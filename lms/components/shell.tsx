import type { ReactNode } from "react";
import Link from "next/link";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { hasClerkKeys } from "@/lib/auth/clerk";
import { AccountSignOutButton } from "./account-sign-out-button";
import { ShellNav, type NavLink } from "./shell-nav";

// App chrome for authenticated pages (docs/BRAND.md): Parchment surfaces,
// 1px Sand borders, zero radius, no shadows. The active nav link (in
// ShellNav) is the single Ochre accent per view; everything else stays
// Ink/Charcoal/Clay.

const STUDENT_LINKS: NavLink[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Sessions", href: "/sessions" },
  { label: "RAG Lab", href: "/tools/rag" },
  { label: "Data Race", href: "/data-race" },
  { label: "Assignments", href: "/assignments" },
  { label: "Quizzes", href: "/quizzes" },
  { label: "Galleries", href: "/galleries" },
  { label: "Interview", href: "/interview" },
  { label: "Peer Review", href: "/peer-review" },
  { label: "Grades", href: "/grades" },
  { label: "Portfolio", href: "/portfolio" },
];

const INSTRUCTOR_LINKS: NavLink[] = [
  { label: "Dashboard", href: "/instructor" },
  { label: "Session 8", href: "/instructor/session-8" },
  // Live class surface: participation, marks, votes and the reveal toggles.
  { label: "Session 2", href: "/instructor/session2" },
  { label: "Data Race", href: "/instructor/data-race" },
  { label: "Unlock Console", href: "/instructor/unlocks" },
  { label: "Quizzes", href: "/instructor/quizzes" },
  { label: "Materials", href: "/instructor/materials" },
  { label: "Matrix", href: "/instructor/matrix" },
  { label: "Galleries", href: "/instructor/galleries" },
  { label: "Review Queue", href: "/instructor/review" },
  { label: "Interviews", href: "/instructor/interviews" },
  { label: "Peer", href: "/instructor/peer" },
  { label: "Validations", href: "/instructor/validations" },
  { label: "Exports", href: "/instructor/exports" },
];

const ADMIN_LINKS: NavLink[] = [
  { label: "Dashboard", href: "/admin" },
  ...INSTRUCTOR_LINKS.slice(1),
  { label: "Roster", href: "/admin/roster" },
  { label: "Types", href: "/admin/types" },
  { label: "Costs", href: "/admin/costs" },
  { label: "DPDP", href: "/admin/dpdp" },
];

const LINKS_BY_ROLE: Record<Role, NavLink[]> = {
  student: STUDENT_LINKS,
  instructor: INSTRUCTOR_LINKS,
  admin: ADMIN_LINKS,
};

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

export async function Shell({
  user,
  children,
}: {
  user: SessionUser;
  children: ReactNode;
}) {
  const [me, unread] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.userId },
      select: { name: true, section: { select: { code: true } } },
    }),
    prisma.notification.count({ where: { userId: user.userId, readAt: null } }),
  ]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--parchment)" }}>
      <header style={{ borderBottom: "1px solid var(--sand)" }}>
        <div
          style={{
            maxWidth: "72rem",
            margin: "0 auto",
            padding: "1rem 2rem",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
          }}
        >
          <Link href="/" style={{ textDecoration: "none", color: "var(--ink)" }}>
            <span style={{ ...mono, display: "block", fontSize: "0.625rem", color: "var(--clay)" }}>
              The Forge
            </span>
            <span
              style={{
                fontFamily: "var(--font-fraunces)",
                fontWeight: 700,
                fontSize: "1.375rem",
                lineHeight: 1.2,
              }}
            >
              Praxel
            </span>
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span style={{ fontSize: "0.9375rem", color: "var(--ink)" }}>
              {me?.name ?? user.email}
            </span>
            {me?.section && (
              <span
                style={{
                  ...mono,
                  fontSize: "0.6875rem",
                  color: "var(--charcoal)",
                  border: "1px solid var(--sand)",
                  padding: "0.125rem 0.5rem",
                }}
              >
                Sec {me.section.code}
              </span>
            )}
            {/* Notification badge — unread count, opens the U10 list. */}
            <Link
              href="/notifications"
              title={`${unread} unread notification${unread === 1 ? "" : "s"}`}
              style={{
                ...mono,
                fontSize: "0.6875rem",
                textDecoration: "none",
                color: unread > 0 ? "var(--pine)" : "var(--clay)",
                border: "1px solid var(--sand)",
                padding: "0.125rem 0.5rem",
              }}
            >
              Ntf {unread}
            </Link>
            {hasClerkKeys() && <AccountSignOutButton />}
          </div>
        </div>
        <ShellNav links={LINKS_BY_ROLE[user.role]} />
      </header>
      {children}
    </div>
  );
}
