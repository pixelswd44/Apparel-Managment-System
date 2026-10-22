import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { GripHorizontal } from 'lucide-react';

// Rearrangeable, resizable dashboard grid — iOS home-screen style.
//   • Grab a widget and drag it (mouse), or press and hold it (touch or mouse)
//     and keep dragging: the widgets jiggle, the dragged one lifts and follows
//     the pointer, the others slide aside with a spring (FLIP), and it settles
//     into its slot on release
//   • In edit mode (Edit button or press-and-hold) every widget shows a grabber
//     on top and, from tablet width up, a size switch and a corner resize handle
//   • Order and sizes are saved per user in localStorage
//
// items: [{ id, size: 1-4 (columns at the widest layout), sizes: [allowed…], node }]

const HOLD_MS     = 450;
const DRAG_SLOP   = 6;   // px a mouse must travel before a plain grab becomes a drag
const SPRING      = 'transform 0.55s cubic-bezier(0.34, 1.32, 0.64, 1)';
const SETTLE      = 'transform 0.45s cubic-bezier(0.34, 1.42, 0.64, 1), box-shadow 0.3s ease';
const LIFT        = 'scale(1.035)';
const INTERACTIVE = 'input, textarea, select, button, a, label, [contenteditable="true"]';

// Column span per size, for the 1 / 2 (md) / 4 (2xl) column layouts
const SPAN = {
  1: '',
  2: 'md:col-span-2 2xl:col-span-2',
  3: 'md:col-span-2 2xl:col-span-3',
  4: 'md:col-span-2 2xl:col-span-4',
};
const SIZE_LABEL = { 1: 'S', 2: 'M', 3: 'L', 4: 'XL' };
const SIZE_TITLE = { 1: 'Small — 1 column', 2: 'Medium — 2 columns', 3: 'Large — 3 columns', 4: 'Full width' };
const JIG = { 1: '0.45deg', 2: '0.22deg', 3: '0.16deg', 4: '0.12deg' };

function loadLayout(key, items) {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(key) || 'null'); } catch { /* storage unavailable */ }
  const ids = items.map(i => i.id);
  const savedOrder = Array.isArray(saved) ? saved : Array.isArray(saved?.order) ? saved.order : [];
  const known = savedOrder.filter(id => ids.includes(id));
  const order = [...known, ...ids.filter(id => !known.includes(id))];
  const sizes = {};
  for (const it of items) {
    const s = saved?.sizes?.[it.id];
    sizes[it.id] = (it.sizes || [it.size]).includes(s) ? s : it.size;
  }
  return { order, sizes };
}

