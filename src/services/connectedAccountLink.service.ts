import { ConnectedProvider, Prisma } from "@prisma/client";
import { prisma } from "../database/prisma";
import { AppError } from "../utils/AppError";

type LinkConnectedAccountInput = {
  userId: string;
  provider: ConnectedProvider;
  providerAccountId: string;
  createData: Prisma.ConnectedAccountUncheckedCreateInput;
  updateData: Prisma.ConnectedAccountUncheckedUpdateInput;
};

/**
 * Links a provider identity without allowing a concurrent OAuth callback to
 * transfer an identity already owned by a different MAX Account.
 */
export async function linkConnectedAccount(input: LinkConnectedAccountInput) {
  const where = {
    provider_providerAccountId: {
      provider: input.provider,
      providerAccountId: input.providerAccountId,
    },
  };
  const existing = await prisma.connectedAccount.findUnique({ where });
  if (existing) {
    if (existing.userId !== input.userId) {
      throw AppError.conflict("This provider account is already connected to another MAX Account", "PROVIDER_ACCOUNT_ALREADY_LINKED");
    }
    return prisma.connectedAccount.update({
      where: { id: existing.id },
      data: input.updateData,
    });
  }

  try {
    return await prisma.connectedAccount.create({ data: input.createData });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;
    if (code !== "P2002") throw error;

    // Another callback may have won the unique-key race. Only refresh the
    // record if it belongs to this same MAX Account; never change its owner.
    const raced = await prisma.connectedAccount.findUnique({ where });
    if (!raced || raced.userId !== input.userId) {
      throw AppError.conflict("This provider account is already connected to another MAX Account", "PROVIDER_ACCOUNT_ALREADY_LINKED");
    }
    return prisma.connectedAccount.update({
      where: { id: raced.id },
      data: input.updateData,
    });
  }
}
