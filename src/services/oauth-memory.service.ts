import { prisma } from "../database/prisma";
import { AppError } from "../utils/AppError";

const MAX_MEMORY_RESPONSE_BYTES = 256 * 1024;

export const oauthMemoryService = {
  async getAuthorizedMemory(userId: string) {
    const profile = await prisma.aIProfile.findUnique({
      where: { userId },
      select: { memoryMetadata: true },
    });

    const metadata = profile?.memoryMetadata ?? null;
    const response = { version: 1, metadata };
    const serialized = JSON.stringify(response);

    if (Buffer.byteLength(serialized, "utf8") > MAX_MEMORY_RESPONSE_BYTES) {
      throw new AppError("MAX Memory response is too large", 413, "MEMORY_RESPONSE_TOO_LARGE");
    }

    return response;
  },
};
