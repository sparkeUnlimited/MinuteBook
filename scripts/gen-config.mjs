// Build-time generator for js/config.js.
//
// Runs during the Amplify Hosting build (see amplify.yml). Reads the Cognito /
// AppSync values from environment variables set in the Amplify console and
// writes js/config.js — which is gitignored, so it never lives in the repo but
// is present in the deployed artifact.
//
// Locally you don't need this: you keep your own js/config.js. It only matters
// in CI/Amplify where config.js is absent.
//
// Expected env vars (set in Amplify console -> App settings -> Environment
// variables):
//   MB_REGION               e.g. us-east-1
//   MB_USER_POOL_ID         e.g. us-east-1_iQ2q3z7ep
//   MB_USER_POOL_CLIENT_ID  e.g. 6sdk3tr7ou04ggjv0pdvclq36i   (public, no secret)
//   MB_APPSYNC_ENDPOINT     (optional, blank until the API exists)
//   MB_APPSYNC_REGION       (optional, defaults to MB_REGION)
//   MB_S3_BUCKET            (optional, for file uploads — from stack Outputs)
//   MB_S3_REGION            (optional, defaults to MB_REGION)
//   MB_IDENTITY_POOL_ID     (optional, for file uploads — from stack Outputs)

import { writeFileSync } from 'node:fs';

const {
  MB_REGION = 'us-east-1',
  MB_USER_POOL_ID = '',
  MB_USER_POOL_CLIENT_ID = '',
  MB_APPSYNC_ENDPOINT = '',
  MB_APPSYNC_REGION = '',
  MB_S3_BUCKET = '',
  MB_S3_REGION = '',
  MB_IDENTITY_POOL_ID = '',
} = process.env;

const contents = `// Generated at build time by scripts/gen-config.mjs. Do not edit by hand in CI.
export default {
  region: ${JSON.stringify(MB_REGION)},
  userPoolId: ${JSON.stringify(MB_USER_POOL_ID)},
  userPoolClientId: ${JSON.stringify(MB_USER_POOL_CLIENT_ID)},
  identityPoolId: ${JSON.stringify(MB_IDENTITY_POOL_ID)},
  appsync: {
    endpoint: ${JSON.stringify(MB_APPSYNC_ENDPOINT)},
    region: ${JSON.stringify(MB_APPSYNC_REGION || MB_REGION)},
  },
  storage: {
    bucket: ${JSON.stringify(MB_S3_BUCKET)},
    region: ${JSON.stringify(MB_S3_REGION || MB_REGION)},
  },
};
`;

const out = new URL('../js/config.js', import.meta.url);
writeFileSync(out, contents);

console.log('[gen-config] wrote js/config.js', {
  region: MB_REGION,
  userPoolId: MB_USER_POOL_ID ? '(set)' : '(EMPTY — login gate will be OFF)',
  userPoolClientId: MB_USER_POOL_CLIENT_ID ? '(set)' : '(EMPTY — login gate will be OFF)',
  appsyncEndpoint: MB_APPSYNC_ENDPOINT ? '(set)' : '(empty — data stays on-device)',
  s3Bucket: MB_S3_BUCKET ? '(set)' : '(empty — file uploads off)',
  identityPoolId: MB_IDENTITY_POOL_ID ? '(set)' : '(empty — file uploads off)',
});
