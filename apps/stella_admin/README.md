# Stella Admin Dashboard

A comprehensive backoffice administration portal for Stella - the social crypto trading platform. Built with Phoenix LiveView for real-time interactivity and modern UI/UX.

![Version](https://img.shields.io/badge/version-1.0.0-lime)
![Phoenix](https://img.shields.io/badge/Phoenix-1.8.3-orange)
![Elixir](https://img.shields.io/badge/Elixir-1.17.3-purple)
![LiveView](https://img.shields.io/badge/LiveView-1.1.23-blue)

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Docker Deployment](#docker-deployment)
- [Project Structure](#project-structure)
- [Pages & Functionality](#pages--functionality)
- [Design System](#design-system)
- [Development](#development)
- [Contributing](#contributing)

## Overview

Stella Admin is a full-featured administration dashboard designed specifically for managing a crypto social trading platform. It provides comprehensive tools for user management, trading oversight, financial tracking, content moderation, analytics, and support operations.

### Key Highlights

- **Real-time Updates**: Live price tickers and data updates using Phoenix LiveView
- **Interactive Charts**: Beautiful visualizations with ApexCharts (area, bar, donut, candlestick, heatmap)
- **Modular Architecture**: Clean separation of concerns with LiveView components
- **Responsive Design**: Mobile-first approach with Tailwind CSS
- **Dark Theme**: Eye-friendly dark theme with lime green accents
- **Docker Ready**: Production-ready containerization

## Features

### Core Modules

- **Dashboard** - Executive overview with key metrics and charts
- **User Management** - User directory, verification, suspension, detailed profiles
- **Trading** - Real-time price monitoring, trade oversight, candlestick charts
- **Finance** - Revenue tracking, transaction management, withdrawal approvals
- **Content** - Post/article moderation, engagement metrics
- **Analytics** - Executive reports, retention heatmaps, geographic distribution
- **Support** - Ticket system, live chat monitoring, team performance
- **Settings** - Platform configuration, security, API management

### Technical Features

- Real-time price updates every 2 seconds
- Interactive data filtering and pagination
- Modal-based workflows for actions
- Compact, information-dense layouts
- Simulated live trading data
- Team performance metrics
- Multi-tab settings interface

## Tech Stack

### Backend
- **Phoenix Framework** 1.8.3
- **Phoenix LiveView** 1.1.23
- **Elixir** 1.17.3
- **Erlang/OTP** 27.2

### Frontend
- **Tailwind CSS** v4.1.12
- **DaisyUI** 5.0.35
- **ApexCharts** 3.x
- **Heroicons** (via Phoenix)

### Infrastructure
- **Docker** - Multi-stage builds
- **PostgreSQL** 16 (when connected to database)
- **Node.js** 20.x (for asset compilation)

## Getting Started

### Prerequisites

- Elixir 1.17+ and Erlang/OTP 27+
- Node.js 20+
- PostgreSQL 16+ (optional for now, data is mocked)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://bitbucket.org/wekesageorgebiteremo/stella_admin.git
   cd stella_admin
   ```

2. **Install dependencies**
   ```bash
   mix setup
   ```
   This will:
   - Install Elixir dependencies
   - Install Node.js dependencies for assets
   - Create and migrate the database (when configured)

3. **Start the Phoenix server**
   ```bash
   mix phx.server
   ```

4. **Access the dashboard**

   Open your browser and navigate to: [`http://localhost:4000`](http://localhost:4000)

### Quick Start (Alternative)

Start with interactive Elixir shell:
```bash
iex -S mix phx.server
```

## Docker Deployment

### Using Docker Compose (Recommended for Development)

```bash
# Build and start services
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop services
docker-compose down
```

This will start:
- PostgreSQL database on port 5432
- Phoenix application on port 4000

### Building Docker Image Manually

```bash
# Build the image
docker build -t stella_admin:latest .

# Run the container
docker run -p 4000:4000 \
  -e SECRET_KEY_BASE=your_secret_key_here \
  -e DATABASE_URL=ecto://postgres:REDACTED@db/stella_admin_prod \
  stella_admin:latest
```

### Production Deployment

For production deployment, ensure you:
1. Set proper environment variables (SECRET_KEY_BASE, DATABASE_URL)
2. Configure PHX_HOST to your domain
3. Use a managed PostgreSQL instance
4. Set up SSL/TLS certificates
5. Configure a reverse proxy (nginx/caddy)

## Project Structure

```
stella_admin/
├── assets/              # Frontend assets
│   ├── css/            # Tailwind CSS configuration
│   ├── js/             # JavaScript (LiveView hooks, ApexCharts)
│   └── vendor/         # Third-party libraries
├── config/             # Application configuration
│   ├── config.exs      # Base configuration
│   ├── dev.exs         # Development settings
│   ├── prod.exs        # Production settings
│   ├── runtime.exs     # Runtime configuration
│   └── test.exs        # Test settings
├── lib/
│   ├── stella_admin/   # Core application logic
│   └── stella_admin_web/
│       ├── components/ # Reusable UI components
│       ├── live/       # LiveView pages
│       │   ├── dashboard_live.ex
│       │   ├── users_live.ex
│       │   ├── user_detail_live.ex
│       │   ├── trading_live.ex
│       │   ├── finance_live.ex
│       │   ├── content_live.ex
│       │   ├── analytics_live.ex
│       │   ├── support_live.ex
│       │   └── settings_live.ex
│       ├── router.ex   # Route definitions
│       └── endpoint.ex # Phoenix endpoint
├── priv/
│   └── static/         # Static files (logo, favicon)
├── test/               # Test files
├── Dockerfile          # Docker configuration
├── docker-compose.yml  # Docker Compose setup
└── mix.exs             # Project dependencies
```

## Pages & Functionality

### 1. Dashboard (`/`)
**Purpose**: Executive overview of platform metrics

**Features**:
- 6 stat cards: Active Traders, Trading Volume, Platform Revenue, Active Copy Trades, Pending Verifications, Total Users
- Platform Revenue Trend (area chart)
- Trading Volume by Pair (donut chart with legend)
- Top Performing Traders table
- 6 additional metric cards in 2x3 grid

**Charts**: Area chart, Donut chart

### 2. Users (`/users`)
**Purpose**: User management and moderation

**Features**:
- User stats overview (Total, Active, Verified, Suspended, New This Week)
- Filter buttons (All, Active, Verified, Suspended)
- User table with actions (View, Suspend)
- Suspension modal workflow
- Pagination

**Actions**: View user details, Suspend/Activate users

### 3. User Detail (`/users/:id`)
**Purpose**: Individual user profile and activity

**Features**:
- User profile information
- 6 stat cards (Total Trades, Win Rate, Total Volume, Followers, Following, Copy Traders)
- Recent trades table
- Activity log timeline

### 4. Trading (`/trading`)
**Purpose**: Real-time trading monitoring

**Features**:
- Trading stats (Total Volume 24h, Active Trades, Avg Trade Size, Top Pair)
- Live price ticker (updates every 2 seconds)
- Candlestick chart (switchable pairs)
- Top trading pairs cards
- Active trades table with filters
- Recent closed trades

**Real-time**: Price updates, animated price changes

**Charts**: Candlestick chart

### 5. Finance (`/finance`)
**Purpose**: Financial operations and revenue tracking

**Features**:
- Financial stats (Revenue, Trading Fees, Subscriptions, Pending Withdrawals, Net Profit, Growth)
- Revenue breakdown with progress bars
- Pending withdrawals with Approve/Reject actions
- Recent transactions table with filters

**Actions**: Approve/Reject withdrawals

### 6. Content (`/content`)
**Purpose**: Content moderation and management

**Features**:
- Content stats (Total Posts, Pending Moderation, Flagged, Removed This Week)
- Pending moderation queue with Approve/Reject buttons
- All content table with engagement metrics
- Filter by content type (All, Posts, Articles, Announcements)

**Actions**: Approve/Reject content

### 7. Analytics (`/analytics`)
**Purpose**: Executive analytics and reporting

**Features**:
- 6 KPI cards (Total Revenue, Total Users, Trading Volume, Avg Session Time, Conversion Rate, ARPU)
- Revenue Trend (area chart)
- User Growth (stacked area chart - New vs Returning)
- Trading Volume Trends (bar chart)
- Revenue Sources (donut chart)
- User Retention Heatmap
- Top Trading Pairs Performance table
- Geographic Distribution table

**Charts**: Area, Stacked Area, Bar, Donut, Heatmap

### 8. Support (`/support`)
**Purpose**: Customer support management

**Features**:
- Support stats (Open Tickets, In Progress, Resolved Today, Avg Response Time, Satisfaction Rate, Live Chats)
- Active tickets table with priority filtering
- Ticket detail modal
- Live chat monitoring
- Team performance metrics

**Filters**: All, High Priority, Unassigned

**Actions**: View ticket, Edit, Resolve

### 9. Settings (`/settings`)
**Purpose**: Platform configuration

**Tabs**:
1. **General** - Platform info, features toggles
2. **Trading** - Trade limits, fees, risk management
3. **Security** - 2FA, KYC, session management, IP whitelist
4. **Notifications** - Email alerts, Slack integration
5. **API** - API configuration, rate limits, key management

## Design System

### Color Palette

- **Primary (Lime Green)**: `#c4f563` - Main accent color
- **Teal**: `#7dd3c0` - Secondary accent
- **Background**: Dark theme (base-100, base-200, base-300)
- **Text**: Light text on dark backgrounds

### Typography

- **Font Family**: System font stack
- **Sizes**:
  - Headers: `text-2xl`, `text-base`, `text-sm`
  - Body: `text-xs` (compact design)
  - Tables: `text-xs`

### Spacing & Layout

- **Border Radius**: Maximum 2px (minimalist design)
- **Padding**: Compact spacing (p-4, py-2.5 for tables)
- **Grid**: Responsive grid layouts (grid-cols-6, grid-cols-2)

### Components

- **Cards**: `bg-base-200 rounded border border-base-300`
- **Buttons**: `btn btn-primary btn-sm`
- **Tables**: `table table-sm` with hover states
- **Badges**: Color-coded status indicators
- **Modals**: Centered overlays with backdrop

### Icons

Using Heroicons via Phoenix core components:
- `hero-home`, `hero-users`, `hero-chart-bar`, `hero-currency-dollar`
- `hero-chart-pie`, `hero-chat-bubble-left-right`, `hero-cog-6-tooth`

## Development

### Running Tests

```bash
mix test
```

### Code Formatting

```bash
mix format
```

### Linting

The project uses Elixir's built-in formatter. Configuration in `.formatter.exs`.

### Asset Compilation

```bash
# Watch mode (auto-recompile)
cd assets && npm run watch

# Production build
mix assets.deploy
```

### Adding New Pages

1. Create LiveView module in `lib/stella_admin_web/live/`
2. Add route in `lib/stella_admin_web/router.ex`
3. Update navigation in `lib/stella_admin_web/components/layouts/admin.html.heex`
4. Follow existing patterns for consistency

### ApexCharts Integration

Charts are integrated via LiveView hooks. Example:

```elixir
defp chart_config do
  %{
    chart: %{type: "area", height: 350},
    series: [%{name: "Revenue", data: [45, 52, 38, 65, 72, 58, 83]}],
    colors: ["#c4f563"]
  } |> Jason.encode!()
end
```

```heex
<div id="chart" phx-hook="ApexChart" data-chart={@chart_config}></div>
```

## Environment Variables

### Required in Production

```bash
# Secret key for encryption (generate with: mix phx.gen.secret)
SECRET_KEY_BASE=your_secret_key_base_here

# Database connection
DATABASE_URL=ecto://user:REDACTED@host/database

# Application host
PHX_HOST=yourdomain.com

# Port (default: 4000)
PORT=4000
```

### Optional

```bash
# Pool size for database connections
POOL_SIZE=10
```

## Database

Currently, the application uses **mocked data** for demonstration purposes. All data is generated in the LiveView modules.

### When Ready to Connect Database:

1. Configure `config/dev.exs` and `config/runtime.exs`
2. Create schemas in `lib/stella_admin/`
3. Generate migrations: `mix ecto.gen.migration create_users`
4. Run migrations: `mix ecto.migrate`
5. Replace mocked data with database queries

## API Documentation

The platform includes API management in Settings. When implementing:

- Use Guardian or similar for JWT authentication
- Implement rate limiting with Hammer or similar
- Document endpoints with ExDoc
- Follow REST conventions

## Performance Considerations

### Current Optimizations

- Mocked data (no database queries)
- LiveView for efficient real-time updates
- Minimal JavaScript (only for charts)
- Tailwind CSS purging in production

### Future Optimizations

- Add database query optimization
- Implement caching (Cachex, Redis)
- Add pagination for large datasets
- Optimize chart rendering for large datasets

## Security

### Current Implementation

- CSRF protection enabled
- Secure browser headers
- Input sanitization via Phoenix

### Production Recommendations

- Enable HTTPS/SSL
- Implement authentication (Guardian, Pow, etc.)
- Add authorization (role-based access)
- Rate limiting on API endpoints
- Regular dependency updates

## Troubleshooting

### Common Issues

**Port already in use**
```bash
# Kill process on port 4000
lsof -ti:4000 | xargs kill -9
```

**Asset compilation fails**
```bash
cd assets
rm -rf node_modules package-lock.json
npm install
```

**Docker build fails**
```bash
# Clear Docker cache
docker system prune -a
docker-compose build --no-cache
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style

- Follow Elixir style guide
- Use `mix format` before committing
- Write descriptive commit messages
- Add tests for new features

## License

Proprietary - All rights reserved

## Support

For support, please contact:
- Email: support@stella.trade
- Internal ticket system: `/support`

## Roadmap

### Phase 1 (Current)
- ✅ Complete UI/UX implementation
- ✅ All core pages and features
- ✅ Docker deployment setup

### Phase 2 (Next)
- [ ] Database integration
- [ ] Authentication & authorization
- [ ] Real API integration
- [ ] Email notifications
- [ ] Automated tests

### Phase 3 (Future)
- [ ] Advanced analytics
- [ ] Export functionality
- [ ] Mobile app companion
- [ ] Multi-language support

## Acknowledgments

- **Phoenix Framework** - Robust web framework
- **LiveView** - Real-time interactivity
- **Tailwind CSS** - Utility-first CSS
- **DaisyUI** - Beautiful component library
- **ApexCharts** - Modern charting library

---

Built with ❤️ using Phoenix LiveView

**Repository**: [Bitbucket](https://bitbucket.org/wekesageorgebiteremo/stella_admin)

🤖 *Initial version generated with [Claude Code](https://claude.com/claude-code)*
