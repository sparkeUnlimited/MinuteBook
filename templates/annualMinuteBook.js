// Compiled Annual Minute Book — one document assembling the whole year:
// cover, corporate snapshot, registers, the year's resolutions/minutes (with
// their captured signatures), and an index of uploaded documents.
// Pure: (data, extras) -> HTML string.
//
// `data` is the standard templateData() object; `extras` carries the
// year-specific records:
//   { fiscalYear, annual, meeting, adhocs[], yearDocs[], signatures: {docKey: sig} }

import { esc, fmtDate } from './_helpers.js';
import { directorRegister } from './directorRegister.js';
import { officerRegister } from './officerRegister.js';
import { shareRegister } from './shareRegister.js';
import { annualResolution } from './annualResolution.js';
import { shareholdersMeeting } from './shareholdersMeeting.js';
import { adHocResolution } from './adHocResolution.js';

function part(title, inner) {
  return `<section class="mb-part">
      <h2 class="mb-part-title">${esc(title)}</h2>
      ${inner}
    </section>`;
}

export function annualMinuteBook(data, extras) {
  const corp = data.corp || {};
  const fy = extras.fiscalYear;
  const sigs = extras.signatures || {};
  const today = new Date().toISOString().slice(0, 10);

  // --- cover -----------------------------------------------------------------
  const cover = `
    <section class="mb-cover">
      <p class="mb-cover-kicker">Corporate Minute Book</p>
      <h1 class="mb-cover-title">${esc(corp.legalName || '[Corporation Name]')}</h1>
      <p class="mb-cover-sub">Annual Minute Book — Fiscal Year ${esc(fy)}</p>
      <p class="mb-cover-meta">
        Corporation No. ${esc(corp.corporationNumber || '—')} · ${esc(corp.jurisdiction || 'Ontario')}<br/>
        Compiled ${esc(fmtDate(today))}
      </p>
    </section>`;

  // --- corporate snapshot ----------------------------------------------------
  const snapRow = (k, v) => `<tr><th>${esc(k)}</th><td>${esc(v || '—')}</td></tr>`;
  const snapshot = part('Corporate Information', `
    <table class="doc-table">
      ${snapRow('Legal Name', corp.legalName)}
      ${snapRow('Trade / Operating Names', (corp.tradeNames || []).join(', '))}
      ${snapRow('Corporation Number', corp.corporationNumber)}
      ${snapRow('Business Number', corp.businessNumber)}
      ${snapRow('Jurisdiction', corp.jurisdiction)}
      ${snapRow('Incorporation Date', corp.incorporationDate ? fmtDate(corp.incorporationDate) : '')}
      ${snapRow('Registered Office', corp.registeredOffice)}
    </table>`);

  // --- registers -------------------------------------------------------------
  const registers = [
    part('Register of Directors', directorRegister(data)),
    part('Register of Officers', officerRegister(data)),
    part('Register of Shares', shareRegister(data)),
  ].join('');

  // --- the year's resolutions & minutes -------------------------------------
  const resolutions = [];
  if (extras.annual) {
    resolutions.push(part(`Annual Resolutions — FY ${esc(fy)}`,
      annualResolution({ ...data, signature: sigs[`annual:${extras.annual.id}`] || null }, extras.annual)));
  }
  if (extras.meeting) {
    resolutions.push(part(`Shareholders' Meeting Minutes — FY ${esc(fy)}`,
      shareholdersMeeting({ ...data, signature: sigs[`shareholders:${extras.meeting.id}`] || null }, extras.meeting)));
  }
  for (const r of extras.adhocs || []) {
    resolutions.push(part(`Resolution — ${esc(r.customTitle || r.type || 'Ad Hoc')}`,
      adHocResolution({ ...data, signature: sigs[`adhoc:${r.id}`] || null }, r)));
  }
  const resolutionsHtml = resolutions.length
    ? resolutions.join('')
    : part(`Resolutions — FY ${esc(fy)}`, '<p>[No resolutions recorded for this fiscal year.]</p>');

  // --- document index --------------------------------------------------------
  const docRows = (extras.yearDocs || []).map((doc) => `
    <tr>
      <td>${esc(doc.category || '—')}</td>
      <td>${esc(doc.description || doc.fileName || '—')}</td>
      <td>${esc(doc.fileName || '—')}</td>
      <td>${doc.attestationConfirmed ? `Confirmed by ${esc(doc.attestationBy || '—')}` : '—'}</td>
    </tr>`).join('');
  const docIndex = part(`Supporting Documents on File — FY ${esc(fy)}`, `
    <p>The following documents are held in the Corporation's electronic records for this fiscal year.</p>
    <table class="doc-table">
      <thead><tr><th>Section</th><th>Description</th><th>File</th><th>Attestation</th></tr></thead>
      <tbody>${docRows || '<tr><td colspan="4">[No documents uploaded for this fiscal year.]</td></tr>'}</tbody>
    </table>`);

  return `<article class="resolution-doc mb-book">
      ${cover}
      ${snapshot}
      ${registers}
      ${resolutionsHtml}
      ${docIndex}
    </article>`;
}
