// In-memory app state, hydrated from the data layer on startup and kept in
// sync as the user edits. Views read from `store` synchronously; writes go
// through the mutating helpers which persist via the data layer and update
// the local cache.
//
// Multi-tenant: CorpInfo holds all corporations; every other model is scoped
// to the *active* corp (store.activeCorpId). Scoped stores contain only the
// active corp's records, and saves auto-stamp corpId.

import { data } from './data/dataClient.js';
import { ALL_MODELS, SCOPED, isScoped } from './models.js';

const ACTIVE_CORP_KEY = 'minutebook.activeCorpId';

export const store = {
  backend: 'local',
  activeCorpId: null,
};
for (const m of ALL_MODELS) store[m] = [];

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach((fn) => fn()); }

// Load the scoped models for the active corp (or clear them if no corp).
async function loadScoped() {
  await Promise.all([...SCOPED].map(async (m) => {
    if (!store.activeCorpId) { store[m] = []; return; }
    try { store[m] = await data.list(m, store.activeCorpId); }
    catch (e) { console.warn(`Failed to load ${m}:`, e); store[m] = []; }
  }));
}

export async function hydrate() {
  store.backend = await data.backendName();
  try { store.CorpInfo = await data.list('CorpInfo'); }
  catch (e) { console.warn('Failed to load CorpInfo:', e); store.CorpInfo = []; }

  // Pick the active corp: remembered choice if still valid, else the first corp.
  const remembered = localStorage.getItem(ACTIVE_CORP_KEY);
  const valid = store.CorpInfo.some((c) => c.id === remembered);
  store.activeCorpId = valid ? remembered : (store.CorpInfo[0]?.id || null);

  await loadScoped();
  emit();
}

// Switch the active corporation and reload its data.
export async function setActiveCorp(corpId) {
  store.activeCorpId = corpId;
  if (corpId) localStorage.setItem(ACTIVE_CORP_KEY, corpId);
  else localStorage.removeItem(ACTIVE_CORP_KEY);
  await loadScoped();
  emit();
}

// Convenience accessors -----------------------------------------------------

export function corps() { return store.CorpInfo; }

export function activeCorp() {
  return store.CorpInfo.find((c) => c.id === store.activeCorpId) || null;
}

// First record of a scoped single-record model for the active corp (e.g.
// BankingInfo). Scoped stores are already filtered to the active corp.
export function single(model) {
  return store[model][0] || null;
}

// Mutations -----------------------------------------------------------------

export async function saveRecord(model, input) {
  // Stamp the active corp on scoped records that don't already carry one.
  if (isScoped(model) && !input.corpId) {
    if (!store.activeCorpId) throw new Error('No active corporation selected.');
    input = { ...input, corpId: store.activeCorpId };
  }
  const record = input.id
    ? await data.update(model, input)
    : await data.create(model, input);
  const arr = store[model];
  const i = arr.findIndex((r) => r.id === record.id);
  if (i >= 0) arr[i] = record; else arr.push(record);
  emit();
  return record;
}

export async function deleteRecord(model, id) {
  await data.remove(model, id);
  store[model] = store[model].filter((r) => r.id !== id);
  emit();
}

// Create a new corporation and switch to it. Returns the new CorpInfo record.
export async function createCorp(fields) {
  const record = await data.create('CorpInfo', fields);
  store.CorpInfo.push(record);
  await setActiveCorp(record.id);
  return record;
}
