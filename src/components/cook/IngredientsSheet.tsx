"use client";

import { animate, motion, useDragControls, useMotionValue, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { he } from "@/i18n/he";
import { IngredientRows, type Progress } from "./IngredientRows";

/** Bottom sheets: damping 0.8, response 0.3 (PLAN §5). */
const SHEET_SPRING = { type: "spring", bounce: 0.2, visualDuration: 0.3 } as const;
/** A flick faster than this (px/s) opens or closes the sheet whatever its position. */
const FLICK = 400;

/**
 * The phone's ingredients panel: a sheet at the bottom of the cooking area.
 * Collapsed, it shows its handle ("מצרכים 3/12") and the next unchecked
 * ingredient. It follows the finger 1:1 from the handle, can be caught
 * mid-motion, and snaps open or shut by where it was let go and how fast.
 * Tapping the handle toggles it too. With reduced motion it doesn't slide:
 * its contents cross-fade.
 */
export function IngredientsSheet({
  progress,
  onToggle,
  onLastStep,
}: {
  progress: Progress;
  onToggle: (id: string) => void;
  onLastStep: () => void;
}) {
  const reduce = useReducedMotion();
  const controls = useDragControls();
  const y = useMotionValue(0);
  const [open, setOpen] = useState(false);
  const [closedY, setClosedY] = useState<number | null>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const handle = useRef<HTMLButtonElement>(null);
  const first = useRef<HTMLLIElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const dragged = useRef(false);
  const flick = useRef(0);
  const placed = useRef(false);
  const caught = useRef(false);

  // Collapsed, only the handle and the top row show.
  useLayoutEffect(() => {
    const measure = () => {
      if (!sheet.current || !handle.current) return;
      const peek = handle.current.offsetHeight + (first.current?.offsetHeight ?? 0);
      setClosedY(Math.max(0, sheet.current.offsetHeight - peek));
    };
    const observer = new ResizeObserver(measure);
    for (const el of [sheet.current, handle.current, first.current]) if (el) observer.observe(el);
    return () => observer.disconnect();
  }, [progress.next?.id, progress.allDone, progress.total]);

  useEffect(() => {
    if (closedY === null) return;
    const target = open ? 0 : closedY;
    if (!open && list.current) list.current.scrollTop = 0;
    const velocity = flick.current;
    flick.current = 0;
    // The first placement, and every move with reduced motion, is instant.
    if (reduce || !placed.current) {
      placed.current = true;
      y.jump(target);
      return;
    }
    const animation = animate(y, target, { ...SHEET_SPRING, velocity });
    return () => animation.stop();
  }, [open, closedY, reduce, y]);

  function letGo(velocity: number) {
    if (closedY === null) return;
    const next = velocity < -FLICK ? true : velocity > FLICK ? false : y.get() < closedY / 2;
    flick.current = velocity;
    if (next === open) {
      animate(y, next ? 0 : closedY, { ...SHEET_SPRING, velocity });
      flick.current = 0;
    } else setOpen(next);
  }

  return (
    <motion.div
      ref={sheet}
      data-open={open}
      style={{ y, visibility: closedY === null ? "hidden" : "visible" }}
      drag={reduce ? false : "y"}
      dragControls={controls}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: closedY ?? 0 }}
      dragElastic={0.08}
      dragMomentum={false}
      onDragStart={() => {
        dragged.current = true;
      }}
      onDragEnd={(_, info) => letGo(info.velocity.y)}
      className="absolute inset-x-0 bottom-0 z-10 mx-auto flex h-[85%] max-w-xl flex-col rounded-t-3xl bg-white shadow-[0_-8px_24px_rgb(31_27_22/0.12)] ring-1 ring-rule"
    >
      <button
        ref={handle}
        type="button"
        aria-expanded={open}
        aria-controls="cook-ingredients"
        onPointerDown={(e) => {
          dragged.current = false;
          if (reduce) return;
          // Caught mid-motion: it stops where it is, under the finger.
          caught.current = y.isAnimating();
          y.stop();
          controls.start(e);
        }}
        onClick={() => {
          if (dragged.current) return;
          // Let go of a sheet caught mid-motion: it settles where it's nearest.
          if (caught.current) letGo(0);
          else setOpen((o) => !o);
        }}
        className="flex w-full shrink-0 touch-none flex-col items-center gap-1 pt-2 pb-2"
      >
        <span aria-hidden="true" className="h-1.5 w-10 rounded-full bg-rule" />
        <span className="text-base font-semibold">
          {he.cook.ingredients(progress.done, progress.total)}
        </span>
      </button>
      <motion.div
        key={reduce ? String(open) : "list"}
        ref={list}
        id="cook-ingredients"
        initial={reduce ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className={`min-h-0 flex-1 border-t border-rule ${open ? "overflow-y-auto" : "overflow-hidden"}`}
      >
        <IngredientRows
          progress={progress}
          onToggle={onToggle}
          onLastStep={() => {
            setOpen(false);
            onLastStep();
          }}
          firstRef={first}
        />
      </motion.div>
    </motion.div>
  );
}
