import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError, requireUser } from "@/lib/auth";
import { getSessionsIndex } from "@/lib/materials";
import { Card, Eyebrow } from "@/components/ui";
import { GatePollMount } from "@/components/gate-poll-mount";

// Sessions index: ten cards. Locked sessions are title-only with a lock mark
// — no summaries or counts leak. Availability comes from one resolveMany
// snapshot inside getSessionsIndex; the gate poll keeps it live in class.

export const dynamic = "force-dynamic";

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

export default async function SessionsIndexPage() {
  let userId: string, sectionId: string | null;
  try {
    const user = await requireUser();
    userId = user.userId;
    sectionId = user.sectionId;
  } catch (e) {
    if (e instanceof AuthError) redirect("/sign-in");
    throw e;
  }
  const index = await getSessionsIndex(userId);

  return (
    <main style={{ maxWidth: "72rem", margin: "0 auto", padding: "3rem 2rem" }}>
      <GatePollMount sectionId={sectionId ?? undefined} />
      <Eyebrow muted>Sessions</Eyebrow>
      <h1 style={{ fontSize: "2.25rem", margin: "0 0 0.5rem" }}>The ten sessions</h1>
      <p style={{ color: "var(--charcoal)", margin: "0 0 2rem", lineHeight: 1.6 }}>
        Everything for class lives inside its session. Locked sessions open in the room.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(20rem, 1fr))",
          gap: "1.5rem",
        }}
      >
        {index.sessions.map((s) =>
          s.locked ? (
            <Card key={s.id} style={{ opacity: 0.65 }}>
              <p style={{ ...mono, fontSize: "0.6875rem", color: "var(--clay)", margin: "0 0 0.5rem" }}>
                Session {s.sessionNo} · Locked
              </p>
              <h2 style={{ fontSize: "1.125rem", margin: 0, color: "var(--charcoal)" }}>
                {s.title}
              </h2>
              <p style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)", margin: "0.75rem 0 0" }}>
                Opens in class
              </p>
            </Card>
          ) : (
            <Link
              key={s.id}
              href={`/sessions/${s.sessionNo}`}
              style={{ textDecoration: "none", color: "inherit", display: "block" }}
            >
              <Card style={{ height: "100%" }}>
                <p style={{ ...mono, fontSize: "0.6875rem", color: "var(--pine)", margin: "0 0 0.5rem" }}>
                  Session {s.sessionNo} · Open
                </p>
                <h2 style={{ fontSize: "1.125rem", margin: "0 0 0.5rem" }}>{s.title}</h2>
                <p style={{ color: "var(--charcoal)", margin: "0 0 0.75rem", lineHeight: 1.55, fontSize: "0.9375rem" }}>
                  {s.summaryMd.replace(/\*\*/g, "")}
                </p>
                <p style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)", margin: 0 }}>
                  {s.counts.materials} material{s.counts.materials === 1 ? "" : "s"}
                  {" · "}
                  {s.counts.assignments} assignment{s.counts.assignments === 1 ? "" : "s"}
                  {" · "}
                  {s.counts.quizzes} quiz{s.counts.quizzes === 1 ? "" : "zes"}
                </p>
              </Card>
            </Link>
          ),
        )}
      </div>
    </main>
  );
}
