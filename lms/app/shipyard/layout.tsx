import type { ReactNode } from "react";
import { IBM_Plex_Mono, Instrument_Sans, Instrument_Serif } from "next/font/google";
import { getSessionUser } from "@/lib/auth";
import { ShipyardShell } from "@/components/shipyard/shipyard-shell";
import "@/components/shipyard/shipyard.css";

export const dynamic = "force-dynamic";

// Shell for Course 2. Same session as the Forge (Clerk, roster gated in
// proxy.ts) — deliberately WITHOUT the Forge's /welcome redirect: that cookie
// belongs to Course 1's onboarding and a Course 2 student who has never opened
// the Forge should not be bounced through it.
//
// The layout resolves the session but does NOT enforce it. One page under
// /shipyard is reachable without one — the demo persona picker on a test-login
// build — and a layout that redirects would make that page redirect to itself.
// Every page that needs a session says so: the spine and the grade line send a
// signed-out visitor to sign-in, and everything under /instructor and /admin
// goes through requireRole.
//
// The Shipyard follows the Shipped.money brand, not the Forge's. Its three
// typefaces are loaded here rather than in the root layout so Course 1 never
// pays for them; next/font self-hosts all three at build time (no runtime CDN
// request, which is the same constraint the Forge kept). The variables are
// applied to the `.sy-root` wrapper, which also paints the #f7f9f8 workspace
// over the Parchment the root layout puts on <body>.

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-instrument-sans",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-instrument-serif",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-plex-mono",
});

const FONT_VARS = `${instrumentSans.variable} ${instrumentSerif.variable} ${plexMono.variable}`;

export const metadata = {
  title: "The Shipyard · Praxel",
  description: "Shape an idea. Build something useful. Get your first customer.",
};

export default async function ShipyardLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();

  return (
    <ShipyardShell user={user} fontClassName={FONT_VARS}>
      {children}
    </ShipyardShell>
  );
}
