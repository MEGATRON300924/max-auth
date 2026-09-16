import { createServer, type Server } from "node:http";
import { randomBytes, createHash } from "node:crypto";

export type MaxPermission = "identity:read" | "profile:read" | "email:read" | "memory:read" | "offline_access";
export interface DesktopConfig { clientId: string; redirectUri?: string; permissions?: MaxPermission[]; authorizeUrl?: string; tokenUrl?: string; }
export interface MaxTokens { accessToken: string; tokenType: string; expiresIn?: number; refreshToken?: string; scope?: string; }

const BASE = "https://auth.max-ai.name.ng/api/v1";
const encode = (value: Buffer) => value.toString("base64url");
const verifier = () => encode(randomBytes(32));
const challenge = (value: string) => encode(createHash("sha256").update(value).digest());

export class MaxDesktopAuth {
  constructor(private readonly config: DesktopConfig) {
    if (!config.clientId) throw new Error("MAX Client ID is required.");
  }

  async authorize(): Promise<MaxTokens> {
    const state = encode(randomBytes(32));
    const codeVerifier = verifier();
    const server = createServer();
    const callback = await new Promise<{ server: Server; url: URL; redirectUri: string }>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address === "string") return reject(new Error("Unable to open local callback."));
        const redirectUri = this.config.redirectUri ?? `http://127.0.0.1:${address.port}/oauth/callback`;
        const url = new URL(this.config.authorizeUrl ?? `${BASE}/oauth/authorize`);
        url.search = new URLSearchParams({ client_id: this.config.clientId, redirect_uri: redirectUri, response_type: "code", scope: (this.config.permissions ?? ["identity:read"]).join(" "), code_challenge: challenge(codeVerifier), code_challenge_method: "S256", state }).toString();
        resolve({ server, url, redirectUri });
      });
    });

    const { exec } = await import("node:child_process");
    const openCommand = process.platform === "win32" ? `start "" "${callback.url}"` : process.platform === "darwin" ? `open "${callback.url}"` : `xdg-open "${callback.url}"`;
    exec(openCommand);

    const code = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => { callback.server.close(); reject(new Error("MAX Auth timed out.")); }, 120000);
      callback.server.on("request", (request, response) => {
        try {
          const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
          if (requestUrl.pathname !== "/oauth/callback") { response.statusCode = 404; response.end(); return; }
          if (requestUrl.searchParams.get("state") !== state) { response.statusCode = 400; response.end("Invalid state"); clearTimeout(timer); callback.server.close(); reject(new Error("MAX Auth state validation failed.")); return; }
          const error = requestUrl.searchParams.get("error");
          if (error) { response.statusCode = 400; response.end("MAX Auth sign-in failed"); clearTimeout(timer); callback.server.close(); reject(new Error(requestUrl.searchParams.get("error_description") ?? error)); return; }
          const value = requestUrl.searchParams.get("code");
          if (!value) throw new Error("No authorization code returned.");
          response.end("You can return to the application."); clearTimeout(timer); callback.server.close(); resolve(value);
        } catch (error) { clearTimeout(timer); callback.server.close(); reject(error); }
      });
    });

    const response = await fetch(this.config.tokenUrl ?? `${BASE}/oauth/token`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ grant_type: "authorization_code", code, client_id: this.config.clientId, redirect_uri: callback.redirectUri, code_verifier: codeVerifier }) });
    const body = await response.json() as { data?: MaxTokens; error?: { message?: string }; error_description?: string };
    if (!response.ok) throw new Error(body.error?.message ?? body.error_description ?? "MAX token exchange failed.");
    return (body.data ?? body) as MaxTokens;
  }
}
