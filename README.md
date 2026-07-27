# Minute Book Generator

A standalone vanilla-JS web app that generates Ontario corporate minute-book
documents (resolutions and registers) as PDFs. No framework, no build step.

Built to the spec in [`docs/minute-book-app-spec.md`](docs/minute-book-app-spec.md).

## Status

| Phase | Feature | State |
|------|---------|-------|
| 1 | Scaffold, sidebar nav, single-page app | ✅ Done |
| 2 | AWS AppSync + DynamoDB backend | ⚙️ Schema + adapter ready; **needs your AWS account to provision** (steps below) |
| 2 | Cognito login (reuses your existing pool) | ✅ Built — turns on when you fill `js/config.js` |
| 3 | Generic form-rendering engine | ✅ Done |
| 4 | Document templates (6) | ✅ Done |
| 5 | PDF generation + share/download | ✅ Done |
| 6 | Document Registry / status view | ✅ Done |
| 7 | Print stylesheet (Cmd+P fallback) | ✅ Done |
| 8 | Polish (nav highlight, confirms, responsive) | ✅ Done |

Until the AWS backend is provisioned, the app runs against a **localStorage
adapter** so it is fully usable on one device today. Provisioning AWS switches
it to durable, cross-device DynamoDB storage with **no other code changes**.

## Configuration (`js/config.js`)

Everything AWS-related is driven by one gitignored file. Copy the template and
fill it in:

```bash
cp js/config.example.js js/config.js
```

Behaviour is progressive — you can turn things on one at a time:

| Fill in… | Effect |
|----------|--------|
| _(nothing)_ | Local storage, no login. Runs out of the box. |
| `userPoolId` + `userPoolClientId` | **Cognito email/password login gate turns on** (reuses your existing pool). |
| `appsync.endpoint` | Data persistence switches from localStorage to AppSync/DynamoDB. |

The Cognito login uses an in-app email/password form (Amplify `USER_SRP_AUTH`,
no hosted-UI redirect) and handles the first-login "set a new password"
challenge for admin-created users. The session persists via Amplify, so you're
not prompted every visit. A **Sign out** control appears in the sidebar when
login is enabled. Use an app client **without a client secret** (public web
client) — a secret can't be used safely from a browser.

## Running locally

ES modules require http(s) (not `file://`). From the project root:

```bash
python3 -m http.server 8765
```

Then open <http://localhost:8765/index.html>. The status dot in the sidebar
shows the active backend: **Local (this device)** or **AWS (AppSync)**.

## Key design decisions

- **Single-page app with hash routing** (`#/corp-info`, `#/directors`, …)
  rather than separate HTML files. Simpler to deploy as an Amplify static
  site, shares state across sections, and matches the sidebar-nav layout.
  (This was the open decision the spec left to us.)
- **Swappable data layer** (`js/data/`): a `DataClient` facade with two
  adapters — `localAdapter` (localStorage, the default) and `amplifyAdapter`
  (AppSync/GraphQL). Selection is automatic: if `aws-exports.js` exists the
  app uses AWS; otherwise it falls back to local. Force one with
  `window.MINUTEBOOK_BACKEND = 'local' | 'amplify'`.
- **Pure template functions** (`templates/`): each takes the data object and
  returns an HTML string, so they are trivial to test in isolation.
- **PDF via jsPDF `doc.html()`** (which uses `html2canvas` — both loaded from
  CDN in `index.html`). Save flow: Web Share API on iOS/iPadOS (save to iCloud
  Drive), plain download fallback elsewhere. `Cmd+P` also works via the print
  stylesheet as a backup.
- **Signed-record immutability** is enforced in the UI: once an annual/ad-hoc
  resolution has a `dateSigned`, its row renders read-only.

## Project layout

```
index.html            App shell + CDN scripts (jsPDF, html2canvas)
styles.css            App chrome, document styling, print rules
js/
  app.js              Controller: nav, section views, save/generate wiring
  router.js           Hash-based router
  schema.js           Declarative field definitions per section (drives forms)
  state.js            In-memory store, hydrated from the data layer
  formEngine.js       Generic input rendering + read-back + validation
  documents.js        Maps stored records -> template functions
  pdf.js              jsPDF build + Web Share/download
  config.example.js   Template for your Cognito / AppSync ids
  config.js           Your local config (gitignored)
  amplify-setup.js    Configures Amplify once from config.js (auth + api)
  auth.js             Cognito sign-in / sign-out / session
  loginGate.js        Email/password login screen; gates boot()
  data/
    dataClient.js     Facade; picks an adapter
    localAdapter.js   localStorage (default, runs with no AWS)
    amplifyAdapter.js AppSync/GraphQL (activates when configured)
templates/            One pure function per document type
schema/schema.graphql AppSync/DynamoDB data model
```

## Login setup (reusing your existing Cognito pool)

The login gate is already built. To turn it on, put your **existing** pool's
values in `js/config.js`:

```js
userPoolId: 'us-east-1_XXXXXXXXX',
userPoolClientId: 'xxxxxxxxxxxxxxxxxxxxxxxxxx',   // a public web client, no secret
```

Requirements on the app client:
- **No client secret** (browsers can't hold one safely). If your current app
  client has a secret, create an additional client without one in the AWS
  Console (Cognito → your pool → App integration → App clients) and use that id.
- `ALLOW_USER_SRP_AUTH` enabled (default for new clients).

That's it — reload and the email/password gate appears. Verified end-to-end
against Cognito (a misconfigured client returns Cognito's own error in the
form), so once the ids are real, sign-in works.

## Data backend setup (Phase 2 — AppSync API, secured by your pool)

Provisioned via a self-contained **CloudFormation template** you upload in the
AWS console — no Amplify CLI, no local credentials. Full steps in
[`infra/README.md`](infra/README.md). In short:

1. `node infra/generate-template.mjs` (already generated:
   `infra/minutebook-appsync.json`).
2. CloudFormation console → **Create stack** → upload that template → acknowledge
   IAM → **Submit**. Provisions 1 AppSync API + 8 DynamoDB tables + 40 resolvers,
   wired to your existing Cognito pool.
3. Copy the stack's **`GraphQLApiUrl`** output into the Amplify env var
   `MB_APPSYNC_ENDPOINT` (and your local `js/config.js` → `appsync.endpoint`).

On next load the app auto-switches from localStorage to DynamoDB — every GraphQL
call is authorized with the signed-in user's Cognito session
(`authMode: 'userPool'`). The API grants access to any authenticated pool user
(single-user tool); see `infra/README.md` for how to add per-owner isolation
later. `schema/schema.graphql` remains the human-readable model reference; the
deployable schema is generated into the template.

## Deploying (AWS Amplify Hosting)

Connect this repo in the Amplify console as a static site (no build command;
publish the project root). Amplify serves `index.html` and the ES modules
directly. Because `js/config.js` is gitignored, set the same values for the
hosted site — either commit a deploy-specific config or add a small build step
that writes `js/config.js` from Amplify environment variables.

## Notes / follow-ups

- **PDF file storage** is out of scope per the spec: DynamoDB holds metadata
  only (`dateSigned`, `pdfGenerated`); the PDF itself lives wherever you save
  it (iCloud/Downloads). Add S3 + Amplify Storage later if you need to
  retrieve the actual files across devices.
- Legal phrasing in the templates is boilerplate scaffolding — review with
  your own precedents before relying on any generated document.
