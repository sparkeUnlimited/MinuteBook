// Generic ad-hoc resolution driven by an AdHocResolution entry.
// Pure: (data, resolution) -> HTML string.

import { esc, fmtDate, docHeader, signatureBlock, wrapDoc, primaryDirector } from './_helpers.js';

export function adHocResolution(data, res) {
  const corp = data.corp || {};
  const director = primaryDirector(data.directors || []);
  const title = res?.customTitle || res?.type || 'Resolution';

  // Preserve author line breaks in the operative details as separate list items
  // when the user used newlines, otherwise a single operative clause.
  const detailLines = String(res?.details || '')
    .split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const operative = detailLines.length
    ? detailLines.map((line) => `<li>${esc(line)}</li>`).join('')
    : '<li>[No details entered]</li>';

  const body = `
    ${docHeader(corp)}
    <h2 class="doc-title">${esc(title)}</h2>
    <p class="doc-subtitle">Resolution of the Sole Director in Writing${res?.date ? ` — ${esc(fmtDate(res.date))}` : ''}</p>

    <p>The undersigned, being the sole director of the Corporation, hereby signs the following
    resolution in writing pursuant to the <em>Business Corporations Act</em> (Ontario).</p>

    <p><strong>WHEREAS</strong> the director considers it in the best interests of the Corporation to
    resolve the matter set out below;</p>

    <p><strong>IT IS RESOLVED THAT:</strong></p>
    <ol class="doc-list">${operative}</ol>

    <ol class="doc-list" start="${detailLines.length + 1}">
      <li><strong>General Authorization.</strong> The director is authorized to do all such further acts
        and execute all such documents as may be necessary to give effect to this resolution.</li>
    </ol>

    ${signatureBlock(director, res?.dateSigned || res?.date)}
  `;
  return wrapDoc(body);
}
