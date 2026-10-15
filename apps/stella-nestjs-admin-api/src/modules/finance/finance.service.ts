import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class FinanceService {
  constructor(private readonly dataSource: DataSource) {}

  // === Page 13: Finance Overview ===

  async getPlatformKpis() {
    const result = await this.dataSource.query(`
      WITH equity_current AS (
        SELECT COALESCE(SUM(total_equity_usd), 0) AS current_equity
        FROM (
          SELECT DISTINCT ON (bot_id) total_equity_usd
          FROM trading.equity_snapshots
          WHERE bot_id IS NOT NULL
          ORDER BY bot_id, snapshot_at DESC
        ) latest
      ),
      pnl_90d AS (
        SELECT COALESCE(SUM(realized_pnl_usd), 0) AS pnl
        FROM trading.positions
        WHERE closed_at > NOW() - INTERVAL '90 days' AND status = 'closed'
      ),
      trades_90d AS (
        SELECT COUNT(*)::int AS total_trades
        FROM trading.orders
        WHERE status = 'filled' AND completed_at > NOW() - INTERVAL '90 days'
      ),
      users_with_bots AS (
        SELECT COUNT(DISTINCT user_id)::int AS count
        FROM trading.bots
        WHERE status = 'running'
      ),
      win_rate AS (
        SELECT CASE WHEN COUNT(*) > 0
          THEN ROUND((COUNT(*) FILTER (WHERE realized_pnl_usd > 0)::numeric / COUNT(*)) * 100, 1)
          ELSE 0 END AS rate
        FROM trading.positions
        WHERE closed_at > NOW() - INTERVAL '90 days' AND status = 'closed'
      )
      SELECT
        ec.current_equity,
        pnl.pnl AS realized_pnl_90d,
        tr.total_trades,
        uwb.count AS users_with_active_bots,
        wr.rate AS platform_win_rate
      FROM equity_current ec
      CROSS JOIN pnl_90d pnl
      CROSS JOIN trades_90d tr
      CROSS JOIN users_with_bots uwb
      CROSS JOIN win_rate wr
    `);
    return result[0] || {};
  }

  async getEquityCurve(days = 90) {
    return this.dataSource.query(`
      WITH daily_snapshots AS (
        SELECT
          DATE(snapshot_at) AS snapshot_date,
          SUM(total_equity_usd) AS daily_equity
        FROM trading.equity_snapshots
        WHERE snapshot_at > NOW() - INTERVAL '${days} days'
        GROUP BY DATE(snapshot_at)
        ORDER BY snapshot_date ASC
      )
      SELECT
        ROW_NUMBER() OVER (ORDER BY snapshot_date)::int AS day,
        daily_equity AS value,
        snapshot_date AS date
      FROM daily_snapshots
    `);
  }

  async getMonthlyReturns(year: number) {
    return this.dataSource.query(`
      SELECT
        TO_CHAR(closed_at, 'Mon') AS month,
        EXTRACT(MONTH FROM closed_at)::int AS month_num,
        COALESCE(SUM(realized_pnl_usd), 0) AS pnl,
        COUNT(*)::int AS trades,
        COALESCE(SUM(quantity * exit_price), 0) AS volume
      FROM trading.positions
      WHERE EXTRACT(YEAR FROM closed_at) = $1
        AND status = 'closed'
      GROUP BY TO_CHAR(closed_at, 'Mon'), EXTRACT(MONTH FROM closed_at)
      ORDER BY EXTRACT(MONTH FROM closed_at)
    `, [year]);
  }

  async getDrawdownCurve(days = 90) {
    const curve = await this.getEquityCurve(days);
    if (!curve || curve.length === 0) return [];

    let peak = 0;
    return curve.map((point: any) => {
      const value = parseFloat(point.value) || 0;
      if (value > peak) peak = value;
      const drawdown = peak > 0 ? ((value - peak) / peak) * 100 : 0;
      return { day: point.day, value: parseFloat(drawdown.toFixed(2)) };
    });
  }

  // === Page 14: Finance Strategies ===

  async getStrategyPerformance() {
    return this.dataSource.query(`
      SELECT
        s.id,
        s.name,
        COALESCE(
          STRING_AGG(DISTINCT p.trading_pair, ', ') FILTER (WHERE p.trading_pair IS NOT NULL),
          ARRAY_TO_STRING(s.supported_pairs, ', ')
        ) AS pair,
        COALESCE(SUM(p.realized_pnl_usd), 0) AS pnl,
        COUNT(p.id)::int AS trades,
        CASE WHEN COUNT(p.id) > 0
          THEN ROUND((COUNT(*) FILTER (WHERE p.realized_pnl_usd > 0)::numeric / COUNT(p.id)) * 100, 1)
          ELSE 0 END AS win_rate,
        CASE WHEN SUM(p.realized_pnl_usd) FILTER (WHERE p.realized_pnl_usd < 0) != 0
          THEN ROUND(
            SUM(p.realized_pnl_usd) FILTER (WHERE p.realized_pnl_usd > 0) /
            ABS(SUM(p.realized_pnl_usd) FILTER (WHERE p.realized_pnl_usd < 0)), 2
          ) ELSE 0 END AS profit_factor,
        COALESCE(ss.sharpe_ratio, 0) AS sharpe,
        COALESCE(ss.sortino_ratio, 0) AS sortino,
        COALESCE(ss.max_drawdown_pct, 0) AS max_dd
      FROM strategy.strategies s
      LEFT JOIN trading.bots b ON b.strategy_id = s.id
      LEFT JOIN trading.positions p ON p.bot_id = b.id
        AND p.status = 'closed'
        AND p.closed_at > NOW() - INTERVAL '90 days'
      LEFT JOIN finance.strategy_stats ss ON ss.strategy_id = s.id
        AND ss.calculation_date = CURRENT_DATE
      WHERE s.status = 'active'
      GROUP BY s.id, s.name, s.supported_pairs, ss.sharpe_ratio, ss.sortino_ratio, ss.max_drawdown_pct
      ORDER BY pnl DESC
    `);
  }

  async getStrategyEquityCurves(days = 90) {
    const rows = await this.dataSource.query(`
      SELECT
        DATE(es.snapshot_at) AS snapshot_date,
        s.name,
        SUM(es.total_equity_usd) AS daily_equity
      FROM trading.equity_snapshots es
      JOIN trading.bots b ON es.bot_id = b.id
      JOIN strategy.strategies s ON b.strategy_id = s.id
      WHERE es.snapshot_at > NOW() - INTERVAL '${days} days'
        AND s.status = 'active'
      GROUP BY DATE(es.snapshot_at), s.name
      ORDER BY snapshot_date ASC
    `);

    const curves: Record<string, any[]> = {};
    for (const row of rows) {
      if (!curves[row.name]) curves[row.name] = [];
      curves[row.name].push({ date: row.snapshot_date, value: row.daily_equity });
    }
    return curves;
  }

  // === Page 15: Finance Risk ===

  async getRiskOverview() {
    const riskMetrics = await this.dataSource.query(`
      SELECT var_95_pct, var_99_pct, cvar_99_9_pct, avg_strategy_correlation,
             max_exchange_concentration_pct
      FROM finance.risk_metrics
      WHERE calculation_date = CURRENT_DATE
      LIMIT 1
    `);

    const openRisk = await this.dataSource.query(`
      SELECT COALESCE(SUM(unrealized_pnl_usd), 0) AS open_risk
      FROM trading.positions
      WHERE status = 'open'
    `);

    const metrics = riskMetrics[0] || {};
    return {
      kpis: {
        platformVaR95: parseFloat(metrics.var_95_pct) || 0,
        largestExposure: parseFloat(metrics.max_exchange_concentration_pct) || 0,
        avgCorrelation: parseFloat(metrics.avg_strategy_correlation) || 0,
        openRisk: parseFloat(openRisk[0]?.open_risk) || 0,
      },
      varLevels: [
        { level: '95% VaR', value: parseFloat(metrics.var_95_pct) || 0 },
        { level: '99% VaR', value: parseFloat(metrics.var_99_pct) || 0 },
        { level: '99.9% CVaR', value: parseFloat(metrics.cvar_99_9_pct) || 0 },
      ],
    };
  }

  async getRiskConcentration() {
    const byExchange = await this.dataSource.query(`
      WITH total_eq AS (
        SELECT COALESCE(SUM(total_equity_usd), 1) AS total
        FROM (
          SELECT DISTINCT ON (bot_id) total_equity_usd
          FROM trading.equity_snapshots
          ORDER BY bot_id, snapshot_at DESC
        ) latest
      )
      SELECT
        a.code AS name,
        CASE WHEN te.total > 0
          THEN ROUND((SUM(latest_eq.total_equity_usd) / te.total * 100))::int
          ELSE 0 END AS pct,
        COALESCE(SUM(pnl.pnl), 0) AS pnl
      FROM exchange.adapters a
      LEFT JOIN exchange.user_credentials uc ON uc.adapter_id = a.id
      LEFT JOIN trading.bots b ON b.credential_id = uc.id
      LEFT JOIN LATERAL (
        SELECT total_equity_usd
        FROM trading.equity_snapshots
        WHERE bot_id = b.id
        ORDER BY snapshot_at DESC
        LIMIT 1
      ) latest_eq ON true
      LEFT JOIN LATERAL (
        SELECT SUM(realized_pnl_usd) AS pnl
        FROM trading.positions
        WHERE bot_id = b.id AND status = 'closed' AND closed_at > NOW() - INTERVAL '90 days'
      ) pnl ON true
      CROSS JOIN total_eq te
      WHERE a.status = 'active'
      GROUP BY a.code, te.total
      ORDER BY pct DESC
    `);

    const byStrategy = await this.dataSource.query(`
      WITH total_eq AS (
        SELECT COALESCE(SUM(total_equity_usd), 1) AS total
        FROM (
          SELECT DISTINCT ON (bot_id) total_equity_usd
          FROM trading.equity_snapshots
          ORDER BY bot_id, snapshot_at DESC
        ) latest
      )
      SELECT
        s.name,
        CASE WHEN te.total > 0
          THEN ROUND((SUM(latest_eq.total_equity_usd) / te.total * 100))::int
          ELSE 0 END AS pct
      FROM strategy.strategies s
      LEFT JOIN trading.bots b ON b.strategy_id = s.id
      LEFT JOIN LATERAL (
        SELECT total_equity_usd
        FROM trading.equity_snapshots
        WHERE bot_id = b.id
        ORDER BY snapshot_at DESC
        LIMIT 1
      ) latest_eq ON true
      CROSS JOIN total_eq te
      WHERE s.status = 'active'
      GROUP BY s.name, te.total
      ORDER BY pct DESC
    `);

    return { byExchange, byStrategy };
  }

  async getCorrelationMatrix() {
    const strategies = await this.dataSource.query(`
      SELECT name FROM strategy.strategies WHERE status = 'active' ORDER BY name LIMIT 10
    `);
    return {
      strategies: strategies.map((s: any) => s.name),
      matrix: [],
    };
  }

  async getPositionSizing() {
    return this.dataSource.query(`
      WITH position_sizes AS (
        SELECT
          CASE
            WHEN (p.quantity * p.entry_price) < 1000 THEN '0-1%'
            WHEN (p.quantity * p.entry_price) < 5000 THEN '1-2%'
            WHEN (p.quantity * p.entry_price) < 10000 THEN '2-5%'
            WHEN (p.quantity * p.entry_price) < 50000 THEN '5-10%'
            ELSE '>10%'
          END AS size_range
        FROM trading.positions p
        WHERE p.opened_at > NOW() - INTERVAL '90 days'
      )
      SELECT size_range AS size, COUNT(*)::int AS count
      FROM position_sizes
      GROUP BY size_range
      ORDER BY MIN(CASE
        WHEN size_range = '0-1%' THEN 1
        WHEN size_range = '1-2%' THEN 2
        WHEN size_range = '2-5%' THEN 3
        WHEN size_range = '5-10%' THEN 4
        ELSE 5
      END)
    `);
  }

  // === Page 16: Finance Market ===

  async getMarketKpis() {
    const bestPair = await this.dataSource.query(`
      SELECT
        p.trading_pair AS pair,
        SUM(p.realized_pnl_usd) AS pnl,
        CASE WHEN COUNT(*) > 0
          THEN ROUND((COUNT(*) FILTER (WHERE p.realized_pnl_usd > 0)::numeric / COUNT(*)) * 100, 1)
          ELSE 0 END AS win_rate
      FROM trading.positions p
      WHERE p.status = 'closed' AND p.closed_at > NOW() - INTERVAL '90 days'
      GROUP BY p.trading_pair
      ORDER BY pnl DESC
      LIMIT 1
    `);

    const bestHour = await this.dataSource.query(`
      SELECT
        EXTRACT(HOUR FROM closed_at)::int AS hour,
        ROUND(AVG(realized_pnl_usd)::numeric, 2) AS avg_pnl
      FROM trading.positions
      WHERE status = 'closed' AND closed_at > NOW() - INTERVAL '90 days'
      GROUP BY EXTRACT(HOUR FROM closed_at)
      ORDER BY avg_pnl DESC
      LIMIT 1
    `);

    const bestDay = await this.dataSource.query(`
      SELECT
        TRIM(TO_CHAR(closed_at, 'Day')) AS day,
        ROUND(AVG(realized_pnl_usd)::numeric, 2) AS avg_pnl
      FROM trading.positions
      WHERE status = 'closed' AND closed_at > NOW() - INTERVAL '90 days'
      GROUP BY TRIM(TO_CHAR(closed_at, 'Day')), EXTRACT(DOW FROM closed_at)
      ORDER BY avg_pnl DESC
      LIMIT 1
    `);

    return {
      bestPerformingPair: bestPair[0] || null,
      bestHour: bestHour[0] ? { hour: `${bestHour[0].hour}:00-${bestHour[0].hour + 1}:00 UTC`, avgPnl: bestHour[0].avg_pnl } : null,
      bestDayOfWeek: bestDay[0]?.day || null,
    };
  }

  async getMarketPairs() {
    return this.dataSource.query(`
      SELECT
        p.trading_pair AS pair,
        COUNT(*)::int AS trades,
        COALESCE(SUM(p.realized_pnl_usd), 0) AS pnl,
        CASE WHEN COUNT(*) > 0
          THEN ROUND((COUNT(*) FILTER (WHERE p.realized_pnl_usd > 0)::numeric / COUNT(*)) * 100, 1)
          ELSE 0 END AS win_rate,
        COALESCE(SUM(p.quantity * p.exit_price), 0) AS volume
      FROM trading.positions p
      WHERE p.status = 'closed' AND p.closed_at > NOW() - INTERVAL '90 days'
      GROUP BY p.trading_pair
      ORDER BY pnl DESC
    `);
  }

  async getHourlyHeatmap() {
    return this.dataSource.query(`
      SELECT
        TRIM(TO_CHAR(closed_at, 'Dy')) AS day,
        EXTRACT(HOUR FROM closed_at)::int AS hour,
        ROUND(AVG(realized_pnl_usd)::numeric, 2) AS val
      FROM trading.positions
      WHERE status = 'closed' AND closed_at > NOW() - INTERVAL '90 days'
      GROUP BY TRIM(TO_CHAR(closed_at, 'Dy')), EXTRACT(DOW FROM closed_at), EXTRACT(HOUR FROM closed_at)
      ORDER BY EXTRACT(DOW FROM closed_at), hour
    `);
  }

  async getMarketExchanges() {
    return this.dataSource.query(`
      WITH total_volume AS (
        SELECT COALESCE(SUM(quantity * exit_price), 1) AS total
        FROM trading.positions
        WHERE status = 'closed' AND closed_at > NOW() - INTERVAL '90 days'
      )
      SELECT
        a.code AS name,
        CASE WHEN tv.total > 0
          THEN ROUND((SUM(p.quantity * p.exit_price) / tv.total * 100))::int
          ELSE 0 END AS pct,
        COALESCE(SUM(p.realized_pnl_usd), 0) AS pnl
      FROM trading.positions p
      JOIN trading.bots b ON p.bot_id = b.id
      JOIN exchange.user_credentials uc ON b.credential_id = uc.id
      JOIN exchange.adapters a ON uc.adapter_id = a.id
      CROSS JOIN total_volume tv
      WHERE p.status = 'closed' AND p.closed_at > NOW() - INTERVAL '90 days'
      GROUP BY a.code, tv.total
      ORDER BY pct DESC
    `);
  }

  // === Page 17: Finance Users ===

  async getUserKpis() {
    const result = await this.dataSource.query(`
      WITH user_stats AS (
        SELECT
          COUNT(*)::int AS total_users,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int AS new_30d
        FROM auth.users
      ),
      aum_stats AS (
        SELECT COALESCE(SUM(latest_eq.total_equity_usd), 0) AS total_aum
        FROM (
          SELECT DISTINCT ON (b.user_id) es.total_equity_usd
          FROM trading.equity_snapshots es
          JOIN trading.bots b ON es.bot_id = b.id
          ORDER BY b.user_id, es.snapshot_at DESC
        ) latest_eq
      )
      SELECT
        us.total_users,
        aum.total_aum,
        CASE WHEN us.total_users > 0
          THEN ROUND((aum.total_aum / us.total_users)::numeric, 2)
          ELSE 0 END AS avg_aum_per_user,
        us.new_30d AS new_users_30d
      FROM user_stats us
      CROSS JOIN aum_stats aum
    `);
    return result[0] || {};
  }

  async getUserPerformance() {
    return this.dataSource.query(`
      WITH user_equity AS (
        SELECT
          b.user_id,
          SUM(latest_eq.total_equity_usd) AS total_equity
        FROM trading.bots b
        LEFT JOIN LATERAL (
          SELECT total_equity_usd
          FROM trading.equity_snapshots
          WHERE bot_id = b.id
          ORDER BY snapshot_at DESC
          LIMIT 1
        ) latest_eq ON true
        GROUP BY b.user_id
      ),
      user_pnl AS (
        SELECT
          b.user_id,
          SUM(p.realized_pnl_usd) AS total_pnl,
          CASE WHEN COUNT(*) > 0
            THEN ROUND((COUNT(*) FILTER (WHERE p.realized_pnl_usd > 0)::numeric / COUNT(*)) * 100, 1)
            ELSE 0 END AS win_rate
        FROM trading.positions p
        JOIN trading.bots b ON p.bot_id = b.id
        WHERE p.status = 'closed' AND p.closed_at > NOW() - INTERVAL '90 days'
        GROUP BY b.user_id
      ),
      user_bots AS (
        SELECT user_id, COUNT(*)::int AS bot_count
        FROM trading.bots
        WHERE status IN ('running', 'paused')
        GROUP BY user_id
      )
      SELECT
        u.id,
        u.username AS name,
        u.email,
        COALESCE(ue.total_equity, 0) AS aum,
        COALESCE(up.total_pnl, 0) AS pnl,
        CASE WHEN ue.total_equity > 0
          THEN ROUND((COALESCE(up.total_pnl, 0) / ue.total_equity * 100)::numeric, 1)
          ELSE 0 END AS pnl_pct,
        COALESCE(ub.bot_count, 0)::int AS bots,
        u.tier,
        u.created_at AS joined,
        COALESCE(up.win_rate, 0) AS win_rate,
        u.status = 'active' AS active
      FROM auth.users u
      LEFT JOIN user_equity ue ON ue.user_id = u.id
      LEFT JOIN user_pnl up ON up.user_id = u.id
      LEFT JOIN user_bots ub ON ub.user_id = u.id
      ORDER BY pnl DESC
    `);
  }

  async getUserTiers() {
    return this.dataSource.query(`
      SELECT
        tier::text AS name,
        COUNT(*)::int AS count
      FROM auth.users
      WHERE status = 'active'
      GROUP BY tier
      ORDER BY count DESC
    `);
  }

  async getUserGrowth(months = 12) {
    return this.dataSource.query(`
      WITH monthly AS (
        SELECT
          TO_CHAR(DATE_TRUNC('month', created_at), 'Mon') AS month,
          DATE_TRUNC('month', created_at) AS month_date,
          COUNT(*)::int AS new_users
        FROM auth.users
        WHERE created_at > NOW() - INTERVAL '${months} months'
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY month_date
      )
      SELECT
        month,
        new_users AS new,
        SUM(new_users) OVER (ORDER BY month_date)::int AS total
      FROM monthly
    `);
  }
}
