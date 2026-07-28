// Main application controller. Wires the sidebar nav, renders each section's
// view (single form / repeatable rows / grouped / registry), and handles
// save, delete, and PDF generation. Single-page app with hash routing.

import { SECTIONS, NAV_ORDER } from './schema.js';
import {
  store, hydrate, single, saveRecord, deleteRecord, onChange,
  corps, activeCorp, setActiveCorp, createCorp,
} from './state.js';
import {
  renderFieldset, readRecord, validateRecord, wireConditionals,
} from './formEngine.js';
import { documentsFor } from './documents.js';
import { generateAndSave } from './pdf.js';
import { esc, fmtDate } from '../templates/_helpers.js';
import { currentRoute, navigate, onRoute, start } from './router.js';
import { ensureSignedIn } from './loginGate.js';
import { authEnabled } from './amplify-setup.js';
import { currentEmail, logout } from './auth.js';

const $nav = document.getElementById('nav');
const $main = document.getElementById('main');
const $status = document.getElementById('backend-status');

// --- toast -----------------------------------------------------------------

function toast(msg, type = 'info') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = `toast toast-${type} show`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3200);
}

// --- navigation ------------------------------------------------------------

function renderNav(active) {
  $nav.innerHTML = NAV_ORDER.map((key) => {
    const s = SECTIONS[key];
    const on = key === active ? ' class="active"' : '';
    return `<a href="#/${key}"${on}>${esc(s.label)}</a>`;
  }).join('');
}

// Corp switcher — sits above the nav. Each corporation is its own CorpInfo
// record; this only chooses which one is active. Names/numbers are edited in
// the Corporation Info form.
function renderCorpSwitcher() {
  let host = document.getElementById('corp-switcher');
  if (!host) {
    host = document.createElement('div');
    host.id = 'corp-switcher';
    host.className = 'corp-switcher';
    $nav.parentNode.insertBefore(host, $nav);
  }
  const list = corps();
  if (!list.length) {
    host.innerHTML = `<button class="btn-add-corp" id="add-corp">+ Add your first corporation</button>`;
  } else {
    const options = list.map((c) =>
      `<option value="${esc(c.id)}"${c.id === store.activeCorpId ? ' selected' : ''}>${esc(c.legalName || 'Untitled corporation')}</option>`).join('');
    host.innerHTML = `
      <label class="cs-label" for="corp-select">Corporation</label>
      <div class="cs-row">
        <select id="corp-select" class="corp-select">${options}</select>
        <button class="btn-add-corp" id="add-corp" title="Add a corporation">＋</button>
      </div>`;
  }
  const sel = document.getElementById('corp-select');
  if (sel) sel.addEventListener('change', async () => {
    await setActiveCorp(sel.value);
    render(currentRoute());
  });
  document.getElementById('add-corp').addEventListener('click', addCorp);
}

async function addCorp() {
  const name = prompt('New corporation — legal name (you can fill in the rest on the next screen):');
  if (name === null) return; // cancelled
  try {
    await createCorp({ legalName: name.trim() || 'Untitled corporation' });
    toast('Corporation added.', 'success');
    if (currentRoute() === 'corp-info') render('corp-info');
    else navigate('corp-info'); // land on the form to enter number, jurisdiction, etc.
  } catch (err) {
    toast(`Couldn't add corporation: ${err.message}`, 'error');
  }
}

// The record a single-record section edits: the active corp for CorpInfo,
// else the active corp's scoped record (e.g. BankingInfo).
function currentRecordFor(section) {
  return section.model === 'CorpInfo' ? activeCorp() : single(section.model);
}

// Corporations other than the active one (for parent / corp-shareholder pickers).
function otherCorps() {
  return corps().filter((c) => c.id !== store.activeCorpId);
}

// --- PDF generation + registry upsert --------------------------------------

async function upsertRegistry(doc, signed) {
  const documentId = doc.recordId || doc.id;
  const existing = store.DocumentRegistryEntry.find((e) => e.documentId === documentId);
  const input = {
    ...(existing ? { id: existing.id } : {}),
    documentId,
    documentType: doc.registryType,
    periodCovered: String(doc.periodCovered ?? ''),
    dateSigned: signed || existing?.dateSigned || new Date().toISOString().slice(0, 10),
    pdfGenerated: true,
  };
  await saveRecord('DocumentRegistryEntry', input);
}

