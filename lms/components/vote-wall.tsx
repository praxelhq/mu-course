"use client";

import { useMemo, useState } from "react";
import type { VoteGallery, VoteGalleryItem } from "@/lib/gallery-vote";

// Interactive voting wall. Optimistic vote toggles; counts + a leaderboard
// appear only when the server marked the viewer unlocked AND their section
// revealed (item.count is non-null exactly then).

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

export function VoteWall({ gallery }: { gallery: VoteGallery }) {
  const [mine, setMine] = useState<Set<string>>(
    () => new Set(gallery.sections.flatMap((s) => s.items.filter((i) => i.mine).map((i) => i.submissionId))),
  );
  const [myVotes, setMyVotes] = useState(gallery.myVotes);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const votesToUnlock = Math.max(0, gallery.unlockThreshold - myVotes);
  const unlocked = myVotes >= gallery.unlockThreshold;

  async function toggle(item: VoteGalleryItem) {
    if (!item.votable || busy) return;
    const has = mine.has(item.submissionId);
    setBusy(item.submissionId);
    setError(null);
    try {
      const res = await fetch("/api/votes", {
        method: has ? "DELETE" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ submissionId: item.submissionId }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError(b?.error ?? `Vote failed (${res.status})`);
        return;
      }
      setMine((prev) => {
        const next = new Set(prev);
        if (has) next.delete(item.submissionId);
        else next.add(item.submissionId);
        return next;
      });
      setMyVotes((v) => v + (has ? -1 : 1));
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(null);
    }
  }

  // Leaderboard: own-section items with a visible count, highest first.
  const leaderboard = useMemo(() => {
    const own = gallery.sections.find((s) => s.code === gallery.mySectionCode);
    if (!own) return [];
    return own.items
      .filter((i) => i.count !== null)
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
      .slice(0, 10);
  }, [gallery]);

  const showResults = unlocked && gallery.revealed && leaderboard.length > 0;

  return (
    <main style={{ maxWidth: "60rem", margin: "0 auto", padding: "3rem 2rem" }}>
      <p style={{ ...mono, fontSize: "0.6875rem", color: "var(--ochre)", margin: "0 0 0.5rem" }}>Gallery · Vote</p>
      <h1 style={{ fontSize: "2rem", margin: "0 0 1rem" }}>{gallery.title}</h1>

      {/* Progress / status banner */}
      <div
        style={{
          border: "1px solid var(--sand)",
          background: "var(--parchment)",
          padding: "1rem 1.25rem",
          marginBottom: "2rem",
        }}
      >
        {!unlocked ? (
          <p style={{ margin: 0, lineHeight: 1.6 }}>
            You&apos;ve upvoted <strong>{myVotes}</strong> of {gallery.unlockThreshold}. Upvote{" "}
            <strong>{votesToUnlock} more</strong> in your section (Section {gallery.mySectionCode ?? "—"}) to
            unlock results.
          </p>
        ) : !gallery.revealed ? (
          <p style={{ margin: 0, lineHeight: 1.6 }}>
            Unlocked — you&apos;ve cast {myVotes} votes. Results appear once your instructor reveals them.
          </p>
        ) : (
          <p style={{ margin: 0, lineHeight: 1.6 }}>Results are live for your section. 🎉</p>
        )}
        {error && <p style={{ color: "var(--ochre)", margin: "0.5rem 0 0", fontSize: "0.85rem" }}>{error}</p>}
      </div>

      {showResults && (
        <section style={{ marginBottom: "2.5rem" }}>
          <p style={{ ...mono, fontSize: "0.6875rem", color: "var(--clay)", margin: "0 0 0.75rem" }}>
            Leaderboard · Section {gallery.mySectionCode}
          </p>
          <ol style={{ margin: 0, paddingLeft: "1.5rem", lineHeight: 1.9 }}>
            {leaderboard.map((i) => (
              <li key={i.submissionId}>
                {i.ownerName} — <strong>{i.count}</strong> {i.count === 1 ? "vote" : "votes"}
              </li>
            ))}
          </ol>
        </section>
      )}

      {gallery.sections.map((section) => {
        const isMine = section.code === gallery.mySectionCode;
        return (
          <section key={section.code} style={{ marginBottom: "2.5rem" }}>
            <p style={{ ...mono, fontSize: "0.6875rem", color: isMine ? "var(--pine)" : "var(--clay)", margin: "0 0 0.75rem" }}>
              Section {section.code}
              {isMine ? " · your section (votable)" : " · view only"}
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(15rem, 1fr))",
                gap: "1rem",
              }}
            >
              {section.items.map((item) => {
                const voted = mine.has(item.submissionId);
                return (
                  <figure
                    key={item.submissionId}
                    style={{ margin: 0, border: "1px solid var(--sand)", background: "var(--paper, #fff)" }}
                  >
                    {item.imageUrl ? (
                      // Memes are all shapes: contain (never cover) so nothing
                      // is cropped, and the whole thing opens full-size in a
                      // new tab — text-heavy memes are unreadable in a tile.
                      <a
                        href={item.imageUrl}
                        target="_blank"
                        rel="noreferrer"
                        title="Open full size"
                        style={{ display: "block", background: "var(--parchment)" }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.imageUrl}
                          alt={`${item.ownerName}'s submission`}
                          style={{
                            width: "100%",
                            height: "16rem",
                            objectFit: "contain",
                            display: "block",
                            cursor: "zoom-in",
                          }}
                        />
                      </a>
                    ) : (
                      <div style={{ height: "16rem", display: "grid", placeItems: "center", color: "var(--clay)" }}>
                        (no image)
                      </div>
                    )}
                    <figcaption style={{ padding: "0.75rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ fontSize: "0.85rem" }}>{item.ownerName}</span>
                        {item.count !== null && (
                          <span style={{ ...mono, fontSize: "0.7rem", color: "var(--pine)" }}>{item.count} ▲</span>
                        )}
                      </div>
                      {item.caption && (
                        <p style={{ margin: "0.35rem 0 0", fontSize: "0.8rem", color: "var(--charcoal)" }}>{item.caption}</p>
                      )}
                      {item.votable && (
                        <button
                          type="button"
                          disabled={busy === item.submissionId}
                          onClick={() => toggle(item)}
                          style={{
                            marginTop: "0.6rem",
                            width: "100%",
                            padding: "0.4rem",
                            border: "1px solid var(--sand)",
                            borderRadius: 0,
                            background: voted ? "var(--pine)" : "transparent",
                            color: voted ? "var(--parchment)" : "var(--pine)",
                            cursor: busy ? "wait" : "pointer",
                            ...mono,
                            fontSize: "0.7rem",
                          }}
                        >
                          {voted ? "▲ Upvoted" : "△ Upvote"}
                        </button>
                      )}
                    </figcaption>
                  </figure>
                );
              })}
              {section.items.length === 0 && (
                <p style={{ color: "var(--clay)", fontSize: "0.85rem" }}>No submissions yet.</p>
              )}
            </div>
          </section>
        );
      })}
    </main>
  );
}
