// PDF generation + save flow (spec Phase 5).
//
// - Renders a template's HTML into a hidden, on-page container styled for
//   print, then uses jsPDF's doc.html() to rasterize it to a real PDF.
// - Save/share: on iOS/iPadOS use the Web Share API with the file so the user
//   can save to iCloud Drive; on macOS Safari (and elsewhere) fall back to a
//   plain anchor download.
// - Cmd+P remains a manual fallback via the print stylesheet (Phase 7).
//
// jsPDF is loaded as a UMD global (window.jspdf) from the CDN in index.html.

const A4 = { width: 210, marginX: 14, marginTop: 16 }; // mm

function getDoc(options = {}) {
  const jspdf = window.jspdf;
  if (!jspdf || !jspdf.jsPDF) {
    throw new Error('jsPDF failed to load. Check the CDN script tag / network.');
  }
  return new jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true, ...options });
}

// PDF permission flags for "locked" documents: viewing and printing allowed,
// modification not. A random owner password prevents casually lifting the
// restrictions. NOTE: these are standard PDF permission flags — a deterrent
// for a stored record, not strong encryption.
function lockOptions() {
  const rand = crypto.getRandomValues(new Uint32Array(4));
  const ownerPassword = [...rand].map((n) => n.toString(36)).join('');
  return {
    encryption: {
      ownerPassword,
      userPermissions: ['print'],
    },
  };
}

// Render the template HTML into an off-screen but rendered container so
// doc.html() can measure it. Returns the element; caller removes it.
function mountForRender(html) {
  const host = document.createElement('div');
  host.className = 'pdf-render-host';
  host.innerHTML = html;
  document.body.appendChild(host);
  return host;
}

// Build a PDF from one HTML string, or an array of them. With an array, each
// entry starts on its own page (doc.html's y is document-absolute, so each
// call is offset by the pages already rendered). `footerText` stamps the
// corporation identity + page number at the foot of every page.
export async function buildPdf(htmlOrSections, filename, { locked = false, footerText = '' } = {}) {
  const sections = Array.isArray(htmlOrSections) ? htmlOrSections : [htmlOrSections];
  const doc = getDoc(locked ? lockOptions() : {});
  const pageH = doc.internal.pageSize.getHeight();

  for (let i = 0; i < sections.length; i++) {
    const host = mountForRender(sections[i]);
    const target = host.querySelector('.resolution-doc') || host;
    try {
      if (i > 0) doc.addPage();
      const startPage = doc.getNumberOfPages();
      await doc.html(target, {
        x: A4.marginX,
        y: (startPage - 1) * pageH + A4.marginTop,
        width: A4.width - A4.marginX * 2,
        windowWidth: target.scrollWidth || 720,
        autoPaging: 'text',
      });
    } finally {
      host.remove();
    }
  }

  if (footerText) stampFooters(doc, footerText);
  return doc.output('blob');
}

function stampFooters(doc, footerText) {
  const total = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(footerText, w / 2, h - 8, { align: 'center' });
    doc.text(`Page ${p} of ${total}`, w - A4.marginX, h - 8, { align: 'right' });
  }
}

function safeName(name) {
  return (name || 'document')
    .replace(/[^\w.\- ]+/g, ' ')   // drop punctuation (em dashes etc.)
    .replace(/[\s_]+/g, '_')       // collapse whitespace/underscores to one _
    .replace(/^_+|_+$/g, '');      // trim leading/trailing _
}

// iOS/iPadOS only. On those, the Web Share sheet is how you save a file to the
// Files app / iCloud Drive. On macOS Safari (and every desktop browser) the
// share sheet has no clean "save to file", so we use a plain download instead.
// iPadOS reports as "MacIntel", so detect it via touch points.
function isAppleMobile() {
  const ua = navigator.userAgent || '';
  const iPhoneOrIPod = /iPhone|iPod/.test(ua);
  const iPad = /iPad/.test(ua)
    || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
  return iPhoneOrIPod || iPad;
}

// Save to file: Web Share on iOS/iPadOS, plain download everywhere else.
export async function saveOrShare(blob, filename) {
  const fname = safeName(filename).endsWith('.pdf') ? safeName(filename) : `${safeName(filename)}.pdf`;
  const file = new File([blob], fname, { type: 'application/pdf' });

  if (isAppleMobile() && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fname });
      return 'shared';
    } catch (err) {
      if (err && err.name === 'AbortError') return 'cancelled';
      // fall through to download on any share failure
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}

// Convenience: build then save. Returns the disposition string.
export async function generateAndSave(html, filename) {
  const blob = await buildPdf(html, filename);
  return saveOrShare(blob, filename);
}
