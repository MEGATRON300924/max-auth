# MAX Auth Status API

The MAX ecosystem status API backs the public status page with persistent PostgreSQL storage. It uses the existing MAX Auth database and administrator access control.

## Public read

`GET /api/v1/status`

No access token is required. Response is intentionally shaped for direct consumption by the existing `status.html` page (which reads the top-level `status` object):

```json
{
  "success": true,
  "status": {
      "MAX Auth": {
        "status": "green",
        "reason": "",
        "category": "ai",
        "updatedAt": null,
        "updatedById": null
      }
  },
  "services": [],
  "updatedAt": null,
  "updatedBy": null
}
```

Status values are `green` (operational), `yellow` (degraded/partial), and `red` (offline). Services that have not been manually updated are returned as operational defaults for compatibility with the existing status page.

## Admin update

`PATCH /api/v1/status/services/{serviceKey}`

Requires a valid MAX Auth access token for a user whose MAX Auth account has `isAdmin = true`.

```http
Authorization: Bearer <MAX_AUTH_ACCESS_TOKEN>
Content-Type: application/json
```

```json
{
  "status": "yellow",
  "reason": "Some requests may be delayed while we investigate."
}
```

The service key is the URL-encoded service name, for example `MAX%20Auth`. Updates are saved in PostgreSQL and also recorded in the existing admin audit log. This API does not run automated probes; statuses are manually controlled.

## Storage and deployment

A new additive Prisma migration creates `status_page_services`. It does not alter or delete existing tables or data. The existing startup migration process applies it during deployment.
