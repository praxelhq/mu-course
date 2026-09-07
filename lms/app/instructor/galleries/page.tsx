import { getGalleryWalls } from "@/lib/galleries";
import {
  activeWall,
  WallFilters,
  WallGrid,
  WallsHeading,
  WallTabs,
} from "@/components/gallery-walls";
import { FeatureControls } from "./feature-controls";
import { PublicationControls } from "./publication-controls";
import { listInstructorPublicationCandidates } from "@/lib/assessment-projections";

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

  const [walls, publicationCandidates] = await Promise.all([
    getGalleryWalls({ filter: { sectionId: section, sector } }),
    listInstructorPublicationCandidates(),
  ]);

  return (
    <main style={{ maxWidth: "72rem", margin: "0 auto", padding: "3rem 2rem" }}>
      <WallsHeading count={walls[wall].length} wall={wall} />
      <p style={{ ...{ fontFamily: "var(--font-geist-mono)", letterSpacing: "0.1em", textTransform: "uppercase" }, fontSize: "0.625rem", color: "var(--clay)", margin: "-1rem 0 1.5rem" }}>
        Versioned work requires current owner consent and instructor approval. Legacy feature toggles remain audited below.
      </p>
      <PublicationControls candidates={publicationCandidates.filter((candidate) => candidate.wall === wall)} />
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
