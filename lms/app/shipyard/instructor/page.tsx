import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listSections, loadSectionMatrix, resolveSection } from "@/lib/shipyard/instructor";
import { MatrixGrid, MatrixLegend } from "@/components/shipyard/matrix-grid";
import { MatrixPollMount } from "@/components/shipyard/matrix-poll-mount";
import { EmptyState } from "@/components/shipyard/empty-states";

export const dynamic = "force-dynamic";

// One section, every student, the six checkpoints (SPEC §4).
//
// An instructor lands on their own section; an admin lands on A and can reach
// all eight. The tabs are links rather than a client filter, so a section is a
// URL somebody can bookmark or put on a wall display.

export default async function ShipyardInstructorPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // The layout already enforced the role; this is only for `sectionId`.
  const user = await requireUser();
  const params = await searchParams;
  const raw = Array.isArray(params.section) ? params.section[0] : params.section;

  const sections = await listSections();
  const active = resolveSection(sections, raw ?? null, user.sectionId);
  if (!active) {
    return (
      <main className="sy-main">
        <EmptyState head="No sections yet">
          Import a roster and the eight sections appear here with their students.
        </EmptyState>
      </main>
    );
  }

  const matrix = await loadSectionMatrix(active.id);
  if (!matrix) {
    return (
      <main className="sy-main">
        <EmptyState head="That section is gone">
          Section {active.code} no longer exists. Pick another from the tabs above.
        </EmptyState>
      </main>
    );
  }

  return (
    <main className="sy-main">
      <header className="sy-shead">
        <div>
          <p className="sy-eyebrow">Course 2 · faculty</p>
          <h1 className="sy-display sy-shead__title">Section {matrix.section.code}</h1>
          {matrix.summary && (
            <p className="sy-shead__line">
              <b>
                {matrix.summary.cleared} of {matrix.summary.total}
              </b>{" "}
              cleared checkpoint {matrix.summary.order} · {matrix.summary.title}
            </p>
          )}
        </div>
        <a
          className="sy-btn sy-btn--quiet"
          href={`/api/shipyard/exports/matrix?sectionId=${encodeURIComponent(matrix.section.id)}`}
        >
          Download CSV
        </a>
      </header>

      <nav className="sy-tabs" aria-label="Sections">
        {sections.map((s) => (
          <Link
            key={s.id}
            href={`/shipyard/instructor?section=${s.code}`}
            className={s.id === active.id ? "sy-tab sy-tab--current" : "sy-tab"}
            aria-current={s.id === active.id ? "page" : undefined}
          >
            {s.code}
          </Link>
        ))}
      </nav>

      <MatrixLegend />
      <MatrixGrid matrix={matrix} />

      <MatrixPollMount sectionId={matrix.section.id} version={matrix.version} />
    </main>
  );
}