export default function DashboardGrid({ items, storageKey, editing, onEditingChange }) {
  const [layout, setLayout] = useState(() => loadLayout(storageKey, items));
  const { order, sizes } = layout;
  const [dragId, setDragId]     = useState(null);
  const [resizeId, setResizeId] = useState(null);
  // Entrance animation only on first show: moving a node in the DOM would replay it
  const [entered, setEntered] = useState(false);
  useEffect(() => { const t = setTimeout(() => setEntered(true), 1400); return () => clearTimeout(t); }, []);

  const gridRef   = useRef(null);
  const els       = useRef({});     // id → wrapper element
  const firstPos  = useRef(null);   // visual positions before a layout change (FLIP "first")
  const press     = useRef(null);   // pointer down on a widget, not yet dragging
  const drag      = useRef(null);   // active move
  const resize    = useRef(null);   // active corner resize
  const suppressClick = useRef(false);

  // Latest values for the window-level pointer handlers
  const live = useRef({});
  live.current = { order, sizes, editing, onEditingChange, items };

  // Keep the layout in step with the widgets that exist
  const idsKey = items.map(i => i.id).join();
  useEffect(() => {
    setLayout(prev => {
      const ids = idsKey.split(',');
      const kept = prev.order.filter(id => ids.includes(id));
      const order = [...kept, ...ids.filter(id => !kept.includes(id))];
      return order.join() === prev.order.join() ? prev : { ...prev, order };
    });
  }, [idsKey]);

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(layout)); } catch { /* storage unavailable */ }
  }, [layout, storageKey]);

  // Visual position of each wrapper relative to the grid (includes running transforms)
  const snapshot = useCallback(() => {
    const g = gridRef.current?.getBoundingClientRect();
    if (!g) return null;
    const pos = {};
    for (const [id, el] of Object.entries(els.current)) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      pos[id] = { x: r.left - g.left, y: r.top - g.top };
    }
    return pos;
  }, []);

  // Keep the dragged widget under the pointer, wherever its slot now is
  const placeDragged = useCallback(() => {
    const d = drag.current;
    const el = d && els.current[d.id];
    const g = gridRef.current?.getBoundingClientRect();
    if (!el || !g) return;
    const tx = d.x - g.left - d.grabX - el.offsetLeft;
    const ty = d.y - g.top  - d.grabY - el.offsetTop;
    el.style.transition = 'box-shadow 0.3s ease';
    el.style.transform  = `translate(${tx}px, ${ty}px) ${LIFT}`;
  }, []);

  // FLIP: after the order or a size changes, slide every other widget from where it was
  useLayoutEffect(() => {
    const first = firstPos.current;
    firstPos.current = null;
    if (!first) return;
    for (const id of order) {
      const el = els.current[id];
      if (!el || id === drag.current?.id || !first[id]) continue;
      const dx = first[id].x - el.offsetLeft;
      const dy = first[id].y - el.offsetTop;
      if (!dx && !dy) continue;
      el.style.transition = 'none';
      el.style.transform  = `translate(${dx}px, ${dy}px)`;
      el.getBoundingClientRect(); // commit the start position
      requestAnimationFrame(() => {
        el.style.transition = SPRING;
        el.style.transform  = '';
      });
    }
    placeDragged();
  }, [order, sizes, placeDragged]);

  const setSize = useCallback((id, size) => {
    if (live.current.sizes[id] === size) return;
    firstPos.current = snapshot();
    setLayout(prev => ({ ...prev, sizes: { ...prev.sizes, [id]: size } }));
  }, [snapshot]);

  function moveTo(targetId) {
    const d = drag.current;
    if (!d || targetId === d.id) return;
    firstPos.current = snapshot();
    setLayout(prev => {
      const next = prev.order.filter(id => id !== d.id);
      const at = next.indexOf(targetId);
      const from = prev.order.indexOf(d.id), to = prev.order.indexOf(targetId);
      next.splice(from < to ? at + 1 : at, 0, d.id); // before or after, depending on direction
      return { ...prev, order: next };
    });
  }

  // Which widget (not the dragged one) is under the pointer, by layout slot
  function targetAt(x, y) {
    const g = gridRef.current?.getBoundingClientRect();
    if (!g) return null;
    const px = x - g.left, py = y - g.top;
    for (const id of live.current.order) {
      if (id === drag.current?.id) continue;
      const el = els.current[id];
      if (!el) continue;
      if (px >= el.offsetLeft && px <= el.offsetLeft + el.offsetWidth &&
          py >= el.offsetTop  && py <= el.offsetTop + el.offsetHeight) return id;
    }
    return null;
  }

  // ── Auto-scroll while dragging near the top/bottom edge ──────────────────
  const scrollRaf = useRef(null);
  const autoScroll = useCallback(() => {
    const d = drag.current;
    if (!d) { scrollRaf.current = null; return; }
    const edge = 80, vh = window.innerHeight;
    const speed = d.y < edge ? -(edge - d.y) / 4 : d.y > vh - edge ? (d.y - (vh - edge)) / 4 : 0;
    if (speed) { window.scrollBy(0, speed); placeDragged(); }
    scrollRaf.current = requestAnimationFrame(autoScroll);
  }, [placeDragged]);

  // Stop the page from scrolling under a finger that is dragging a widget
  const blockTouchScroll = useCallback(e => { if (drag.current || resize.current) e.preventDefault(); }, []);

  function startDrag(id, pointerId, x, y, autoExit) {
    const el = els.current[id];
    if (!el) return;
    const r = el.getBoundingClientRect();
    drag.current = { id, pointerId, grabX: x - r.left, grabY: y - r.top, x, y, lastTarget: null, autoExit };
    el.style.zIndex = '40';
    el.style.boxShadow = '0 30px 60px -20px rgba(30,41,82,.45)';
    window.getSelection?.()?.removeAllRanges();
    setDragId(id);
    placeDragged();
    if (!scrollRaf.current) scrollRaf.current = requestAnimationFrame(autoScroll);
  }

  function finishDrag() {
    const d = drag.current;
    if (!d) return;
    const el = els.current[d.id];
    drag.current = null;
    setDragId(null);
    if (el) {
      el.style.transition = SETTLE;
      el.style.transform  = '';
      el.style.boxShadow  = '';
      setTimeout(() => { if (drag.current?.id !== d.id) el.style.zIndex = ''; }, 450);
    }
    // The click that ends a drag must not open whatever is under the pointer
    suppressClick.current = true;
    setTimeout(() => { suppressClick.current = false; }, 400);
    // A plain grab-and-drag leaves edit mode again once dropped
    if (d.autoExit) live.current.onEditingChange(false);
  }

  // ── Window-level pointer tracking (survives the DOM reordering under it) ──
  useEffect(() => {
    function onMove(e) {
      const p = press.current;
      if (p && e.pointerId === p.pointerId) {
        p.x = e.clientX; p.y = e.clientY;
        const dist = Math.hypot(e.clientX - p.sx, e.clientY - p.sy);
        if (p.pointerType === 'mouse' && dist > DRAG_SLOP) {
          // Mouse: grab and drag straight away
          clearTimeout(p.timer); press.current = null;
          const wasEditing = live.current.editing;
          if (!wasEditing) live.current.onEditingChange(true);
          startDrag(p.id, p.pointerId, e.clientX, e.clientY, !wasEditing);
        } else if (p.pointerType !== 'mouse' && dist > 10) {
          // Finger moved before the hold finished: it's a scroll
          clearTimeout(p.timer); press.current = null;
        }
      }

      const rz = resize.current;
      if (rz && e.pointerId === rz.pointerId) {
        const el = els.current[rz.id], grid = gridRef.current;
        if (el && grid) {
          const g = grid.getBoundingClientRect();
          const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
          const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
          const colW = (g.width - gap * (cols - 1)) / cols;
          const want = Math.max(1, Math.min(cols, Math.round((e.clientX - g.left - el.offsetLeft + gap) / (colW + gap))));
          // Map visible columns back to a size: at 2 columns anything wider than 1 is "full"
          const target = cols >= 4 ? want : want >= 2 ? 4 : 1;
          const allowed = rz.allowed;
          const best = allowed.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a), allowed[0]);
          setSize(rz.id, best);
        }
      }

      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      d.x = e.clientX; d.y = e.clientY;
      placeDragged();
      // Short cooldown after each move so widgets of different sizes can't ping-pong
      if (performance.now() < (d.coolUntil || 0)) return;
      const t = targetAt(e.clientX, e.clientY);
      if (t && t !== d.lastTarget) { d.lastTarget = t; d.coolUntil = performance.now() + 220; moveTo(t); }
      else if (!t) d.lastTarget = null;
    }

    function onUp(e) {
      const p = press.current;
      if (p && e.pointerId === p.pointerId) { clearTimeout(p.timer); press.current = null; }
      if (resize.current && e.pointerId === resize.current.pointerId) {
        resize.current = null; setResizeId(null);
        suppressClick.current = true;
        setTimeout(() => { suppressClick.current = false; }, 400);
      }
      if (drag.current && e.pointerId === drag.current.pointerId) finishDrag();
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    document.addEventListener('touchmove', blockTouchScroll, { passive: false });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.removeEventListener('touchmove', blockTouchScroll);
    };
  }); // re-bound every render so handlers see fresh closures; cheap

  function onPointerDown(e, id) {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest('[data-dash-control]')) return;          // size switch / resize handle
    const fromHandle = !!e.target.closest('[data-grabber]');
    if (editing) {
      if (e.pointerType !== 'mouse' && !fromHandle) {
        // Finger on a widget body in edit mode: hold to pick it up, otherwise scroll
        armPress(e, id);
        return;
      }
      e.preventDefault();
      startDrag(id, e.pointerId, e.clientX, e.clientY, false);
      return;
    }
    if (e.target.closest(INTERACTIVE)) return;                      // let links, fields and buttons work
    armPress(e, id);
  }

  // Pointer is down on a widget: a mouse drag or a press-and-hold picks it up
  function armPress(e, id) {
    const p = { id, pointerId: e.pointerId, pointerType: e.pointerType, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY };
    p.timer = setTimeout(() => {
      if (press.current !== p) return;
      press.current = null;
      navigator.vibrate?.(12);
      if (!live.current.editing) live.current.onEditingChange(true);
      startDrag(p.id, p.pointerId, p.x, p.y, false); // keep dragging in the same gesture
    }, HOLD_MS);
    press.current = p;
  }

  function startResize(e, id) {
    e.preventDefault();
    e.stopPropagation();
    const item = live.current.items.find(i => i.id === id);
    resize.current = { id, pointerId: e.pointerId, allowed: item?.sizes || [item?.size || 1] };
    setResizeId(id);
  }

  // Clicks inside widgets are off while editing or right after a drag; controls still work
  function onClickCapture(e) {
    if (e.target.closest('[data-dash-control]')) return;
    if (suppressClick.current || editing) { e.preventDefault(); e.stopPropagation(); }
  }

  // Esc leaves edit mode
  useEffect(() => {
    if (!editing) return;
    const onKey = e => { if (e.key === 'Escape') onEditingChange(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, onEditingChange]);

  const byId = Object.fromEntries(items.map(i => [i.id, i]));

  return (
    <div ref={gridRef} onClickCapture={onClickCapture}
      className={`relative grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-4 grid-flow-row-dense gap-5 mt-6 sm:mt-7 ${editing ? 'dash-editing pb-4' : ''}`}>
      {order.map((id, i) => {
        const item = byId[id];
        if (!item) return null;
        const size = sizes[id] || item.size;
        const allowed = item.sizes || [item.size];
        const dragging = dragId === id;
        return (
          <div key={id} ref={el => { els.current[id] = el; }}
            className={`dash-widget relative ${entered ? '' : 'dash-widget-enter'} ${SPAN[size] || ''} ${editing ? 'select-none' : ''} ${dragging ? 'cursor-grabbing' : editing ? 'cursor-grab' : ''} ${resizeId === id ? 'z-30' : ''}`}
            style={{ animationDelay: `${i * 55}ms` }}
            onPointerDown={e => onPointerDown(e, id)}
            onDragStart={e => e.preventDefault()}
            onContextMenu={e => { if (editing || press.current || drag.current) e.preventDefault(); }}>
            {/* Wider widgets tilt less, so every edge moves about the same */}
            <div className={`h-full ${editing && !dragging && resizeId !== id ? 'dash-jiggle' : ''}`}
              style={{ animationDelay: `${(i % 3) * -0.11}s`, '--jig': JIG[size] }}>
              <div className={`h-full ${editing ? 'pointer-events-none' : ''} ${resizeId === id ? 'ring-2 ring-[#0071e3]/50 rounded-3xl' : ''}`}>{item.node}</div>
            </div>

            {editing && (
              <>
                {/* Grabber (also the touch drag handle) */}
                <span data-grabber title="Drag to move"
                  className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-10 flex items-center justify-center w-12 h-6 rounded-full glass-strong !bg-white/90 text-[#6e6e73] shadow-md animate-pop"
                  style={{ touchAction: 'none' }}>
                  <GripHorizontal size={15} />
                </span>

                {allowed.length > 1 && (
                  <>
                    {/* Size switch */}
                    <div data-dash-control
                      className="hidden md:flex absolute -bottom-3 left-1/2 -translate-x-1/2 z-10 items-center gap-0.5 p-0.5 rounded-full glass-strong !bg-white/90 shadow-md animate-pop">
                      {allowed.map(s => (
                        <button key={s} type="button" title={SIZE_TITLE[s]} onClick={() => setSize(id, s)}
                          className={`min-w-[28px] h-6 px-1.5 rounded-full text-[11px] font-semibold transition-colors ${
                            s === size ? 'bg-[#0071e3] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.3)]' : 'text-[#515154] hover:bg-black/5'}`}>
                          {SIZE_LABEL[s]}
                        </button>
                      ))}
                    </div>
                    {/* Corner resize handle */}
                    <span data-dash-control title="Drag to resize"
                      onPointerDown={e => startResize(e, id)}
                      className="hidden md:grid absolute -bottom-1.5 -right-1.5 z-10 w-6 h-6 place-items-center rounded-full glass-strong !bg-white/90 shadow-md cursor-ew-resize animate-pop"
                      style={{ touchAction: 'none' }}>
                      <svg width="10" height="10" viewBox="0 0 10 10" className="text-[#6e6e73]" aria-hidden>
                        <path d="M9 3L3 9M9 6.5L6.5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </span>
                  </>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
