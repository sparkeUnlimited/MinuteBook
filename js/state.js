// In-memory app state, hydrated from the data layer on startup and kept in
// sync as the user edits. Views read from `store` synchronously; writes go
// through the mutating helpers which persist via the data layer and update
// the local cache.

import { data } from './data/dataClient.js';

const MODELS = [
  'CorpInfo', 'Director', 'ShareClass', 'Shareholder', 'BankingInfo',
  'AnnualResolution', 'AdHocResolution', 'DocumentRegistryEntry',
];

export const store = {
  backend: 'local',
  CorpInfo: [],
  Director: [],
  ShareClass: [],
  Shareholder: [],
  BankingInfo: [],
  AnnualResolution: [],
  AdHocResolution: [],
  DocumentRegistryEntry: [],
};

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach((fn) => fn()); }

export async function hydrate() {
  store.backend = await data.backendName();
  await Promise.all(MODELS.map(async (m) => {
    try { store[m] = await data.list(m); }
    catch (e) { console.warn(`Failed to load ${m}:`, e); store[m] = []; }
  }));
  emit();
}

// Convenience accessors -----------------------------------------------------

// Single-record models (CorpInfo, BankingInfo) — first row or null.
export function single(model) {
  return store[model][0] || null;
}

// Mutations -----------------------------------------------------------------

export async function saveRecord(model, input) {
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
