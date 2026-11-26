"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { he } from "@/i18n/he";
import { useTray } from "./TrayProvider";

/**
 * "מגש הארוחה · N", floating above the tabs (PRD §8.1). The number bumps
 * with a critically damped spring when a dish is added; with reduced motion
 * it just changes.
 */
export function TrayPill() {
  const { id, count } = useTray();
  const pathname = usePathname();
  const reduce = useReducedMotion();
  if (
    !id ||
    count === 0 ||
    pathname === "/meals" ||
    pathname === "/login" ||
    pathname.startsWith("/auth/")
  )
    return null;

  return (
    <Link
      href={`/meals?id=${id}`}
      className="press fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 mx-auto flex h-11 w-fit items-center gap-1 rounded-full bg-ink px-5 text-sm font-semibold text-paper shadow-lg print:hidden"
    >
      {he.meals.trayTitle} ·
      <motion.span
        key={count}
        className="inline-block tabular-nums"
        initial={reduce ? false : { scale: 1.5 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", bounce: 0, duration: 0.3 }}
      >
        {count}
      </motion.span>
    </Link>
  );
}
