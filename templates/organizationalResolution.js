// Organizational resolution — the one-time first resolution of the sole
// director following incorporation. Pure: (data) -> HTML string.

import { esc, fmtDate, docHeader, signatureBlock, wrapDoc, primaryDirector } from './_helpers.js';

export function organizationalResolution(data) {
  const corp = data.corp || {};
  const directors = data.directors || [];
  const shareClasses = data.shareClasses || [];
  const shareholders = data.shareholders || [];
  const banking = data.banking || null;
  const director = primaryDirector(directors);

  const directorList = directors.length
    ? directors.map((d) => `<li>${esc(d.name)}${d.titles?.length ? ` — ${esc(d.titles.join(', '))}` : ''}</li>`).join('')
    : '<li>[No directors entered]</li>';

  const issuances = shareholders.map((sh) => {
    const cls = shareClasses.find((c) => c.id === sh.shareClassId);
    return `<li>${esc(sh.quantity)} ${esc(cls?.className || '[class]')} share(s) to <strong>${esc(sh.name)}</strong>${sh.certificateNumber ? ` (Certificate No. ${esc(sh.certificateNumber)})` : ''}</li>`;
  }).join('') || '<li>[No share issuances entered]</li>';

  const bankingClause = banking ? `
    <li><strong>Banking.</strong> The Corporation shall open and maintain accounts with
    <strong>${esc(banking.bankName)}</strong> at ${esc(banking.branchAddress)}, and the following
    person(s) are authorized to sign on behalf of the Corporation:
    ${esc((banking.signingOfficers || []).join(', ') || '[signing officers]')}.</li>` : '';

  const body = `
    ${docHeader(corp)}
    <h2 class="doc-title">Resolutions of the Sole Director in Writing</h2>
    <p class="doc-subtitle">Organizational Resolutions Following Incorporation</p>

    <p>The undersigned, being the sole director of the Corporation, hereby signs the following
    resolutions in writing pursuant to the <em>Business Corporations Act</em> (Ontario).</p>

    <p><strong>WHEREAS</strong> the Corporation was incorporated under the laws of
    ${esc(corp.jurisdiction || 'Ontario')} on ${esc(fmtDate(corp.incorporationDate))}; and</p>

    <p><strong>WHEREAS</strong> it is desirable to organize the Corporation and transact its
    initial business;</p>

    <p><strong>IT IS RESOLVED THAT:</strong></p>
    <ol class="doc-list">
      <li><strong>Directors.</strong> The following person(s) are confirmed as the director(s) of the Corporation:
        <ul>${directorList}</ul>
      </li>
      <li><strong>Registered Office.</strong> The registered office of the Corporation is located at
        ${esc(corp.registeredOffice || '[registered office]')}.</li>
      <li><strong>By-laws.</strong> By-law No. 1, regulating the general conduct and affairs of the
        Corporation, is enacted and confirmed.</li>
      <li><strong>Issuance of Shares.</strong> The Corporation is authorized to issue, and hereby issues,
        the following shares as fully paid and non-assessable:
        <ul>${issuances}</ul>
      </li>
      <li><strong>Share Certificates.</strong> The form of share certificate presented is approved and
        adopted.</li>
      ${bankingClause}
      <li><strong>Fiscal Year.</strong> The financial year end of the Corporation is fixed by the director.</li>
      <li><strong>General Authorization.</strong> The director is authorized to do all such further acts
        and execute all such documents as may be necessary to give effect to these resolutions.</li>
    </ol>

    ${signatureBlock(director, corp.incorporationDate, data.signature)}
  `;
  return wrapDoc(body);
}
