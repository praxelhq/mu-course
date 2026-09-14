import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError, requireRole } from "@/lib/auth";
import { isTestLoginEnabled } from "@/lib/auth/test-login";
import { resolveTrackerMode } from "@/lib/tracker/client";
import { METRIC_SIGNAL_NAMES } from "@/lib/tracker/types";
import { listCheckpoints } from "@/lib/shipyard/checkpoint-admin";
import { listSections } from "@/lib/shipyard/instructor";
import { loadCostMeter, type CostBucket } from "@/lib/shipyard/review-costs";
import { listWeights } from "@/lib/shipyard/weights";
import { GRADE_COMPONENT_LABELS } from "@/lib/shipyard/grades";
import { FakeTrackerForm } from "@/components/shipyard/fake-tracker-form";
import { CostChart, formatUsd } from "@/components/shipyard/cost-chart";
import {
  FinaliseSection,
  RecomputeGrades,
  RouterControls,
  SimulateByokFailures,
  WeightsForm,
} from "@/components/shipyard/admin-controls";
import { CheckpointList, type CheckpointRow } from "@/components/shipyard/admin-checkpoints";
import { EmptyState } from "@/components/shipyard/empty-states";
import { formatDayTime } from "@/components/shipyard/format";

export const dynamic = "force-dynamic";

// The admin bench (SPEC §4): everything that changes how the course runs
// rather than how one student is doing.
//
// Five sections, and they are URL tabs rather than client state, for the same
// reason the section matrix is: an admin sends "look at this" as a link, and a
// bench that forgets which panel you were on when you save is a bench that
// makes you re-find your place after every write. It also means each tab loads
// only its own data — the cost meter is four aggregate queries and the
// checkpoint list is six rows, and neither should pay for the other.

const TABS = [
  ["routing", "Routing & cost"],
  ["checkpoints", "Checkpoints"],
  ["weights", "Weights"],
  ["grades", "Grades"],
  ["tracker", "Tracker"],
] as const;

type Tab = (typeof TABS)[number][0];

function isTab(v: string | undefined): v is Tab {
  return v !== undefined && TABS.some(([key]) => key === v);
}

