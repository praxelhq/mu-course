import { prisma } from "@/lib/db";
import { s3Configured } from "@/lib/s3";
import { Card, Eyebrow } from "@/components/ui";
import { MaterialsManager } from "./manager";

// Instructor materials manager: every material (including instructorOnly),
// grouped by session, with direct-to-S3 upload, link creation, visibility
// toggles, and delete. Without AWS env, uploads disable with a banner but
// link materials still work.

export const dynamic = "force-dynamic";

export default async function InstructorMaterialsPage() {
  const [materials, sections] = await Promise.all([
    prisma.material.findMany({ orderBy: [{ sessionNo: "asc" }, { title: "asc" }] }),
    prisma.section.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true } }),
  ]);
  const storageReady = s3Configured();

  return (
    <main style={{ maxWidth: "72rem", margin: "0 auto", padding: "3rem 2rem" }}>
      <Eyebrow muted>Materials</Eyebrow>
      <h1 style={{ fontSize: "2.25rem", margin: "0 0 0.5rem" }}>Course materials</h1>
      <p style={{ color: "var(--charcoal)", margin: "0 0 2rem", lineHeight: 1.6 }}>
        Upload files, add external links, and control who sees what. New materials start locked —
        open them from the Unlock Console.
      </p>
      {!storageReady && (
        <Card style={{ marginBottom: "1.5rem", borderColor: "var(--ochre)" }}>
          <p style={{ margin: 0, color: "var(--charcoal)", lineHeight: 1.6 }}>
            <strong>File storage is not configured</strong> (S3 env missing in this environment).
            File uploads are disabled; link materials can still be created, and seeded file rows
            show as placeholders.
          </p>
        </Card>
      )}
      <MaterialsManager
        storageReady={storageReady}
        sections={sections}
        materials={materials.map((m) => ({
          id: m.id,
          sessionNo: m.sessionNo,
          title: m.title,
          kind: m.kind,
          s3Key: m.s3Key,
          externalUrl: m.externalUrl,
          sizeBytes: m.sizeBytes,
          sectionIds: m.sectionIds,
          instructorOnly: m.instructorOnly,
        }))}
      />
    </main>
  );
}
