import { mailService } from "./mail.service";
import { logger } from "../utils/logger";

interface NotificationUser { email: string; displayName: string | null; username: string; }
const nameOf = (user: NotificationUser) => user.displayName || user.username;

export const notificationService = {
  async sendLoginNotification(user: NotificationUser, ctx: { ipAddress?: string; userAgent?: string }) {
    try { await mailService.send({ to: user.email, subject: "New sign-in to your MAX Account", text: `Hi ${nameOf(user)},\n\nYour MAX Account was just used to sign in.\n\nIP address: ${ctx.ipAddress || "Unavailable"}\nDevice: ${ctx.userAgent || "Unavailable"}\n\nIf this was not you, secure your account immediately by changing your password and reviewing your active sessions.` }); } catch (error) { logger.error("Login notification email failed", { userId: user.username, error }); }
  },
  async sendWelcomeNotification(user: NotificationUser) {
    try { await mailService.send({ to: user.email, subject: "Welcome to your MAX Account", text: `Hi ${nameOf(user)},\n\nWelcome to MAX. Your MAX Account is now ready.\n\nPlease verify your email using the verification message already sent to you. This account will be your identity across MAX services and apps.` }); } catch (error) { logger.error("Welcome email failed", { userId: user.username, error }); }
  },
  async sendPasswordChangedNotification(user: NotificationUser) {
    try { await mailService.send({ to: user.email, subject: "Your MAX Account password was changed", text: `Hi ${nameOf(user)},\n\nYour MAX Account password was successfully changed.\n\nIf you did not make this change, reset your password immediately and review your active sessions.` }); } catch (error) { logger.error("Password-change notification email failed", { userId: user.username, error }); }
  },
  async sendMfaChangedNotification(user: NotificationUser, action: "enabled" | "disabled") {
    try { await mailService.send({ to: user.email, subject: `MAX Account MFA ${action}`, text: `Hi ${nameOf(user)},\n\nMulti-factor authentication was ${action} on your MAX Account.\n\nIf you did not make this change, reset your password immediately and review your active sessions.` }); } catch (error) { logger.error("MFA notification email failed", { userId: user.username, error }); }
  },
  async sendOAuthAuthorizationNotification(user: NotificationUser, appName: string, scopes: string[]) {
    try { await mailService.send({ to: user.email, subject: `MAX Account connected to ${appName}`, text: `Hi ${nameOf(user)},\n\nYou authorized ${appName} to use your MAX Account.\n\nPermissions: ${scopes.join(", ")}\n\nIf you did not authorize this application, open your MAX Account security settings and revoke its access.` }); } catch (error) { logger.error("OAuth authorization notification email failed", { userId: user.username, error }); }
  },
};
