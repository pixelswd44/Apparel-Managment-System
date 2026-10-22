import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { GripHorizontal } from 'lucide-react';

// Rearrangeable dashboard grid, iOS home-screen style.
//   • Press and hold a widget (or turn on `editing`) → widgets jiggle
//   • Drag one: it lifts and follows the pointer, the others slide aside with a
//     spring (FLIP), and it settles into its slot on release
//   • The order is saved per user in localStorage; unknown/new widgets reconcile
// Mouse drags from anywhere on a widget; touch drags from the grabber handle so
// the page still scrolls with a finger.
//
// items: [{ id, span?: 'md:col-span-2 …', node }]

const HOLD_MS  = 500;
const SPRING   = 'transform 0.55s cubic-bezier(0.34, 1.32, 0.64, 1)';
const SETTLE   = 'transform 0.45s cubic-bezier(0.34, 1.42, 0.64, 1), box-shadow 0.3s ease';
const LIFT     = 'scale(1.035)';

function loadOrder(key, ids) {
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem(key) || '[]'); } catch { /* storage unavailable */ }
  if (!Array.isArray(saved)) saved = [];
  const known = saved.filter(id => ids.includes(id));
  return [...known, ...ids.filter(id => !known.includes(id))];
}

export default function DashboardGrid({ items, storageKey, editing, onEditingChange }) {
  const ids = items.map(i => i.id);
  const [order, setOrder]   = useState(() => loadOrder(storageKey, ids));
  const [dragId, setDragId] = useState(null);
  // Entrance animation only on first show: moving a node in the DOM would replay it
  const [entered, setEntered] = useState(false);
  useEffect(() => { const t = setTimeout(() => setEntered(true), 1400); return () => clearTimeout(t); }, []);

  const gridRef   = useRef(null);
  const els       = useRef({});        // id → wrapper element
  const firstPos  = useRef(null);      // visual positions before a reorder (FLIP "first")
  const drag      = useRef(null);      // { id, pointerId, grabX, grabY, x, y, lastTarget }
  const hold      = useRef(null);      // long-press timer state
  const suppressClick = useRef(false);

  // Keep the saved order in step with the widgets that exist
  useEffect(() => {
    setOrder(prev => {
      const kept = prev.filter(id => ids.includes(id));
      const next = [...kept, ...ids.filter(id => !kept.includes(id))];
      return next.join() === prev.join() ? prev : next;
    });
  }, [ids.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(order)); } catch { /* storage unavailable */ }
  }, [order, storageKey]);

  // Visual position of each wrapper relative to the grid (includes running transforms)
  const snapshot = useCallback(() => {
    const g = gridRef.current?.getBoundingClientRect();
    if (!g) return null;
    const pos = {};
    for (const id of Object.keys(els.current)) {
      const el = els.current[id];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      pos[id] = { x: r.left - g.left, y: r.top - g.top };
    }
    return pos;
  }, []);

  // Put the dragged widget under the pointer, wherever its slot now is
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

  // FLIP: after the order changes, slide every other widget from where it was
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
  }, [order, placeDragged]);

  function moveTo(targetId) {
    const d = drag.current;
    if (!d || targetId === d.id) return;
    firstPos.current = snapshot();
    setOrder(prev => {
      const next = prev.filter(id => id !== d.id);
      const at = next.indexOf(targetId);
      const from = prev.indexOf(d.id), to = prev.indexOf(targetId);
      next.splice(from < to ? at + 1 : at, 0, d.id); // before or after, depending on direction
      return next;
    });
  }

  // Which widget (not the dragged one) is under the pointer, by layout slot
  function targetAt(x, y) {
    const g = gridRef.current?.getBoundingClientRect();
    if (!g) return null;
    const px = x - g.left, py = y - g.top;
    for (const id of order) {
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
  function autoScroll() {
    const d = drag.current;
    if (!d) { scrollRaf.current = null; return; }
    const edge = 80, vh = window.innerHeight;
    const speed = d.y < edge ? -(edge - d.y) / 4 : d.y > vh - edge ? (d.y - (vh - edge)) / 4 : 0;
    if (speed) { window.scrollBy(0, speed); placeDragged(); }
    scrollRaf.current = requestAnimationFrame(autoScroll);
  }

  function startDrag(e, id) {
    const el = els.current[id];
    if (!el) return;
    const r = el.getBoundingClientRect();
    drag.current = { id, pointerId: e.pointerId, grabX: e.clientX - r.left, grabY: e.clientY - r.top, x: e.clientX, y: e.clientY, lastTarget: null };
    el.style.zIndex = '40';
    el.style.boxShadow = '0 30px 60px -20px rgba(30,41,82,.45)';
    setDragId(id);
    placeDragged();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    if (!scrollRaf.current) scrollRaf.current = requestAnimationFrame(autoScroll);
  }

  function onPointerDown(e, id) {
    if (e.button !== undefined && e.button !== 0) return;
    const fromHandle = !!e.target.closest('[data-grabber]');
    if (editing) {
      if (e.pointerType !== 'mouse' && !fromHandle) return; // fingers scroll unless on the grabber
      e.preventDefault();
      startDrag(e, id);
      return;
    }
    // Not editing: press-and-hold enters edit mode (like the iOS home screen)
    const sx = e.clientX, sy = e.clientY;
    hold.current = {
      sx, sy,
      timer: setTimeout(() => {
        hold.current = null;
        suppressClick.current = true;
        setTimeout(() => { suppressClick.current = false; }, 600);
        navigator.vibrate?.(12);
        onEditingChange(true);
      }, HOLD_MS),
    };
  }

  function onPointerMove(e) {
    if (hold.current && Math.hypot(e.clientX - hold.current.sx, e.clientY - hold.current.sy) > 8) {
      clearTimeout(hold.current.timer); hold.current = null;
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

  function endDrag(e) {
    if (hold.current) { clearTimeout(hold.current.timer); hold.current = null; }
    const d = drag.current;
    if (!d || (e && e.pointerId !== d.pointerId)) return;
    const el = els.current[d.id];
    drag.current = null;
    setDragId(null);
    if (el) {
      el.style.transition = SETTLE;
      el.style.transform  = '';
      el.style.boxShadow  = '';
      setTimeout(() => { if (!drag.current || drag.current.id !== d.id) el.style.zIndex = ''; }, 450);
    }
  }

  // The click that ends a long-press must not open whatever was under the finger
  function onClickCapture(e) {
    if (suppressClick.current || editing) { e.preventDefault(); e.stopPropagation(); suppressClick.current = false; }
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
      className={`relative grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-4 grid-flow-row-dense gap-5 mt-6 sm:mt-7 ${editing ? 'dash-editing' : ''}`}>
      {order.map((id, i) => {
        const item = byId[id];
        if (!item) return null;
        const dragging = dragId === id;
        return (
          <div key={id} ref={el => { els.current[id] = el; }}
            className={`dash-widget relative ${entered ? '' : 'dash-widget-enter'} ${item.span || ''} ${editing ? 'select-none' : ''} ${dragging ? 'cursor-grabbing' : editing ? 'cursor-grab' : ''}`}
            style={{ animationDelay: `${i * 55}ms`, touchAction: editing ? 'pan-y' : undefined }}
            onPointerDown={e => onPointerDown(e, id)}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onContextMenu={e => { if (editing || hold.current) e.preventDefault(); }}>
            {/* Wider widgets tilt less, so every edge moves about the same */}
            <div className={`h-full ${editing && !dragging ? 'dash-jiggle' : ''}`}
              style={{ animationDelay: `${(i % 3) * -0.11}s`, '--jig': /col-span-4/.test(item.span) ? '0.12deg' : /col-span-2/.test(item.span) ? '0.22deg' : '0.45deg' }}>
              <div className={`h-full ${editing ? 'pointer-events-none' : ''}`}>{item.node}</div>
            </div>
            {editing && (
              <span data-grabber title="Drag to move"
                className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-10 flex items-center justify-center w-12 h-6 rounded-full glass-strong !bg-white/90 text-[#6e6e73] shadow-md animate-pop"
                style={{ touchAction: 'none' }}>
                <GripHorizontal size={15} />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
