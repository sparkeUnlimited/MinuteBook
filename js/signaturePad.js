// Signature capture modal. Two modes:
//   - Draw: a <canvas> driven by Pointer Events, so it works with an Apple
//     Pencil (events arrive as pointerType 'pen'), a finger (touch), or a
//     mouse/trackpad — one code path for all. `touch-action: none` on the
//     canvas (see styles.css) stops the page scrolling while you draw.
//   - Type: a typed name rendered in a signature font — the fallback for
//     anyone without a stylus or touch screen.
//
// Resolves to { method: 'drawn'|'typed', name, dataUrl } or null if cancelled.

import { esc } from '../templates/_helpers.js';

export function captureSignature({ defaultName = '', title = 'Sign' } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'sig-overlay';
    overlay.innerHTML = `
      <div class="sig-modal" role="dialog" aria-modal="true">
        <h2>${esc(title)}</h2>
        <label class="sig-lbl" for="sig-name">Signer name</label>
        <input id="sig-name" class="sig-name" type="text" value="${esc(defaultName)}" />
        <div class="sig-tabs">
          <button type="button" class="sig-tab active" data-tab="draw">Draw</button>
          <button type="button" class="sig-tab" data-tab="type">Type</button>
        </div>
        <div class="sig-panel" data-panel="draw">
          <canvas id="sig-canvas" class="sig-canvas" width="500" height="180"></canvas>
          <div class="sig-hint">Draw with an Apple Pencil, finger, or mouse.
            <button type="button" id="sig-clear" class="sig-link">Clear</button></div>
        </div>
        <div class="sig-panel" data-panel="type" hidden>
          <input id="sig-typed" class="sig-typed" type="text" placeholder="Type your full name" value="${esc(defaultName)}" />
          <div id="sig-typed-preview" class="sig-typed-preview"></div>
          <div class="sig-hint">No stylus needed — your typed name becomes the signature.</div>
        </div>
        <div class="sig-actions">
          <button type="button" class="btn" id="sig-cancel">Cancel</button>
          <button type="button" class="btn btn-primary" id="sig-adopt">Adopt &amp; Sign</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    // --- draw canvas (pointer events: pen / touch / mouse) ---
    const canvas = overlay.querySelector('#sig-canvas');
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
    let drawing = false; let hasDrawn = false; let last = null;

    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) * (canvas.width / r.width),
        y: (e.clientY - r.top) * (canvas.height / r.height),
      };
    };
    canvas.addEventListener('pointerdown', (e) => {
      drawing = true; hasDrawn = true; last = pos(e);
      try { canvas.setPointerCapture(e.pointerId); } catch { /* noop */ }
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drawing) return;
      const p = pos(e);
      ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      last = p; e.preventDefault();
    });
    const endStroke = () => { drawing = false; };
    canvas.addEventListener('pointerup', endStroke);
    canvas.addEventListener('pointercancel', endStroke);
    canvas.addEventListener('pointerleave', endStroke);
    overlay.querySelector('#sig-clear').addEventListener('click', () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height); hasDrawn = false;
    });

    // --- tabs ---
    let mode = 'draw';
    overlay.querySelectorAll('.sig-tab').forEach((t) => t.addEventListener('click', () => {
      mode = t.getAttribute('data-tab');
      overlay.querySelectorAll('.sig-tab').forEach((x) => x.classList.toggle('active', x === t));
      overlay.querySelectorAll('.sig-panel').forEach((p) => { p.hidden = p.getAttribute('data-panel') !== mode; });
    }));

    // --- typed preview ---
    const typed = overlay.querySelector('#sig-typed');
    const preview = overlay.querySelector('#sig-typed-preview');
    const updatePreview = () => { preview.textContent = typed.value; };
    typed.addEventListener('input', updatePreview); updatePreview();

    // --- close / adopt ---
    const close = (result) => { overlay.remove(); resolve(result); };
    overlay.querySelector('#sig-cancel').addEventListener('click', () => close(null));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });

    overlay.querySelector('#sig-adopt').addEventListener('click', () => {
      const name = overlay.querySelector('#sig-name').value.trim();
      if (!name) { overlay.querySelector('#sig-name').focus(); return; }
      if (mode === 'draw') {
        if (!hasDrawn) { overlay.querySelector('#sig-clear').classList.add('nudge'); return; }
        close({ method: 'drawn', name, dataUrl: canvas.toDataURL('image/png') });
      } else {
        const val = typed.value.trim();
        if (!val) { typed.focus(); return; }
        close({ method: 'typed', name, dataUrl: renderTyped(val) });
      }
    });
  });
}

// Render a typed name to a canvas in a signature-style font -> data URL, so a
// typed signature embeds into PDFs the same way a drawn one does.
function renderTyped(text) {
  const c = document.createElement('canvas');
  c.width = 500; c.height = 120;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#111';
  ctx.font = '46px "Snell Roundhand", "Brush Script MT", "Segoe Script", cursive';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 12, 62);
  return c.toDataURL('image/png');
}
