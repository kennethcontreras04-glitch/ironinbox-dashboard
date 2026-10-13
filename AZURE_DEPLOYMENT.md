# Deploy IronInbox to Azure Static Web Apps

The existing React frontend, Azure Functions API in `api/`, and private Blob Storage remain in use. No Azure resources are created by these code changes. The production workflow deploys `main`; this implementation is on `outlook-implementation` and has not been deployed.

## Backend settings

Set these in the Static Web App backend runtime environment (not `VITE_` frontend variables):

- `FRONTEND_URL`: `https://YOUR-SITE.azurestaticapps.net`, without a trailing slash.
- `TOKEN_ENCRYPTION_KEY`: a stable, cryptographically random secret of at least 32 random bytes. Changing it makes existing encrypted records unreadable.
- `IRONINBOX_STORAGE_CONNECTION_STRING`: connection string for a dedicated Storage account.
- `IRONINBOX_STORAGE_CONTAINER`: the existing private container, usually `ironinbox`.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GMAIL_REDIRECT_URI`: existing Google web-app credentials and `https://YOUR-SITE.azurestaticapps.net/api/gmail/callback`.
- `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`: the Microsoft application ID and client secret **value**.
- `MICROSOFT_TENANT_ID`: `common` to support both personal Microsoft accounts and work/school accounts.
- `MICROSOFT_REDIRECT_URI`: `https://YOUR-SITE.azurestaticapps.net/api/outlook/callback`.

Google and Microsoft are configured independently. An unconfigured provider is disabled in the UI without disabling the other provider or username/password login. The existing Google callback does not change.

The Blob container must already exist and deny public access. Preserve existing lifecycle rules for `ironinbox/oauth/` (delete after one day) and `ironinbox/sessions/` (delete after eight days). Add cleanup for `ironinbox/login-attempts/` after one day. Do not apply session-expiry cleanup to `users/`, `identities/`, or `credentials/`; those are persistent account records. Deleted data can remain recoverable according to Storage soft-delete/versioning settings.

## Microsoft registration — Kenneth

1. Open Microsoft Entra admin center → App registrations → New registration.
2. Register IronInbox with **Accounts in any organizational directory and personal Microsoft accounts**. This supports Microsoft 365 and Outlook.com/Hotmail. `common` cannot override a single-tenant-only registration.
3. Add a **Web** platform redirect URI matching the production `MICROSOFT_REDIRECT_URI` above exactly. For development, also register `http://localhost:5000/api/outlook/callback`. Code redemption occurs in the backend, so use Web, not SPA, and do not enable implicit grants or public-client flows.
4. Under Microsoft Graph API permissions, configure **delegated** `User.Read` and `Mail.Read`. The app requests `openid profile email` for identity and `offline_access` when adding a mailbox. Do not configure application-wide mail permissions for this user-consent flow.
5. Create a client secret and put its **value** in the backend's `MICROSOFT_CLIENT_SECRET`. Copy the application/client ID into `MICROSOFT_CLIENT_ID`. Track secret expiration so access can be renewed before it expires. Do not paste secrets into chat, source files, or frontend settings.
6. Confirm tenant consent policy allows users to grant the delegated permissions. Some organizations require administrator approval. A supported account without an Exchange Online/Outlook mailbox cannot retrieve mail through Graph.

Sign-in uses identity and basic profile access, not `Mail.Read`. Adding a Microsoft mailbox requests mailbox permissions separately and preserves the current IronInbox login, including Google or username/password login. A mailbox can be connected by more than one IronInbox user when each user independently authorizes it; their monitoring records are isolated.

## Google registration

Keep the existing OAuth web client and Gmail API configuration. Register the production and development Gmail callbacks above. The login flow now requests `openid email profile`; mailbox connection separately requests `gmail.readonly` and offline access. A new consent screen is expected when adding a mailbox. Keep test users configured while the Google app is in testing. Verification and testing-mode refresh-token expiration rules continue to apply.

## Deployment and verification

