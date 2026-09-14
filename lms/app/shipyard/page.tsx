import { requireUser } from "@/lib/auth";
import { isSpineScenario, mockSpine } from "@/lib/shipyard/spine-mock";
import { SpineHeader } from "@/components/shipyard/spine-header";
import { CheckpointRail } from "@/components/shipyard/checkpoint-rail";
import { StationIndex } from "@/components/shipyard/station-index";
import { GradeLine } from "@/components/shipyard/grade-line";
import { Notice } from "@/components/shipyard/notice";
import { SpinePollMount } from "@/components/shipyard/spine-poll-mount";

export const dynamic = "force-dynamic";

// The student spine: the whole course on one screen (SPEC §4).
//
// Until the data layer lands this reads `?scenario=` and renders a mock. The
// swap is one line — `mockSpine(...)` becomes `loadSpine(user.userId)` — and
// nothing below this file changes, because everything downstream is typed
// against SpineView.

export default async function ShipyardSpinePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const raw = Array.isArray(params.scenario) ? params.scenario[0] : params.scenario;
  const spine = mockSpine(isSpineScenario(raw) ? raw : "fresh");

  const staff = user.role === "instructor" || user.role === "admin";
  const pending = spine.checkpoints.some(
    (c) =>
      c.latestSubmission?.status === "in_review" || c.latestSubmission?.status === "submitted",
  );

  return (
    <main className="sy-main">
      {staff && (
        <Notice label="Staff view" tone="staff">
          You are viewing the student spine as staff. Nothing here is yours; no
          submission or gate can be changed from this screen.
        </Notice>
      )}

      <SpineHeader spine={spine} />

      <div className="sy-layout">
        <div>
          <CheckpointRail spine={spine} />
          <GradeLine grade={spine.grade} />
        </div>
        <aside className="sy-aside">
          <StationIndex spine={spine} />
        </aside>
      </div>

      <SpinePollMount enabled={pending} />
    </main>
  );
}
