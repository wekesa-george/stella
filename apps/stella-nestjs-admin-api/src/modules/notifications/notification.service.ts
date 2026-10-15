import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationLog } from './notification.entity';
import { NotificationChannel } from '../settings/entities/notification-channel.entity';
import { NotificationSettings } from '../settings/entities/notification-settings.entity';

export interface SendNotificationDto {
  /** Channel key: 'ntfy' | 'slack' | 'email' | 'pagerduty' */
  channel: string;
  /** Severity for routing/logging: 'critical' | 'warning' | 'info' */
  severity: string;
  /** Notification title */
  title: string;
  /** Notification body/message */
  message: string;
  /** Optional structured metadata */
  metadata?: Record<string, any>;
  /** Optional: override ntfy topic (default: stella-ops) */
  topic?: string;
  /** Optional: priority for ntfy (1-5, default based on severity) */
  priority?: number;
  /** Optional: tags for ntfy */
  tags?: string[];
  /** Optional: click URL */
  clickUrl?: string;
  /** Optional: email recipients override */
  emailRecipients?: string[];
  /** Optional: dedup key (prevents duplicate sends within dedup window) */
  dedupKey?: string;
}

export interface SendResult {
  channelKey: string;
  success: boolean;
  logId: string;
  error?: string;
}

@Injectable()
export class NotificationService implements OnModuleInit {
  private readonly logger = new Logger(NotificationService.name);
  private channels: Map<string, NotificationChannel> = new Map();
  private dedupWindowMs = 5 * 60 * 1000;
  private recentDedup: Map<string, number> = new Map(); // dedupKey -> timestamp

  constructor(
    @InjectRepository(NotificationLog)
    private readonly logRepo: Repository<NotificationLog>,
    @InjectRepository(NotificationChannel)
    private readonly channelRepo: Repository<NotificationChannel>,
    @InjectRepository(NotificationSettings)
    private readonly settingsRepo: Repository<NotificationSettings>,
  ) {}

  async onModuleInit() {
    await this.refreshChannels();
  }

  /** Reload channel configs from DB */
  async refreshChannels() {
    const channels = await this.channelRepo.find();
    this.channels.clear();
    for (const ch of channels) {
      this.channels.set(ch.channelKey, ch);
    }

    const settings = await this.settingsRepo.findOne({ where: {} });
    if (settings) {
      this.dedupWindowMs = settings.dedupWindowMinutes * 60 * 1000;
    }

    this.logger.log(`Loaded ${this.channels.size} notification channels (dedup: ${this.dedupWindowMs / 1000}s)`);
  }

  /** Send a notification to a single channel */
  async send(dto: SendNotificationDto): Promise<SendResult> {
    const channel = this.channels.get(dto.channel);
    if (!channel) {
      this.logger.warn(`Channel '${dto.channel}' not found`);
      return { channelKey: dto.channel, success: false, logId: '', error: 'Channel not found' };
    }

    if (!channel.isActive) {
      this.logger.debug(`Channel '${dto.channel}' is disabled, skipping`);
      return { channelKey: dto.channel, success: false, logId: '', error: 'Channel disabled' };
    }

    // Dedup check
    if (dto.dedupKey) {
      const now = Date.now();
      const lastSent = this.recentDedup.get(dto.dedupKey);
      if (lastSent && (now - lastSent) < this.dedupWindowMs) {
        this.logger.debug(`Dedup: skipping '${dto.dedupKey}' (sent ${Math.round((now - lastSent) / 1000)}s ago)`);
        return { channelKey: dto.channel, success: true, logId: '', error: 'Deduped' };
      }
      this.recentDedup.set(dto.dedupKey, now);
      // Cleanup old entries
      if (this.recentDedup.size > 1000) {
        const cutoff = now - this.dedupWindowMs;
        for (const [key, ts] of this.recentDedup) {
          if (ts < cutoff) this.recentDedup.delete(key);
        }
      }
    }

    // Create log entry
    const log = this.logRepo.create({
      channelId: channel.id,
      severity: dto.severity,
      message: `[${dto.title}] ${dto.message}`,
      metadata: dto.metadata ?? null,
      status: 'pending',
    });
    const saved = await this.logRepo.save(log);

    try {
      await this.dispatch(channel, dto);
      saved.status = 'sent';
      saved.sentAt = new Date();
      await this.logRepo.save(saved);
      this.logger.log(`Sent [${dto.channel}] ${dto.title}`);
      return { channelKey: dto.channel, success: true, logId: saved.id };
    } catch (err: any) {
      saved.status = 'failed';
      saved.errorMessage = err.message?.slice(0, 500);
      await this.logRepo.save(saved);
      this.logger.error(`Failed [${dto.channel}] ${dto.title}: ${err.message}`);
      return { channelKey: dto.channel, success: false, logId: saved.id, error: err.message };
    }
  }