export default async function ShipyardAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  try {
    await requireRole("admin");
  } catch (e) {
    if (e instanceof AuthError) redirect(e.status === 401 ? "/sign-in" : "/shipyard");
    throw e;
  }

  const params = await searchParams;
  const raw = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const tab: Tab = isTab(raw) ? raw : "routing";

  return (
    <main className="sy-main">
      <header className="sy-shead">
        <div>
          <p className="sy-eyebrow">Course 2 · admin</p>
          <h1 className="sy-display sy-shead__title">The bench</h1>
          <p className="sy-shead__line">
            Everything that changes how the course runs rather than how one student
            is doing. Every write here is audit-logged under your name.
          </p>
        </div>
      </header>

      <nav className="sy-tabs" aria-label="Admin sections">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={`/shipyard/admin?tab=${key}`}
            className={key === tab ? "sy-tab sy-tab--current" : "sy-tab"}
            aria-current={key === tab ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>

      {tab === "routing" && <RoutingAndCost />}
      {tab === "checkpoints" && <Checkpoints />}
      {tab === "weights" && <Weights />}
      {tab === "grades" && <Grades />}
      {tab === "tracker" && <Tracker />}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Routing & cost
// ---------------------------------------------------------------------------

async function RoutingAndCost() {
  const meter = await loadCostMeter();
  const { router } = meter;
  // The simulator refuses in production without a test-login build, so the
  // button is not offered where it would only ever return a 403.
  const canSimulate = isTestLoginEnabled() || process.env.NODE_ENV !== "production";

  return (
    <>
      {router.killSwitchActive && (
        <div className="sy-banner" role="alert">
          <p className="sy-banner__head">The BYOK kill-switch is thrown.</p>
          <p className="sy-banner__body">
            Five consecutive credit-or-auth failures on the Anthropic key
            {router.exhaustedAt ? ` at ${formatDayTime(router.exhaustedAt.toISOString())}` : ""}.
            Every task is on <span className="sy-mono">z-ai/glm-5.3-flash</span> until an
            admin resets it. No Haiku call will be attempted in the meantime.
          </p>
        </div>
      )}

      <section className="sy-section">
        <div className="sy-stats">
          <Stat label="Spend, 14 days" value={formatUsd(meter.totals.costUsd)} />
          <Stat label="Model calls" value={meter.totals.calls.toLocaleString("en-IN")} />
          <Stat
            label="Tokens in / out"
            value={`${compact(meter.totals.tokensIn)} / ${compact(meter.totals.tokensOut)}`}
          />
        </div>

        <CostChart days={meter.byDay} />
      </section>

      <div className="sy-cols sy-cols--even">
        <section className="sy-section">
          <h2 className="sy-title sy-section__head">Routing</h2>
          <RouterControls
            activeProfile={router.effectiveProfile}
            killSwitchActive={router.killSwitchActive}
            consecutiveByokFailures={router.consecutiveByokFailures}
            threshold={5}
          />

          <p className="sy-eyebrow sy-section__sub">The table</p>
          <table className="sy-table sy-table--flat">
            <thead>
              <tr>
                <th scope="col">Task</th>
                <th scope="col">Primary</th>
                <th scope="col">Fallback</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(router.routes).map(([task, models]) => (
                <tr key={task}>
                  <td>
                    <span className="sy-table__label">{task}</span>
                  </td>
                  <td className="sy-mono">{models[0]}</td>
                  <td className="sy-mono">{models[1]}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="sy-eyebrow sy-section__sub">List prices, per million tokens</p>
          <table className="sy-table sy-table--flat">
            <thead>
              <tr>
                <th scope="col">Model</th>
                <th scope="col" className="sy-n">
                  In / M
                </th>
                <th scope="col" className="sy-n">
                  Out / M
                </th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(router.prices).map(([model, price]) => (
                <tr key={model}>
                  <td className="sy-mono">{model}</td>
                  <td className="sy-n">${price.inPerMillion.toFixed(2)}</td>
                  <td className="sy-n">${price.outPerMillion.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {canSimulate && <SimulateByokFailures />}
        </section>

        <section className="sy-section">
          <h2 className="sy-title sy-section__head">Where it went</h2>
          {/* Two sources, and they answer different questions (DECISIONS,
              2026-09-15): model and feature are every CostLog row, including
              pre-flight and escalations that have no review of their own;
              by-checkpoint is the verdict spend recorded on the review itself,
              which is the only place the checkpoint dimension exists. They are
              not meant to add up to each other. */}
          <p className="sy-section__note">
            By model and by feature read <span className="sy-mono">CostLog</span>, which
            covers pre-flight and escalations too. By checkpoint reads the verdict cost
            stored on each review — the only place that dimension exists. The two do not
            add up to one another.
          </p>
          <Buckets head="By model" rows={meter.byModel} />
          <Buckets head="By feature" rows={meter.byFeature} />
          <Buckets head="By checkpoint" rows={meter.byCheckpoint} />
        </section>
      </div>

      <section className="sy-section">
        <h2 className="sy-title sy-section__head">Reviews</h2>
        <div className="sy-stats sy-stats--four">
          <Stat label="Waiting on a person" value={String(meter.reviews.needsHumanOpen)} />
          <Stat label="Passes held" value={String(meter.reviews.heldPasses)} />
          <Stat label="Disputed" value={String(meter.reviews.disputed)} />
          <Stat label="Mean confidence" value={meter.reviews.meanConfidence.toFixed(2)} />
        </div>
        <p className="sy-section__foot">
          {meter.reviews.total.toLocaleString("en-IN")} reviews · {meter.reviews.passed} passed ·{" "}
          {meter.reviews.returned} returned · {formatUsd(meter.reviews.verdictCostUsd)} on verdicts ·{" "}
          {meter.deadLetter.count === 0 ? (
            <>nothing in the dead-letter queue</>
          ) : (
            <>
              <b>{meter.deadLetter.count}</b> in the dead-letter queue (
              <span className="sy-mono">{meter.deadLetter.queue}</span>) ·{" "}
              <Link href="/shipyard/instructor/queue">open the review queue</Link>
            </>
          )}
        </p>
      </section>
    </>
  );
}

function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="sy-stat">
      <p className="sy-eyebrow">{label}</p>
      <p className="sy-stat__value">{value}</p>
    </div>
  );
}

function Buckets({ head, rows }: { head: string; rows: CostBucket[] }) {
  if (rows.length === 0) {
    return (
      <div className="sy-bucket">
        <p className="sy-eyebrow">{head}</p>
        <p className="sy-bucket__none">Nothing recorded yet.</p>
      </div>
    );
  }
  return (
    <div className="sy-bucket">
      <p className="sy-eyebrow">{head}</p>
      <table className="sy-table sy-table--flat">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td>
                <span className="sy-table__label">{r.label}</span>
              </td>
              <td className="sy-n sy-table__pending">{r.calls}</td>
              <td className="sy-n">{formatUsd(r.costUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Checkpoints
// ---------------------------------------------------------------------------

async function Checkpoints() {
  const rows = await listCheckpoints();
  const checkpoints: CheckpointRow[] = rows.map((r) => ({
    id: r.id,
    key: r.key,
    order: r.order,
    title: r.title,
    barMarkdown: r.barMarkdown,
    rubric: r.rubric,
    gateType: r.gateType,
    acceptsImages: r.acceptsImages,
    fieldSchema: r.fieldSchema,
    metricSignals: r.metricSignals,
    deadlineAt: r.deadlineAt ? r.deadlineAt.toISOString() : null,
    resubmitWindowHours: r.resubmitWindowHours,
    resubmitCooldownMinutes: r.resubmitCooldownMinutes,
    updatedAt: r.updatedAt.toISOString(),
  }));

  return (
    <section className="sy-section">
      <h2 className="sy-title sy-section__head">The six</h2>
      <p className="sy-section__note">
        Bars, rubrics, deadlines, cooldowns, and which tracker signal gates which
        checkpoint. Changing the gate or its signals re-decides every product on
        the course, and the save says how many it moved.
      </p>
      {checkpoints.length === 0 ? (
        <EmptyState head="No checkpoints are seeded">
          Run <span className="sy-mono">pnpm seed</span> to create the six rows this
          course is made of.
        </EmptyState>
      ) : (
        <CheckpointList
          checkpoints={checkpoints}
          knownSignals={[...METRIC_SIGNAL_NAMES]}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

async function Weights() {
  const versions = await listWeights();
  const active = versions.find((v) => v.active) ?? null;

  return (
    <div className="sy-cols sy-cols--even">
      <section className="sy-section">
        <h2 className="sy-title sy-section__head">
          Active · <span className="sy-mono">{active?.version ?? "none"}</span>
        </h2>
        {active ? (
          <table className="sy-table">
            <thead>
              <tr>
                <th scope="col">Component</th>
                <th scope="col" className="sy-n">
                  Weight
                </th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(active.weights).map(([key, value]) => (
                <tr key={key}>
                  <td>
                    <span className="sy-table__label">
                      {GRADE_COMPONENT_LABELS[key as keyof typeof GRADE_COMPONENT_LABELS] ?? key}
                    </span>
                    <span className="sy-table__source">{key}</span>
                  </td>
                  <td className="sy-n">{value}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>
                  <span className="sy-eyebrow">Total</span>
                </td>
                <td className="sy-n">
                  {Object.values(active.weights).reduce((a, b) => a + b, 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        ) : (
          <EmptyState head="No weights version is active">
            Grades fall back to the seeded 30 / 30 / 20 / 20 until one is.
          </EmptyState>
        )}

        {versions.length > 1 && (
          <div className="sy-bucket">
            <p className="sy-eyebrow">History</p>
            <table className="sy-table sy-table--flat">
              <tbody>
                {versions.map((v) => (
                  <tr key={v.id}>
                    <td className="sy-mono">{v.version}</td>
                    <td className="sy-table__pending">{formatDayTime(v.createdAt.toISOString())}</td>
                    <td className="sy-n sy-mono">
                      {v.weights.productQuality}/{v.weights.realNumbers}/{v.weights.workflow}/
                      {v.weights.distribution}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="sy-section">
        <WeightsForm
          current={
            active?.weights ?? {
              productQuality: 30,
              realNumbers: 30,
              workflow: 20,
              distribution: 20,
            }
          }
        />
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grades
// ---------------------------------------------------------------------------

async function Grades() {
  const sections = await listSections();
  return (
    <div className="sy-cols sy-cols--even">
      <section className="sy-section">
        <RecomputeGrades sections={sections} />
      </section>
      <section className="sy-section">
        <FinaliseSection sections={sections} />
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tracker
// ---------------------------------------------------------------------------

async function Tracker() {
  const fake = resolveTrackerMode() !== "real";
  return (
    <section className="sy-section sy-section--narrow">
      <h2 className="sy-title sy-section__head">Shipped.money</h2>
      {fake ? (
        <>
          <p className="sy-section__note">
            Fake mode. Write a student&rsquo;s Shipped.money signals by hand and watch
            their spine move. Every write is audit-logged under your name.
          </p>
          <FakeTrackerForm />
        </>
      ) : (
        <p className="sy-section__note">
          <span className="sy-mono">TRACKER_MODE=real</span>. Signals come from
          Shipped.money&rsquo;s Verified tier and nothing in this portal can write them
          — which is the whole reason a metric gate is worth anything.
        </p>
      )}
    </section>
  );
}
