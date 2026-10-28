import { Request, Response, NextFunction } from "express";
import { oauthService, MAX_OAUTH_SCOPES } from "../services/oauth.service";
import { oauthClientConfigService } from "../services/oauth-client-config.service";
import { oauthMemoryService } from "../services/oauth-memory.service";
import { ok } from "../utils/response";
import { AppError } from "../utils/AppError";
import { env } from "../config/env";
import { createPublicKey, timingSafeEqual } from "crypto";

function noStore(res: Response) { res.setHeader("Cache-Control", "no-store"); res.setHeader("Pragma", "no-cache"); }

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] || character);
}

const OAUTH_SCOPE_LABELS: Record<string, string> = {
  openid: "Sign you in to this app",
  profile: "View your basic MAX profile",
  "profile:read": "Read your MAX profile",
  email: "View your email address",
  "email:read": "Read your email address",
  "account:read": "Read basic account information",
  "identity:read": "Read your MAX account identity",
  memory: "Access MAX Memory",
  "memory:read": "Read information you have allowed MAX Memory to share",
  "developer:manage": "Manage OAuth applications owned by your MAX Account in MAX for Developers",
  "business:read": "Read the selected business identity and basic profile",
  "business:manage": "Manage the selected business profile where your business role permits",
  "business:members:read": "Read the selected business team and member roles",
  "business:members:manage": "Manage team invitations and memberships where your business role permits",
  "business:apps:manage": "Manage connected MAX products for the selected business",
  offline_access: "Keep access available when you are not actively using the app",
};

