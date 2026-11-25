"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { he } from "@/i18n/he";
import type { ImageFiles } from "@/lib/data/imports";
import {
  connectDrive,
  disconnectDrive,
  downloadDriveFile,
  DriveError,
  pickTakeoutFiles,
  TAKEOUT_KEEP,
} from "@/lib/import/google-drive";
import { parseKeepArchives, ParseError } from "@/lib/import/parse";
import type { ParsedCollection } from "@/lib/import/types";
import { readImagesFrom } from "@/lib/import/images";

type Phase = "idle" | "connecting" | "takeout" | "picking" | "downloading";

// Google access tokens last an hour; ask again a little before that.
const TOKEN_MS = 50 * 60 * 1000;

/**
 * Keep with no files to handle: connect Google once, let Takeout put the
 * Keep export in the user's Drive, then pick it in Google's picker (which
 * opens by itself when they come back from Takeout).
 */
export function KeepFromDrive({
  onParsed,
}: {
  onParsed: (fileName: string, parsed: ParsedCollection, images: ImageFiles) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string>();
  const [notReady, setNotReady] = useState(false);
  const token = useRef<{ value: string; at: number } | null>(null);
  const openedTakeout = useRef(false);

  async function freshToken() {
    if (token.current && Date.now() - token.current.at < TOKEN_MS) return token.current.value;
    const value = await connectDrive();
    token.current = { value, at: Date.now() };
    return value;
  }

  const fail = (e: unknown) => {
    const code = e instanceof DriveError || e instanceof ParseError ? e.message : "failed";
    setError(he.bulk.keepErrors[code] ?? he.bulk.errors[code] ?? he.bulk.keepErrors.failed);
  };

  async function connect() {
    setError(undefined);
    setPhase("connecting");
    try {
      await freshToken();
      setPhase("takeout");
    } catch (e) {
      fail(e);
      setPhase("idle");
    }
  }

  async function pick() {
    setError(undefined);
    setNotReady(false);
    setPhase("picking");
    try {
      const t = await freshToken();
      const files = await pickTakeoutFiles(t);
      if (!files.length) {
        setNotReady(true);
        setPhase("takeout");
        return;
      }
      setPhase("downloading");
      const parts = await Promise.all(files.map((f) => downloadDriveFile(t, f.id)));
      const { parsed, files: zipFiles } = await parseKeepArchives(parts);
      const images = await readImagesFrom(zipFiles, parsed);
      disconnectDrive(t);
      token.current = null;
      onParsed("Google Keep", parsed, images);
    } catch (e) {
      fail(e);
      setPhase("takeout");
    }
  }

  // Back from the Takeout tab: open the picker without another tap.
  const onReturn = useEffectEvent(() => {
    if (document.visibilityState === "visible" && openedTakeout.current) {
      openedTakeout.current = false;
      void pick();
    }
  });
  useEffect(() => {
    const listener = () => onReturn();
    document.addEventListener("visibilitychange", listener);
    return () => document.removeEventListener("visibilitychange", listener);
  }, []);

  const problem = error && (
    <p role="alert" className="text-sm font-medium text-red-700">
      {error}
    </p>
  );

  if (phase === "idle" || phase === "connecting") {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={phase === "connecting"}
          onClick={connect}
          className="press h-14 rounded-full bg-accent text-lg font-semibold text-white disabled:opacity-60"
        >
          {phase === "connecting" ? he.bulk.keepConnecting : he.bulk.keepConnect}
        </button>
        <p className="text-sm text-muted">{he.bulk.keepConnectHint}</p>
        {problem}
      </div>
    );
  }

  const busy = phase === "picking" || phase === "downloading";
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-bold">{he.bulk.keepTakeoutTitle}</h2>
      <ol className="flex flex-col gap-2 rounded-2xl bg-white p-4 ring-1 ring-rule">
        {he.bulk.keepTakeoutSteps.map((step, i) => (
          <li key={step} className="flex gap-3 text-base">
            <span
              aria-hidden="true"
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-sm font-bold text-accent"
            >
              {i + 1}
            </span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
      <a
        href={TAKEOUT_KEEP}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => (openedTakeout.current = true)}
        className="press flex h-14 items-center justify-center rounded-full bg-accent text-lg font-semibold text-white"
      >
        {he.bulk.openTakeout} ↗
      </a>
      <button
        type="button"
        disabled={busy}
        onClick={pick}
        className="press h-12 rounded-full bg-white text-base font-semibold ring-1 ring-rule disabled:opacity-60"
      >
        {phase === "downloading" ? he.bulk.keepDownloading : he.bulk.keepPick}
      </button>
      {notReady && <p className="text-sm text-muted">{he.bulk.keepNotReady}</p>}
      {problem}
    </div>
  );
}
