import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { missingPrerequisites } from "@/lib/interview/prerequisites";
import { interviewOpen } from "@/lib/interview/rollout";
import { InterviewLiveLoader } from "./loader";
import styles from "./room.module.css";

// The interview itself, on its own screen.
//
// Everything that is not the conversation — window state, uploads, consent —
// happened on /interview. By the time a student is here they have consented
// and the only job left is to talk. The guards are re-checked server-side
// anyway: a link pasted straight into the address bar must not skip them.

export const dynamic = "force-dynamic";

export default async function InterviewLivePage() {
  const user = await requireUser();

  const [open, missing, live] = await Promise.all([
    interviewOpen(),
    missingPrerequisites(user.userId),
    prisma.interview.findFirst({
      where: { userId: user.userId, status: "live" },
      select: { id: true },
    }),
  ]);

  // A resumable interview outranks the gates: someone mid-interview must
  // always be able to get back into the room.
  if (!live) {
    if (!open || missing.length > 0) redirect("/interview");
  }

  return (
    <main className={styles.page}>
      <InterviewLiveLoader
        textMode={process.env.NEXT_PUBLIC_INTERVIEW_TEXT_MODE === "1"}
      />
      <noscript>
        <div style={{ padding: "2rem" }}>
          The interview needs JavaScript. <Link href="/interview">Go back</Link>.
        </div>
      </noscript>
    </main>
  );
}
