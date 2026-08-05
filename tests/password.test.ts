import { hashPassword, verifyPassword, isPasswordStrongEnough } from "../src/security/password";

describe("password security", () => {
  it("hashes and verifies a correct password", async () => {
    const hash = await hashPassword("SuperSecret123");
    expect(hash).not.toEqual("SuperSecret123");
    const valid = await verifyPassword(hash, "SuperSecret123");
    expect(valid).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("SuperSecret123");
    const valid = await verifyPassword(hash, "WrongPassword123");
    expect(valid).toBe(false);
  });

  it("enforces minimum password strength", () => {
    expect(isPasswordStrongEnough("short1")).toBe(false); // too short
    expect(isPasswordStrongEnough("nonumbers")).toBe(false); // no digit
    expect(isPasswordStrongEnough("12345678")).toBe(false); // no letter
    expect(isPasswordStrongEnough("ValidPass1")).toBe(true);
  });
});