async function handleGenerate(doc, btn) {
  const prev = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Generating…';
  try {
    const html = doc.build();
    const disposition = await generateAndSave(html, doc.label);
    if (disposition === 'cancelled') {
      toast('Save cancelled.', 'info');
      return;
    }
    // Mark the underlying signable record as pdfGenerated, if any.
    if (doc.recordModel && doc.recordId) {
      const rec = store[doc.recordModel].find((r) => r.id === doc.recordId);
      if (rec && !rec.pdfGenerated) {
        await saveRecord(doc.recordModel, { id: rec.id, pdfGenerated: true });
      }
    }
    await upsertRegistry(doc, null);
    toast(disposition === 'shared' ? 'PDF shared.' : 'PDF saved.', 'success');
  } catch (err) {
    console.error(err);
    toast(`Couldn't generate PDF: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = prev;
  }
}

function docButtons(sectionKey, record) {
  const docs = documentsFor(sectionKey, record);
  if (!docs.length) return '';
  return `<div class="doc-actions">${docs.map((d, i) =>
    `<button class="btn btn-doc" data-gen="${sectionKey}" data-rec="${record?.id || ''}" data-idx="${i}">📄 ${esc(d.label)}</button>`,
  ).join('')}</div>`;
}

// Attach generate handlers within a container.
function wireDocButtons(container, sectionKey) {
  container.querySelectorAll('[data-gen]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const recId = btn.getAttribute('data-rec');
      const idx = Number(btn.getAttribute('data-idx'));
      const record = recId ? store[SECTIONS[sectionKey].model]?.find((r) => r.id === recId) : null;
      const docs = documentsFor(sectionKey, record);
      if (docs[idx]) handleGenerate(docs[idx], btn);
    });
  });
}

// --- section views ---------------------------------------------------------

function sectionHeader(section, extra = '') {
  return `<div class="section-head">
      <h1>${esc(section.label)}</h1>
      ${extra}
    </div>`;
}

// Single-record section (CorpInfo, BankingInfo).
function renderSingle(key, section) {
  const isCorp = section.model === 'CorpInfo';
  const record = currentRecordFor(section) || {};
  const firstCorpHint = isCorp && !activeCorp()
    ? `<p class="doc-gate">No corporation yet — fill this in and save to create your first one.</p>` : '';
  $main.innerHTML = `
    ${sectionHeader(section)}
    ${firstCorpHint}
    <form class="card" id="form-single">
      ${renderFieldset(section.fields, record, false, { corps: otherCorps() })}
      <div class="card-actions">
        <button type="submit" class="btn btn-primary">Save</button>
      </div>
    </form>
    <div class="doc-block" id="doc-block"></div>
  `;
  const form = document.getElementById('form-single');
  wireConditionals(form);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rec = readRecord(form, section.fields);
    const missing = validateRecord(form, section.fields, rec);
    if (missing.length) { toast(`Required: ${missing.join(', ')}`, 'error'); return; }
    try {
      const existing = currentRecordFor(section);
      if (isCorp && !existing) {
        await createCorp(rec);           // first corp — becomes active
        renderCorpSwitcher();
      } else {
        await saveRecord(section.model, existing ? { id: existing.id, ...rec } : rec);
        if (isCorp) renderCorpSwitcher(); // name may have changed
      }
      toast('Saved.', 'success');
      renderDocBlock(key, section, null);
    } catch (err) { toast(`Couldn't save: ${err.message}`, 'error'); }
  });

  renderDocBlock(key, section, null);
}

// Render the "Generate documents" block for single-record sections, gated on
// required fields being complete.
function renderDocBlock(key, section, record) {
  const block = document.getElementById('doc-block');
  if (!block) return;
  const rec = record || currentRecordFor(section) || {};
  const missing = validateRecord(document.getElementById('form-single'), section.fields, readRecordSafe(section, rec));
  if (missing.length) {
    block.innerHTML = `<p class="doc-gate">Complete required fields and save to generate documents.</p>`;
    return;
  }
  block.innerHTML = `<h2 class="doc-block-title">Generate</h2>${docButtons(key, rec)}`;
  wireDocButtons(block, key);
}

