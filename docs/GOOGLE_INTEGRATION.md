# MAX Google Integration

MAX Auth uses one Google OAuth connection for the core Google Workspace integrations.

## OAuth scopes requested by MAX

- openid
- email
- profile
- https://www.googleapis.com/auth/calendar.events
- https://www.googleapis.com/auth/calendar.calendarlist.readonly
- https://www.googleapis.com/auth/drive.file
- https://www.googleapis.com/auth/gmail.modify
- https://www.googleapis.com/auth/tasks
- https://www.googleapis.com/auth/contacts.readonly

The Drive, Docs, Sheets, and Slides functionality uses the per-file `drive.file` scope rather than unrestricted Drive scopes.

## Google APIs to enable

- Calendar API
- Drive API
- Docs API
- Sheets API
- Slides API
- Gmail API
- Tasks API
- People API

## OAuth redirect URI

https://auth.max-ai.name.ng/api/v1/connected-accounts/google/calendar/callback

Existing users must reconnect Google after the requested scope set changes so Google can issue a token containing the new permissions.

## Implemented service areas

- Google Calendar: calendars and event CRUD
- Google Drive: file listing, metadata create/update/delete
- Google Docs: read and batchUpdate
- Google Sheets: read and values update
- Google Slides: read and batchUpdate
- Gmail: message listing, message read, send, label modification
- Google Tasks: lists and task CRUD
- Google Contacts: read connections

Tokens and PKCE verifier/state values are encrypted/hashed by MAX Auth. Refresh tokens are retained for offline API access.
