# Backend infrastructure — AppSync + DynamoDB

This folder provisions the cloud data backend for the Minute Book app:

- **1 AppSync GraphQL API**, authorized by your **existing Cognito user pool**
  (`us-east-1_iQ2q3z7ep`) — every request must carry a signed-in user's token.
- **8 DynamoDB tables** (one per model, on-demand billing).
- **40 resolvers** (get/list/create/update/delete per model), written in the
  AppSync JS runtime, talking directly to DynamoDB.

Files:

- `generate-template.mjs` — generator. Edit the model list here, then re-run.
- `minutebook-appsync.json` — the generated CloudFormation template you deploy.

Regenerate after any change:

```bash
node infra/generate-template.mjs
```

## Deploy it (AWS console — no local credentials needed)

1. Open the **CloudFormation** console, in region **us-east-1** (top-right must
   match your Cognito pool's region).
2. **Create stack → With new resources (standard)**.
3. **Choose an existing template → Upload a template file** → pick
   `infra/minutebook-appsync.json` → **Next**.
4. **Stack name**: `minutebook-backend` (the table names are prefixed with this).
   Leave the parameters at their defaults (they're pre-filled with your pool id
   and region) → **Next**.
5. On the review step, check the box **"I acknowledge that AWS CloudFormation
   might create IAM resources"** (the template creates one service role for
   AppSync to reach DynamoDB) → **Submit**.
6. Wait for **CREATE_COMPLETE** (~2–3 min).
7. Open the stack's **Outputs** tab and copy **`GraphQLApiUrl`** — it looks like
   `https://xxxxxxxx.appsync-api.us-east-1.amazonaws.com/graphql`.

## Point the app at it

1. In the **Amplify** console → your app → **App settings → Environment
   variables**, add:
   - `MB_APPSYNC_ENDPOINT` = the `GraphQLApiUrl` from the Outputs tab
   - `MB_APPSYNC_REGION` = `us-east-1` (optional; defaults to `MB_REGION`)
2. Merge your working branch into `main` (or redeploy `main`). The build writes
   `js/config.js` with the endpoint, and the app auto-switches from localStorage
   to DynamoDB. The sidebar status dot changes to **"AWS (AppSync)"**.
3. For **local** testing, put the same endpoint in your local `js/config.js`
   under `appsync.endpoint`.

## Notes

- **Auth model:** any authenticated user in the pool can read/write all records
  (single-user tool — no per-owner isolation). If you ever add a second user who
  should *not* see this minute book, we'd add an `owner` field + ownership checks
  to the resolvers.
- **No CORS setup needed** — AppSync handles browser preflight/headers itself.
- **Deleting the stack** removes the tables **and their data**. Export/back up
  first if there's anything you want to keep.
- **Migrating existing local data:** records you entered before this switch live
  in that browser's localStorage, not DynamoDB. Re-enter them once, or ask and
  I'll add a one-time "push local data to the cloud" helper.
