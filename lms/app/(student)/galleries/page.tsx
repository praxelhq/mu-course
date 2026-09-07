import { getGalleryWalls } from "@/lib/galleries";
import {
  activeWall,
  WallFilters,
  WallGrid,
  WallsHeading,
  WallTabs,
} from "@/components/gallery-walls";

// Login-gated cohort galleries (auth via the (student) layout's
// requireUser; deliberately CROSS-SECTION: every student sees every
// section's walls). Grades never appear here — getGalleryWalls is the only
// data source and its projection excludes them by construction.

export const dynamic = "force-dynamic";

export default async function GalleriesPage({
  searchParams,
}: {
  searchParams: Promise<{ wall?: string; section?: string; sector?: string }>;
}) {
  const sp = await searchParams;
  const wall = activeWall(sp.wall);
  const section = sp.section || undefined;
  const sector = sp.sector || undefined;

  const walls = await getGalleryWalls({
    filter: { sectionId: section, sector },
  });

  return (
    <main style={{ maxWidth: "72rem", margin: "0 auto", padding: "3rem 2rem" }}>
      <WallsHeading count={walls[wall].length} wall={wall} />
      <WallTabs basePath="/galleries" wall={wall} section={section} sector={sector} />
      <WallFilters
        basePath="/galleries"
        wall={wall}
        section={section}
        sector={sector}
        sections={walls.sections}
        sectors={walls.sectors}
      />
      <WallGrid walls={walls} wall={wall} />
    </main>
  );
}
