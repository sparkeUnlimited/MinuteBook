// Banking resolution — authorizes accounts and signing officers.
// Pure: (data) -> HTML string.

import { esc, docHeader, signatureBlock, wrapDoc, primaryDirector } from './_helpers.js';

export function bankingResolution(data) {
  const corp = data.corp || {};
  const banking = data.banking || {};
  const director = primaryDirector(data.directors || []);

  const officers = (banking.signingOfficers || []);
  const officerList = officers.length
    ? officers.map((o) => `<li>${esc(o)}</li>`).join('')
    : '<li>[No signing officers entered]</li>';
  const accounts = (banking.accountTypes || []).join(', ') || '[account types]';

  const body = `
    ${docHeader(corp)}
    <h2 class="doc-title">Banking Resolution of the Sole Director in Writing</h2>

    <p><strong>WHEREAS</strong> it is in the interest of the Corporation to establish banking
    arrangements for the conduct of its business;</p>

    <p><strong>IT IS RESOLVED THAT:</strong></p>
    <ol class="doc-list">
      <li><strong>Bank.</strong> The Corporation shall open and maintain such accounts as it requires
        (${esc(accounts)}) with <strong>${esc(banking.bankName || '[Bank Name]')}</strong>
        (the "Bank") at ${esc(banking.branchAddress || '[branch address]')}.</li>
      <li><strong>Signing Authority.</strong> The following person(s) are authorized to sign cheques,
        drafts, and other instruments, and to otherwise operate the accounts of the Corporation with the Bank:
        <ul>${officerList}</ul>
      </li>
      <li><strong>Bank Documentation.</strong> The Corporation is authorized to execute the Bank's
        standard account-opening and operating agreements, which are approved.</li>
      <li><strong>General Authorization.</strong> The director is authorized to do all such further acts
        as may be necessary to give effect to this resolution.</li>
    </ol>

    ${signatureBlock(director, null)}
  `;
  return wrapDoc(body);
}
