// Director register — a standing register of directors and offices held.
// Pure: (data) -> HTML string.

import { esc, fmtDate, docHeader, wrapDoc } from './_helpers.js';

export function directorRegister(data) {
  const corp = data.corp || {};
  const directors = data.directors || [];

  const rows = directors.length ? directors.map((d) => `
    <tr>
      <td>${esc(d.name)}</td>
      <td>${esc((d.titles || []).join(', ') || '—')}</td>
      <td>${esc(fmtDate(d.appointmentDate))}</td>
      <td>${esc(d.address)}</td>
    </tr>`).join('') : '<tr><td colspan="4">[No directors entered]</td></tr>';

  const body = `
    ${docHeader(corp)}
    <h2 class="doc-title">Register of Directors</h2>
    <p class="doc-subtitle">As at ${esc(fmtDate(new Date().toISOString().slice(0, 10)))}</p>

    <table class="doc-table">
      <thead><tr><th>Name</th><th>Office(s)</th><th>Appointed</th><th>Address</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  return wrapDoc(body);
}
