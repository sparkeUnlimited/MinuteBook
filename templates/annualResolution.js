// Annual resolution of the sole director — parameterized by fiscal year.
// Pure: (data, resolution) -> HTML string.

import { esc, fmtDate, money, docHeader, signatureBlock, wrapDoc, primaryDirector } from './_helpers.js';

export function annualResolution(data, res) {
  const corp = data.corp || {};
  const director = primaryDirector(data.directors || []);
  const fy = res?.fiscalYearCovered || '[fiscal year]';

  const clauses = [];
  if (res?.financialStatementsApproved) {
    clauses.push(`<li><strong>Financial Statements.</strong> The financial statements of the Corporation
      for the fiscal year ${esc(fy)} are approved and adopted.</li>`);
  }
  if (res?.directorContinuation) {
    clauses.push(`<li><strong>Continuation of Director.</strong> ${esc(director?.name || 'The director')}
      is continued in office as director of the Corporation until the next annual resolution or until a
      successor is appointed.</li>`);
  }
  if (res?.dividendDeclared) {
    const amt = res.dividendAmount ? money(res.dividendAmount) : '[amount]';
    const cls = res.dividendClass ? `the ${esc(res.dividendClass)} shares` : 'the issued shares';
    clauses.push(`<li><strong>Dividend.</strong> A dividend of ${amt} is declared payable on
      ${cls} of the Corporation, to be paid out of the available funds of the Corporation.</li>`);
  }
  if (res?.auditWaiver) {
    clauses.push(`<li><strong>Waiver of Audit.</strong> Pursuant to the <em>Business Corporations Act</em>
      (Ontario), the appointment of an auditor is waived for the fiscal year ${esc(fy)}.</li>`);
  }
  if (!clauses.length) {
    clauses.push('<li>[No resolutions selected for this fiscal year.]</li>');
  }

  const body = `
    ${docHeader(corp)}
    <h2 class="doc-title">Annual Resolutions of the Sole Director in Writing</h2>
    <p class="doc-subtitle">In respect of the fiscal year ${esc(fy)}</p>

    <p>The undersigned, being the sole director of the Corporation, hereby signs the following
    annual resolutions in writing pursuant to the <em>Business Corporations Act</em> (Ontario), in lieu
    of holding an annual meeting.</p>

    <p><strong>IT IS RESOLVED THAT:</strong></p>
    <ol class="doc-list">${clauses.join('')}</ol>

    ${signatureBlock(director, res?.dateSigned, data.signature)}
  `;
  return wrapDoc(body);
}