  /** Send to multiple channels at once */
  async sendMulti(channels: string[], dto: Omit<SendNotificationDto, 'channel'>): Promise<SendResult[]> {
    return Promise.all(
      channels.map(channel => this.send({ ...dto, channel })),
    );
  }

  /** Broadcast to all active channels matching a severity threshold */
  async broadcast(dto: Omit<SendNotificationDto, 'channel'>): Promise<SendResult[]> {
    const activeChannels = [...this.channels.values()]
      .filter(ch => ch.isActive)
      .map(ch => ch.channelKey);
    return this.sendMulti(activeChannels, dto);
  }

  /** Get recent notification logs */
  async getLogs(limit = 50): Promise<NotificationLog[]> {
    return this.logRepo.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  // ===========================================================================
  // CHANNEL DISPATCHERS
  // ===========================================================================

  private async dispatch(channel: NotificationChannel, dto: SendNotificationDto) {
    switch (channel.channelKey) {
      case 'ntfy':
        return this.sendNtfy(channel.config, dto);
      case 'slack':
        return this.sendSlack(channel.config, dto);
      case 'email':
        return this.sendEmail(channel.config, dto);
      case 'pagerduty':
        return this.sendPagerDuty(channel.config, dto);
      default:
        throw new Error(`Unknown channel type: ${channel.channelKey}`);
    }
  }

  // --- ntfy ---
  private async sendNtfy(config: Record<string, any>, dto: SendNotificationDto) {
    const baseUrl = config.base_url || config.webhook_url || 'https://notifications.stella-1.com';
    const topic = dto.topic || config.default_topic || 'stella-ops';
    const token = config.auth_token || '';

    const priorityMap: Record<string, number> = {
      critical: 5, warning: 4, info: 3,
    };
    const priority = dto.priority || priorityMap[dto.severity] || 3;

    const headers: Record<string, string> = {
      'Title': dto.title,
      'Priority': String(priority),
      'Content-Type': 'text/plain',
    };

    if (dto.tags?.length) {
      headers['Tags'] = dto.tags.join(',');
    }
    if (dto.clickUrl) {
      headers['Click'] = dto.clickUrl;
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${baseUrl}/${topic}`, {
      method: 'POST',
      headers,
      body: dto.message,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`ntfy ${res.status}: ${body}`);
    }
  }

  // --- Slack ---
  private async sendSlack(config: Record<string, any>, dto: SendNotificationDto) {
    const webhookUrl = config.webhook_url;
    if (!webhookUrl) throw new Error('Slack webhook_url not configured');

    const colorMap: Record<string, string> = {
      critical: '#ff4757', warning: '#f5a623', info: '#3d9df3',
    };

    const payload = {
      attachments: [{
        color: colorMap[dto.severity] || '#3d9df3',
        title: dto.title,
        text: dto.message,
        fields: dto.metadata ? Object.entries(dto.metadata).map(([k, v]) => ({
          title: k,
          value: String(v),
          short: true,
        })) : [],
        ts: Math.floor(Date.now() / 1000),
      }],
    };

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Slack ${res.status}: ${body}`);
    }
  }

  // --- Email (via ntfy email feature or SMTP relay) ---
  private async sendEmail(config: Record<string, any>, dto: SendNotificationDto) {
    // Use ntfy's email forwarding: publish to ntfy with Email header
    // This avoids needing a separate SMTP setup
    const ntfyConfig = this.channels.get('ntfy')?.config;
    const baseUrl = ntfyConfig?.base_url || 'https://notifications.stella-1.com';
    const topic = 'stella-email-relay';
    const token = ntfyConfig?.auth_token || '';
    const recipients = dto.emailRecipients || config.recipients?.split(',').map((s: string) => s.trim()) || [];

    if (recipients.length === 0) {
      throw new Error('No email recipients configured');
    }

    const headers: Record<string, string> = {
      'Title': dto.title,
      'Priority': '3',
      'Email': recipients.join(','),
      'Content-Type': 'text/plain',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${baseUrl}/${topic}`, {
      method: 'POST',
      headers,
      body: dto.message,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`ntfy-email ${res.status}: ${body}`);
    }
  }

  // --- PagerDuty ---
  private async sendPagerDuty(config: Record<string, any>, dto: SendNotificationDto) {
    const routingKey = config.routing_key || config.webhook_url;
    if (!routingKey) throw new Error('PagerDuty routing_key not configured');

    const severityMap: Record<string, string> = {
      critical: 'critical', warning: 'warning', info: 'info',
    };

    const payload = {
      routing_key: routingKey,
      event_action: 'trigger',
      payload: {
        summary: `[${dto.severity.toUpperCase()}] ${dto.title}: ${dto.message}`,
        source: 'stella-platform',
        severity: severityMap[dto.severity] || 'info',
        custom_details: dto.metadata || {},
      },
    };

    const res = await fetch('https://events.pagerduty.com/v2/enqueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`PagerDuty ${res.status}: ${body}`);
    }
  }
}