function readRecordSafe(section, fallback) {
  const form = document.getElementById('form-single');
  return form ? readRecord(form, section.fields) : fallback;
}

// Repeatable section (Directors, Annual, Ad Hoc).
function renderRepeatable(key, section) {
  const records = store[section.model] || [];
  $main.innerHTML = `
    ${sectionHeader(section, `<button class="btn btn-primary" id="add-row">+ Add</button>`)}
    <div id="rows"></div>
  `;
  const rowsEl = document.getElementById('rows');
  document.getElementById('add-row').addEventListener('click', () => {
    rowsEl.insertAdjacentHTML('afterbegin', rowCard(key, section, {}, true));
    wireRow(rowsEl.firstElementChild, key, section);
  });

  if (!records.length) {
    rowsEl.innerHTML = `<p class="empty">No entries yet. Click “Add”.</p>`;
  } else {
    rowsEl.innerHTML = records.map((r) => rowCard(key, section, r, false)).join('');
    rowsEl.querySelectorAll('.row-card').forEach((el) => wireRow(el, key, section));
  }
}

function rowCard(key, section, record, isNew) {
  const locked = section.immutableWhen ? section.immutableWhen(record) : false;
  const title = section.rowLabel ? section.rowLabel(record) : 'Entry';
  return `<form class="card row-card${locked ? ' locked' : ''}" data-id="${record.id || ''}">
      <div class="row-head">
        <h3>${esc(title)}</h3>
        ${locked ? '<span class="lock-badge">🔒 Signed — locked</span>' : ''}
      </div>
      ${renderFieldset(section.fields, record, locked)}
      <div class="card-actions">
        ${locked ? '' : `<button type="submit" class="btn btn-primary">Save</button>
          <button type="button" class="btn btn-danger" data-remove>Remove</button>`}
      </div>
      ${record.id || locked ? `<div class="doc-actions-wrap">${docButtons(key, record)}</div>` : ''}
    </form>`;
}

function wireRow(el, key, section) {
  wireConditionals(el);
  el.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = el.getAttribute('data-id') || null;
    const rec = readRecord(el, section.fields);
    const missing = validateRecord(el, section.fields, rec);
    if (missing.length) { toast(`Required: ${missing.join(', ')}`, 'error'); return; }
    try {
      const saved = await saveRecord(section.model, id ? { id, ...rec } : rec);
      toast('Saved.', 'success');
      // If newly signed, immutability changed — re-render the section.
      if (section.immutableWhen && section.immutableWhen(saved)) renderRepeatable(key, section);
      else { el.setAttribute('data-id', saved.id); refreshRowDocs(el, key, saved); }
    } catch (err) { toast(`Couldn't save: ${err.message}`, 'error'); }
  });

  const removeBtn = el.querySelector('[data-remove]');
  if (removeBtn) {
    removeBtn.addEventListener('click', async () => {
      const id = el.getAttribute('data-id');
      if (!id) { el.remove(); return; } // unsaved new row
      // Confirmation before removing legal record data (spec Phase 8).
      if (!confirm('Remove this entry? This is legal record data and cannot be undone.')) return;
      try { await deleteRecord(section.model, id); renderRepeatable(key, section); toast('Removed.', 'info'); }
      catch (err) { toast(`Couldn't remove: ${err.message}`, 'error'); }
    });
  }

  wireDocButtons(el, key);
}

function refreshRowDocs(el, key, record) {
  let wrap = el.querySelector('.doc-actions-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'doc-actions-wrap';
    el.appendChild(wrap);
  }
  wrap.innerHTML = docButtons(key, record);
  wireDocButtons(el, key);
}

