import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, Eyebrow } from "@/components/ui";
import { buildInterviewResult } from "@/lib/interview/result";
import { InterviewResult } from "./result-client";

// The student's own result. Reachable straight from the closing screen, so a
// student sees their score and the grader's reasoning as soon as the queue has
// finished — usually under a minute after hanging up.

export const dynamic = "force-dynamic";

export default async function InterviewResultPage() {
  const user = await requireUser();
  const [profile, interview] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.userId }, select: { name: true } }),
    prisma.interview.findFirst({
      where: { userId: user.userId },
      orderBy: { createdAt: "desc" },
      select: { status: true, rubricScores: true, completedAt: true },
    }),
  ]);

  const initial = buildInterviewResult(interview);

  return (
    <main style={{ maxWidth: "44rem", margin: "0 auto", padding: "2rem 1.5rem 4rem" }}>
      <Eyebrow>AI readiness interview</Eyebrow>
      <h1
        style={{
          fontFamily: "var(--font-fraunces)",
          fontSize: "clamp(1.75rem,4vw,2.5rem)",
          lineHeight: 1.1,
          margin: "0.75rem 0 1.5rem",
        }}
      >
        Your result
      </h1>

      {initial.state === "none" ? (
        <Card>
          <p style={{ margin: 0 }}>
            You have not taken the interview yet.{" "}
            <Link href="/interview" style={{ color: "var(--pine)" }}>
              Go to the interview
            </Link>
            .
          </p>
        </Card>
      ) : (
        <InterviewResult initial={initial} studentName={profile?.name ?? user.email} />
      )}
    </main>
  );
}
