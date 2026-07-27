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

function getDoc() {
  const jspdf = window.jspdf;
  if (!jspdf || !jspdf.jsPDF) {
    throw new Error('jsPDF failed to load. Check the CDN script tag / network.');
  }
  return new jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
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

export async function buildPdf(html, filename) {
  const doc = getDoc();
  const host = mountForRender(html);
  const target = host.querySelector('.resolution-doc') || host;
  try {
    await doc.html(target, {
      x: A4.marginX,
      y: A4.marginTop,
      width: A4.width - A4.marginX * 2,
      windowWidth: target.scrollWidth || 720,
      autoPaging: 'text',
    });
    return doc.output('blob');
  } finally {
    host.remove();
  }
}

function safeName(name) {
  return (name || 'document').replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, '_');
}

// Try Web Share (iOS/iPadOS) first, fall back to download.
export async function saveOrShare(blob, filename) {
  const fname = safeName(filename).endsWith('.pdf') ? safeName(filename) : `${safeName(filename)}.pdf`;
  const file = new File([blob], fname, { type: 'application/pdf' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
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
