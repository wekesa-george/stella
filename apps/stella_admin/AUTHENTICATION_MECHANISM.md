# Authentication Mechanism

This document explains how the Stella Admin application determines if a user is authenticated, based on the Logto JavaScript SDK implementation.

## How Logto JS SDK Determines Authentication

### Source: `@js/packages/client/src/client.ts`

The Logto JavaScript SDK uses a simple but effective method to check authentication:

```typescript
// Line 166-168 in client.ts
async isAuthenticated() {
  return Boolean(await this.getIdToken());
}
```

**Key Insight: Authentication is determined by the presence of an ID Token in storage.**

### Why ID Token?

The ID Token is a JWT (JSON Web Token) issued by the OpenID Connect provider (Logto) that contains:
- User identity claims (sub, name, email, etc.)
- Token metadata (iss, aud, exp, iat)
- Digital signature for verification

Unlike access tokens (which may be scoped to specific resources), the ID Token specifically represents the authenticated user session.

## Storage Keys Used by Logto SDK

From `@js/packages/client/src/adapter/types.ts:7-12`:

```typescript
export enum PersistKey {
  IdToken = 'idToken',           // Primary authentication indicator
  RefreshToken = 'refreshToken', // Used to refresh expired tokens
  AccessToken = 'accessToken',   // Access tokens for API calls
  SignInSession = 'signInSession' // Temporary session during OAuth flow
}
```

## Token Flow in OAuth2/OIDC

### 1. Sign-In Initiation
```
User clicks "Sign In" → Redirect to Logto → User authenticates
```

### 2. OAuth2 Callback (`handleSignInCallback` - line 574)
```typescript
const { idToken, refreshToken, accessToken, scope, expiresIn } =
  await fetchTokenByAuthorizationCode({ ... });

await this.jwtVerifier.verifyIdToken(idToken);    // Verify JWT signature
await this.setIdToken(idToken);                    // Store ID token
await this.setRefreshToken(refreshToken ?? null);  // Store refresh token
this.accessTokenMap.set(accessTokenKey, { ... });  // Store access token
```

### 3. Token Storage
Tokens are stored in persistent storage:
- **Browser**: localStorage or sessionStorage
- **Node/Express**: Express session (server-side)
- **Phoenix (our implementation)**: Phoenix session (encrypted cookies)

### 4. Authentication Check
Every protected operation first checks:
```typescript
if (!(await this.isAuthenticated())) {
  throw new LogtoClientError('not_authenticated');
}
```

## Phoenix Implementation

Our Phoenix implementation mirrors this pattern:

### Storage Location
**Phoenix Session** (encrypted, signed cookies stored on client but controlled by server)

### Session Keys
```elixir
# Primary authentication indicator (like JS SDK)
:id_token        # OpenID Connect ID Token

# Supporting tokens and data
:access_token    # OAuth2 access token
:refresh_token   # OAuth2 refresh token
:current_user    # User profile from userinfo endpoint
```

### Authentication Check

**In Plugs** (`lib/stella_admin_web/plugs/require_auth.ex:15`):
```elixir
case get_session(conn, :id_token) do
  nil -> redirect_to_sign_in()
  _id_token -> continue()
end
```

**In LiveViews** (`lib/stella_admin_web/live/live_auth.ex:12`):
```elixir
case session["id_token"] do
  nil -> redirect_to_sign_in()
  _id_token -> assign_user_data_and_continue()
end
```

## Why Not Use `current_user`?

While we could check for `current_user` presence, using `id_token` is more aligned with OAuth2/OIDC standards because:

1. **Standardization**: ID Token is the OIDC standard for representing authentication
2. **Verification**: ID Token is a signed JWT that can be verified
3. **Consistency**: Matches Logto's official SDK implementation
4. **Separation of Concerns**:
   - `id_token` = "Is user authenticated?"
   - `current_user` = "What data do we know about the user?"

## Token Lifecycle

### Sign In
```
1. User → /auth/sign-in
2. Generate CSRF state
3. Redirect to Logto with PKCE challenge
4. User authenticates at Logto
5. Logto redirects to /auth/callback?code=XXX&state=YYY
6. Verify state (CSRF protection)
7. Exchange code for tokens
8. Verify ID Token signature
9. Store tokens in session
10. Redirect to dashboard
```

### Authentication Check
```
1. Request arrives at protected route
2. LoadCurrentUser plug loads tokens from session into assigns
3. RequireAuth plug checks for id_token
4. If missing: redirect to /auth/sign-in
5. If present: allow request to proceed
```

### Sign Out
```
1. User → /auth/sign-out
2. Clear all session data (drop: true)
3. Redirect to Logto logout endpoint
4. Logto clears its session
5. Logto redirects back to home page
```

## Security Considerations

### 1. Session Encryption
Phoenix sessions are encrypted and signed by default, preventing:
- Token tampering
- Session hijacking (with proper secret_key_base)

### 2. CSRF Protection
State parameter in OAuth2 flow prevents cross-site request forgery.

### 3. PKCE (Proof Key for Code Exchange)
Protects against authorization code interception attacks.

### 4. Token Verification
ID Token signatures should be verified (future enhancement for Phoenix implementation).

### 5. Refresh Token Rotation
When implementing token refresh, refresh tokens should be rotated (one-time use).

## Future Enhancements

### 1. ID Token Verification
Currently we trust the ID Token from Logto. For maximum security, implement JWT verification:
```elixir
# Verify ID Token signature using Logto's JWKS
def verify_id_token(id_token) do
  with {:ok, jwks} <- fetch_jwks(),
       {:ok, claims} <- Joken.verify(id_token, jwks) do
    {:ok, claims}
  end
end
```

### 2. Token Refresh
Implement automatic token refresh when access tokens expire:
```elixir
def get_access_token(conn) do
  access_token = get_session(conn, :access_token)

  if token_expired?(access_token) do
    refresh_access_token(conn)
  else
    access_token
  end
end
```

### 3. Token Expiration Checks
Decode ID Token and check `exp` claim before trusting it.

### 4. Silent Authentication
Use iframe + `prompt=none` to refresh sessions without user interaction.

## References

- **Logto Client SDK**: `@js/packages/client/src/client.ts`
- **Logto Express SDK**: `@js/packages/express/src/index.ts`
- **Logto Node SDK**: `@js/packages/node/src/client.ts`
- **OpenID Connect Core**: https://openid.net/specs/openid-connect-core-1_0.html
- **OAuth 2.0 RFC 6749**: https://www.rfc-editor.org/rfc/rfc6749
- **PKCE RFC 7636**: https://www.rfc-editor.org/rfc/rfc7636
