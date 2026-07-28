/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from "react";
import Link from "next/link";
import type { GalleryWallItem, GalleryWalls, WallKey } from "@/lib/galleries";
import { Card, Eyebrow } from "@/components/ui";

// U11 — shared rendering for the three gallery walls (student + instructor
// surfaces). Server-rendered; filtering is URL-searchParams based so the
// pages stay server components. The featured ribbon is the view's single
// Ochre accent (BRAND rule 3).

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

export const WALL_LABELS: Record<WallKey, string> = {
  app: "App wall",
  workflow: "Workflow wall",
  maps: "Map wall",
};

export function activeWall(param: string | undefined): WallKey {
  return param === "workflow" || param === "maps" ? param : "app";
}

function qs(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function WallTabs({
  basePath,
  wall,
  section,
  sector,
}: {
  basePath: string;
  wall: WallKey;
  section?: string;
  sector?: string;
}) {
  return (
    <nav style={{ display: "flex", gap: "0.5rem", margin: "0 0 1.5rem" }}>
      {(Object.keys(WALL_LABELS) as WallKey[]).map((w) => (
        <Link
          key={w}
          href={`${basePath}${qs({ wall: w, section, sector })}`}
          style={{
            ...mono,
            fontSize: "0.6875rem",
            textDecoration: "none",
            padding: "0.375rem 0.875rem",
            border: "1px solid var(--sand)",
            color: w === wall ? "var(--cream)" : "var(--charcoal)",
            background: w === wall ? "var(--pine)" : "transparent",
            borderColor: w === wall ? "var(--pine)" : "var(--sand)",
          }}
        >
          {WALL_LABELS[w]}
        </Link>
      ))}
    </nav>
  );
}

/** Plain GET form — server-rendered filters, no client JS. */
export function WallFilters({
  basePath,
  wall,
  section,
  sector,
  sections,
  sectors,
}: {
  basePath: string;
  wall: WallKey;
  section?: string;
  sector?: string;
  sections: { id: string; code: string }[];
  sectors: string[];
}) {
  const selectStyle: React.CSSProperties = {
    fontFamily: "var(--font-geist-mono)",
    fontSize: "0.8125rem",
    border: "1px solid var(--sand)",
    background: "var(--parchment)",
    color: "var(--ink)",
    padding: "0.375rem 0.5rem",
  };
  return (
    <form
      method="get"
      action={basePath}
      style={{ display: "flex", alignItems: "center", gap: "0.75rem", margin: "0 0 2rem", flexWrap: "wrap" }}
    >
      <input type="hidden" name="wall" value={wall} />
      <label style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)" }}>
        Section{" "}
        <select name="section" defaultValue={section ?? ""} style={selectStyle}>
          <option value="">All</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code}
            </option>
          ))}
        </select>
      </label>
      <label style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)" }}>
        Sector{" "}
        <select name="sector" defaultValue={sector ?? ""} style={selectStyle}>
          <option value="">All</option>
          {sectors.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        style={{
          ...mono,
          fontSize: "0.6875rem",
          background: "var(--pine)",
          color: "var(--cream)",
          border: "1px solid var(--pine)",
          padding: "0.375rem 1rem",
          cursor: "pointer",
        }}
      >
        Apply
      </button>
      {(section || sector) && (
        <Link
          href={`${basePath}${qs({ wall })}`}
          style={{ ...mono, fontSize: "0.625rem", color: "var(--charcoal)" }}
        >
          Clear
        </Link>
      )}
    </form>
  );
}

function extLink(label: string, href: string) {
  return (
    <a
      key={label}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        ...mono,
        fontSize: "0.6875rem",
        color: "var(--pine)",
        border: "1px solid var(--sand)",
        padding: "0.25rem 0.625rem",
        textDecoration: "none",
      }}
    >
      {label} ↗
    </a>
  );
}

export function GalleryCard({
  item,
  controls,
}: {
  item: GalleryWallItem;
  /** Instructor-only featuring controls slot. */
  controls?: ReactNode;
}) {
  const byline = [item.displayName, item.sectionCode && `Sec ${item.sectionCode}`, item.sectorName]
    .filter(Boolean)
    .join(" · ");
  return (
    <Card style={{ padding: 0, position: "relative", display: "flex", flexDirection: "column" }}>
      {item.featured && (
        <span
          style={{
            ...mono,
            position: "absolute",
            top: 0,
            right: 0,
            fontSize: "0.625rem",
            color: "var(--cream)",
            background: "var(--ochre)",
            padding: "0.25rem 0.625rem",
            zIndex: 1,
          }}
        >
          Featured
        </span>
      )}

      {item.wall === "app" &&
        (item.screenshotUrl ? (
          <img
            src={item.screenshotUrl}
            alt={`Screenshot of ${item.displayName}'s app`}
            style={{
              width: "100%",
              height: "10rem",
              objectFit: "cover",
              borderBottom: "1px solid var(--sand)",
              display: "block",
            }}
          />
        ) : (
          <div
            aria-hidden
            style={{
              height: "10rem",
              background: "var(--pine)",
              color: "var(--cream)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-fraunces)",
              fontWeight: 700,
              fontSize: "3.5rem",
              borderBottom: "1px solid var(--sand)",
            }}
          >
            {item.placeholderInitial}
          </div>
        ))}

      <div style={{ padding: "1rem 1.25rem 1.25rem", display: "grid", gap: "0.625rem" }}>
        <div>
          <p style={{ margin: 0, fontWeight: 500 }}>{byline}</p>
          <p style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)", margin: "0.25rem 0 0" }}>
            {item.title}
          </p>
        </div>

        {item.caption && (
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--charcoal)" }}>{item.caption}</p>
        )}

        {(item.links.appUrl || item.links.githubUrl || item.files.length > 0) && (
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {item.links.appUrl && extLink("Open app", item.links.appUrl)}
            {item.links.githubUrl && extLink("GitHub", item.links.githubUrl)}
            {item.files.map((f) => extLink(f.label, f.url))}
          </div>
        )}

        {item.filesWithheld && (
          <p style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)", margin: 0 }}>
            Files available when featured
          </p>
        )}

        {controls}
      </div>
    </Card>
  );
}

export function WallGrid({
  walls,
  wall,
  renderControls,
}: {
  walls: GalleryWalls;
  wall: WallKey;
  renderControls?: (item: GalleryWallItem) => ReactNode;
}) {
  const items = walls[wall];
  if (items.length === 0) {
    return (
      <Card>
        <p style={{ color: "var(--charcoal)", margin: 0 }}>
          Nothing on this wall yet — graded artifacts appear here automatically.
        </p>
      </Card>
    );
  }
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(17rem, 1fr))",
        gap: "1.5rem",
      }}
    >
      {items.map((item) => (
        <GalleryCard key={item.id} item={item} controls={renderControls?.(item)} />
      ))}
    </div>
  );
}

export function WallsHeading({ count, wall }: { count: number; wall: WallKey }) {
  return (
    <>
      <Eyebrow muted>Galleries</Eyebrow>
      <h1 style={{ fontSize: "2rem", margin: "0 0 0.5rem" }}>Cohort galleries</h1>
      <p style={{ color: "var(--charcoal)", margin: "0 0 1.5rem" }}>
        {WALL_LABELS[wall]} · {count} item{count === 1 ? "" : "s"} · every section, whole cohort.
      </p>
    </>
  );
}
