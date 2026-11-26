"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useAccess } from "@/components/auth/AuthProvider";
import { getCurrentBook } from "@/lib/data/book";
import { addToTray, getTray } from "@/lib/data/meals";
import { isDemo } from "@/lib/demo";

type Tray = {
  /** The book's tray (its draft meal), once it has one. */
  id: string | null;
  count: number;
  /** Owners and contributors plan meals; viewers only look. */
  canPlan: boolean;
  add: (recipeId: string) => Promise<void>;
  refresh: () => void;
};

const TrayContext = createContext<Tray>({
  id: null,
  count: 0,
  canPlan: false,
  add: async () => {},
  refresh: () => {},
});

/** The meal tray (PRD §8.1). It lives on the server: same on every device. */
export function useTray() {
  return useContext(TrayContext);
}

export function TrayProvider({ children }: { children: ReactNode }) {
  const access = useAccess();
  const approved = access?.status === "approved";
  const [book, setBook] = useState<{ id: string; canPlan: boolean } | null>(null);
  const [tray, setTray] = useState<{ id: string | null; count: number }>({ id: null, count: 0 });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (isDemo || !approved) return;
    let live = true;
    getCurrentBook().then(
      (b) => live && b && setBook({ id: b.id, canPlan: b.role !== "viewer" }),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [approved]);

  useEffect(() => {
    if (!book) return;
    let live = true;
    getTray(book.id).then(
      (t) => live && setTray(t ?? { id: null, count: 0 }),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [book, tick]);

  const refresh = useCallback(() => setTick((n) => n + 1), []);
  const add = useCallback(
    async (recipeId: string) => {
      await addToTray(recipeId);
      refresh();
    },
    [refresh],
  );

  return (
    <TrayContext.Provider
      value={{ id: tray.id, count: tray.count, canPlan: !!book?.canPlan, add, refresh }}
    >
      {children}
    </TrayContext.Provider>
  );
}
