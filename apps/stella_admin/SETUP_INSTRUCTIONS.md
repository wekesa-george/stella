# Stella Admin Setup Instructions

## Prerequisites

- Elixir 1.15+
- Erlang/OTP 26+
- PostgreSQL (if using database in future)

## Installation Steps

### 1. Install Dependencies

```bash
mix deps.get
```

### 2. Configure Environment Variables

The `.env` file has been created with the Logto credentials. The environment variables will be automatically loaded in development mode.

Required variables in `.env`:
- `LOGTO_APP_ID` - Your Logto Application ID
- `LOGTO_APP_SECRET` - Your Logto Application Secret
- `LOGTO_ENDPOINT` - Logto server endpoint
- `LOGTO_REDIRECT_URI` - OAuth2 callback URI
- `PORT` - Server port (default: 4000)

### 3. Configure Logto Console

In your Logto admin console at https://auth.stella.praetocloud.com:

1. Go to your application settings
2. Add these **Redirect URIs**:
   - `http://localhost:4000/auth/callback`
3. Add these **Post Logout Redirect URIs**:
   - `http://localhost:4000`

### 4. Install Assets

```bash
mix assets.setup
mix assets.build
```

### 5. Start the Server

```bash
mix phx.server
```

Or inside IEx with:

```bash
iex -S mix phx.server
```

The server will start on `http://localhost:4000`

## Testing OAuth2 Flow

1. Navigate to `http://localhost:4000`
2. You'll be redirected to `/auth/sign-in`
3. You'll be redirected to Logto authentication page
4. Sign in with your Logto credentials
5. You'll be redirected back to `http://localhost:4000/auth/callback`
6. The app will exchange the code for tokens
7. You'll be redirected to the dashboard at `http://localhost:4000`

## Troubleshooting

### "client_secret: nil" error

This means the environment variables aren't being loaded. Make sure:
1. The `.env` file exists in the project root
2. The `dotenvy` dependency is installed (`mix deps.get`)
3. The server was started AFTER creating/updating the `.env` file

### "Invalid redirect_uri" error from Logto

Make sure the redirect URI in the Logto console exactly matches:
```
http://localhost:4000/auth/callback
```

### "Invalid state parameter" error

This is a CSRF protection error. Causes:
- Session expired
- Cookies disabled
- Browser blocking third-party cookies

Solution: Clear your browser cookies and try again.

## Project Structure

```
stella_admin/
├── config/
│   ├── config.exs          # Base configuration
│   ├── dev.exs             # Development configuration
│   ├── runtime.exs         # Runtime configuration (loads .env)
│   └── test.exs            # Test configuration
├── lib/
│   ├── stella_admin/       # Business logic
│   └── stella_admin_web/   # Web interface
│       ├── controllers/
│       │   └── auth_controller.ex  # OAuth2 flow handlers
│       ├── live/
│       │   ├── live_auth.ex        # LiveView authentication
│       │   └── *_live.ex           # LiveView pages
│       ├── plugs/
│       │   ├── load_current_user.ex  # Load user from session
│       │   └── require_auth.ex       # Protect routes
│       ├── logto.ex                  # OAuth2 client
│       └── router.ex                 # Route definitions
├── .env                    # Environment variables (gitignored)
├── .env.example            # Environment variables template
└── mix.exs                 # Project dependencies
```

## Next Steps

1. **Customize Protected Routes**: All routes in the main scope require authentication. Modify `router.ex` to change this.

2. **Add User Management**: Currently user info is fetched on each login. Consider storing users in a database.

3. **Implement Token Refresh**: Add automatic token refresh when access tokens expire.

4. **Add Authorization**: Implement role-based access control using Logto's claims.

5. **Production Deployment**: Update `.env` variables for production and ensure HTTPS is enabled.

## Documentation

- `OAUTH2_SETUP.md` - Detailed OAuth2 integration documentation
- `AUTHENTICATION_MECHANISM.md` - How authentication works (comparison with Logto JS SDK)
- `README.md` - Project overview

## Support

For issues or questions about:
- **Logto**: https://docs.logto.io/
- **Phoenix**: https://hexdocs.pm/phoenix/
- **OAuth2 Library**: https://github.com/scrogson/oauth2
