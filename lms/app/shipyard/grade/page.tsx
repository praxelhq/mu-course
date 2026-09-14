import { isSpineScenario, mockSpine } from "@/lib/shipyard/spine-mock";
import { GradeLine } from "@/components/shipyard/grade-line";
import { pad2 } from "@/components/shipyard/format";

export const dynamic = "force-dynamic";

// The grade line alone. Same numbers as the spine, more room to read them.

export default async function ShipyardGradePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.scenario) ? params.scenario[0] : params.scenario;
  const spine = mockSpine(isSpineScenario(raw) ? raw : "fresh");
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
