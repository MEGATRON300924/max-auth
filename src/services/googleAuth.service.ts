export const googleAuthService = {
  async connect(userId: string, credential: string, ctx: { ipAddress?: string; userAgent?: string }) {
    const identity = await verifyGoogleCredential(credential);
    const existing = await prisma.connectedAccount.findUnique({
      where: { provider_providerAccountId: { provider: "GOOGLE", providerAccountId: identity.sub } },
    });
    if (existing && existing.userId !== userId) {
      throw AppError.conflict("This Google account is already linked to another MAX Account", "GOOGLE_ACCOUNT_ALREADY_LINKED");
    }
    if (!existing) {
      await prisma.connectedAccount.create({
        data: {
          userId,
          provider: "GOOGLE",
          providerAccountId: identity.sub,
          scope: "openid email profile",
        },
      });
      await auditService.record("CONNECTED_ACCOUNT_LINKED", {
        userId,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        metadata: { provider: "GOOGLE" },
      });
    }
    return { provider: "GOOGLE" as const };
  },


  async signIn(credential: string, ctx: { ipAddress?: string; userAgent?: string; clientHint?: string }, mfaCode?: string) {
    const identity = await verifyGoogleCredential(credential);
    const email = identity.email.toLowerCase();

    // Google `sub` is the stable identity key. Email is used only for
    // first-time account discovery/creation.
    const linked = await prisma.connectedAccount.findUnique({
      where: { provider_providerAccountId: { provider: "GOOGLE", providerAccountId: identity.sub } },
    });
    let user = linked ? await userRepository.findById(linked.userId) : await userRepository.findByEmail(email);
    if (!user) {
      const username = await uniqueUsername(usernameBase(email, identity.name));
      user = await prisma.user.create({ data: { username, email, passwordHash: await hashPassword(generateOpaqueToken(32)), displayName: identity.name || username, avatarUrl: identity.picture, verificationStatus: "VERIFIED", aiProfile: { create: {} } } });
      await auditService.record("REGISTER", { userId: user.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent, metadata: { provider: "GOOGLE" } });
    } else {
      if (user.status !== "ACTIVE") throw AppError.forbidden("This account is not active", "ACCOUNT_NOT_ACTIVE");
      await userRepository.update(user.id, { avatarUrl: identity.picture || user.avatarUrl, displayName: identity.name || user.displayName, verificationStatus: "VERIFIED" });
      user = (await userRepository.findById(user.id))!;
    }
    const existingConnection = await prisma.connectedAccount.findUnique({ where: { provider_providerAccountId: { provider: "GOOGLE", providerAccountId: identity.sub } } });
    if (existingConnection && existingConnection.userId !== user.id) throw AppError.conflict("This Google account is already linked to another MAX Account", "GOOGLE_ACCOUNT_ALREADY_LINKED");
    if (!existingConnection) await prisma.connectedAccount.create({ data: { userId: user.id, provider: "GOOGLE", providerAccountId: identity.sub, scope: "openid email profile" } });
    await mfaService.verifyLoginFactor(user.id, mfaCode);
    const device = await deviceService.identifyOrCreateDevice(user.id, ctx, ctx.clientHint);
    const tokens = await tokenService.issueTokenPair(user, { deviceId: device.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent });
    await auditService.record("LOGIN_SUCCESS", { userId: user.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent, metadata: { provider: "GOOGLE" } });
    return { user, ...tokens };
  },
};
