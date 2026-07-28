import { getGalleryWalls } from "@/lib/galleries";
import {
  activeWall,
  WallFilters,
  WallGrid,
  WallsHeading,
  WallTabs,
} from "@/components/gallery-walls";
import { FeatureControls } from "./feature-controls";

// The featuring surface: same three walls as the student page, plus
// per-card feature/unfeature + caption controls (POST /api/galleries/feature,
// audited). Auth via the instructor layout (instructors and admins).

export const dynamic = "force-dynamic";

export default async function InstructorGalleriesPage({
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
      <p style={{ ...{ fontFamily: "var(--font-geist-mono)", letterSpacing: "0.1em", textTransform: "uppercase" }, fontSize: "0.625rem", color: "var(--clay)", margin: "-1rem 0 1.5rem" }}>
        Featuring exposes a workflow item&apos;s files on the wall — every toggle is audited.
      </p>
      <WallTabs basePath="/instructor/galleries" wall={wall} section={section} sector={sector} />
      <WallFilters
        basePath="/instructor/galleries"
        wall={wall}
        section={section}
        sector={sector}
        sections={walls.sections}
        sectors={walls.sectors}
      />
      <WallGrid
        walls={walls}
        wall={wall}
        renderControls={(item) => (
          <FeatureControls
            galleryItemId={item.id}
            featured={item.featured}
            caption={item.caption}
          />
        )}
      />
    </main>
  );
}
