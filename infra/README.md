# Backend infrastructure — AppSync + DynamoDB + S3 (with roles)

This folder provisions the cloud backend for the Minute Book app:

- **1 AppSync GraphQL API**, authorized by your **existing Cognito user pool**
  (`us-east-1_iQ2q3z7ep`).
- **13 DynamoDB tables** (one per model, on-demand billing).
- **65 resolvers** (get/list/create/update/delete per model), AppSync JS runtime.
- **Group-based auth** via `@aws_auth`, using your Cognito groups
  (**Executives, Finance, Admin, Users** — managed in Cognito, *not* created by
  this template):
  - **Edit the minute book** → `Executives`, `Admin`.
  - **Upload/manage financial documents** → `Executives`, `Admin`, `Finance`.
  - **Read** → any signed-in user, **except** banking details and the ISC
    register (dates of birth), which are limited to `Executives`/`Admin`/`Finance`
    (so `Users` can't see them).
- **1 S3 bucket** for uploaded files + compiled minute books, and a **Cognito
  Identity Pool** for browser S3 access scoped to `files/*` and `minute-book/*`.

Files:

- `generate-template.mjs` — generator. Edit the model list / group mapping here,
  then re-run.
- `minutebook-appsync.json` — the generated CloudFormation template you deploy.

Regenerate after any change:

```bash
node infra/generate-template.mjs
```

## Deploy: run this as a STACK UPDATE (don't delete anything)

Your v1 stack is already live, so apply v2 as an update — your existing tables
and data are preserved (v2 keeps all v1 logical IDs and only adds to them).

1. CloudFormation console (region **us-east-1**) → select the `minutebook-backend`
   stack → **Update**.
2. **Replace existing template → Upload a template file** → pick
   `infra/minutebook-appsync.json` → **Next**.
3. Parameters are pre-filled (pool id, app client id, region) → **Next**.
4. Re-check **"I acknowledge that AWS CloudFormation might create IAM
   resources"** → **Next**.
5. Review the **change set**: it should be all **Add** (new tables, S3, Identity
   Pool, resolvers) and **Modify** (the GraphQL schema) — **no Delete/Replace on
   your existing `*Table` resources**. If you see a Replace on a data table,
   stop and tell me.
6. **Submit** and wait for **UPDATE_COMPLETE**.
7. Open the **Outputs** tab and copy `FilesBucketName` and `IdentityPoolId`
   (the `GraphQLApiUrl` is unchanged from v1).

### Group membership (no lockout for you)

Because editing is gated to `Executives`/`Admin` and **you're in both**, you keep
full access — nothing to do. Just make sure:
- Your **accountant** is in the **`Finance`** group (to upload financial docs and
  read banking/financials).
- Anyone who should be view-only is in **`Users`** (they won't see banking/ISC).

## Point the app at it (Amplify env vars)

`MB_APPSYNC_ENDPOINT` is already set from v1. Add the two new ones:

- `MB_S3_BUCKET` = `FilesBucketName` (from Outputs)
- `MB_IDENTITY_POOL_ID` = `IdentityPoolId` (from Outputs)

Then redeploy `main`. For local testing, put the same values in your local
`js/config.js`.

## Notes

- **S3 layout:** `files/{year}/{category}/…` and `files/corporate/{category}/…`
  for uploads; `minute-book/{year}/…` for compiled minute-book PDFs.
- **Registers included, UI to follow:** `Officer`, `SignificantControlPerson`
  (ISC/transparency register), and `ShareTransfer` tables ship now so no second
  backend deploy is needed; their screens come in a later client phase.
- **Changing the group mapping** later: edit the `writeGroups` / `readGroups` in
  `generate-template.mjs`, regenerate, and run another stack update.
- **Deleting the stack** removes the tables **and their data**, and the S3 bucket
  must be emptied first. Back up anything you want to keep.
