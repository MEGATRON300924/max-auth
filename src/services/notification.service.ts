import { mailService } from "./mail.service";
import { logger } from "../utils/logger";

interface NotificationUser {
  email: string;
  displayName: string | null;
  username: string;
}

export const notificationService = {
  async sendLoginNotification(user: NotificationUser, ctx: { ipAddress?: string; userAgent?: string }) {
    try {
      const name = user.displayName || user.username;
      await mailService.send({
        to: user.email,
        subject: "New sign-in to your MAX Account",
        text: `Hi ${name},\n\nYour MAX Account was just used to sign in.\n\nIP address: ${ctx.ipAddress || "Unavailable"}\nDevice: ${ctx.userAgent || "Unavailable"}\n\nIf this was not you, secure your account immediately by changing your password and reviewing your active sessions.`,
      });
    } catch (error) {
      logger.error("Login notification email failed", { userId: user.username, error });
    }
  },

  async sendWelcomeNotification(user: NotificationUser) {
    try {
      const name = user.displayName || user.username;
      await mailService.send({
        to: user.email,
        subject: "Welcome to your MAX Account",
        text: `Hi ${name},\n\nWelcome to MAX. Your MAX Account is now ready.\n\nPlease verify your email using the verification message already sent to you. This account will be your identity across MAX services and apps.`,
      });
    } catch (error) {
      logger.error("Welcome email failed", { userId: user.username, error });
    }
  },
};
