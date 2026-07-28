// Officer register — a standing register of officers and offices held.
// Pure: (data) -> HTML string.

import { esc, fmtDate, docHeader, wrapDoc } from './_helpers.js';

export function officerRegister(data) {
  const corp = data.corp || {};
  const officers = data.officers || [];

  const rows = officers.length ? officers.map((o) => `
    <tr>
      <td>${esc(o.name)}</td>
      <td>${esc(o.office || '—')}</td>
      <td>${esc(fmtDate(o.appointmentDate))}</td>
      <td>${o.endDate ? esc(fmtDate(o.endDate)) : '—'}</td>
    </tr>`).join('') : '<tr><td colspan="4">[No officers entered]</td></tr>';

  const body = `
    ${docHeader(corp)}
    <h2 class="doc-title">Register of Officers</h2>
    <p class="doc-subtitle">As at ${esc(fmtDate(new Date().toISOString().slice(0, 10)))}</p>

    <table class="doc-table">
      <thead><tr><th>Name</th><th>Office</th><th>Appointed</th><th>End Date</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  return wrapDoc(body);
}
