import argon2 from "argon2";
import { env } from "../config/env";

/**
 * Hash a plaintext password using Argon2id.
 * Argon2id is the recommended variant: resistant to both
 * GPU cracking (like Argon2i) and side-channel attacks (like Argon2d).
 */
export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, {
    type: argon2.argon2id,
    memoryCost: env.ARGON2_MEMORY_COST,
    timeCost: env.ARGON2_TIME_COST,
    parallelism: env.ARGON2_PARALLELISM,
  });
}

export async function verifyPassword(
  hash: string,
  plain: string
): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/**
 * Basic password strength policy.
 * Min 8 chars, at least one letter and one number.
 * (Zod schema layers additional rules; this is defense in depth.)
 */
export function isPasswordStrongEnough(plain: string): boolean {
  if (plain.length < 8) return false;
  const hasLetter = /[a-zA-Z]/.test(plain);
  const hasNumber = /[0-9]/.test(plain);
  return hasLetter && hasNumber;
}
