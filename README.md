# IronInbox

A React dashboard backed by Azure Functions for read-only Gmail and Microsoft Outlook monitoring.

## Run locally

Use Node 22.16+:

```sh
npm ci
npm --prefix api ci
```

Copy `.env.example` to `.env`. Configure encryption, a private Blob Storage container, and the email providers you want to use. Register `http://localhost:5000/api/gmail/callback` with Google and `http://localhost:5000/api/outlook/callback` with Microsoft, both as web callbacks. Start these in separate terminals:

```sh
npm run api
npm run dev
```

See [AZURE_DEPLOYMENT.md](AZURE_DEPLOYMENT.md) for provider registration and deployment steps. Azure Static Web Apps builds `dist` and deploys `api`. The local `server/index.mjs` is a development adapter for the same handler. Secrets belong in backend settings, never frontend code or GitHub.

## Account flow

- Continue with Google, Continue with Microsoft, or create an account with username/password. Each login identity receives a persistent internal IronInbox user ID.
- Social login asks only for identity/profile access. The Account page then offers monitoring of that address or a different Gmail/Microsoft mailbox. Username/password users are prompted to add a mailbox.
- Add multiple mailboxes of either provider. Each connection has its own identity, encrypted tokens, messages, monitoring flag, and sync timestamp.
- Pause, resume, reconnect, or disconnect one mailbox without changing the app login. Signing out removes only the browser session; connections and reviews persist.
- Identity records use provider subjects, never email matching. Google login, Microsoft login, and password login create separate IronInbox users unless a future explicit login-linking flow is implemented. Connecting a mailbox does not add it as an alternative app-login method.

## Monitoring

The latest 50 inbox messages per mailbox are classified using the existing rules for sender domains, content, links, attachment metadata, and configured keywords. Sync runs while the app is open or when manually requested; scheduled background monitoring is not implemented. Gmail uses batches of ten and Microsoft batches of five. Review decisions persist and message IDs include the owning mailbox ID.

Microsoft Graph does not label receiver-trusted authentication verdicts. Outlook authentication results are therefore reported as unknown and do not produce an authenticated-brand trust discount. Attachment metadata is inspected, not attachment contents. Outlook messages with more than four attachment pages fail that sync rather than being silently treated as fully scanned.

Existing unexpired Gmail sessions migrate on first use into the persistent user model, preserving their tokens, messages, and reviews. Expired sessions cannot be recovered automatically. Monitoring wipe removes all connections and monitoring records for the user, across browsers; it retains the IronInbox login account and does not revoke provider consent.

Username/password accounts use salted scrypt hashes and a persistent limit of ten attempts per username per fifteen minutes, shared across registration and login. Password recovery, password changes, MFA for password accounts, and login-method linking are not implemented. Do not present these as supported features.

Detection settings and incident edits persist in the encrypted user workspace. The latest dashboard, notifications, and incident workflows from main are preserved. Stars/read markers and some preferences remain browser-side features; role previews are not backend authorization. Mailbox authorization is enforced on the server.

## Checks

```sh
npm run test:api
npm run build
npm run lint
```

Backend tests mock provider responses; live provider consent must be verified separately with test accounts. All entry points share `api/src/handler.mjs`, the provider adapters in `api/src/providers.mjs`, and the existing classifier in `api/src/classify.mjs`.
