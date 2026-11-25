import { Request, Response, NextFunction } from "express";
import { authenticateConnectedAccounts } from "../src/middleware/authenticateConnectedAccounts";
import { authenticate } from "../src/middleware/authenticate";
import { oauthService } from "../src/services/oauth.service";

jest.mock("../src/middleware/authenticate", () => ({
  authenticate: jest.fn((_req: Request, _res: Response, next: NextFunction) => next()),
}));

jest.mock("../src/services/oauth.service", () => ({
  oauthService: { introspect: jest.fn() },
}));

const authenticateMock = authenticate as jest.Mock;
const introspectMock = oauthService.introspect as jest.Mock;

function request(token: string, method = "GET", path = "/github/repos") {
  return {
    method,
    path,
    header: (name: string) => name.toLowerCase() === "authorization" ? `Bearer ${token}` : undefined,
    user: undefined,
  } as unknown as Request;
}

function response() {
  return { setHeader: jest.fn() } as unknown as Response;
}

const activeChatToken = {
  active: true,
  client_id: "max_client_OHnbfpb_bEfwe1z9",
  user: {
    id: "user-123",
    username: "test-user",
    email: "test@example.com",
    displayName: "Test User",
    avatarUrl: null,
    verificationStatus: "VERIFIED",
    status: "ACTIVE",
  },
  scopes: ["connected-apps:read", "profile:write"],
  exp: Math.floor(Date.now() / 1000) + 600,
};

describe("authenticateConnectedAccounts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    introspectMock.mockResolvedValue(activeChatToken);
  });

  it("keeps first-party session JWTs on the existing session middleware", async () => {
    const req = request("header.payload.signature");
    const next = jest.fn();
    await authenticateConnectedAccounts(req, response(), next);
    expect(authenticateMock).toHaveBeenCalledWith(req, expect.anything(), next);
    expect(introspectMock).not.toHaveBeenCalled();
  });

  it("accepts an active MAX Chat opaque OAuth token with connected-app permissions", async () => {
    const req = request("opaque-oauth-token");
    const res = response();
    const next = jest.fn();
    await authenticateConnectedAccounts(req, res, next);
    expect(introspectMock).toHaveBeenCalledWith("opaque-oauth-token");
    expect((req as any).user.sub).toBe("user-123");
    expect((req as any).user.sessionId).toBe("oauth:max_client_OHnbfpb_bEfwe1z9");
    expect((res.setHeader as jest.Mock)).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(next).toHaveBeenCalledWith();
  });

  it("rejects OAuth tokens issued to other applications", async () => {
    introspectMock.mockResolvedValue({ ...activeChatToken, client_id: "another-client" });
    const next = jest.fn();
    await authenticateConnectedAccounts(request("opaque-token"), response(), next);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403, code: "CONNECTED_ACCOUNT_CLIENT_FORBIDDEN" });
  });

  it("requires connected-apps:read for OAuth connected-account access", async () => {
    introspectMock.mockResolvedValue({ ...activeChatToken, scopes: ["profile:write"] });
    const next = jest.fn();
    await authenticateConnectedAccounts(request("opaque-token"), response(), next);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403, code: "INSUFFICIENT_SCOPE" });
  });

  it("requires profile:write to start a provider connection", async () => {
    introspectMock.mockResolvedValue({ ...activeChatToken, scopes: ["connected-apps:read"] });
    const next = jest.fn();
    await authenticateConnectedAccounts(request("opaque-token", "GET", "/github/connect"), response(), next);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403, code: "INSUFFICIENT_SCOPE" });
  });

  it("rejects inactive or expired opaque OAuth tokens", async () => {
    introspectMock.mockResolvedValue({ active: false });
    const next = jest.fn();
    await authenticateConnectedAccounts(request("expired-token"), response(), next);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 401, code: "INVALID_TOKEN" });
  });
});
