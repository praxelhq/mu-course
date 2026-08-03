import { listAssignmentTypes } from "@/lib/assignment-types";
import { parseSubmissionSchema } from "@/lib/submission-schema";
import { Eyebrow } from "@/components/ui";
import { TypesEditor, type EditableType } from "./types-editor";

// Admin assignment-type editor. Artifact kinds are AssignmentType ROWS,
// not code (CLAUDE.md invariant): creating a type here yields a working
// submit form with zero code changes — the structured field-list editor is
// the whole "add an artifact kind" operation.

export const dynamic = "force-dynamic";

export default async function TypesPage() {
  const rows = await listAssignmentTypes();
  const types: EditableType[] = rows.map((t) => {
    const schema = parseSubmissionSchema(t.submissionSchema);
    const rubric = t.rubric as {
      scale?: number;
      dimensions?: { key: string; label: string; max?: number; description?: string }[];
    } | null;
    return {
      id: t.id,
      slug: t.slug,
      title: t.title,
      description: t.description,
      teamBased: t.teamBased,
      galleryEligible: t.galleryEligible,
      fields: schema?.fields ?? [],
      rubricDimensions: (rubric?.dimensions ?? []).map((d) => ({
        key: d.key,
        label: d.label,
        max: d.max ?? 10,
        description: d.description ?? "",
      })),
    };
  });

  return (
    <main style={{ maxWidth: "64rem", margin: "0 auto", padding: "3rem 2rem" }}>
      <Eyebrow muted>Admin</Eyebrow>
      <h1 style={{ fontSize: "2rem", margin: "0 0 0.5rem" }}>Assignment types</h1>
      <p style={{ color: "var(--charcoal)", margin: "0 0 2rem", maxWidth: "44rem", lineHeight: 1.6 }}>
        Artifact kinds are rows, not code. A new type here becomes a working schema-driven submit
        form immediately — no deploy required.
      </p>
      <TypesEditor types={types} />
    </main>
  );
}
