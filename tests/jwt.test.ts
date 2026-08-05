import { signAccessToken, verifyAccessToken, signRefreshToken, verifyRefreshToken } from "../src/security/jwt";

describe("jwt security", () => {
  it("signs and verifies an access token", () => {
    const token = signAccessToken({
      sub: "user-123",
      username: "megatron",
      tier: "FREE",
      sessionId: "session-abc",
    });
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe("user-123");
    expect(payload.type).toBe("access");
  });

  it("signs and verifies a refresh token", () => {
    const token = signRefreshToken({ sub: "user-123", sessionId: "session-abc" });
    const payload = verifyRefreshToken(token);
    expect(payload.sessionId).toBe("session-abc");
    expect(payload.type).toBe("refresh");
  });

  it("rejects an access token when verified as a refresh token", () => {
    const token = signAccessToken({
      sub: "user-123",
      username: "megatron",
      tier: "FREE",
      sessionId: "session-abc",
    });
    expect(() => verifyRefreshToken(token)).toThrow();
  });

  it("rejects a tampered token", () => {
    const token = signAccessToken({
      sub: "user-123",
      username: "megatron",
      tier: "FREE",
      sessionId: "session-abc",
    });
    const tampered = token.slice(0, -2) + "xx";
    expect(() => verifyAccessToken(tampered)).toThrow();
  });
});
