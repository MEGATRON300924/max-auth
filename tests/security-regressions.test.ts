import { createHmac } from "node:crypto";
import { ConnectedProvider } from "@prisma/client";
import { prisma } from "../src/database/prisma";
import { linkConnectedAccount } from "../src/services/connectedAccountLink.service";
import { signatureFor } from "../src/services/webhook.service";

jest.mock("../src/database/prisma", () => ({
  prisma: {
    connectedAccount: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $queryRawUnsafe: jest.fn(),
    $executeRawUnsafe: jest.fn(),
  },
}));

const connected = prisma.connectedAccount as unknown as {
  findUnique: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
};

const input = {
  userId: "max-user-a",
  provider: ConnectedProvider.SPOTIFY,
  providerAccountId: "spotify-account-123",
  createData: {
    userId: "max-user-a",
    provider: ConnectedProvider.SPOTIFY,
    providerAccountId: "spotify-account-123",
    accessTokenEnc: "encrypted-access-token",
    refreshTokenEnc: null,
  } as any,
  updateData: { accessTokenEnc: "new-encrypted-access-token" } as any,
};

describe("connected account ownership", () => {
  beforeEach(() => jest.clearAllMocks());

  it("does not transfer an identity already owned by another MAX Account", async () => {
    connected.findUnique.mockResolvedValue({ id: "connection-1", userId: "max-user-b" });

    await expect(linkConnectedAccount(input)).rejects.toThrow("already connected to another MAX Account");
    expect(connected.create).not.toHaveBeenCalled();
    expect(connected.update).not.toHaveBeenCalled();
  });

  it("does not transfer ownership when two OAuth callbacks race to create the same identity", async () => {
    connected.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "connection-1", userId: "max-user-b" });
    connected.create.mockRejectedValue({ code: "P2002" });

    await expect(linkConnectedAccount(input)).rejects.toThrow("already connected to another MAX Account");
    expect(connected.update).not.toHaveBeenCalled();
  });

  it("updates an existing connection only when it belongs to the same MAX Account", async () => {
    connected.findUnique.mockResolvedValue({ id: "connection-1", userId: "max-user-a" });
    connected.update.mockResolvedValue({ id: "connection-1", userId: "max-user-a" });

    await linkConnectedAccount(input);

    expect(connected.update).toHaveBeenCalledWith({
      where: { id: "connection-1" },
      data: input.updateData,
    });
    expect(input.updateData).not.toHaveProperty("userId");
  });
});

describe("webhook signatures", () => {
  it("signs the exact secret returned to the webhook owner", () => {
    const secret = "whsec_example_secret";
    const timestamp = "1794931200";
    const body = JSON.stringify({ id: "evt_123", type: "webhook.test" });
    const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");

    expect(signatureFor(secret, timestamp, body)).toBe(expected);
  });
});
