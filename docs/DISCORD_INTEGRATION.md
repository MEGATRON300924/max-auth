# Discord Integration

MAX Auth now supports Discord account linking through Discord OAuth2.

## OAuth

- Authorization: `https://discord.com/oauth2/authorize`
- Token/API: `https://discord.com/api/v10`
- Redirect URI:
  `https://auth.max-ai.name.ng/api/v1/connected-accounts/discord/callback`
- Scopes: `identify email guilds`

Discord access and refresh tokens are encrypted at rest with AES-256-GCM. OAuth state is one-time, hashed, and expires after 10 minutes.

## Environment

Set these production variables:

```text
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_REDIRECT_URI=https://auth.max-ai.name.ng/api/v1/connected-accounts/discord/callback
DISCORD_TOKEN_ENCRYPTION_KEY=
```

The encryption key must be a strong random secret and must not be committed to Git.

## Connected-account endpoints

Authenticated MAX Account:

- `GET /api/v1/connected-accounts/discord/connect`
- `GET /api/v1/connected-accounts/discord/me`
- `GET /api/v1/connected-accounts/discord/guilds`

OAuth callback:

- `GET /api/v1/connected-accounts/discord/callback`

The existing generic unlink endpoint removes the stored Discord connection.

## Discord Developer Portal

Create/configure a Discord application and add the exact redirect URI above under OAuth2 redirect URLs. Keep the OAuth client secret private.

MAX Auth only requests identity/profile/email and server-membership read access here. It does not request bot, message-content, or privileged server permissions.

Discord's current OAuth2 flow returns an access token plus refresh token, with access tokens expiring and refresh tokens used to obtain new access tokens. See Discord's official OAuth documentation for current platform requirements.
