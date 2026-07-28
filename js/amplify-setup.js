// Central Amplify configuration, shared by the auth layer and the AppSync
// data adapter so the library is configured exactly once. Reads js/config.js.
//
// Amplify v6 is loaded from a CDN as an ES module (no build step), consistent
// with the rest of this vanilla-JS app.

const AMPLIFY_ESM = 'https://esm.sh/aws-amplify@6';

let _configPromise = null;
export function getConfig() {
  if (!_configPromise) {
    // If js/config.js is absent (fresh clone), fall back to null -> local mode.
    _configPromise = import('./config.js').then((m) => m.default).catch(() => null);
  }
  return _configPromise;
}

export async function authEnabled() {
  const c = await getConfig();
  return !!(c && c.userPoolId && c.userPoolClientId);
}

export async function backendEnabled() {
  const c = await getConfig();
  return !!(c && c.appsync && c.appsync.endpoint);
}

// File uploads need both an S3 bucket and an Identity Pool (for browser creds).
export async function storageEnabled() {
  const c = await getConfig();
  return !!(c && c.identityPoolId && c.storage && c.storage.bucket);
}

let _configured = null;
// Configure Amplify once from config.js. Only includes the Auth / API blocks
// that are actually populated, so partial setups (login-only, no API) work.
export function ensureAmplifyConfigured() {
  if (!_configured) {
    _configured = (async () => {
      const c = (await getConfig()) || {};
      const { Amplify } = await import(AMPLIFY_ESM);
      const conf = {};
      if (c.userPoolId && c.userPoolClientId) {
        conf.Auth = {
          Cognito: {
            userPoolId: c.userPoolId,
            userPoolClientId: c.userPoolClientId,
            // Identity pool: exchanges the user-pool token for AWS creds so the
            // browser can read/write S3 (file uploads).
            ...(c.identityPoolId ? { identityPoolId: c.identityPoolId } : {}),
          },
        };
      }
      if (c.appsync && c.appsync.endpoint) {
        conf.API = {
          GraphQL: {
            endpoint: c.appsync.endpoint,
            region: c.appsync.region || c.region,
            defaultAuthMode: 'userPool',
          },
        };
      }
      if (c.storage && c.storage.bucket) {
        conf.Storage = {
          S3: {
            bucket: c.storage.bucket,
            region: c.storage.region || c.region,
          },
        };
      }
      Amplify.configure(conf);
      return true;
    })();
  }
  return _configured;
}
