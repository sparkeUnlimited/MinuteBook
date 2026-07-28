// Generic form-rendering engine (spec Phase 3).
//
// Renders inputs from a section's field definitions in schema.js, supporting:
//   text | textarea | date | number | select | multiselect | boolean
//   - required validation (gates PDF generation)
//   - conditional fields via showIf { field, equals }
//   - repeatable sections with add/remove-row controls
//   - immutability (disable all inputs) for signed resolutions
//
// It is view-agnostic: it renders into a container and calls back on save /
// delete. The section view (app.js) supplies data and persistence callbacks.

import { esc } from '../templates/_helpers.js';

let _uid = 0;
const nextId = () => `f${++_uid}`;

// --- field rendering -------------------------------------------------------

function optionList(field, context) {
  if (field.optionsFrom && context && context[field.optionsFrom]) {
    // Options derived from other records (e.g. shareClassId, or corps).
    return context[field.optionsFrom].map((r) => ({
      value: r.id,
      label: r.className || r.name || r.legalName || r.id,
    }));
  }
  return (field.options || []).map((o) => ({ value: o, label: o }));
}

function renderField(field, value, disabled, context) {
  const id = nextId();
  const req = field.required ? ' <span class="req" title="Required">*</span>' : '';
  const help = field.help ? `<p class="field-help">${esc(field.help)}</p>` : '';
  const dis = disabled ? 'disabled' : '';
  const showIf = field.showIf ? ` data-showif-field="${esc(field.showIf.field)}" data-showif-equals="${esc(String(field.showIf.equals))}"` : '';
  let control = '';

  switch (field.type) {
    case 'textarea':
      control = `<textarea id="${id}" name="${esc(field.name)}" rows="3" ${dis}>${esc(value ?? '')}</textarea>`;
      break;
    case 'date':
      control = `<input id="${id}" name="${esc(field.name)}" type="date" value="${esc(value ?? '')}" ${dis}>`;
      break;
    case 'number':
      control = `<input id="${id}" name="${esc(field.name)}" type="number" step="any" value="${esc(value ?? '')}" ${dis}>`;
      break;
    case 'boolean':
      control = `<label class="switch"><input id="${id}" name="${esc(field.name)}" type="checkbox" ${value ? 'checked' : ''} ${dis}><span>Yes</span></label>`;
      break;
    case 'select': {
      const opts = optionList(field, context);
      const options = ['<option value="">— select —</option>']
        .concat(opts.map((o) => `<option value="${esc(o.value)}" ${String(value) === String(o.value) ? 'selected' : ''}>${esc(o.label)}</option>`))
        .join('');
      control = `<select id="${id}" name="${esc(field.name)}" ${dis}>${options}</select>`;
      break;
    }
    case 'multiselect': {
      const opts = optionList(field, context);
      const selected = Array.isArray(value) ? value.map(String) : [];
      const checks = opts.map((o) => {
        const on = selected.includes(String(o.value));
        return `<label class="chk"><input type="checkbox" data-multi="${esc(field.name)}" value="${esc(o.value)}" ${on ? 'checked' : ''} ${dis}><span>${esc(o.label)}</span></label>`;
      }).join('');
      // freeform additions: values not in the predefined option set
      const known = new Set(opts.map((o) => String(o.value)));
      const extra = selected.filter((v) => !known.has(v));
      const freeform = field.freeform
        ? `<input class="multi-freeform" type="text" data-multi-free="${esc(field.name)}" placeholder="Add more, comma-separated" value="${esc(extra.join(', '))}" ${dis}>`
        : '';
      control = `<div class="multiselect" data-multi-group="${esc(field.name)}">${checks || '<span class="field-help">No preset options — type below.</span>'}${freeform}</div>`;
      break;
    }
    case 'text':
    default:
      control = `<input id="${id}" name="${esc(field.name)}" type="text" value="${esc(value ?? '')}" ${dis}>`;
  }

  return `<div class="field" data-field="${esc(field.name)}"${showIf}>
      <label for="${id}">${esc(field.label)}${req}</label>
      ${control}${help}
    </div>`;
}

// --- read values back out of the DOM --------------------------------------

function readField(root, field) {
  switch (field.type) {
    case 'boolean': {
      const el = root.querySelector(`[name="${CSS.escape(field.name)}"]`);
      return !!(el && el.checked);
    }
    case 'number': {
      const el = root.querySelector(`[name="${CSS.escape(field.name)}"]`);
      if (!el || el.value === '') return null;
      return Number(el.value);
    }
    case 'multiselect': {
      const group = root.querySelector(`[data-multi-group="${CSS.escape(field.name)}"]`);
      if (!group) return [];
      const checked = [...group.querySelectorAll(`[data-multi="${CSS.escape(field.name)}"]:checked`)].map((c) => c.value);
      const freeEl = group.querySelector(`[data-multi-free="${CSS.escape(field.name)}"]`);
      const free = freeEl ? freeEl.value.split(',').map((s) => s.trim()).filter(Boolean) : [];
      // de-dup, preserve order (checked first, then freeform extras)
      return [...new Set([...checked, ...free])];
    }
    default: {
      const el = root.querySelector(`[name="${CSS.escape(field.name)}"]`);
      const v = el ? el.value.trim() : '';
      return v === '' ? null : v;
    }
  }
}

export function readRecord(root, fields) {
  const out = {};
  for (const f of fields) out[f.name] = readField(root, f);
  return out;
}

// --- validation ------------------------------------------------------------

// Returns array of labels of missing required (and currently-visible) fields.
export function validateRecord(root, fields, record) {
  const missing = [];
  for (const f of fields) {
    if (!f.required) continue;
    if (!isVisible(f, record)) continue;
    const v = record[f.name];
    const empty = v == null || v === '' || (Array.isArray(v) && v.length === 0);
    if (empty) missing.push(f.label);
  }
  return missing;
}

function isVisible(field, record) {
  if (!field.showIf) return true;
  return record[field.showIf.field] === field.showIf.equals;
}

// --- conditional visibility (live) ----------------------------------------

export function wireConditionals(root) {
  const apply = () => {
    root.querySelectorAll('[data-showif-field]').forEach((el) => {
      const dep = el.getAttribute('data-showif-field');
      const equals = el.getAttribute('data-showif-equals');
      const depEl = root.querySelector(`[name="${CSS.escape(dep)}"]`);
      let val;
      if (depEl && depEl.type === 'checkbox') val = String(depEl.checked);
      else val = depEl ? String(depEl.value) : '';
      el.style.display = (val === equals) ? '' : 'none';
    });
  };
  root.addEventListener('change', apply);
  root.addEventListener('input', apply);
  apply();
}

// --- high-level: render a set of fields into a form element ----------------

export function renderFieldset(fields, record, disabled, context) {
  return fields.map((f) => renderField(f, record?.[f.name], disabled, context)).join('');
}
