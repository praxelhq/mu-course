import type { ReactNode } from "react";
import Link from "next/link";
import type { SessionUser } from "@/lib/auth";
import { isTestLoginEnabled } from "@/lib/auth/test-login";
import { hasClerkKeys } from "@/lib/auth/clerk";
import { ShipyardNav, type NavItem } from "./shipyard-nav";

// Shipyard chrome. One slim rule across the top and nothing else: no second
// nav row, no breadcrumb, no notification bell. The page underneath says where
// you are; the bar only has to say which building you are in and how to leave.
//
// `.sy-root` is the brand boundary: it carries the Shipped.money font
// variables (loaded in app/shipyard/layout.tsx), paints the workspace over the
// Forge's Parchment body, and is the one subtree app/globals.css exempts from
// its `border-radius: 0` rule.

const STUDENT_NAV: NavItem[] = [
  { label: "Workspace", href: "/shipyard" },
  { label: "Previous work", href: "/shipyard/history" },
  { label: "Grade", href: "/shipyard/grade" },
];

const STAFF_NAV: NavItem[] = [
  { label: "Workspace", href: "/shipyard" },
  { label: "Appeals", href: "/shipyard/reviews" },
  { label: "Sections", href: "/shipyard/instructor" },
  { label: "Queue", href: "/shipyard/instructor/queue" },
  { label: "Admin", href: "/shipyard/admin" },
];

export function ShipyardShell({
  user,
  fontClassName,
  children,
}: {
  /** Null on the one page under /shipyard that does not need a session. */
  user: SessionUser | null;
  /** next/font variable classes for Instrument Sans / Serif and Plex Mono. */
  fontClassName: string;
  children: ReactNode;
}) {
  // Staff do not get the student spine in their nav: /shipyard redirects them
  // to the matrix, and a link that bounces is worse than no link. Signed out,
  // the bar carries the wordmark and the way in, and nothing else.
  const staff = user?.role === "instructor" || user?.role === "admin";
  const items = user === null ? [] : staff ? STAFF_NAV : STUDENT_NAV;

  return (
    <div className={`sy-root ${fontClassName}`}>
      <header className="sy-topbar">
        <div className="sy-topbar__inner">
          <Link href="/shipyard" className="sy-wordmark">
            <span className="sy-wordmark__eyebrow">Praxel · Course 2</span>
            <span className="sy-wordmark__name">Shipyard</span>
          </Link>
          <ShipyardNav
            items={items}
            clerkAvailable={hasClerkKeys()}
            demoPersonas={isTestLoginEnabled()}
            signedIn={user !== null}
          />
        </div>
      </header>
      {children}
    </div>
  );
}
