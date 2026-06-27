import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

// ── Print (browser native) ────────────────────────────────────────────────────

/**
 * printDoc(ref, title?)
 * Isolates content into a body-level portal and calls window.print().
 * The browser uses document.title as the default filename when saving as PDF —
 * we swap it in before print and restore it after.
 */
export function printDoc(ref, title) {
  const content = ref?.current?.innerHTML;
  if (!content) { window.print(); return; }

  let portal = document.getElementById('__print_doc__');
  if (!portal) {
    portal = document.createElement('div');
    portal.id = '__print_doc__';
    document.body.appendChild(portal);
  }

  portal.innerHTML = content;
  document.body.classList.add('__printing__');

  // Temporarily set document title so the browser uses it as the PDF filename
  const prevTitle = document.title;
  if (title) document.title = title;

  function cleanup() {
    document.title = prevTitle;           // restore original tab title
    document.body.classList.remove('__printing__');
    portal.innerHTML = '';
    window.removeEventListener('afterprint', cleanup);
  }
  window.addEventListener('afterprint', cleanup);
  window.print();
}

// ── Loading overlay ───────────────────────────────────────────────────────────

function showLoader() {
  let el = document.getElementById('__pdf_loader__');
  if (!el) {
    el = document.createElement('div');
    el.id = '__pdf_loader__';
    el.style.cssText =
      'position:fixed;inset:0;background:rgba(15,23,42,0.55);' +
      'display:flex;align-items:center;justify-content:center;z-index:99999;backdrop-filter:blur(3px);';
    el.innerHTML = `
      <div style="background:#fff;border-radius:6px;padding:24px 32px;
                  display:flex;align-items:center;gap:14px;
                  box-shadow:0 8px 32px rgba(0,0,0,0.18);min-width:210px;">
        <div id="__pdf_spinner__"
             style="width:22px;height:22px;border:3px solid #e0e7ff;
                    border-top-color:#4f46e5;border-radius:50%;flex-shrink:0;"></div>
        <div>
          <p style="font-family:-apple-system,system-ui,sans-serif;font-size:14px;
                    font-weight:700;color:#1e293b;margin:0;">
            Generating PDF…
          </p>
          <p style="font-family:-apple-system,system-ui,sans-serif;font-size:12px;
                    color:#94a3b8;margin:3px 0 0;">Please wait</p>
        </div>
      </div>
      <style>
        @keyframes __pdfspin__ { to { transform:rotate(360deg); } }
        #__pdf_spinner__ { animation:__pdfspin__ 0.7s linear infinite; }
      </style>`;
    document.body.appendChild(el);
  }
  el.style.display = 'flex';
}

function hideLoader() {
  const el = document.getElementById('__pdf_loader__');
  if (el) el.style.display = 'none';
}

// ── Image → data-URL (fix CORS canvas taint) ─────────────────────────────────

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Pre-load all <img> tags in a cloned element as data-URLs so html2canvas
 * never hits a cross-origin restriction (canvas taint = export failure).
 */
async function resolveImages(root) {
  const imgs = Array.from(root.querySelectorAll('img'));
  await Promise.all(imgs.map(async img => {
    const src = img.getAttribute('src');
    if (!src || src.startsWith('data:')) return; // already base64, skip
    try {
      const resp = await fetch(src, { mode: 'cors', credentials: 'omit' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      img.src = await blobToDataURL(blob);
    } catch {
      // If image can't be fetched, remove it so it doesn't block canvas export
      img.remove();
    }
  }));
}

// ── Download as PDF ───────────────────────────────────────────────────────────

/**
 * downloadDoc(ref, title)
 *
 * Captures the document element as a multi-page A4 PDF.
 *
 * Root cause of html2canvas failures on Windows / Tailwind v4:
 *  1. position:fixed wrappers → layout engine doesn't compute scroll dimensions
 *     correctly. FIX: use position:absolute off-screen instead.
 *  2. Cross-origin <img> tags → canvas taint prevents toDataURL().
 *     FIX: pre-fetch images and convert to data-URLs before capture.
 */
export async function downloadDoc(ref, title = 'Document') {
  const element = ref?.current;
  if (!element) return;

  showLoader();

  // ── 1. Build an off-screen, unconstrained wrapper ─────────────────────────
  //    KEY: use position:absolute, NOT fixed — fixed breaks scroll-height
  //    measurement in html2canvas on Windows/Chromium.
  const wrapper = document.createElement('div');
  wrapper.style.cssText = [
    'position:absolute',
    'left:-9999px',
    'top:0',
    'width:794px',          // A4 at ~96 dpi
    'background:#ffffff',
    'overflow:visible',
    'box-sizing:border-box',
  ].join(';');

  // Deep-clone; strip constraints that would clip content
  const clone = element.cloneNode(true);
  clone.style.height      = 'auto';
  clone.style.maxHeight   = 'none';
  clone.style.overflow    = 'visible';
  clone.style.borderRadius = '0';
  clone.style.boxShadow   = 'none';

  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  // ── 2. Pre-resolve images before html2canvas touches the DOM ─────────────
  await resolveImages(wrapper);

  // Wait two animation frames so the browser fully lays out the clone
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  try {
    const totalH = Math.max(wrapper.scrollHeight, 50);

    const canvas = await html2canvas(wrapper, {
      scale:           1.8,          // crisp but within canvas memory limits
      useCORS:         true,
      allowTaint:      false,
      logging:         false,
      backgroundColor: '#ffffff',
      width:           794,
      height:          totalH,
      windowWidth:     794,
      windowHeight:    totalH,
      // Ignore interactive controls that don't belong in the PDF
      ignoreElements: el =>
        el.tagName === 'BUTTON' ||
        el.getAttribute('data-html2canvas-ignore') === 'true',
    });

    // ── 3. Slice canvas across A4 pages ────────────────────────────────────
    const pdf    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW  = pdf.internal.pageSize.getWidth();   // 210 mm
    const pageH  = pdf.internal.pageSize.getHeight();  // 297 mm

    const imgData   = canvas.toDataURL('image/jpeg', 0.93);
    const mmPerPx   = pageW / canvas.width;
    const imgTotalH = canvas.height * mmPerPx;

    let yOffset = 0, pageNum = 0;
    while (yOffset < imgTotalH) {
      if (pageNum > 0) pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, -yOffset, pageW, imgTotalH);
      yOffset += pageH;
      pageNum++;
    }

    // Sanitise title: strip characters that are invalid in file names
    const safeName = title.replace(/[\\/:*?"<>|]/g, '-').trim();
    pdf.save(`${safeName}.pdf`);

  } catch (err) {
    console.error('PDF generation failed:', err);
    alert(
      `Could not generate the PDF.\n\nReason: ${err?.message || 'Unknown error'}\n\n` +
      'Try using the Print button and save as PDF from your browser instead.'
    );
  } finally {
    if (document.body.contains(wrapper)) document.body.removeChild(wrapper);
    hideLoader();
  }
}
