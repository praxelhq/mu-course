"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The only client component in the shell: active-link detection needs
// usePathname. The active link is the view's single Ochre accent
// (docs/BRAND.md rule 3) — nothing else in the chrome uses Ochre.

export type NavLink = { label: string; href: string };

export function ShellNav({ links }: { links: NavLink[] }) {
  const pathname = usePathname() ?? "";
  // Longest matching href wins so /admin/roster lights up "Roster", not the
  // "/admin" dashboard link too — exactly one Ochre accent per view.
  const activeHref = links
    .filter((l) => pathname === l.href || pathname.startsWith(`${l.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav
      aria-label="Primary"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "0 1.75rem",
        borderTop: "1px solid var(--sand)",
        padding: "0 2rem",
        maxWidth: "72rem",
        margin: "0 auto",
      }}
    >
      {links.map((link) => {
        const active = link.href === activeHref;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            style={{
              fontFamily: "var(--font-geist-mono)",
              fontSize: "0.75rem",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              textDecoration: "none",
              color: active ? "var(--ochre)" : "var(--charcoal)",
              borderBottom: active
                ? "2px solid var(--ochre)"
                : "2px solid transparent",
              padding: "0.75rem 0",
            }}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
