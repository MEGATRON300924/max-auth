import { logger } from "../utils/logger";
import { env } from "../config/env";

interface MailPayload {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Mail abstraction. In development (MAIL_PROVIDER=console), emails are
 * logged instead of sent. Swap in a real provider (SES, Resend, Postmark,
 * SMTP via nodemailer) by implementing the same `send` signature.
 */
export const mailService = {
  async send(payload: MailPayload) {
    if (env.MAIL_PROVIDER === "console") {
      logger.info("[MAIL:console] Email dispatched (dev mode)", {
        to: payload.to,
        subject: payload.subject,
      });
      return;
    }

    // TODO: integrate real provider (SMTP / SES / Resend / Postmark).
    logger.warn(
      `MAIL_PROVIDER="${env.MAIL_PROVIDER}" is not yet implemented — falling back to console log`
    );
    logger.info("[MAIL:fallback] Email dispatched", {
      to: payload.to,
      subject: payload.subject,
    });
  },
};
