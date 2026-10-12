# MAX Auth email delivery

MAX Auth already creates single-use, hashed email-verification tokens and exposes the verification/resend endpoints. Production email delivery must be configured separately; the `console` mail provider is for local development and does not deliver messages.

## Configure Resend for production

1. Create or sign in to a Resend account at https://resend.com.
2. Add `max-ai.name.ng` as a sending domain in Resend and publish the exact DNS records Resend provides. Wait until Resend marks the domain verified.
3. Create a Resend API key with permission to send mail.
4. In the Render service hosting `max-auth`, add these environment variables (do not commit the API key or paste it into source code):
   - `MAIL_PROVIDER=resend`
   - `RESEND_API_KEY=<your Resend API key>`
   - `MAIL_FROM=MAX AI <no-reply@max-ai.name.ng>`
   - `FRONTEND_URL=https://api.max-ai.name.ng`
   - `EMAIL_VERIFICATION_TOKEN_TTL_HOURS=24`
5. Save the environment variables and redeploy the backend service.
6. Register a test account using an inbox you control. Confirm the email arrives, the button opens `https://api.max-ai.name.ng/verify-email?token=...`, and successful verification changes the account's `verificationStatus` to `VERIFIED`.
7. Test **Resend verification email** from the post-registration screen and confirm expired/used links are rejected.

## Security notes

- Verification tokens are random, stored as hashes, single-use, and expire after the configured TTL.
- The browser stores only opted-in account identifiers for the account chooser, never passwords or session tokens.
- Keep `RESEND_API_KEY` in Render environment variables only. Rotate it immediately if it is exposed.
- Do not use `MAIL_PROVIDER=console` in production: it only logs a development-mode dispatch and does not send email.
