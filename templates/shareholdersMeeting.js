// Annual shareholders' meeting minutes (written resolution in lieu of a
// meeting, for a sole/closely-held shareholder). Pure: (data, meeting) -> HTML.

import { esc, fmtDate, docHeader, signatureBlock, wrapDoc, primaryDirector } from './_helpers.js';

const STATUS_BODY = {
  no_updates: `There being no changes to the business or affairs of the Corporation requiring
    a resolution, the shareholder(s) confirm the continuation of the Corporation's current
    directors, officers, share structure, and banking arrangements for the ensuing year.`,
  continued_previous: `The shareholder(s) resolve to continue, unchanged, with the previously
    established directors, officers, share structure, and banking arrangements of the Corporation
    for the ensuing year.`,
};

export function shareholdersMeeting(data, meeting) {
  const corp = data.corp || {};
  const director = primaryDirector(data.directors || []);
  const fy = meeting?.fiscalYear || '[fiscal year]';

  let bodyText;
  if (meeting?.status === 'custom') {
    const lines = String(meeting.notes || '').split(/\n+/).map((s) => s.trim()).filter(Boolean);
    bodyText = lines.length
      ? `<ol class="doc-list">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ol>`
      : '<p>[No details entered.]</p>';
  } else {
    bodyText = `<p>${esc(STATUS_BODY[meeting?.status] || STATUS_BODY.no_updates)}</p>`;
  }

  const body = `
    ${docHeader(corp)}
    <h2 class="doc-title">Annual Resolutions of the Shareholder(s) in Writing</h2>
    <p class="doc-subtitle">In respect of the fiscal year ${esc(fy)}${meeting?.meetingDate ? ` — ${esc(fmtDate(meeting.meetingDate))}` : ''}</p>

    <p>The undersigned, being the holder(s) of all of the issued and outstanding voting shares of
    the Corporation, hereby sign the following annual resolutions in writing pursuant to the
    <em>Business Corporations Act</em> (Ontario), in lieu of holding an annual meeting of shareholders.</p>

    <p><strong>IT IS RESOLVED THAT:</strong></p>
    ${bodyText}

    <p>The financial statements of the Corporation presented for the fiscal year ${esc(fy)} are received,
    and the appointment of an auditor is waived to the extent permitted by law.</p>

    ${signatureBlock(director, meeting?.dateSigned, data.signature)}
  `;
  return wrapDoc(body);
}
