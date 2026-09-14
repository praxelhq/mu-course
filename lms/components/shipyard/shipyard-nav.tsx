"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";

export type NavItem = { label: string; href: string };

// The nav is the one client island in the chrome: it needs the pathname to
// mark where you are, and nothing else in the bar re-renders.

export function ShipyardNav({
  items,
  clerkAvailable,
  demoPersonas = false,
  signedIn = true,
}: {
  items: NavItem[];
  clerkAvailable: boolean;
  /**
   * Test-login builds (local dev, the demo stack) have no Clerk session to end
   * — signing out would just bounce you back in as the same cookie. What the
   * person at the keyboard actually wants there is a different persona.
   */
  demoPersonas?: boolean;
  /** False on the signed-out demo picker: there is nothing to sign out of. */
  signedIn?: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav className="sy-nav" aria-label="Shipyard">
      {items.map((item) => {
        const current =
          item.href === "/shipyard" ? pathname === "/shipyard" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={current ? "sy-nav__link sy-nav__link--current" : "sy-nav__link"}
            aria-current={current ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
      {items.length > 0 && <span className="sy-nav__sep" aria-hidden="true" />}
      {signedIn && (
        <Link href="/dashboard" className="sy-nav__link sy-nav__link--away">
          The Forge
        </Link>
      )}
      {/* The Forge's AccountSignOutButton is styled in Praxel tokens inline, so
          the Shipyard wires Clerk's primitive to its own control instead. */}
      {demoPersonas ? (
        <Link href="/shipyard/demo" className="sy-nav__link sy-nav__link--away">
          {signedIn ? "Switch persona" : "Pick a persona"}
        </Link>
      ) : !signedIn ? (
        <Link href="/sign-in" className="sy-nav__link sy-nav__link--away">
          Sign in
        </Link>
      ) : clerkAvailable ? (
        <SignOutButton redirectUrl="/sign-in">
          <button type="button" className="sy-nav__link sy-nav__link--away">
            Sign out
          </button>
        </SignOutButton>
      ) : (
        <Link href="/sign-in" className="sy-nav__link sy-nav__link--away">
          Sign out
        </Link>
      )}
    </nav>
  );
}
