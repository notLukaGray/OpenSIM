"use client";
// useWorldPan (P10-01): component-local presentation state for the world map's
// pan/tap gestures. Engine purity (AGENTS.md rule 3): nothing here enters
// game/ or GameState — this is camera + gesture bookkeeping only.
//
// Gesture contract (P10-01):
//   • middle-mouse drag pans on desktop;
//   • two-finger drag pans on touch;
//   • left-drag on EMPTY SPACE also pans (decided: yes — it matches every
//     map-like UI; a drag that begins ON a zone stays owned by that zone so a
//     sloppy tap never yanks the world out from under the player's finger);
//   • single taps/clicks are reserved for hit zones. A tap is only resolved on
//     pointer-up if its pointer stayed within TAP_SLOP_PX of where it started,
//     so a pan can never register as a tap.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** Max drift (px) between pointer-down and pointer-up that still counts as a tap. */
const TAP_SLOP_PX = 10;

type Vec2 = { x: number; y: number };

type PointerTrack = { lastX: number; lastY: number; moved: number };

type Options<T extends HTMLElement> = {
  /** World size as multipliers over the viewport (> 1 guarantees pannable margin). */
  spanX?: number;
  spanY?: number;
  /** Called when a zone tap survives the movement threshold. */
  onTapZone: (zoneId: string) => void;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(0, hi));

export function useWorldPan<T extends HTMLElement>({ spanX = 1.6, spanY = 1.3, onTapZone }: Options<T>) {
  const viewportRef = useRef<T | null>(null);
  const [vpSize, setVpSize] = useState<Vec2>({ x: 0, y: 0 });
  const [offset, setOffset] = useState<Vec2>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  // The map art is square. Keep the world square while making it larger than
  // the viewport on both axes so the full illustration stays undistorted.
  const world = useMemo(
    () => {
      const side = Math.max(vpSize.x * spanX, vpSize.y * spanY);
      return { w: Math.ceil(side), h: Math.ceil(side) };
    },
    [vpSize, spanX, spanY]
  );

  // Track viewport size; re-clamp/center when it or the world changes.
  const centeredRef = useRef(false);
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setVpSize({ x: r.width, y: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (vpSize.x === 0 || vpSize.y === 0 || world.w === 0) return;
    const maxX = Math.max(0, world.w - vpSize.x);
    const maxY = Math.max(0, world.h - vpSize.y);
    // First valid measurement centers the world; afterwards keep position.
    // (Both paths are pure updaters — StrictMode double-invokes them.)
    if (!centeredRef.current) {
      centeredRef.current = true;
      setOffset({ x: maxX / 2, y: maxY / 2 });
    } else {
      setOffset((prev) => ({ x: clamp(prev.x, 0, maxX), y: clamp(prev.y, 0, maxY) }));
    }
  }, [world.w, world.h, vpSize.x, vpSize.y]);

  // Latest-callback ref: gesture handlers below are deliberately dependency-free.
  const onTapZoneRef = useRef(onTapZone);
  useEffect(() => {
    onTapZoneRef.current = onTapZone;
  });

  // ── gesture state (refs — no re-renders during a drag) ────────────────────
  const pointers = useRef(new Map<number, PointerTrack>());
  const panAnchor = useRef<number | null>(null);
  const tapCandidate = useRef<{ id: number; zoneId: string; invalidated: boolean } | null>(null);

  const zoneFromTarget = (target: EventTarget | null): string | null => {
    const el = target instanceof Element ? target : null;
    return el?.closest("[data-map-zone]")?.getAttribute("data-map-zone") ?? null;
  };

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      pointers.current.set(e.pointerId, { lastX: e.clientX, lastY: e.clientY, moved: 0 });

      // A second pointer joining kills any pending single-pointer tap.
      if (tapCandidate.current && tapCandidate.current.id !== e.pointerId)
        tapCandidate.current.invalidated = true;

      const zoneId = zoneFromTarget(e.target);
      // Pan eligibility, decided once at pointer-down:
      //   mouse middle → always; mouse left → empty space only; touch/pen → second finger.
      const wantsPan =
        (e.pointerType === "mouse" && e.button === 1) ||
        (e.pointerType === "mouse" && e.button === 0 && zoneId === null) ||
        (e.pointerType !== "mouse" && pointers.current.size === 2);

      if (wantsPan && panAnchor.current === null) {
        panAnchor.current = e.pointerId;
        setIsPanning(true);
        if (tapCandidate.current?.id === e.pointerId) tapCandidate.current = null; // a pan is never a tap
        try {
          viewportRef.current?.setPointerCapture?.(e.pointerId);
        } catch {
          /* pointer already gone — gestures still work via bubbling */
        }
        if (e.pointerType === "mouse") e.preventDefault(); // stop middle-click autoscroll
        return;
      }

      // Single left-click / single finger starting on a zone may become a tap —
      // never while a pan is in progress (e.g. a third finger landing on a zone).
      if (panAnchor.current === null && zoneId !== null && (e.pointerType !== "mouse" || e.button === 0))
        tapCandidate.current = { id: e.pointerId, zoneId, invalidated: false };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const t = pointers.current.get(e.pointerId);
      if (!t) return;
      const dx = e.clientX - t.lastX;
      const dy = e.clientY - t.lastY;
      t.lastX = e.clientX;
      t.lastY = e.clientY;
      t.moved += Math.hypot(dx, dy);
      if (tapCandidate.current?.id === e.pointerId && t.moved > TAP_SLOP_PX)
        tapCandidate.current = null; // drifted too far — this was a drag
      if (panAnchor.current === e.pointerId)
        setOffset((prev) => ({
          x: clamp(prev.x - dx, 0, world.w - vpSize.x),
          y: clamp(prev.y - dy, 0, world.h - vpSize.y),
        }));
    },
    [world.w, world.h, vpSize.x, vpSize.y]
  );

  const finishPointer = useCallback((e: React.PointerEvent) => {
    const t = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    if (panAnchor.current === e.pointerId) {
      // The anchoring finger/mouse owns the gesture; when it lifts, the pan
      // ends — a remaining finger does not silently take over the camera.
      panAnchor.current = null;
      setIsPanning(false);
      try {
        viewportRef.current?.releasePointerCapture?.(e.pointerId);
      } catch {
        /* capture already gone — nothing to release */
      }
    }
    const cand = tapCandidate.current;
    if (cand && cand.id === e.pointerId) {
      tapCandidate.current = null;
      if (!cand.invalidated && t && t.moved <= TAP_SLOP_PX) onTapZoneRef.current(cand.zoneId);
    }
  }, []);

  const handlers = useMemo(
    () => ({
      onPointerDown,
      onPointerMove,
      onPointerUp: finishPointer,
      onPointerCancel: finishPointer,
      onAuxClick: (e: React.MouseEvent) => e.preventDefault(), // middle-click autoscroll fallback
    }),
    [onPointerDown, onPointerMove, finishPointer]
  );

  return { viewportRef, world, offset, isPanning, handlers };
}
