"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { he } from "@/i18n/he";

type Tab = { href: string; label: string; icon: ReactNode };

const iconProps = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

const tabs: Tab[] = [
  {
    href: "/",
    label: he.nav.library,
    icon: (
      <svg {...iconProps}>
        <path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z" />
        <path d="M4 21V5M8 7h6" />
      </svg>
    ),
  },
  {
    href: "/meals",
    label: he.nav.meals,
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="4" />
      </svg>
    ),
  },
  {
    href: "/shopping",
    label: he.nav.shopping,
    icon: (
      <svg {...iconProps}>
        <path d="M5 8h14l-1.5 12h-11z" />
        <path d="M9 8V6a3 3 0 0 1 6 0v2" />
      </svg>
    ),
  },
  {
    href: "/add",
    label: he.nav.add,
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v8M8 12h8" />
      </svg>
    ),
  },
];

function isActive(pathname: string, href: string) {
  // Recipe pages belong to the library tab.
  if (href === "/") return pathname === "/" || pathname === "/recipe";
  // Bulk import belongs to the add tab.
  if (href === "/add" && pathname === "/import") return true;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BottomNav() {
  const pathname = usePathname();
  if (pathname === "/login" || pathname.startsWith("/auth/")) return null;

  return (
    <nav
      aria-label={he.nav.label}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-paper/75 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 not-supports-[backdrop-filter:blur(1px)]:bg-paper reduced-transparency:bg-paper reduced-transparency:backdrop-blur-none reduced-transparency:backdrop-saturate-100"
    >
      <ul className="mx-auto grid h-16 max-w-xl grid-cols-4">
        {tabs.map((tab) => {
          const active = isActive(pathname, tab.href);
          return (
            <li key={tab.href} className="flex">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium ${
                  active ? "text-accent" : "text-muted"
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
