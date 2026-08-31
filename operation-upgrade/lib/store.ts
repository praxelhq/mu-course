"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { emptyBoard, type Board } from "@/lib/engine/types";
import type { PhaseId } from "@/lib/phases";

const ID_KEY = "bharatbites:id";
const BOARD_KEY = "bharatbites:board";

export type Identity = { handle: string; secret: string; seat: number; sectionCode: string };

function read<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A locked-down browser is not a reason to stop the game.
  }
}

export function loadIdentity(): Identity | null {
  return read<Identity>(ID_KEY);
}
export function saveIdentity(id: Identity) {
  write(ID_KEY, id);
}
export function clearIdentity() {
  try {
    window.localStorage.removeItem(ID_KEY);
    window.localStorage.removeItem(BOARD_KEY);
  } catch { /* nothing to clear */ }
}

export function makeSecret(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The board lives in the browser. The server is a backup and a phase clock.
 * Everything a student does is instant and works with the wifi down.
 */
export function useBoard(identity: Identity) {
  const [board, setBoard] = useState<Board>(() => {
    const saved = read<Board>(BOARD_KEY);
    if (saved && saved.v === 1 && saved.handle === identity.handle) return saved;
    return emptyBoard(identity.handle, identity.seat);
  });
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "offline">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Local first, always. This is what makes the game survive a lecture hall.
  useEffect(() => {
    write(BOARD_KEY, board);
  }, [board]);

  // Then a debounced mirror to the server, which is allowed to fail quietly.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSaveState("saving");
      try {
        const res = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sectionCode: identity.sectionCode,
            handle: identity.handle,
            secret: identity.secret,
            board,
            locked: Boolean(board.lockedAt),
          }),
        });
        const body = await res.json().catch(() => ({}));
        setSaveState(body.offline ? "offline" : res.ok ? "saved" : "offline");
      } catch {
        setSaveState("offline");
      }
    }, 1200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [board, identity]);

  const update = useCallback((patch: (b: Board) => Board) => {
    setBoard((prev) => (prev.lockedAt ? prev : patch(prev)));
  }, []);

  return { board, update, setBoard, saveState };
}

/** The facilitator's phase, polled. Falls back to letting them play on. */
export function useRoomPhase(sectionCode: string) {
  const [phase, setPhase] = useState<PhaseId>("offer");
  const [endsAt, setEndsAt] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let handle: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const res = await fetch(`/api/room?section=${encodeURIComponent(sectionCode)}`, { cache: "no-store" });
        const body = await res.json();
        if (!cancelled && res.ok) {
          setPhase(body.phase as PhaseId);
          setEndsAt(body.phaseEndsAt ?? null);
          setConnected(!body.offline);
        }
      } catch {
        if (!cancelled) setConnected(false);
      }
      if (!cancelled) handle = setTimeout(poll, 3000 + Math.floor(Math.random() * 900));
    };
    handle = setTimeout(poll, 0);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [sectionCode]);

  return { phase, endsAt, connected };
}
