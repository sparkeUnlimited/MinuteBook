# Backend infrastructure — AppSync + DynamoDB + S3 (with roles)

This folder provisions the cloud backend for the Minute Book app:

- **1 AppSync GraphQL API**, authorized by your **existing Cognito user pool**
  (`us-east-1_iQ2q3z7ep`).
- **13 DynamoDB tables** (one per model, on-demand billing).
- **65 resolvers** (get/list/create/update/delete per model), AppSync JS runtime,
  talking directly to DynamoDB.
- **Two Cognito groups** — `Owners` and `Accountants` — added to your pool.
- **Group-based write auth** via `@aws_auth`: reads are open to any signed-in
  user, but only `Owners` can write minute-book data; `Document` uploads are
  writable by `Owners` and `Accountants`.
- **1 S3 bucket** for uploaded files + compiled minute books, and a **Cognito
  Identity Pool** so the browser can read/write S3 with temporary, prefix-scoped
  credentials (`files/*`, `minute-book/*`).

Files:

- `generate-template.mjs` — generator. Edit the model list here, then re-run.
- `minutebook-appsync.json` — the generated CloudFormation template you deploy.

Regenerate after any change:

```bash
node infra/generate-template.mjs
```

## ⚠️ Do this FIRST: put yourself in the `Owners` group

Once deployed, **only `Owners` can edit the minute book**. The stack *creates*
the group but can't add you to it. So the moment the app points at this backend,
you must already be in `Owners` or you'll have read-only access to your own app.

Order: **deploy the stack → add your user to `Owners` → then set the Amplify env
vars.** (Create the accountant user and add them to `Accountants` at the same
time.) In the **Cognito** console → your pool → **Groups** → `Owners` → **Add
user**.

## Deploy it (AWS console — no local credentials needed)

1. Open the **CloudFormation** console in region **us-east-1**.
2. **Create stack → With new resources (standard)**.
3. **Upload a template file** → pick `infra/minutebook-appsync.json` → **Next**.
4. **Stack name**: `minutebook-backend` (table/bucket names are prefixed with
   this). Parameters are pre-filled with your pool id, app client id, and region
   → **Next**.
5. Check **"I acknowledge that AWS CloudFormation might create IAM resources"**
   (the template creates service/auth roles) → **Submit**.
6. Wait for **CREATE_COMPLETE** (~3–4 min).
7. Open the **Outputs** tab and copy `GraphQLApiUrl`, `FilesBucketName`, and
   `IdentityPoolId`.

## Point the app at it (Amplify env vars)

In the **Amplify** console → your app → **App settings → Environment variables**,
add:

- `MB_APPSYNC_ENDPOINT` = `GraphQLApiUrl`
- `MB_S3_BUCKET` = `FilesBucketName`
- `MB_IDENTITY_POOL_ID` = `IdentityPoolId`
- `MB_APPSYNC_REGION` = `us-east-1` (optional; defaults to `MB_REGION`)

Then merge to `main` to redeploy. The build writes `js/config.js`, and the app
switches from localStorage to DynamoDB + S3. For local testing, put the same
values in your local `js/config.js`.

## Notes

- **Auth model:** reads are open to any pool user; writes are group-gated
  (`Owners` for minute-book data, `Owners`+`Accountants` for `Document`
  uploads). Enforced server-side; the UI also hides edit controls for
  accountants.
- **S3 layout:** `files/{year}/{category}/…` and `files/corporate/{category}/…`
  for uploads; `minute-book/{year}/…` for compiled minute-book PDFs.
- **Registers included but UI to follow:** `Officer`, `SignificantControlPerson`
  (ISC/transparency register), and `ShareTransfer` tables ship now so no second
  backend deploy is needed; their screens come in a later client phase.
- **Deleting the stack** removes the tables **and their data** (and the S3
  bucket must be emptied first). Back up anything you want to keep.
- **Migrating existing local data:** records entered before the switch live in
  that browser's localStorage. Re-enter them, or ask for the one-time
  "push local data to the cloud" helper.
