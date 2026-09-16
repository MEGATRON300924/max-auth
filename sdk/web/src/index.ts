export type MaxPermission =
  | "identity:read"
  | "profile:read"
  | "email:read"
  | "memory:read"
  | "offline_access";

export interface MaxAuthConfig {
  clientId: string;
  redirectUri: string;
  permissions?: MaxPermission[];
  authorizeUrl?: string;
  tokenUrl?: string;
  userInfoUrl?: string;
  storage?: Storage;
}

export interface MaxTokens {
  accessToken: string;
  tokenType: string;
  expiresIn?: number;
  refreshToken?: string;
  scope?: string;
}

export interface MaxUserInfo {
  sub?: string;
  id?: string;
  name?: string;
  username?: string;
  email?: string;
  email_verified?: boolean;
  picture?: string;
  memory?: unknown;
  [key: string]: unknown;
}

const DEFAULT_BASE = "https://auth.max-ai.name.ng/api/v1";
const randomBytes = (length: number) => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
};
const base64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
const createVerifier = () => base64Url(randomBytes(32));
const sha256 = async (value: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));

export class MaxAuth {
  private readonly config: Required<Pick<MaxAuthConfig, "clientId" | "redirectUri">> & MaxAuthConfig;
  private readonly storage: Storage;
  private tokens: MaxTokens | null = null;

  constructor(config: MaxAuthConfig) {
    if (!config.clientId) throw new Error("MAX Client ID is required.");
    if (!config.redirectUri) throw new Error("MAX redirect URI is required.");
    if (!globalThis.crypto?.subtle) throw new Error("Web Crypto is required for MAX Auth.");
    this.config = config;
    this.storage = config.storage ?? sessionStorage;
  }

  async getAuthorizationUrl(): Promise<string> {
    const state = base64Url(randomBytes(32));
    const verifier = createVerifier();
    const challenge = base64Url(await sha256(verifier));
    this.storage.setItem("max_auth_state", state);
    this.storage.setItem("max_auth_verifier", verifier);
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      scope: (this.config.permissions ?? ["identity:read"]).join(" "),
      code_challenge: challenge,
      code_challenge_method: "S256",
      state,
    });
    return `${this.config.authorizeUrl ?? `${DEFAULT_BASE}/oauth/authorize`}?${params}`;
  }

  async signIn(): Promise<void> {
    globalThis.location.assign(await this.getAuthorizationUrl());
  }

  async handleCallback(url = globalThis.location.href): Promise<MaxTokens> {
    const parsed = new URL(url);
    const returnedState = parsed.searchParams.get("state");
    const expectedState = this.storage.getItem("max_auth_state");
    const code = parsed.searchParams.get("code");
    const error = parsed.searchParams.get("error");
    if (error) throw new Error(parsed.searchParams.get("error_description") ?? error);
    if (!code) throw new Error("MAX Auth callback did not contain an authorization code.");
    if (!returnedState || !expectedState || returnedState !== expectedState) throw new Error("MAX Auth state validation failed.");
    const verifier = this.storage.getItem("max_auth_verifier");
    if (!verifier) throw new Error("MAX Auth PKCE verifier is missing.");
    const response = await fetch(this.config.tokenUrl ?? `${DEFAULT_BASE}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ grant_type: "authorization_code", code, client_id: this.config.clientId, redirect_uri: this.config.redirectUri, code_verifier: verifier }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message ?? body?.error_description ?? "MAX token exchange failed.");
    this.tokens = body.data ?? body;
    this.storage.removeItem("max_auth_state");
    this.storage.removeItem("max_auth_verifier");
    return this.tokens as MaxTokens;
  }

  setTokens(tokens: MaxTokens) { this.tokens = tokens; }
  getTokens() { return this.tokens; }

  async getUserInfo(): Promise<MaxUserInfo> {
    if (!this.tokens?.accessToken) throw new Error("Sign in with MAX before requesting user information.");
    const response = await fetch(this.config.userInfoUrl ?? `${DEFAULT_BASE}/oauth/userinfo`, { headers: { Authorization: `Bearer ${this.tokens.accessToken}`, Accept: "application/json" } });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message ?? "Unable to load MAX account information.");
    return body.data ?? body;
  }

  async refresh(): Promise<MaxTokens> {
    if (!this.tokens?.refreshToken) throw new Error("No MAX refresh token is available.");
    const response = await fetch(this.config.tokenUrl ?? `${DEFAULT_BASE}/oauth/token`, {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ grant_type: "refresh_token", refresh_token: this.tokens.refreshToken, client_id: this.config.clientId }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message ?? "MAX token refresh failed.");
    this.tokens = body.data ?? body;
    return this.tokens as MaxTokens;
  }

  async revoke(token = this.tokens?.refreshToken ?? this.tokens?.accessToken): Promise<void> {
    if (!token) return;
    const response = await fetch(`${DEFAULT_BASE}/oauth/revoke`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ token, client_id: this.config.clientId }) });
    if (!response.ok) throw new Error("MAX token revocation failed.");
    this.tokens = null;
  }
}

export const createMaxAuth = (config: MaxAuthConfig) => new MaxAuth(config);
