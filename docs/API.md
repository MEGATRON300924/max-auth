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

**Register** body: `{ username, email, password, fullName, displayName, ageConfirmed: true, rememberMe?, country?, language?, timezone? }`. `ageConfirmed` is a required self-attestation; MAX does not collect a date of birth in this flow.
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

## OAuth / OIDC — `/oauth`

| Method | Path | Description |
|---|---|---|
| POST | `/oauth/clients` | Register an OAuth client |
| GET | `/oauth/clients` | List owned OAuth clients |
| PATCH | `/oauth/clients/:clientId` | Update client name, redirect URIs or scopes |
| GET / PUT | `/oauth/clients/:clientId/config` | Read or update platform configuration |
| GET | `/oauth/authorize` | Validate an authorization request and start consent |
| GET | `/oauth/authorize/details` | Return details from a signed, validated authorization request |
| POST | `/oauth/authorize/approve` | Approve a validated request and issue a short-lived code |
| POST | `/oauth/token` | Exchange an authorization code or refresh token |
| POST | `/oauth/revoke` | Revoke a token |
| GET | `/oauth/userinfo` | Return claims permitted by the access token's scopes |
| GET | `/oauth/memory` | Read authorized MAX Memory data when `memory:read` is granted |
| GET / POST | `/oauth/introspect` | Internal token introspection; requires service authentication |

Authorization uses the authorization-code flow with PKCE S256, exact redirect URI matching, signed request details, short-lived single-use codes, and scope checks. Browser requests that fail validation receive a branded HTML error page; API requests can receive JSON errors. Only the official MAX for Developers client may request `developer:manage`, and the developer console must request only `openid profile email offline_access developer:manage`.

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
  -d '{"username":"megatron","fullName":"Example Name","displayName":"Megatron","email":"zion@example.com","password":"SuperSecret123","ageConfirmed":true,"rememberMe":false}'

# -> { "success": true, "data": { "user": {...}, "accessToken": "eyJ..." } }

curl http://localhost:4000/api/v1/auth/me \
  -H "Authorization: Bearer eyJ..."
```
