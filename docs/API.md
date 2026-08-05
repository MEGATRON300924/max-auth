# MAX Auth — API Documentation

Base URL: `{APP_URL}/api/v1`
Interactive Swagger UI: `{APP_URL}/docs` (raw spec at `/docs.json`)

All responses follow the shape:

```json
{ "success": true, "data": { ... } }
```
or on error:
```json
{ "success": false, "error": { "code": "SOME_CODE", "message": "...", "details": [...] } }
```

Authenticated routes require `Authorization: Bearer <accessToken>`.
Cookie-based routes (`/auth/refresh`, `/auth/logout`) additionally require an
`x-csrf-token` header — call `GET /security/csrf-token` first to obtain one.

---

## Authentication — `/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | – | Create a MAX Account |
| POST | `/auth/login` | – | Login with email or username + password |
| POST | `/auth/logout` | cookie + CSRF | Revoke current session |
| POST | `/auth/refresh` | cookie + CSRF | Rotate refresh token, get new access token |
| GET | `/auth/me` | Bearer | Get the current authenticated user |
| POST | `/auth/email/send-verification` | Bearer | (Re)send email verification link |
| POST | `/auth/email/verify` | – | Verify email with token |
| POST | `/auth/password/forgot` | – | Request password reset email |
| POST | `/auth/password/reset` | – | Reset password with token |
| POST | `/auth/password/change` | Bearer | Change password (requires current password) |
| DELETE | `/auth/account` | Bearer | Soft-delete the account (requires password) |

**Register** body: `{ username, email, password, displayName?, country?, language?, timezone? }`
**Login** body: `{ identifier, password }` — `identifier` is email or username.

## Profile — `/profile`

| Method | Path | Description |
|---|---|---|
| GET | `/profile` | Get full profile |
| PATCH | `/profile` | Update `displayName`, `avatarUrl`, `country`, `language`, `timezone` |
| GET | `/profile/ai` | Get AI personalization profile |
| PATCH | `/profile/ai` | Update `interests`, `preferences`, `languages`, `connectedServices` |

## Devices & Sessions — `/devices`

| Method | Path | Description |
|---|---|---|
| GET | `/devices` | List known devices |
| POST | `/devices/:deviceId/trust` | Mark a device trusted |
| DELETE | `/devices/:deviceId` | Remove a device |
| GET | `/devices/sessions/all` | List active sessions |
| DELETE | `/devices/sessions/:sessionId` | Revoke one session |
| DELETE | `/devices/sessions` | Revoke all sessions (log out everywhere) |
| GET | `/devices/login-history` | List login attempts |

## Security — `/security`

| Method | Path | Description |
|---|---|---|
| GET | `/security/csrf-token` | Get a CSRF token for cookie-based routes |
| GET | `/security/audit-logs` | List audit trail for the current user |

## Connected Accounts — `/connected-accounts`
*(Architecture only — link/unlink management; provider OAuth handshakes not implemented)*

| Method | Path | Description |
|---|---|---|
| GET | `/connected-accounts` | List linked accounts |
| DELETE | `/connected-accounts/:accountId` | Unlink an account |

## OAuth ("Continue with MAX AI") — `/oauth`

| Method | Path | Status | Description |
|---|---|---|---|
| POST | `/oauth/clients` | ✅ live | Register a new OAuth client |
| GET | `/oauth/clients` | ✅ live | List your OAuth clients |
| DELETE | `/oauth/clients/:clientId` | ✅ live | Deactivate a client |
| GET | `/oauth/consents` | ✅ live | List apps you've granted access to |
| DELETE | `/oauth/consents/:consentId` | ✅ live | Revoke access for an app |
| GET | `/oauth/authorize` | 🚧 501 | Authorization endpoint — not implemented yet |
| POST | `/oauth/token` | 🚧 501 | Token exchange — not implemented yet |

## Administration — `/admin` (requires `isAdmin = true`)

| Method | Path | Description |
|---|---|---|
| GET | `/admin/users` | List/search users, paginated |
| GET | `/admin/users/:userId` | Get a single user |
| POST | `/admin/users/:userId/suspend` | Suspend an account |
| POST | `/admin/users/:userId/reactivate` | Reactivate an account |
| GET | `/admin/stats` | Platform-wide statistics |

## Health — `/health`

| Method | Path | Description |
|---|---|---|
| GET | `/health/live` | Liveness probe |
| GET | `/health/ready` | Readiness probe (checks DB connectivity) |

---

## Example: register + call a protected route

```bash
curl -X POST http://localhost:4000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"megatron","email":"zion@example.com","password":"SuperSecret123"}'

# -> { "success": true, "data": { "user": {...}, "accessToken": "eyJ..." } }

curl http://localhost:4000/api/v1/auth/me \
  -H "Authorization: Bearer eyJ..."
```
