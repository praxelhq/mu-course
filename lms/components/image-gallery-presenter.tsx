"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";
import type { GalleryPresentationItem } from "@/lib/gallery-presentation";
import {
  reconcilePresentationSelection,
  stepPresentationIndex,
} from "@/lib/gallery-presentation-navigation";

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const control: React.CSSProperties = {
  ...mono,
  border: "1px solid var(--sand)",
  background: "var(--pine)",
  color: "var(--parchment)",
  cursor: "pointer",
};

export function ImageGalleryPresenter({
  title,
  sectionCode,
  items,
}: {
  title: string;
  sectionCode: string;
  items: GalleryPresentationItem[];
}) {
  const [open, setOpen] = useState(false);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const activeThumbRef = useRef<HTMLButtonElement | null>(null);
  const previousSubmissionIdsRef = useRef<string[]>([]);

  const activeIndex = Math.max(
    0,
    items.findIndex((candidate) => candidate.submissionId === selectedSubmissionId),
  );
  const item = items[activeIndex];

  const showRelative = useCallback(
    (delta: number) => {
      const nextIndex = stepPresentationIndex(activeIndex, delta, items.length);
      setSelectedSubmissionId(items[nextIndex]?.submissionId ?? null);
    },
    [activeIndex, items],
  );

  const close = useCallback(() => {
    if (document.fullscreenElement === overlayRef.current) {
      void document.exitFullscreen().catch(() => undefined);
    }
    setFullscreen(false);
    setOpen(false);
    requestAnimationFrame(() => launcherRef.current?.focus());
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else if (overlayRef.current) {
      void overlayRef.current.requestFullscreen().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    const nextSubmissionIds = items.map((candidate) => candidate.submissionId);
    const nextSelection = reconcilePresentationSelection(
      selectedSubmissionId,
      previousSubmissionIdsRef.current,
      nextSubmissionIds,
    );
    previousSubmissionIdsRef.current = nextSubmissionIds;
    if (nextSelection.submissionId !== selectedSubmissionId) {
      setSelectedSubmissionId(nextSelection.submissionId);
    }
    if (open && nextSelection.submissionId === null) close();
  }, [close, items, open, selectedSubmissionId]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => closeRef.current?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      const targetIsControl =
        event.target instanceof HTMLElement &&
        Boolean(event.target.closest("button, a, input, select, textarea"));
      if (event.key === "Tab") {
        const focusable = overlayRef.current?.querySelectorAll<HTMLButtonElement>(
          "button:not([disabled])",
        );
        const first = focusable?.[0];
        const last = focusable?.[Math.max(0, (focusable?.length ?? 1) - 1)];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.key === "ArrowRight" || (event.key === " " && !targetIsControl)) {
        event.preventDefault();
        showRelative(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        showRelative(-1);
      } else if (event.key === "Home") {
        event.preventDefault();
        setSelectedSubmissionId(items[0]?.submissionId ?? null);
      } else if (event.key === "End") {
        event.preventDefault();
        setSelectedSubmissionId(items.at(-1)?.submissionId ?? null);
      } else if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        toggleFullscreen();
      }
    };
    const onFullscreenChange = () => setFullscreen(document.fullscreenElement === overlayRef.current);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [close, items, open, showRelative, toggleFullscreen]);

  useEffect(() => {
    if (open) activeThumbRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeIndex, open]);

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        disabled={items.length === 0}
        aria-haspopup="dialog"
        onClick={() => {
          setSelectedSubmissionId(items[0]?.submissionId ?? null);
          setOpen(true);
        }}
        style={{
          ...mono,
          marginTop: "0.5rem",
          width: "100%",
          padding: "0.55rem",
          fontSize: "0.65rem",
          border: "1px solid var(--pine)",
          background: items.length ? "var(--pine)" : "transparent",
          color: items.length ? "var(--parchment)" : "var(--clay)",
          cursor: items.length ? "pointer" : "not-allowed",
        }}
      >
        {items.length ? `Present gallery · ${items.length} →` : "No images to present yet"}
      </button>

      {open && item && (
        <div
          ref={overlayRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${title} presentation`}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "var(--pine)",
            color: "var(--parchment)",
            display: "grid",
            gridTemplateRows: "auto minmax(0, 1fr) auto",
            padding: "clamp(0.75rem, 2vw, 1.5rem)",
          }}
        >
          <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ ...mono, margin: 0, fontSize: "0.65rem", color: "var(--ochre)" }}>
                Projector gallery · Section {sectionCode}
              </p>
              <h2 style={{ margin: "0.25rem 0 0", fontSize: "clamp(1.15rem, 2vw, 1.75rem)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {title}
              </h2>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
              <button type="button" onClick={toggleFullscreen} style={{ ...control, padding: "0.55rem 0.75rem", fontSize: "0.65rem" }}>
                {fullscreen ? "Exit full screen" : "F · Full screen"}
              </button>
              <button ref={closeRef} type="button" onClick={close} style={{ ...control, padding: "0.55rem 0.75rem", fontSize: "0.65rem" }}>
                Esc · Close
              </button>
            </div>
          </header>

          <div style={{ minHeight: 0, position: "relative", display: "grid", placeItems: "center", padding: "1rem clamp(3.5rem, 7vw, 7rem)" }}>
            <button
              type="button"
              aria-label="Previous image"
              onClick={() => showRelative(-1)}
              style={{ ...control, position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", width: "clamp(3rem, 6vw, 5.5rem)", height: "clamp(5rem, 18vh, 10rem)", fontSize: "clamp(1.5rem, 3vw, 2.5rem)" }}
            >
              ←
            </button>
            <figure style={{ margin: 0, width: "100%", height: "100%", minHeight: 0, display: "grid", gridTemplateRows: "minmax(0, 1fr) auto", placeItems: "center" }}>
              <img
                src={item.imageUrl}
                alt={`Submission ${activeIndex + 1} from ${item.ownerName}`}
                style={{ display: "block", maxWidth: "100%", maxHeight: "100%", width: "auto", height: "auto", objectFit: "contain" }}
              />
              <figcaption style={{ textAlign: "center", paddingTop: "0.75rem", maxWidth: "60rem" }}>
                <p aria-live="polite" style={{ ...mono, margin: 0, fontSize: "0.7rem", color: "var(--ochre)" }}>
                  {activeIndex + 1} of {items.length} · {item.ownerName}
                </p>
                {item.caption && <p style={{ margin: "0.35rem 0 0", fontSize: "clamp(0.9rem, 1.4vw, 1.15rem)" }}>{item.caption}</p>}
              </figcaption>
            </figure>
            <button
              type="button"
              aria-label="Next image"
              onClick={() => showRelative(1)}
              style={{ ...control, position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", width: "clamp(3rem, 6vw, 5.5rem)", height: "clamp(5rem, 18vh, 10rem)", fontSize: "clamp(1.5rem, 3vw, 2.5rem)" }}
            >
              →
            </button>
          </div>

          <footer>
            <p style={{ ...mono, margin: "0 0 0.5rem", textAlign: "center", fontSize: "0.6rem", color: "var(--sand)" }}>
              Use ← →, Space, or the side buttons · thumbnails scroll horizontally
            </p>
            <div style={{ display: "flex", gap: "0.5rem", overflowX: "auto", padding: "0.25rem 0 0.5rem", scrollbarColor: "var(--ochre) var(--pine)" }}>
              {items.map((thumbnail, thumbnailIndex) => {
                const active = thumbnailIndex === activeIndex;
                return (
                  <button
                    key={thumbnail.submissionId}
                    ref={active ? activeThumbRef : undefined}
                    type="button"
                    aria-label={`Show image ${thumbnailIndex + 1}, ${thumbnail.ownerName}`}
                    aria-current={active ? "true" : undefined}
                    onClick={() => setSelectedSubmissionId(thumbnail.submissionId)}
                    style={{ flex: "0 0 auto", width: "5rem", height: "3.5rem", padding: 0, border: active ? "3px solid var(--ochre)" : "1px solid var(--sand)", background: "var(--pine)", cursor: "pointer" }}
                  >
                    <img
                      src={thumbnail.imageUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                    />
                  </button>
                );
              })}
            </div>
          </footer>
        </div>
      )}
    </>
  );
}
