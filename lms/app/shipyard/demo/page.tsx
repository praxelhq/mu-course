import { notFound } from "next/navigation";
import { isTestLoginEnabled } from "@/lib/auth/test-login";
import { prisma } from "@/lib/db";
import { DEMO_PERSONAS } from "@/lib/shipyard/demo-personas";
import { DemoSwitcher } from "@/components/shipyard/demo-switcher";

export const dynamic = "force-dynamic";

// The demo cast, one click each.
//
// This page does not exist on a real deploy: `isTestLoginEnabled()` is false
// there, and a page that hands out sessions must not merely be hidden. The
// route returns a 404 rather than a 403 for the same reason the file route
// does — a 403 would confirm it is here.

export default async function ShipyardDemoPage() {
  if (!isTestLoginEnabled()) notFound();

  // A persona is only offered if the row is actually in this database, so a
  // reseed that reshuffles the buckets shows a dead name instead of a login
  // that 404s halfway through.
  const ids = DEMO_PERSONAS.map((p) => p.id);
  const present = new Set(
    (await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true } })).map(
      (u) => u.id,
    ),
  );

  const personas = DEMO_PERSONAS.map((p) => ({ ...p, present: present.has(p.id) }));
  const missing = personas.filter((p) => !p.present).length;

  return (
    <main className="sy-main">
      <header className="sy-shead">
        <div>
          <p className="sy-eyebrow">Test-login build</p>
          <h1 className="sy-display sy-shead__title">Pick somebody</h1>
          <p className="sy-shead__line">
            Ten seeded accounts, one per state the Shipyard can be in. Choosing one
            replaces your session; come back here to change again. This page is not
            served on a real deploy.
          </p>
          {missing > 0 && (
            <p className="sy-shead__warn">
              {missing} of these accounts are not in this database. Run
              <span className="sy-mono"> pnpm seed</span> against the local
              Postgres.
            </p>
          )}
        </div>
      </header>

      <DemoSwitcher personas={personas} />
    </main>
  );
}
