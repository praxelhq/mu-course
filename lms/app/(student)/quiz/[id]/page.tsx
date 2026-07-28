import { notFound, redirect } from "next/navigation";
import { AuthError, requireUser } from "@/lib/auth";
import { getArmedQuizForStudent } from "@/lib/quizzes";
import { Card, Eyebrow } from "@/components/ui";
import { QuizTakeForm } from "./take-form";

// The quiz taking page. All quiz data comes through the single student
// repository module (lib/quizzes). Every unavailable state renders the same
// small set of cards regardless of which quiz it is.

export const dynamic = "force-dynamic";

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

function StateCard({ heading, body }: { heading: string; body: string }) {
  return (
    <Card style={{ textAlign: "center", padding: "3rem 2rem", opacity: 0.85 }}>
      <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.75rem", color: "var(--charcoal)" }}>
        {heading}
      </h1>
      <p style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)", margin: 0 }}>{body}</p>
    </Card>
  );
}

export default async function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let userId: string;
  try {
    const user = await requireUser();
    if (user.role !== "student") redirect("/instructor/quizzes");
    userId = user.userId;
  } catch (e) {
    if (e instanceof AuthError) redirect("/sign-in");
    throw e;
  }

  const armed = await getArmedQuizForStudent(userId, id);
  if (armed.status === "not_available") notFound();

  return (
    <main style={{ maxWidth: "48rem", margin: "0 auto", padding: "3rem 2rem" }}>
      {armed.status === "ready" ? (
        <>
          <Eyebrow muted>Session {armed.quiz.sessionNo} · Quiz</Eyebrow>
          <h1 style={{ fontSize: "2rem", margin: "0 0 0.5rem" }}>{armed.quiz.title}</h1>
          <p style={{ color: "var(--charcoal)", margin: "0 0 2rem", lineHeight: 1.6 }}>
            {armed.quiz.questions.length} questions, one answer each. You get one attempt —
            your score and the correct answers appear as soon as you submit.
          </p>
          <QuizTakeForm quizId={armed.quiz.id} questions={armed.quiz.questions} />
        </>
      ) : armed.status === "attempted" ? (
        <StateCard
          heading="You have already submitted this quiz."
          body="Each quiz allows a single attempt. Your quiz record lives under Quizzes."
        />
      ) : (
        <StateCard
          heading="This quiz has closed."
          body="Quizzes run live in class and close when the instructor ends them."
        />
      )}
    </main>
  );
}
