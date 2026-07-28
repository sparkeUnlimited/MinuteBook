// File storage facade. Mirrors the data-layer pattern: a local adapter (stores
// files as data URLs in localStorage, so uploads work with no AWS) and an
// Amplify S3 adapter (real uploads via the Cognito Identity Pool credentials).
//
//   upload(path, file) -> { path }
//   url(path)          -> a URL usable as an <a href> (data: locally, presigned in S3)
//   remove(path)       -> void
//
// `path` is the full S3 key, e.g. "{corpId}/files/2025/tax-return/file.pdf".

import { ensureAmplifyConfigured, storageEnabled } from './amplify-setup.js';

const S3_ESM = 'https://esm.sh/aws-amplify@6/storage';
const LOCAL_KEY = 'minutebook.files.v1';

// --- local adapter (base64 in localStorage) --------------------------------

function readLocal() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || {}; }
  catch { return {}; }
}
function writeLocal(db) { localStorage.setItem(LOCAL_KEY, JSON.stringify(db)); }

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

const localStore = {
  async upload(path, file) {
    const db = readLocal();
    db[path] = { name: file.name, type: file.type, size: file.size, dataUrl: await fileToDataUrl(file) };
    writeLocal(db);
    return { path };
  },
  async url(path) {
    const db = readLocal();
    return db[path]?.dataUrl || null;
  },
  async remove(path) {
    const db = readLocal();
    delete db[path];
    writeLocal(db);
  },
};

// --- Amplify S3 adapter -----------------------------------------------------

let s3ModPromise = null;
async function s3() {
  if (!s3ModPromise) {
    s3ModPromise = (async () => {
      await ensureAmplifyConfigured();
      return import(S3_ESM);
    })();
  }
  return s3ModPromise;
}

const amplifyStore = {
  async upload(path, file) {
    const { uploadData } = await s3();
    await uploadData({ path, data: file, options: { contentType: file.type } }).result;
    return { path };
  },
  async url(path) {
    const { getUrl } = await s3();
    const res = await getUrl({ path });
    return res.url.toString();
  },
  async remove(path) {
    const { remove } = await s3();
    await remove({ path });
  },
};

// --- facade ----------------------------------------------------------------

let adapterPromise = null;
async function adapter() {
  if (!adapterPromise) {
    adapterPromise = storageEnabled().then((on) => (on ? amplifyStore : localStore));
  }
  return adapterPromise;
}

export const storage = {
  async available() { return true; }, // both adapters work; local is the fallback
  async usingCloud() { return storageEnabled(); },
  async upload(path, file) { return (await adapter()).upload(path, file); },
  async url(path) { return (await adapter()).url(path); },
  async remove(path) { return (await adapter()).remove(path); },
};

// Build a safe, corp-scoped S3 key.
export function buildKey({ corpId, scope, fiscalYear, category, fileName }) {
  const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'misc';
  const safeFile = String(fileName || 'file').replace(/[^\w.\-]+/g, '_');
  const where = scope === 'year' ? String(fiscalYear || 'unfiled') : 'corporate';
  return `${corpId}/files/${slug(where)}/${slug(category)}/${Date.now()}-${safeFile}`;
}