function renderOAuthRequestError(req: Request, res: Response, err: AppError) {
  noStore(res);
  res.setHeader("Vary", "Accept");
  const requested = typeof req.query.scope === "string"
    ? [...new Set(req.query.scope.split(/\s+/).filter(Boolean))]
    : [];
  const scopeDetails = (err.details && typeof err.details === "object" ? err.details : {}) as { invalidScopes?: unknown; notAllowedScopes?: unknown };
  const invalidScopes = new Set(Array.isArray(scopeDetails.invalidScopes) ? scopeDetails.invalidScopes.filter((scope): scope is string => typeof scope === "string") : []);
  const notAllowedScopes = new Set(Array.isArray(scopeDetails.notAllowedScopes) ? scopeDetails.notAllowedScopes.filter((scope): scope is string => typeof scope === "string") : []);
  const scopeItems = requested.length
    ? requested.map((scope) => {
        const label = OAUTH_SCOPE_LABELS[scope] || "Unrecognized permission";
        const issue = invalidScopes.has(scope) ? "Not recognized by MAX Auth" : notAllowedScopes.has(scope) ? "Not enabled for this application" : "";
        const issueMarkup = issue ? `<span class="permission-issue">${escapeHtml(issue)}</span>` : "";
        return `<li class="${issue ? "permission-invalid" : ""}"><div><span class="permission-name">${escapeHtml(label)}</span>${issueMarkup}</div><span class="permission-code">${escapeHtml(scope)}</span></li>`;
      }).join("")
    : '<li><span class="permission-name">The requested permissions could not be validated.</span></li>';
  const logoUrl = `${env.FRONTEND_URL.replace(/\/$/, "")}/logo.png`;
  const logoOrigin = new URL(logoUrl).origin;
  const q = String.fromCharCode(39);
  res.setHeader("Content-Security-Policy", "default-src " + q + "none" + q + "; img-src " + logoOrigin + "; style-src " + q + "unsafe-inline" + q + "; base-uri " + q + "none" + q + "; form-action " + q + "none" + q + "; frame-ancestors " + q + "none" + q);
  const isScopeError = err.code === "INVALID_SCOPE";
  const title = isScopeError ? "Permission check failed" : "We couldn't continue";
  const message = isScopeError
    ? "Some permissions in this request are invalid or aren't enabled for this application. MAX Auth has stopped the request, and no access was granted."
    : "MAX Auth couldn't validate this authorization request. No access was granted.";
  const detail = isScopeError
    ? "If you're the developer, compare the flagged permissions with this application's configured scopes in MAX for Developers or MAX Auth. Request only the permissions the app actually needs, then try again."
    : "Return to the app that sent you here, or contact its developer if the problem continues.";
  return res.status(err.statusCode).type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>${escapeHtml(title)} · MAX</title>
  <style>
    :root{color-scheme:light dark;--page:#f7f8fa;--card:#fff;--ink:#252b36;--muted:#667085;--border:#e3e7ed;--accent:#3569b7;--soft:#edf3fc}
    @media(prefers-color-scheme:dark){:root{--page:#17191d;--card:#202329;--ink:#e5e7eb;--muted:#a2a8b3;--border:#373b44;--accent:#9abcf6;--soft:#293342}}
    *{box-sizing:border-box}body{margin:0;min-height:100vh;background:var(--page);color:var(--ink);font:15px/1.55 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:grid;place-items:center;padding:28px 16px}
    main{width:100%;max-width:520px}.brand{display:flex;align-items:center;gap:10px;margin:0 0 28px 4px;color:var(--muted);font-size:14px;font-weight:600}.brand img{width:32px;height:32px;object-fit:contain;border-radius:9px}
    .card{background:var(--card);border:1px solid var(--border);border-radius:24px;padding:32px;box-shadow:0 8px 32px #1018280a}.mark{width:44px;height:44px;border-radius:14px;background:var(--soft);display:grid;place-items:center;color:var(--accent);font-size:22px;font-weight:700}
    h1{font-size:25px;line-height:1.25;letter-spacing:-.5px;font-weight:600;margin:18px 0 10px}p{margin:0;color:var(--muted)}.intro{margin-bottom:24px}.permission-box{border:1px solid var(--border);border-radius:16px;padding:16px;margin:20px 0}.permission-heading{font-size:13px;color:var(--muted);font-weight:600;margin-bottom:10px}ul{list-style:none;padding:0;margin:0;display:grid;gap:12px}li{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.permission-name{font-size:14px}.permission-issue{display:block;margin-top:4px;font-size:12px;color:#b54708}.permission-invalid{background:color-mix(in srgb,#f79009 7%,transparent);border-radius:10px;padding:8px}.permission-code{flex-shrink:0;font:11px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted);background:var(--soft);border-radius:6px;padding:3px 6px;overflow-wrap:anywhere}.notice{font-size:13px;margin-top:16px}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:24px}.button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 18px;border-radius:999px;text-decoration:none;font-size:14px;font-weight:600;border:1px solid var(--border);color:var(--ink)}.primary{background:var(--accent);border-color:var(--accent);color:white}.footer{font-size:12px;text-align:center;margin-top:22px;color:var(--muted)}a:focus-visible{outline:2px solid var(--accent);outline-offset:3px}@media(max-width:480px){.card{padding:24px;border-radius:20px}h1{font-size:23px}li{display:grid;gap:4px}}
  </style>
</head>
<body>
  <main>
    <div class="brand"><img src="${escapeHtml(logoUrl)}" alt="MAX logo"><span>MAX</span></div>
    <section class="card" aria-labelledby="page-title">
      <div class="mark" aria-hidden="true">!</div>
      <h1 id="page-title">${escapeHtml(title)}</h1>
      <p class="intro">${escapeHtml(message)}</p>
      <div class="permission-box">
        <div class="permission-heading">PERMISSIONS INCLUDED IN THIS REQUEST</div>
        <ul>${scopeItems}</ul>
      </div>
      <p>${escapeHtml(detail)}</p>
      <p class="notice">For your protection, MAX Auth won't continue until the request is valid.</p>
      <div class="actions">
        <a class="button primary" href="https://developers.max-ai.name.ng">MAX for Developers</a>
        <a class="button" href="https://max-ai.name.ng">Back to MAX AI</a>
      </div>
    </section>
    <div class="footer"><a href="https://max-ai.name.ng/privacy" style="color:inherit">Privacy</a> · <a href="https://max-ai.name.ng/terms" style="color:inherit">Terms</a></div>
  </main>
</body>
</html>`);
}
function bearer(req: Request) { const header = req.header("authorization"); return header?.startsWith("Bearer ") ? header.slice(7) : undefined; }
function clientCredentials(req: Request) { const authorization = req.header("authorization"); if (authorization?.startsWith("Basic ")) { try { const decoded = Buffer.from(authorization.slice(6), "base64").toString("utf8"); const separator = decoded.indexOf(":"); if (separator > 0) return { clientId: decoded.slice(0, separator), clientSecret: decoded.slice(separator + 1) }; } catch {} } return { clientId: typeof req.body?.client_id === "string" ? req.body.client_id : "", clientSecret: typeof req.body?.client_secret === "string" ? req.body.client_secret : undefined }; }
function requireInternalService(req: Request) { if (!env.MAX_AUTH_SERVICE_TOKEN) throw new AppError("OAuth introspection service authentication is not configured", 503, "SERVICE_AUTH_NOT_CONFIGURED"); const provided = req.header("x-max-service-token") || ""; const expected = Buffer.from(env.MAX_AUTH_SERVICE_TOKEN); const actual = Buffer.from(provided); if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw AppError.unauthorized("Invalid service credentials", "INVALID_SERVICE_CREDENTIALS"); }
async function authorizedOAuthContext(req: Request) { const result = await oauthService.introspect(bearer(req) || ""); if (!result.active || !result.user || !result.scopes) throw AppError.unauthorized("Invalid OAuth access token", "INVALID_TOKEN"); return result; }

export const oauthController = {
  async createClient(req: Request, res: Response, next: NextFunction) { noStore(res); try { const { name, redirectUris, scopes, isConfidential } = req.body; const result = await oauthService.createClient(req.user!.sub, { name, redirectUris, scopes, isConfidential }); return ok(res, { client: result.client, clientSecret: result.clientSecret, warning: "Store this client secret now — it will not be shown again." }, 201); } catch (err) { next(err); } },
  async listClients(req: Request, res: Response, next: NextFunction) { try { return ok(res, { clients: await oauthService.listClientsForOwner(req.user!.sub) }); } catch (err) { next(err); } },
  async updateClient(req: Request, res: Response, next: NextFunction) { try { const { name, redirectUris, scopes, isConfidential } = req.body; return ok(res, { client: await oauthService.updateClient(req.user!.sub, req.params.clientId, { name, redirectUris, scopes, isConfidential }) }); } catch (err) { next(err); } },
  async rotateClientSecret(req: Request, res: Response, next: NextFunction) { noStore(res); try { const result = await oauthService.rotateClientSecret(req.user!.sub, req.params.clientId); return ok(res, { ...result, warning: "Store this client secret now — it will not be shown again." }); } catch (err) { next(err); } },
  async revokeClient(req: Request, res: Response, next: NextFunction) { try { return ok(res, { client: await oauthService.revokeClient(req.user!.sub, req.params.clientId) }); } catch (err) { next(err); } },
  async listConsents(req: Request, res: Response, next: NextFunction) { try { return ok(res, { consents: await oauthService.listConsentsForUser(req.user!.sub) }); } catch (err) { next(err); } },
  async revokeConsent(req: Request, res: Response, next: NextFunction) { try { await oauthService.revokeConsent(req.user!.sub, req.params.consentId); return ok(res, { message: "Consent revoked" }); } catch (err) { next(err); } },
  async clientTester(req: Request, res: Response, next: NextFunction) { try { const clientId = typeof req.query.client_id === "string" ? req.query.client_id.trim() : ""; const redirectUri = typeof req.query.redirect_uri === "string" ? req.query.redirect_uri : undefined; const scopes = typeof req.query.scope === "string" ? req.query.scope.split(" ").filter(Boolean) : []; if (!clientId) throw AppError.badRequest("client_id is required", "CLIENT_ID_REQUIRED"); return ok(res, await oauthClientConfigService.publicClientTest(clientId, redirectUri, scopes)); } catch (err) { next(err); } },
  async authorize(req: Request, res: Response, next: NextFunction) { try { const input = { clientId: String(req.query.client_id || ""), redirectUri: String(req.query.redirect_uri || ""), responseType: String(req.query.response_type || ""), scope: typeof req.query.scope === "string" ? req.query.scope : undefined, state: typeof req.query.state === "string" ? req.query.state : undefined, codeChallenge: typeof req.query.code_challenge === "string" ? req.query.code_challenge : undefined, codeChallengeMethod: typeof req.query.code_challenge_method === "string" ? req.query.code_challenge_method : undefined, businessId: typeof req.query.business_id === "string" ? req.query.business_id : undefined }; const config = await oauthClientConfigService.getPublic(input.clientId); const { client, scopes, requestToken } = await oauthService.getAuthorizationRequest({ ...input, branding: { name: config.displayName || undefined, logo: config.logoUrl || undefined, website: config.websiteUrl || undefined } }); const params = new URLSearchParams({ client_id: client.clientId, client_name: config.displayName || client.name, redirect_uri: input.redirectUri, response_type: "code", scope: scopes.join(" "), state: input.state! }); if (config.logoUrl) params.set("client_logo", config.logoUrl); if (config.websiteUrl) params.set("client_website", config.websiteUrl); params.set("code_challenge", input.codeChallenge!); params.set("code_challenge_method", "S256"); params.set("request_token", requestToken); return res.redirect(`${env.FRONTEND_URL}/authorize?${params.toString()}`); } catch (err) { if (err instanceof AppError && req.get("accept")?.toLowerCase().includes("text/html")) { return renderOAuthRequestError(req, res, err); } next(err); } },
  async authorizeDetails(req: Request, res: Response, next: NextFunction) { try { noStore(res); res.setHeader("Referrer-Policy", "no-referrer"); const requestToken = typeof req.query.request_token === "string" ? req.query.request_token : ""; if (!requestToken) throw AppError.badRequest("Authorization request token is required", "INVALID_REQUEST"); return ok(res, { request: await oauthService.inspectAuthorizationRequest(requestToken) }); } catch (err) { next(err); } },
  async approve(req: Request, res: Response, next: NextFunction) { try { const { clientId, redirectUri, scopes, codeChallenge, codeChallengeMethod, state, requestToken } = req.body; const code = await oauthService.issueAuthorizationCode({ clientId, userId: req.user!.sub, redirectUri, scopes: String(scopes || "").split(" ").filter(Boolean), codeChallenge, codeChallengeMethod, state, requestToken }); const callback = new URL(redirectUri); callback.searchParams.set("code", code); callback.searchParams.set("state", state); return ok(res, { redirectUri: callback.toString() }); } catch (err) { next(err); } },
  async token(req: Request, res: Response, next: NextFunction) { try { noStore(res); const body = req.body || {}; const credentials = clientCredentials(req); if (body.grant_type === "authorization_code") return res.json(await oauthService.exchangeCode({ code: body.code, clientId: credentials.clientId, redirectUri: body.redirect_uri, codeVerifier: body.code_verifier, clientSecret: credentials.clientSecret })); if (body.grant_type === "refresh_token") return res.json(await oauthService.refreshAccessToken(body.refresh_token, credentials.clientId, credentials.clientSecret)); throw AppError.badRequest("Unsupported grant type", "UNSUPPORTED_GRANT_TYPE"); } catch (err) { next(err); } },
  async revoke(req: Request, res: Response, next: NextFunction) { try { noStore(res); const credentials = clientCredentials(req); await oauthService.revokeToken(req.body?.token, credentials.clientId, credentials.clientSecret); return res.status(200).json({}); } catch (err) { next(err); } },
  async introspect(req: Request, res: Response, next: NextFunction) { try { noStore(res); requireInternalService(req); return res.json(await oauthService.introspect(bearer(req) || String(req.body?.token || ""))); } catch (err) { next(err); } },
  async businessContext(req: Request, res: Response, next: NextFunction) {
    try {
      noStore(res);
      const token = bearer(req);
      if (!token) throw AppError.unauthorized("A business-scoped OAuth access token is required", "INVALID_TOKEN");
      const result = await oauthService.introspect(token);
      if (!result.active) throw AppError.unauthorized("This token is inactive", "INVALID_TOKEN");
      const user = result.user;
      const scopes = result.scopes;
      if (!user || !scopes || !result.business_id || !result.business_role) {
        throw AppError.unauthorized("This token has no active business context", "BUSINESS_CONTEXT_REQUIRED");
      }
      const businessScopes = scopes.filter((scope) => scope.startsWith("business:"));
      if (!businessScopes.length) throw AppError.forbidden("The token is missing business permissions", "INSUFFICIENT_SCOPE");
      return ok(res, {
        user: { id: user.id, email: user.email, username: user.username, displayName: user.displayName },
        business: { businessId: result.business_id, displayName: result.business_name, role: result.business_role },
        scopes: businessScopes,
        expiresAt: result.exp,
      });
    } catch (err) { next(err); }
  },
  async userinfo(req: Request, res: Response, next: NextFunction) { try { noStore(res); const result = await authorizedOAuthContext(req); const claims: Record<string, unknown> = { sub: result.user.id }; if (result.scopes.includes("identity:read")) claims.user_id = result.user.id; if (result.scopes.includes("profile") || result.scopes.includes("profile:read")) Object.assign(claims, { name: result.user.displayName, preferred_username: result.user.username, picture: result.user.avatarUrl || `${(env.FRONTEND_URL.endsWith("/") ? env.FRONTEND_URL.slice(0, -1) : env.FRONTEND_URL)}/user.png` }); if (result.scopes.includes("email") || result.scopes.includes("email:read")) Object.assign(claims, { email: result.user.email, email_verified: result.user.verificationStatus === "VERIFIED" }); if (result.scopes.includes("memory:read")) claims.memory = await oauthMemoryService.getAuthorizedMemory(bearer(req) || ""); return res.json(claims); } catch (err) { next(err); } },
  async memory(req: Request, res: Response, next: NextFunction) { try { noStore(res); const result = await authorizedOAuthContext(req); if (!result.scopes.includes("memory:read")) throw AppError.forbidden("The access token does not include MAX Memory permission", "INSUFFICIENT_SCOPE"); return res.json(await oauthMemoryService.getAuthorizedMemory(bearer(req) || "")); } catch (err) { next(err); } },
  discovery(_req: Request, res: Response) { return res.json({ issuer: env.OIDC_ISSUER, authorization_endpoint: `${env.APP_URL}/api/v1/oauth/authorize`, token_endpoint: `${env.APP_URL}/api/v1/oauth/token`, userinfo_endpoint: `${env.APP_URL}/api/v1/oauth/userinfo`, memory_endpoint: `${env.APP_URL}/api/v1/oauth/memory`, introspection_endpoint: `${env.APP_URL}/api/v1/oauth/introspect`, revocation_endpoint: `${env.APP_URL}/api/v1/oauth/revoke`, jwks_uri: `${env.APP_URL}/.well-known/jwks.json`, response_types_supported: ["code"], response_modes_supported: ["query"], grant_types_supported: ["authorization_code", "refresh_token"], code_challenge_methods_supported: ["S256"], subject_types_supported: ["public"], id_token_signing_alg_values_supported: ["RS256"], scopes_supported: MAX_OAUTH_SCOPES.filter((scope) => scope !== "developer:manage"), claims_supported: ["sub", "user_id", "name", "preferred_username", "email", "email_verified", "picture", "memory"] }); },
  jwks(_req: Request, res: Response) { if (!env.OIDC_PUBLIC_KEY) return res.status(503).json({ error: "oidc_not_configured" }); try { const jwk = createPublicKey(env.OIDC_PUBLIC_KEY.replace(/\\n/g, "\n")).export({ format: "jwk" }) as Record<string, string>; return res.json({ keys: [{ kty: jwk.kty, use: "sig", alg: "RS256", kid: env.OIDC_KEY_ID, n: jwk.n, e: jwk.e }] }); } catch { return res.status(503).json({ error: "oidc_not_configured" }); } },
};