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
}: {
  items: NavItem[];
  clerkAvailable: boolean;
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
      <span className="sy-nav__sep" aria-hidden="true" />
      <Link href="/dashboard" className="sy-nav__link sy-nav__link--away">
        The Forge
      </Link>
      {/* The Forge's AccountSignOutButton is styled in Praxel tokens inline, so
          the Shipyard wires Clerk's primitive to its own control instead. */}
      {clerkAvailable ? (
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
