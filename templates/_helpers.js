// Shared, pure helpers for document templates. Every template is a pure
// function: full data object in, HTML string out (spec Phase 4 / Notes).

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function fmtDate(iso) {
  if (!iso) return '________________';
  // iso expected as YYYY-MM-DD (AWSDate). Render as "January 2, 2025".
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return esc(iso);
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[m - 1]} ${d}, ${y}`;
}

export function money(n) {
  const v = Number(n || 0);
  return v.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' });
}

// Standard document header: corporation name + number.
export function docHeader(corp) {
  const name = esc(corp?.legalName || '[Corporation Name]');
  const num = esc(corp?.corporationNumber || '[Corporation Number]');
  const jur = esc(corp?.jurisdiction || 'Ontario');
  return `
    <header class="doc-head">
      <h1 class="doc-corp">${name}</h1>
      <p class="doc-meta">(the "Corporation") &nbsp;·&nbsp; Corporation No. ${num} &nbsp;·&nbsp; ${jur}</p>
    </header>`;
}

// Signature block for the sole director (or first director).
export function signatureBlock(director, dateSigned) {
  const name = esc(director?.name || '[Director Name]');
  const dateLine = dateSigned
    ? `Dated the ${esc(fmtDate(dateSigned))}.`
    : `Dated the ______ day of ____________________, 20____.`;
  return `
    <div class="doc-sign">
      <p class="doc-dateline">${dateLine}</p>
      <div class="sig">
        <div class="sig-line">
          <span class="sig-rule"></span>
          <span class="sig-name">${name}</span>
          <span class="sig-role">Director</span>
        </div>
      </div>
    </div>`;
}

// Wrap any body in the standard resolution container so print + jsPDF pick it
// up consistently.
export function wrapDoc(inner) {
  return `<article class="resolution-doc">${inner}</article>`;
}

// Resolve the signing director: the sole director if flagged, else the first.
export function primaryDirector(directors = []) {
  return directors.find((d) => d.isSoleDirector) || directors[0] || null;
}