// Grouped section (Shares: classes + shareholders).
function renderGroups(key, section) {
  $main.innerHTML = `${sectionHeader(section)}<div id="groups"></div>`;
  const host = document.getElementById('groups');
  section.groups.forEach((group) => {
    const wrap = document.createElement('section');
    wrap.className = 'group';
    wrap.innerHTML = `<div class="group-head"><h2>${esc(group.label)}</h2>
      <button class="btn btn-primary" data-addgroup>+ Add</button></div>
      <div class="group-rows"></div>`;
    host.appendChild(wrap);
    const rowsEl = wrap.querySelector('.group-rows');
    const context = () => ({ shareClasses: store.ShareClass, shareholders: store.Shareholder, corps: otherCorps() });

    const draw = () => {
      const records = store[group.model] || [];
      rowsEl.innerHTML = records.length
        ? records.map((r) => groupRowCard(group, r, context())).join('')
        : `<p class="empty">None yet.</p>`;
      rowsEl.querySelectorAll('.row-card').forEach((el) => wireGroupRow(el, group, draw));
    };
    wrap.querySelector('[data-addgroup]').addEventListener('click', () => {
      rowsEl.insertAdjacentHTML('afterbegin', groupRowCard(group, {}, context()));
      wireGroupRow(rowsEl.firstElementChild, group, draw);
    });
    draw();
  });

  // Documents for the whole shares section (share register).
  const docWrap = document.createElement('div');
  docWrap.className = 'doc-block';
  docWrap.innerHTML = `<h2 class="doc-block-title">Generate</h2>${docButtons(key, null)}`;
  host.appendChild(docWrap);
  wireDocButtons(docWrap, key);
}

function groupRowCard(group, record, context) {
  const title = group.rowLabel ? group.rowLabel(record) : 'Entry';
  return `<form class="card row-card" data-id="${record.id || ''}">
      <div class="row-head"><h3>${esc(title)}</h3></div>
      ${renderFieldset(group.fields, record, false, context)}
      <div class="card-actions">
        <button type="submit" class="btn btn-primary">Save</button>
        <button type="button" class="btn btn-danger" data-remove>Remove</button>
      </div>
    </form>`;
}

function wireGroupRow(el, group, redraw) {
  wireConditionals(el);
  el.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = el.getAttribute('data-id') || null;
    const rec = readRecord(el, group.fields);
    // A corporation shareholder mirrors that corp's legal name for display.
    if (group.model === 'Shareholder' && rec.shareholderCorpId) {
      const c = corps().find((x) => x.id === rec.shareholderCorpId);
      if (c) rec.name = c.legalName;
    }
    const missing = validateRecord(el, group.fields, rec);
    if (missing.length) { toast(`Required: ${missing.join(', ')}`, 'error'); return; }
    try { await saveRecord(group.model, id ? { id, ...rec } : rec); toast('Saved.', 'success'); redraw(); }
    catch (err) { toast(`Couldn't save: ${err.message}`, 'error'); }
  });
  const removeBtn = el.querySelector('[data-remove]');
  removeBtn.addEventListener('click', async () => {
    const id = el.getAttribute('data-id');
    if (!id) { el.remove(); return; }
    if (!confirm('Remove this entry? This is legal record data and cannot be undone.')) return;
    try { await deleteRecord(group.model, id); redraw(); toast('Removed.', 'info'); }
    catch (err) { toast(`Couldn't remove: ${err.message}`, 'error'); }
  });
}

