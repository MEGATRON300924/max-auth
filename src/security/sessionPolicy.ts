export const REFRESH_ROTATION_GRACE_MS = 5_000;

export function calculateIdleExpiry(now: Date, absoluteExpiresAt: Date, idleTimeoutDays: number): Date {
  return new Date(Math.min(
    now.getTime() + idleTimeoutDays * 24 * 60 * 60 * 1000,
    absoluteExpiresAt.getTime(),
  ));
}

export function wasRotatedRecently(revokedAt: Date | null | undefined, now: Date, graceMs = REFRESH_ROTATION_GRACE_MS): boolean {
  if (!revokedAt) return false;
  const elapsed = now.getTime() - revokedAt.getTime();
  return elapsed >= 0 && elapsed <= graceMs;
}
