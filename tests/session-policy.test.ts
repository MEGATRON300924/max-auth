import { calculateIdleExpiry, wasRotatedRecently } from "../src/security/sessionPolicy";

describe("central session inactivity policy", () => {
  const now = new Date("2026-11-19T12:00:00.000Z");

  it("sets a full 30-day idle deadline from successful activity", () => {
    expect(calculateIdleExpiry(now, new Date("2027-11-19T12:00:00.000Z"), 30))
      .toEqual(new Date("2026-12-19T12:00:00.000Z"));
  });

  it("never extends a session beyond its absolute lifetime", () => {
    expect(calculateIdleExpiry(now, new Date("2026-11-25T12:00:00.000Z"), 30))
      .toEqual(new Date("2026-11-25T12:00:00.000Z"));
  });

  it("recognizes only the short concurrent-rotation grace window", () => {
    expect(wasRotatedRecently(new Date("2026-11-19T11:59:56.000Z"), now)).toBe(true);
    expect(wasRotatedRecently(new Date("2026-11-19T11:59:54.000Z"), now)).toBe(false);
    expect(wasRotatedRecently(new Date("2026-11-19T12:00:01.000Z"), now)).toBe(false);
    expect(wasRotatedRecently(null, now)).toBe(false);
  });
});
