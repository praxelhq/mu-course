import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isTestLoginEnabled } from "@/lib/auth/test-login";
import { ensureProduct } from "@/lib/shipyard/products";
import { loadSpine } from "@/lib/shipyard/spine";
import { isSpineScenario, mockSpine } from "@/lib/shipyard/spine-mock";
import type { SpineView } from "@/lib/shipyard/view-models";
import { GradeLine } from "@/components/shipyard/grade-line";
import { pad2 } from "@/components/shipyard/format";

export const dynamic = "force-dynamic";

// The grade line alone. Same numbers as the spine, more room to read them.

export default async function ShipyardGradePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect(isTestLoginEnabled() ? "/shipyard/demo" : "/sign-in");
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
  const cleared = spine.checkpoints.filter((c) => c.state === "passed").length;

  return (
    <main className="sy-main">
      <header className="sy-header">
        <div>
          <p className="sy-eyebrow">Course 2 · your grade</p>
          <h1 className="sy-display sy-header__name">
            Four components, <em>one</em> condition
          </h1>
          <p className="sy-header__line">
            Grades stay inside this portal. What leaves it, if anything ever does,
            is artefacts and badges — never a number.
          </p>
        </div>
        <div className="sy-progress">
          <p className="sy-eyebrow">Checkpoints cleared</p>
          <p className="sy-progress__count">
            <span className="sy-progress__cleared">{pad2(cleared)}</span>
            <span className="sy-progress__of">/{pad2(spine.checkpoints.length)}</span>
          </p>
        </div>
      </header>

      <div style={{ maxWidth: "48rem" }}>
        <GradeLine grade={spine.grade} standalone />
      </div>
    </main>
  );
}
