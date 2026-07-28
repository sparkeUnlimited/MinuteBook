// Local development adapter — persists to localStorage so the app is fully
// runnable before AWS is provisioned. The spec calls for DynamoDB in
// production (durable, cross-device); this adapter is a drop-in stand-in with
// the same interface so nothing else in the app has to change when the
// Amplify adapter takes over.

const KEY = 'minutebook.v1';

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

function writeAll(db) {
  localStorage.setItem(KEY, JSON.stringify(db));
}

function uid() {
  return 'loc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

export const localAdapter = {
  name: 'local',

  async list(model, corpId) {
    const db = readAll();
    const items = Object.values(db[model] || {});
    // corp-scoped models filter by corpId when one is supplied.
    return corpId ? items.filter((r) => r.corpId === corpId) : items;
  },

  async get(model, id) {
    const db = readAll();
    return (db[model] || {})[id] || null;
  },

  async create(model, input) {
    const db = readAll();
    db[model] = db[model] || {};
    const now = new Date().toISOString();
    const record = { id: input.id || uid(), createdAt: now, updatedAt: now, ...input };
    db[model][record.id] = record;
    writeAll(db);
    return record;
  },

  async update(model, input) {
    const db = readAll();
    db[model] = db[model] || {};
    const existing = db[model][input.id] || {};
    const record = { ...existing, ...input, updatedAt: new Date().toISOString() };
    db[model][record.id] = record;
    writeAll(db);
    return record;
  },

  async remove(model, id) {
    const db = readAll();
    if (db[model]) delete db[model][id];
    writeAll(db);
    return { id };
  },
};
