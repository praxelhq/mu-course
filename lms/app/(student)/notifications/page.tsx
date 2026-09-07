import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, Eyebrow } from "@/components/ui";

// The notifications surface: every notification (unread first),
// mark-read per item and mark-all (plain form POSTs to the existing U4
// /api/notifications/read endpoint — scoped server-side to the session
// user). Grade notifications link to /grades (U15 builds that page).

export const dynamic = "force-dynamic";

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const readButton: React.CSSProperties = {
  ...mono,
  fontSize: "0.6875rem",
  background: "var(--parchment)",
  color: "var(--pine)",
  border: "1px solid var(--sand)",
  padding: "0.375rem 0.75rem",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

const GRADE_KINDS = new Set(["grade-ready", "grade-updated"]);

export default async function NotificationsPage() {
  let userId: string;
  try {
    userId = (await requireUser()).userId;
  } catch (e) {
    if (e instanceof AuthError) redirect("/sign-in");
    throw e;
  }

  const notifications = await prisma.notification.findMany({
    where: { userId },
    orderBy: [{ readAt: "asc" }, { createdAt: "desc" }],
  });
  const unreadCount = notifications.filter((n) => n.readAt === null).length;

  return (
    <main style={{ maxWidth: "56rem", margin: "0 auto", padding: "3rem 2rem" }}>
      <Eyebrow muted>Notifications</Eyebrow>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "1rem", margin: "0 0 2rem" }}>
        <h1 style={{ fontSize: "2rem", margin: 0 }}>
          {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
        </h1>
        {unreadCount > 0 && (
          <form method="post" action="/api/notifications/read" style={{ marginLeft: "auto" }}>
            <input type="hidden" name="redirectTo" value="/notifications" />
            <button type="submit" style={readButton}>
              Mark all read
            </button>
          </form>
        )}
      </div>

      <Card>
        {notifications.length === 0 ? (
          <p style={{ margin: 0, color: "var(--charcoal)" }}>
            Nothing here yet. Grade updates and course announcements land in this list.
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {notifications.map((n) => (
              <li
                key={n.id}
                style={{
                  display: "flex",
                  gap: "1rem",
                  alignItems: "flex-start",
                  borderBottom: "1px solid var(--sand)",
                  padding: "0.875rem 0",
                  opacity: n.readAt ? 0.6 : 1,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "baseline" }}>
                    <p style={{ margin: 0, fontWeight: n.readAt ? 400 : 600 }}>{n.title}</p>
                    <span style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)" }}>
                      {dateFmt.format(n.createdAt)}
                    </span>
                  </div>
                  {n.body && (
                    <p style={{ margin: "0.25rem 0 0", color: "var(--charcoal)", lineHeight: 1.5 }}>
                      {n.body}
                    </p>
                  )}
                  {GRADE_KINDS.has(n.kind) && (
                    <Link href="/grades" style={{ ...mono, fontSize: "0.6875rem", color: "var(--pine)" }}>
                      View grades →
                    </Link>
                  )}
                </div>
                {!n.readAt && (
                  <form method="post" action="/api/notifications/read">
                    <input type="hidden" name="id" value={n.id} />
                    <input type="hidden" name="redirectTo" value="/notifications" />
                    <button type="submit" style={readButton}>
                      Mark read
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
