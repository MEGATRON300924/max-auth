import crypto from "crypto";
import { ConnectedProvider } from "@prisma/client";
import { prisma } from "../database/prisma";
import { AppError } from "../utils/AppError";
import { auditService } from "./audit.service";
import { env } from "../config/env";

const GITHUB_API = "https://api.github.com";
const STATE_TTL_MS = 10 * 60 * 1000;
const INSTALL_STATE_MARKER = "github-app-installation";

function stateHash(value: string) { return crypto.createHash("sha256").update(value).digest("hex"); }
function base64url(value: Buffer | string) { return Buffer.from(value).toString("base64url"); }
function appConfig() {
  if (!env.GITHUB_APP_ID || !env.GITHUB_APP_SLUG || !env.GITHUB_APP_PRIVATE_KEY) {
    throw new AppError("MAX GitHub App installation is not configured yet", 503, "SERVICE_UNAVAILABLE");
  }
  return { appId: env.GITHUB_APP_ID, slug: env.GITHUB_APP_SLUG, privateKey: env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n") };
}
function appJwt() {
  const { appId, privateKey } = appConfig();
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ iat: now - 30, exp: now + 8 * 60, iss: appId }));
  const unsigned = header + "." + payload;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  return unsigned + "." + signer.sign(privateKey).toString("base64url");
}
async function appRequest<T>(path: string): Promise<T> {
  const response = await fetch(GITHUB_API + path, {
    headers: { Authorization: "Bearer " + appJwt(), Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    signal: AbortSignal.timeout(12000),
  });
  const body: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new AppError(body?.message || "GitHub App request failed", response.status === 404 ? 404 : 502, "GITHUB_APP_REQUEST_FAILED");
  return body as T;
}
function settingsUrl(installationId: string, accountLogin: string, accountType: string) {
  return accountType.toLowerCase() === "organization"
    ? `https://github.com/organizations/${encodeURIComponent(accountLogin)}/settings/installations/${encodeURIComponent(installationId)}`
    : `https://github.com/settings/installations/${encodeURIComponent(installationId)}`;
}

export const githubAppService = {
  async createInstallUrl(userId: string) {
    const { slug } = appConfig();
    const state = crypto.randomBytes(32).toString("base64url");
    await prisma.oAuthIntegrationState.create({
      data: {
        provider: ConnectedProvider.GITHUB,
        stateHash: stateHash(state),
        userId,
        verifierEnc: INSTALL_STATE_MARKER,
        expiresAt: new Date(Date.now() + STATE_TTL_MS),
      },
    });
    const url = new URL(`https://github.com/apps/${encodeURIComponent(slug)}/installations/new`);
    url.searchParams.set("state", state);
    return url.toString();
  },

  async handleInstallCallback(input: { installationId?: string; state?: string; setupAction?: string }) {
    appConfig();
    if (!input.installationId || !/^\\d{1,20}$/.test(input.installationId) || !input.state) {
      throw new AppError("GitHub installation response was incomplete", 400, "GITHUB_APP_CALLBACK_INVALID");
    }
    const state = await prisma.oAuthIntegrationState.findUnique({ where: { stateHash: stateHash(input.state) } });
    if (!state || state.provider !== ConnectedProvider.GITHUB || state.verifierEnc !== INSTALL_STATE_MARKER || state.usedAt || state.expiresAt.getTime() <= Date.now()) {
      throw new AppError("GitHub installation state is invalid or expired", 400, "GITHUB_APP_STATE_INVALID");
    }
    const claimed = await prisma.oAuthIntegrationState.updateMany({
      where: { id: state.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) throw new AppError("GitHub installation state has already been used", 400, "GITHUB_APP_STATE_REPLAYED");

    const installation = await appRequest<{
      id: number; account: { login: string; type: string } | null;
      repository_selection: string; permissions?: Record<string, unknown>;
      suspended_at?: string | null;
    }>(`/app/installations/${encodeURIComponent(input.installationId)}`);
    if (!installation.account?.login) throw new AppError("GitHub did not return an installation owner", 400, "GITHUB_APP_ACCOUNT_INVALID");

    const existing = await prisma.gitHubAppInstallation.findUnique({ where: { installationId: String(installation.id) } });
    if (existing && existing.userId !== state.userId) throw AppError.conflict("This GitHub App installation is already linked to another MAX Account");
    const record = await prisma.gitHubAppInstallation.upsert({
      where: { installationId: String(installation.id) },
      create: {
        userId: state.userId, installationId: String(installation.id),
        accountLogin: installation.account.login, accountType: installation.account.type,
        repositorySelection: installation.repository_selection,
        permissions: installation.permissions ?? {},
        suspendedAt: installation.suspended_at ? new Date(installation.suspended_at) : null,
      },
      update: {
        userId: state.userId, accountLogin: installation.account.login,
        accountType: installation.account.type, repositorySelection: installation.repository_selection,
        permissions: installation.permissions ?? {},
        suspendedAt: installation.suspended_at ? new Date(installation.suspended_at) : null,
      },
    });
    await auditService.record("CONNECTED_ACCOUNT_LINKED", {
      userId: state.userId,
      metadata: { provider: "GITHUB_APP", installationId: record.installationId, accountLogin: record.accountLogin, repositorySelection: record.repositorySelection },
    });
    return { installation: record };
  },

  async list(userId: string) {
    const rows = await prisma.gitHubAppInstallation.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
    return rows.map((row) => ({
      id: row.id, installationId: row.installationId, accountLogin: row.accountLogin,
      accountType: row.accountType, repositorySelection: row.repositorySelection,
      permissions: row.permissions, suspended: Boolean(row.suspendedAt), linkedAt: row.createdAt,
      settingsUrl: settingsUrl(row.installationId, row.accountLogin, row.accountType),
    }));
  },

  async editAccessUrl(userId: string, recordId: string) {
    const row = await prisma.gitHubAppInstallation.findFirst({ where: { id: recordId, userId } });
    if (!row) throw AppError.notFound("GitHub App installation not found");
    return { settingsUrl: settingsUrl(row.installationId, row.accountLogin, row.accountType) };
  },
};
