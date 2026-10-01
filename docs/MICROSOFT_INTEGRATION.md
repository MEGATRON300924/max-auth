# Microsoft Integration

MAX Auth uses Microsoft identity platform authorization code flow with Microsoft Graph delegated permissions. Microsoft documents delegated access as the model where the app acts on behalf of the signed-in user, and recommends least-privilege permissions. citeturn0search0turn0search1

## Render environment variables

Set these on the MAX Auth service:

- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `MICROSOFT_REDIRECT_URI=https://auth.max-ai.name.ng/api/v1/connected-accounts/microsoft/callback`
- `MICROSOFT_TOKEN_ENCRYPTION_KEY`

The encryption key is a MAX Auth secret. It is not supplied by Microsoft and must never be committed to GitHub or exposed to the frontend.

## Microsoft Entra app registration

Register a Web application in Microsoft Entra ID / Microsoft identity platform.

Authorized redirect URI:

`https://auth.max-ai.name.ng/api/v1/connected-accounts/microsoft/callback`

For a MAX consumer integration that should support Outlook.com/personal Microsoft accounts as well as organizational accounts, configure the application to support the appropriate Microsoft account types.

Under Microsoft Graph -> Delegated permissions, the current MAX integration requests:

- `User.Read`
- `Mail.ReadWrite`
- `Mail.Send`
- `Calendars.ReadWrite`
- `Files.ReadWrite`
- `Tasks.ReadWrite`
- `Contacts.Read`
- `openid`
- `profile`
- `email`
- `offline_access`

`offline_access` is requested because MAX Auth stores encrypted refresh tokens so a connected account can continue working after the short-lived access token expires. Microsoft documents this scope for long-lived delegated access. citeturn0search1turn0search2

## Connected endpoints

- `GET /api/v1/connected-accounts/microsoft/connect`
- `GET /api/v1/connected-accounts/microsoft/callback`
- `GET /api/v1/connected-accounts/microsoft/me`
- `GET /api/v1/connected-accounts/microsoft/mail`
- `POST /api/v1/connected-accounts/microsoft/mail/send`
- `GET /api/v1/connected-accounts/microsoft/calendar/events`
- `GET /api/v1/connected-accounts/microsoft/drive/files`
- `GET /api/v1/connected-accounts/microsoft/todo/lists`
- `GET /api/v1/connected-accounts/microsoft/todo/tasks`
- `GET /api/v1/connected-accounts/microsoft/contacts`

Provider access and refresh tokens remain encrypted inside MAX Auth. The MAX AI Backend personalization bridge receives derived/approved service data rather than provider credentials.
