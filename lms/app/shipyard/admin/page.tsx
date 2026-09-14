import { redirect } from "next/navigation";
import { AuthError, requireRole } from "@/lib/auth";
import { resolveTrackerMode } from "@/lib/tracker/client";
import { FakeTrackerForm } from "@/components/shipyard/fake-tracker-form";

export const dynamic = "force-dynamic";

// The admin bench. Two of the three cards are honest placeholders: the
// checkpoint editor and the routing/cost console are M4's, and saying so
// quietly is better than a disabled button that implies it nearly works.
//
// The third is real, because the demo needs it: the fake tracker is the only
// way to show a metric gate moving without a live payment provider. It is not
// rendered at all when TRACKER_MODE=real — the route refuses to write in that
// mode, by design, so a metric gate an admin could clear by hand would not be a
// metric gate.

export default async function ShipyardAdminPage() {
  try {
    await requireRole("admin");
  } catch (e) {
    if (e instanceof AuthError) redirect(e.status === 401 ? "/sign-in" : "/shipyard");
    throw e;
  }

  const fakeTracker = resolveTrackerMode() !== "real";

  return (
    <main className="sy-main">
      <header className="sy-shead">
        <div>
          <p className="sy-eyebrow">Course 2 · admin</p>
          <h1 className="sy-display sy-shead__title">The bench</h1>
          <p className="sy-shead__line">
            Everything that changes how the course runs rather than how one
            student is doing.
          </p>
        </div>
      </header>

      <div className="sy-cards">
        <section className="sy-card">
          <h2 className="sy-title sy-card__head">Checkpoints</h2>
          <p className="sy-card__body">
            Bars, rubrics, deadlines, cooldowns, and which tracker signal gates
            which checkpoint — all of it row edits, never a deploy. The editor
            lands with M4; until then the six are seeded from
            <span className="sy-mono"> lib/shipyard/checkpoints.ts</span>.
          </p>
          <p className="sy-card__tag">M4</p>
        </section>

        <section className="sy-card">
          <h2 className="sy-title sy-card__head">Routing &amp; cost</h2>
          <p className="sy-card__body">
            The model routing profile, the BYOK kill-switch and its manual
            override, and a live meter of spend by model and by checkpoint. The
            numbers are already recorded on every review row; this is the screen
            that reads them, and it lands with M4.
          </p>
          <p className="sy-card__tag">M4</p>
        </section>

        <section className="sy-card">
          <h2 className="sy-title sy-card__head">Tracker</h2>
          {fakeTracker ? (
            <>
              <p className="sy-card__body">
                Fake mode. Write a student&rsquo;s Shipped.money signals by hand and
                watch their spine move. Every write is audit-logged under your
                name.
              </p>
              <FakeTrackerForm />
            </>
          ) : (
            <>
              <p className="sy-card__body">
                <span className="sy-mono">TRACKER_MODE=real</span>. Signals come
                from Shipped.money&rsquo;s Verified tier and nothing in this portal
                can write them — which is the whole reason a metric gate is worth
                anything.
              </p>
              <p className="sy-card__tag">Live</p>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
