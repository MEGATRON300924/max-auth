import { logger } from "../utils/logger";
import { env } from "../config/env";

interface MailPayload { to: string; subject: string; text: string; html?: string; }

export const mailService = {
  async send(payload: MailPayload) {
    if (env.MAIL_PROVIDER === "console") {
      logger.info("[MAIL:console] Email dispatched (dev mode)", { to: payload.to, subject: payload.subject });
      return;
    }
    if (env.MAIL_PROVIDER === "resend") {
      if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is required when MAIL_PROVIDER=resend");
      const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: env.MAIL_FROM, to: [payload.to], subject: payload.subject, text: payload.text, html: payload.html }) });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        logger.error("Resend email delivery failed", { status: response.status, body });
        throw new Error("Email delivery failed");
      }
      return;
    }
    throw new Error(`Unsupported MAIL_PROVIDER: ${env.MAIL_PROVIDER}`);
  },
};
