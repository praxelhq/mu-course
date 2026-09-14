import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isTestLoginEnabled } from "@/lib/auth/test-login";
import { ensureProduct } from "@/lib/shipyard/products";
import { loadSpine } from "@/lib/shipyard/spine";
import { isSpineScenario, mockSpine } from "@/lib/shipyard/spine-mock";
import type { SpineView } from "@/lib/shipyard/view-models";
import { SpineHeader } from "@/components/shipyard/spine-header";
import { CheckpointRail } from "@/components/shipyard/checkpoint-rail";
import { StationIndex } from "@/components/shipyard/station-index";
import { GradeLine } from "@/components/shipyard/grade-line";
import { SpinePollMount } from "@/components/shipyard/spine-poll-mount";

export const dynamic = "force-dynamic";

// The student spine: the whole course on one screen (SPEC §4).
//
// `ensureProduct` runs before `loadSpine` because a student's first page load
// is the only enrolment signal the portal gets: it creates the product and its
// six ShipyardCheckpointState rows, so the very first render already shows
// checkpoint 1 open rather than six locked boxes.
//
// `?scenario=` still renders the mock, but ONLY on a test-login build. It is a
// design-review affordance — the seven spine states side by side without
// seeding seven students — and on a real deploy it would be a way to show a
// student a spine that is not theirs.

export default async function ShipyardSpinePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // The layout resolves the session but does not enforce it (one page under
  // /shipyard is reachable without one). This page needs one.
  const user = await getSessionUser();
  if (!user) redirect(isTestLoginEnabled() ? "/shipyard/demo" : "/sign-in");

  // Staff have their own building. The student spine is one person's own data,
  // and a read-only copy of it for staff is the drill-down, not this page.
  if (user.role === "instructor" || user.role === "admin") {
    redirect("/shipyard/instructor");
  }

  const params = await searchParams;
  const raw = Array.isArray(params.scenario) ? params.scenario[0] : params.scenario;
  const scenario = isTestLoginEnabled() && isSpineScenario(raw) ? raw : null;

  let spine: SpineView;
  if (scenario) {
    spine = mockSpine(scenario);
  } else {
    await ensureProduct(user.userId);
    spine = await loadSpine(user.userId);
  }

  const pending = spine.checkpoints.some(
    (c) =>
      c.latestSubmission?.status === "in_review" || c.latestSubmission?.status === "submitted",
  );

  return (
    <main className="sy-main">
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