Run `npm run test:api`, `npm run build`, and `npm run lint`. Deploy through the existing workflow after review. The workflow builds the frontend with Node 22 and deploys `api` as managed Functions; `public/staticwebapp.config.json` retains the Node 20 API runtime.

After configuring a test environment:

1. Check `/api/health`: `configured` checks core storage/encryption settings; `providers.gmail` and `providers.outlook` report whether each provider has its required settings. This does not validate credentials or connectivity.
2. Sign in with Google. Confirm the Account page offers that address or a different account, and no mailbox is monitored automatically for a new user.
3. Add a secondary Microsoft mailbox, approve read-only consent, and sync. Confirm its emails appear as Outlook messages in the existing dashboard and that message details identify the monitored address.
4. Add a second Gmail account and confirm both mailboxes coexist without changing your app login. Sync failure for one mailbox must not prevent the other mailbox from being attempted.
5. Pause/resume one connection. Disconnect one connection and confirm the app stays signed in and the other connection remains. Sign out/in with the same login method and confirm the remaining connection and reviews persist.
6. Test Microsoft login followed by a secondary Gmail connection. Test username/password registration followed by either mailbox provider.
7. Test denied consent, expired/revoked access, reconnecting, and an organizational mailbox requiring admin consent. Test Outlook.com/Hotmail separately from Microsoft 365.
8. With an existing unexpired Gmail browser session, confirm migration preserves its saved messages and reviews. OAuth authorizations already in flight during deployment should be restarted.

Do not switch between login providers and expect an automatic merge: each login identity currently owns a separate IronInbox user. Mailbox connections do not grant app-login access.

## Storage and behavior

Each seven-day browser session stores only the internal user ID and expiration. Persistent user records contain separately keyed mailbox connections with their own encrypted tokens, messages, monitoring state, and timestamps. Identity indexes, credentials, OAuth state/PKCE verifiers, sessions, and user records are encrypted with AES-256-GCM. Mailbox mutations use conditional ETag writes against the user record, so concurrent changes return a retryable conflict instead of overwriting one another. Mailbox ownership comes from the server session, never a request-supplied user ID.

This retains the existing storage abstraction to minimize migration. All mailbox connections for one user share that user's encrypted blob and its concurrency boundary. For a larger deployment, move mailboxes/messages into separate records and add a transactional identity/account store. Username/password login currently has no recovery/change-password or MFA flow; registration/login attempts are limited per username, not through a complete abuse-prevention service.

Sync reads the latest 50 inbox messages per mailbox, in bounded requests while the app is open. It does not schedule background jobs or modify/delete/send provider messages. Microsoft requests immutable IDs and attachment metadata, and uses a shared 24-second fetch budget for each sync batch. Outlook authentication headers are not treated as receiver-trusted verdicts. Adding delta cursors and a scheduled worker is a separate follow-up.

Disconnect deletes the selected connection's saved tokens and monitoring records. Sign-out deletes only that browser session. Wipe deletes all of the user's monitored connections/records, including those visible from other browsers, while preserving the login identity. Provider consent is revoked separately in Google/Microsoft account settings.

## Local development

Use Node 22.16+, run `npm ci` and `npm --prefix api ci`, then copy `.env.example` to `.env`. Use a separate development Storage container. Start `npm run api` and `npm run dev` in separate terminals. The frontend runs at `http://localhost:5000` and proxies `/api` to port 8787. Register the two localhost callbacks above. Localhost cookies omit Secure; deployed cookies are Secure and HttpOnly.

## References

- [Microsoft authorization-code flow and PKCE](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)
- [Microsoft Graph list messages](https://learn.microsoft.com/en-us/graph/api/user-list-messages?view=graph-rest-1.0)
- [Microsoft Graph message resource](https://learn.microsoft.com/en-us/graph/api/resources/message?view=graph-rest-1.0)
- [Microsoft Graph permissions](https://learn.microsoft.com/en-us/graph/permissions-overview)
- [Azure Static Web Apps APIs](https://learn.microsoft.com/en-us/azure/static-web-apps/apis-overview)
