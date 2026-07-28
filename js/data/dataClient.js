// Single data-access facade used by the rest of the app. It picks a backend
// adapter at load time and exposes a stable CRUD interface:
//   list(model) / get(model,id) / create(model,input) /
//   update(model,input) / remove(model,id)
//
// Adapter selection:
//   - If a global `window.MINUTEBOOK_BACKEND === 'local'` is set, force local.
//   - Else if aws-exports is present (backend provisioned), use Amplify.
//   - Else fall back to the localStorage adapter so the app always runs.

import { localAdapter } from './localAdapter.js';
import { backendEnabled } from '../amplify-setup.js';

let adapterPromise = null;

async function detectAdapter() {
  if (window.MINUTEBOOK_BACKEND === 'local') return localAdapter;

  // Use AppSync when config.js has an endpoint (or forced); else local.
  try {
    if (window.MINUTEBOOK_BACKEND === 'amplify' || (await backendEnabled())) {
      const { amplifyAdapter } = await import('./amplifyAdapter.js');
      return amplifyAdapter;
    }
  } catch (e) {
    console.warn('AppSync adapter unavailable, using local storage:', e);
  }
  return localAdapter;
}

async function adapter() {
  if (!adapterPromise) adapterPromise = detectAdapter();
  return adapterPromise;
}

export const data = {
  async backendName() {
    return (await adapter()).name;
  },
  async list(model, corpId) {
    return (await adapter()).list(model, corpId);
  },
  async get(model, id) {
    return (await adapter()).get(model, id);
  },
  async create(model, input) {
    return (await adapter()).create(model, input);
  },
  async update(model, input) {
    return (await adapter()).update(model, input);
  },
  async remove(model, id) {
    return (await adapter()).remove(model, id);
  },
};
