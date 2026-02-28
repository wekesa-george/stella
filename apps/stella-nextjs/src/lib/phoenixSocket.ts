import { Socket, Channel } from 'phoenix';

const WS_URL = process.env.NEXT_PUBLIC_TRADING_ENGINE_WS_URL || 'ws://localhost:4000/socket';

const LOG_PREFIX = '[PhoenixSocket]';

let socket: Socket | null = null;
let currentToken: string | null = null;
const activeChannels = new Map<string, Channel>();

// Bumped on every socket reconnect so React hooks can re-join channels
let socketVersion = 0;
const versionListeners = new Set<(v: number) => void>();

export function getSocketVersion(): number {
  return socketVersion;
}

export function onSocketVersionChange(cb: (v: number) => void): () => void {
  versionListeners.add(cb);
  return () => versionListeners.delete(cb);
}

function bumpVersion() {
  socketVersion += 1;
  console.log(LOG_PREFIX, `Socket version bumped to ${socketVersion}`);
  for (const cb of versionListeners) cb(socketVersion);
}

/**
 * Get or create the shared Phoenix socket connection.
 * Call setSocketToken() first to authenticate.
 */
export function getSocket(): Socket {
  if (!socket) {
    console.log(LOG_PREFIX, 'Creating new socket →', WS_URL, currentToken ? '(with token)' : '(anonymous)');
    socket = new Socket(WS_URL, {
      params: () => (currentToken ? { token: currentToken } : {}) as Record<string, string>,
      reconnectAfterMs: (tries) => [1000, 2000, 5000, 10000][Math.min(tries - 1, 3)],
    });

    socket.onOpen(() => console.log(LOG_PREFIX, `Socket OPEN → ${WS_URL} (token=${currentToken ? 'yes' : 'no'})`));
    socket.onClose((event) => console.log(LOG_PREFIX, 'Socket CLOSE', event, `activeChannels=${activeChannels.size}`));
    socket.onError((error) => console.warn(LOG_PREFIX, 'Socket ERROR', error, `activeChannels=${activeChannels.size}`));

    socket.connect();
  }
  return socket;
}

/**
 * Set the JWT token for socket authentication.
 * If the token changes, reconnects the socket with the new token.
 */
export function setSocketToken(token: string) {
  if (currentToken === token) {
    console.log(LOG_PREFIX, 'setSocketToken — same token, skipping');
    return;
  }
  console.log(LOG_PREFIX, 'setSocketToken — new token, will reconnect');
  currentToken = token;

  if (socket) {
    // Leave all channels cleanly before disconnecting
    for (const [topic, ch] of activeChannels) {
      console.log(LOG_PREFIX, `Leaving channel "${topic}" before reconnect`);
      ch.leave();
    }
    activeChannels.clear();
    socket.disconnect();
    socket = null;
  }

  // Eagerly reconnect so channels can join immediately
  getSocket();

  // Notify hooks to re-join their channels on the new socket
  bumpVersion();
}

/**
 * Disconnect and clean up the socket.
 */
export function disconnectSocket() {
  console.log(LOG_PREFIX, 'disconnectSocket called');
  if (socket) {
    for (const [topic, ch] of activeChannels) {
      console.log(LOG_PREFIX, `Leaving channel "${topic}" on disconnect`);
      ch.leave();
    }
    activeChannels.clear();
    socket.disconnect();
    socket = null;
    currentToken = null;
  }
}

/**
 * Join a Phoenix channel, reusing existing if already joined.
 */
export function joinChannel(topic: string, params?: Record<string, any>): Channel {
  const existing = activeChannels.get(topic);
  if (existing) {
    // Check if the existing channel is still usable
    // phoenix.js Channel has a `state` property but it's not in the TS types
    const state = (existing as any).state as string | undefined;
    if (state === 'joined' || state === 'joining') {
      console.log(LOG_PREFIX, `joinChannel("${topic}") — reusing (state: ${state})`);
      return existing;
    }
    // Channel is in a bad state (closed/errored/leaving), remove and re-create
    console.log(LOG_PREFIX, `joinChannel("${topic}") — stale channel (state: ${state}), recreating`);
    existing.leave();
    activeChannels.delete(topic);
  }

  const s = getSocket();
  const channel = s.channel(topic, params || {});

  console.log(LOG_PREFIX, `joinChannel("${topic}") — joining new channel`);

  channel.join()
    .receive('ok', () => {
      console.log(LOG_PREFIX, `Channel "${topic}" joined OK`);
    })
    .receive('error', (resp) => {
      console.warn(LOG_PREFIX, `Channel "${topic}" join ERROR:`, resp);
      activeChannels.delete(topic);
    })
    .receive('timeout', () => {
      console.warn(LOG_PREFIX, `Channel "${topic}" join TIMEOUT`);
      activeChannels.delete(topic);
    });

  channel.onClose(() => {
    console.log(LOG_PREFIX, `Channel "${topic}" CLOSED`);
    activeChannels.delete(topic);
  });

  channel.onError((reason) => {
    console.warn(LOG_PREFIX, `Channel "${topic}" ERROR:`, reason);
  });

  activeChannels.set(topic, channel);
  return channel;
}

/**
 * Leave a Phoenix channel.
 */
export function leaveChannel(topic: string) {
  const channel = activeChannels.get(topic);
  if (channel) {
    console.log(LOG_PREFIX, `leaveChannel("${topic}")`);
    channel.leave();
    activeChannels.delete(topic);
  }
}