// Registry / status view (spec Phase 6).
function renderRegistry() {
  const entries = store.DocumentRegistryEntry;
  const annuals = store.AnnualResolution;

  // Overdue: no signed annual resolution for the year that ended >6 months ago.
  const overdueRows = computeOverdue(annuals);

  const rows = entries.length ? entries
    .slice()
    .sort((a, b) => String(b.dateSigned || '').localeCompare(String(a.dateSigned || '')))
    .map((e) => `
      <tr>
        <td>${esc(e.documentType)}</td>
        <td>${esc(e.periodCovered)}</td>
        <td>${e.dateSigned ? esc(fmtDate(e.dateSigned)) : '—'}</td>
        <td>${e.pdfGenerated ? '<span class="pill pill-ok">Complete</span>' : '<span class="pill">Not generated</span>'}</td>
      </tr>`).join('')
    : '<tr><td colspan="4" class="empty">No documents generated yet.</td></tr>';

  $main.innerHTML = `
    ${sectionHeader(SECTIONS.registry, `<button class="btn btn-primary" id="new-annual">+ New Annual Resolution</button>`)}
    ${overdueRows}
    <table class="registry-table">
      <thead><tr><th>Document</th><th>Period</th><th>Date Signed</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  document.getElementById('new-annual').addEventListener('click', createNewAnnual);
}

function computeOverdue(annuals) {
  const now = new Date();
  const currentFY = now.getUTCFullYear() - 1; // year most recently ended
  const hasSigned = annuals.some((a) => a.dateSigned && String(a.fiscalYearCovered).includes(String(currentFY)));
  // Overdue if we're past ~June of the following year (6 months after a
  // Dec 31 year end) and no signed resolution exists for it.
  const overdue = !hasSigned && now.getUTCMonth() >= 6;
  if (!overdue) return '';
  return `<div class="alert alert-overdue">⚠ Annual resolution for fiscal year ${currentFY} appears overdue
    (more than 6 months after a typical fiscal year end and not yet signed).</div>`;
}

async function createNewAnnual() {
  // Pre-fill new fiscal year, carrying nothing mutable forward (static corp/
  // director info is read live from the store by templates already).
  const lastYear = store.AnnualResolution
    .map((a) => parseInt(String(a.fiscalYearCovered).match(/\d{4}/)?.[0] || '0', 10))
    .reduce((m, y) => Math.max(m, y), 0);
  const nextYear = (lastYear || new Date().getUTCFullYear() - 1) + (lastYear ? 1 : 0) || new Date().getUTCFullYear() - 1;
  const rec = {
    fiscalYearCovered: String(nextYear),
    financialStatementsApproved: true,
    directorContinuation: true,
    dividendDeclared: false,
    auditWaiver: true,
    pdfGenerated: false,
  };
  await saveRecord('AnnualResolution', rec);
  toast(`Created annual resolution for FY ${nextYear}.`, 'success');
  navigate('annual');
}

// --- top-level render ------------------------------------------------------

function render(route) {
  renderNav(route);
  renderCorpSwitcher();
  const section = SECTIONS[route];
  if (!section) return;

  // Every section except Corporation Info needs an active corp to scope to.
  if (route !== 'corp-info' && !store.activeCorpId) {
    $main.innerHTML = `
      ${sectionHeader(section)}
      <p class="doc-gate">Add a corporation first — go to
        <a href="#/corp-info">Corporation Info</a> to create one.</p>`;
    return;
  }

  if (section.view === 'registry') return renderRegistry();
  if (section.groups) return renderGroups(route, section);
  if (section.repeatable) return renderRepeatable(route, section);
  return renderSingle(route, section);
}

// --- boot ------------------------------------------------------------------

async function renderSignOut() {
  if (!(await authEnabled())) return;
  const foot = document.querySelector('.sidebar-foot');
  if (!foot) return;
  const email = await currentEmail();
  foot.innerHTML = `
    ${email ? `<p class="who">${esc(email)}</p>` : ''}
    <button class="signout" id="signout">Sign out</button>`;
  foot.querySelector('#signout').addEventListener('click', async () => {
    try { await logout(); } finally { location.reload(); }
  });
}

async function boot() {
  $main.innerHTML = '<p class="loading">Loading…</p>';

  // Gate the app behind Cognito login (skips instantly if auth isn't configured).
  try {
    await ensureSignedIn();
  } catch (err) {
    console.error(err);
    $main.innerHTML = `<p class="loading">Sign-in unavailable: ${esc(err.message || String(err))}</p>`;
    return;
  }

  try {
    await hydrate();
  } catch (err) {
    console.error(err);
    toast('Failed to load data. Working from an empty state.', 'error');
  }
  $status.textContent = store.backend === 'amplify' ? '● AWS (AppSync)' : '● Local (this device)';
  $status.className = `backend-status ${store.backend}`;

  onRoute(render);
  start();
  renderSignOut();

  // Re-render current section when the store changes from elsewhere.
  onChange(() => { /* views manage their own refresh; registry benefits */
    if (currentRoute() === 'registry') renderRegistry();
  });
}

boot();
