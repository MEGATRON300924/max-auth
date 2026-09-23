# MAX AI Backend integration contract

MAX Auth remains the identity, OAuth, connected-account, and credential boundary. The future MAX AI Backend owns the AI model/brain and can use the internal service bridge for personalization state.

## Service authentication

MAX AI Backend -> MAX Auth internal requests use:

- `X-MAX-Auth-Service-Token: <MAX_AUTH_SERVICE_TOKEN>`
- `X-MAX-User-Id: <user UUID>`

The service token must never be exposed to the MAX AI app or browser.

## Personalization endpoints

Base path:

`/api/v1/internal`

### Get personalization snapshot

`GET /users/:userId/personalization`

Returns:
- stable MAX user identity fields needed for personalization
- AI profile: interests, preferences, languages, connected-service signals, memory metadata
- connected provider metadata and granted scopes
- token expiry metadata

It never returns access tokens or refresh tokens.

### Update personalization profile

`PATCH /users/:userId/personalization`

Supported JSON fields:
- `interests`
- `preferences`
- `languages`
- `connectedServices`
- `memoryMetadata`

### Update one provider's derived signals

`PATCH /users/:userId/personalization/services/:provider`

Use this for normalized signals such as Spotify music preferences or YouTube interests. Do not store provider access/refresh tokens in the AI profile.

## OAuth boundary

The MAX AI app should initiate connected-service authorization. MAX Auth handles the OAuth callback and encrypted provider credentials. The browser should never receive provider refresh tokens or the MAX Auth service token.

## Current personalization-ready scopes

Google includes YouTube readonly access in addition to the existing Google Workspace scopes.

Spotify now requests:
- `user-top-read`
- `user-read-recently-played`
- `user-read-currently-playing`
- `user-read-playback-state`
- `user-modify-playback-state`
- `user-library-read`
- `playlist-read-private`

Existing Spotify users will need to reconnect Spotify to grant newly added permissions.

## Google Maps

Google Maps is not an OAuth connected-account scope. Maps Platform access/billing should be handled by the service that performs Maps/Places requests, with usage controls. MAX Auth should not store a Maps API key in user connected-account records.

## Security boundary

Raw third-party credentials stay encrypted in MAX Auth. MAX AI Backend receives only the user-scoped data or derived personalization signals it needs. This keeps the AI layer independent of OAuth token storage and provider credential management.
