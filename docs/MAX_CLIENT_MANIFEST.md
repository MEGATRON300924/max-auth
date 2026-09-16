# MAX Client Manifest

Developers may publish a JSON manifest at a stable HTTPS URL such as `/.well-known/max-auth.json`.

Example:

```json
{
  "client_id": "max_client_...",
  "website": "https://example.com",
  "redirect_uris": [
    "https://example.com/auth/callback"
  ],
  "authorization": {
    "provider": "max-auth",
    "pkce": "S256"
  }
}
```

The manifest is an additional verification and diagnostics mechanism. It does not replace the OAuth client ID, exact redirect URI validation, or PKCE.

MAX Auth only accepts a manifest hosted on a registered website host. It checks that the manifest declares the same client ID, registered redirect URIs, website and S256 PKCE configuration before marking the client `VERIFIED`.

Do not put client secrets in this file. Public clients must use Authorization Code + S256 PKCE.
