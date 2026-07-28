// Share register — a standing register (not a resolution), regenerated on
// demand. Shows authorized/issued by class and the holdings by shareholder.
// Pure: (data) -> HTML string.

import { esc, fmtDate, docHeader, wrapDoc } from './_helpers.js';

export function shareRegister(data) {
  const corp = data.corp || {};
  const classes = data.shareClasses || [];
  const holders = data.shareholders || [];

  const classRows = classes.length ? classes.map((c) => `
    <tr>
      <td>${esc(c.className)}</td>
      <td class="num">${c.authorizedUnlimited ? 'Unlimited' : esc(c.authorized)}</td>
      <td class="num">${esc(c.issued)}</td>
      <td>${esc(c.rightsRestrictions || '—')}</td>
    </tr>`).join('') : '<tr><td colspan="4">[No share classes entered]</td></tr>';

  const holderRows = holders.length ? holders.map((h) => {
    const cls = classes.find((c) => c.id === h.shareClassId);
    return `
    <tr>
      <td>${esc(h.name)}</td>
      <td>${esc(cls?.className || '[class]')}</td>
      <td class="num">${esc(h.quantity)}</td>
      <td>${esc(h.certificateNumber || '—')}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="4">[No shareholders entered]</td></tr>';

  const body = `
    ${docHeader(corp)}
    <h2 class="doc-title">Register of Shares</h2>
    <p class="doc-subtitle">As at ${esc(fmtDate(new Date().toISOString().slice(0, 10)))}</p>

    <h3 class="doc-h3">Authorized &amp; Issued Capital by Class</h3>
    <table class="doc-table">
      <thead><tr><th>Class</th><th class="num">Authorized</th><th class="num">Issued</th><th>Rights / Restrictions</th></tr></thead>
      <tbody>${classRows}</tbody>
    </table>

    <h3 class="doc-h3">Shareholdings</h3>
    <table class="doc-table">
      <thead><tr><th>Shareholder</th><th>Class</th><th class="num">Quantity</th><th>Certificate #</th></tr></thead>
      <tbody>${holderRows}</tbody>
    </table>
  `;
  return wrapDoc(body);
}
