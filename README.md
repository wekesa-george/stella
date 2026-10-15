# Stella

A crypto trading platform: a trading engine, a client portal, an admin console and a backtesting worker.

| Path | What it is | Stack |
|---|---|---|
| `apps/stella_platform_umbrella` | Trading engine: exchange orchestration, bots, order recovery | Elixir / Phoenix umbrella |
| `apps/stella_admin` | Admin console (KYC, settings, operations) | Elixir / Phoenix LiveView |
| `apps/stella-nestjs-admin-api` | Admin REST API | NestJS |
| `apps/stella-nextjs` | Trader-facing web app | Next.js |
| `apps/stella-clients-nextjs` | Client portal with Logto auth | Next.js |
| `apps/stella-vectorbt-worker` | Strategy backtesting and pair scanning | Python, vectorbt |
| `design/` | UI mockups (JSX), brand assets, Open Sans (OFL) | |
| `docs/` | Architecture notes, migration docs, implementation plans | |

Each app keeps its own README and setup. Configuration comes from environment variables, and no `.env` files are committed. Values shown as `REDACTED` in the code or history were removed before publishing.

The full history of each app was preserved when it was merged into this repo.
