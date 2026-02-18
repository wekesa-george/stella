# OAuth2 Setup with Logto

This document explains the OAuth2 integration with Logto for the Stella Admin application.

## Overview

The application uses Logto as an OAuth2/OIDC provider for user authentication. The implementation is based on the Logto JavaScript SDK patterns found in the `@js/packages/express` and `@js/packages/node` directories.

## Configuration

### 1. Environment Variables

Copy `.env.example` to `.env` and fill in your Logto credentials:

```bash
cp .env.example .env
```

Required environment variables:

- `LOGTO_APP_ID`: Your Logto application ID (default: `92rd6uz9rn4o0ch68etka`)
- `LOGTO_APP_SECRET`: Your Logto application secret (get from Logto console)
- `LOGTO_ENDPOINT`: Logto server endpoint (default: `https://auth.stella.praetocloud.com`)
- `LOGTO_REDIRECT_URI`: OAuth2 callback URI (default: `http://localhost:4000/auth/callback`)

### 2. Logto Console Configuration

In your Logto admin console (https://auth.stella.praetocloud.com):

1. Go to your application settings
2. Add the following redirect URIs:
   - `http://localhost:4000/auth/callback` (development)
   - `https://your-production-domain.com/auth/callback` (production)
3. Add the following post logout redirect URIs:
   - `http://localhost:4000` (development)
   - `https://your-production-domain.com` (production)
4. Copy your App Secret from the console

## Architecture

### Key Components

1. **OAuth2 Client** (`lib/stella_admin_web/logto.ex`):
   - Implements OAuth2 strategy for Logto
   - Handles token exchange and user info retrieval
   - Based on the `@logto/node` SDK implementation

2. **Auth Controller** (`lib/stella_admin_web/controllers/auth_controller.ex`):
   - Handles sign-in, callback, and sign-out flows
   - Similar to the Express SDK's `handleAuthRoutes` function

3. **Authentication Plugs**:
   - `LoadCurrentUser`: Loads user from session into `conn.assigns`
   - `RequireAuth`: Protects routes requiring authentication

4. **LiveView Auth** (`lib/stella_admin_web/live/live_auth.ex`):
   - Ensures authentication in LiveView sessions
   - Makes user data available in LiveViews via `@current_user`

### Authentication Flow

1. **Sign In**:
   ```
   User → /auth/sign-in → Logto Auth Page → /auth/callback → Dashboard
   ```

2. **Callback**:
   - Verifies CSRF state
   - Exchanges authorization code for access token
   - Fetches user info
   - Creates session

3. **Sign Out**:
   - Clears local session
   - Redirects to Logto logout endpoint
   - Logto redirects back to home page

## Endpoints

- `GET /auth/sign-in`: Initiates OAuth2 flow
- `GET /auth/callback`: Handles OAuth2 callback
- `GET /auth/sign-out`: Signs out and redirects to Logto logout

## Protected Routes

All routes under `/` (dashboard, users, trading, etc.) require authentication. Unauthenticated users are automatically redirected to `/auth/sign-in`.

## Session Management

Following the Logto JS SDK pattern (see `@js/packages/client/src/client.ts:166-168`), authentication is determined by the presence of an ID Token. User information is stored in the Phoenix session:

- `id_token`: OpenID Connect ID Token (primary authentication indicator)
- `access_token`: OAuth2 access token
- `refresh_token`: OAuth2 refresh token (for future token refresh)
- `current_user`: User profile information (from userinfo endpoint)

## Accessing User Data

### In Controllers

```elixir
def index(conn, _params) do
  current_user = conn.assigns.current_user
  access_token = conn.assigns.access_token
  # ...
end
```

### In LiveViews

```elixir
def mount(_params, _session, socket) do
  current_user = socket.assigns.current_user
  access_token = socket.assigns.access_token
  # ...
end
```

### In Templates

```heex
<%= if @current_user do %>
  <p>Welcome, <%= @current_user["name"] %>!</p>
<% end %>
```

## Security Features

1. **CSRF Protection**: State parameter prevents cross-site request forgery
2. **Secure Sessions**: Phoenix's built-in session encryption
3. **Token Storage**: Tokens stored server-side in encrypted sessions
4. **HTTPS Required**: Production should use HTTPS for all communications

## Troubleshooting

### "Invalid state parameter" error

This means the CSRF state verification failed. Possible causes:
- Session expired
- Cookies disabled
- CSRF attack attempt

Solution: Clear cookies and try signing in again.

### "Failed to exchange code for token" error

The OAuth2 code exchange failed. Check:
- `LOGTO_APP_SECRET` is correct
- Redirect URI matches Logto console configuration
- Network connectivity to Logto endpoint

### "Failed to fetch user information" error

Token exchange succeeded but user info fetch failed. Check:
- Access token is valid
- Logto endpoint is accessible
- Scopes include required claims (openid, profile, email)

## Development

To test the OAuth2 flow locally:

```bash
# Set up environment variables
cp .env.example .env
# Edit .env with your Logto credentials

# Install dependencies
mix deps.get

# Start the server
mix phx.server
```

Visit `http://localhost:4000` and you'll be redirected to sign in.

## References

- Logto Documentation: https://docs.logto.io/
- OAuth2 Elixir Library: https://github.com/scrogson/oauth2
- Phoenix Authentication Guide: https://hexdocs.pm/phoenix/Mix.Tasks.Phx.Gen.Auth.html
- Express SDK Implementation: `@js/packages/express/src/index.ts`
- Node SDK Implementation: `@js/packages/node/src/client.ts`
