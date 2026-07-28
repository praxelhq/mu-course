import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthError, requireUser } from "@/lib/auth";
import { Button, Eyebrow } from "@/components/ui";
import { WELCOME_COOKIE } from "@/lib/welcome";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Welcome · The Forge",
};

// Onboarding: the student hygiene note (docs/build/06_student_hygiene_note.md)
// rendered as a branded page. "Let's build" sets the forge_welcomed cookie
// and lands on the dashboard.

async function markWelcomed() {
  "use server";
  const store = await cookies();
  store.set(WELCOME_COOKIE, "1", {
    path: "/",
    maxAge: 60 * 60 * 24 * 400,
    sameSite: "lax",
    httpOnly: true,
  });
  redirect("/dashboard");
}

const p: React.CSSProperties = {
  fontSize: "1.0625rem",
  lineHeight: 1.7,
  color: "var(--ink)",
  margin: "0 0 1.25rem",
};

function Point({ lead, children }: { lead: string; children: React.ReactNode }) {
  return (
    <p style={p}>
      <strong>{lead}</strong> {children}
    </p>
  );
}

export default async function WelcomePage() {
  try {
    await requireUser();
  } catch (e) {
    if (e instanceof AuthError) redirect("/sign-in");
    throw e;
  }

  return (
    <main style={{ maxWidth: "70ch", margin: "0 auto", padding: "4rem 2rem" }}>
      <Eyebrow>Course 1 · AI for Business, The Operating Stack</Eyebrow>
      <h1 style={{ fontSize: "2.5rem", lineHeight: 1.15, margin: "0 0 1.5rem" }}>
        How this course actually runs, and why it matters more than it looks
        like it does
      </h1>
      <hr style={{ margin: "0 0 1.5rem" }} />

      <p style={p}>
        Statistically, nobody reads the section of a syllabus called
        &ldquo;expectations.&rdquo; You&rsquo;re already breaking the pattern.
        Keep going, it gets good, and then it gets serious, in that order.
      </p>
      <p style={p}>
        Here&rsquo;s the honest pitch. Nobody, including us, knows exactly what
        your job will look like in five years. Neither does that one LinkedIn
        post that sounded very sure of itself. The tools will have changed at
        least twice by then. What won&rsquo;t change is this: someone who can
        learn a new tool fast, direct it well, and catch it when it&rsquo;s
        confidently wrong, is useful in almost any room they walk into, in
        almost any function. Consulting, product, finance, ops, doesn&rsquo;t
        matter. That&rsquo;s not a skill most courses get to teach directly.
        This one does, because it&rsquo;s the entire point of it. Ten sessions
        from now, you should be someone who can be handed an unfamiliar problem
        in an unfamiliar industry and actually go build something real against
        it. That&rsquo;s a genuinely rare thing to be able to say about
        yourself at the start of a career.
      </p>
      <p style={p}>
        So put in the hours here. Do the reading before class, not on the ride
        over. This is the one where the effort compounds instead of
        evaporating the day after the exam.
      </p>
      <p style={p}>
        Now, the practical part, which we&rsquo;ll try to make less dry than
        that phrase suggests.
      </p>

      <h2 style={{ fontSize: "1.375rem", margin: "2rem 0 1rem" }}>
        The practical part
      </h2>

      <Point lead="This is a build course, not a lecture course.">
        Most of what you learn, you&rsquo;ll learn by doing it, in class, on
        real problems tied to a real company your team gets in touch with.
        Class time is build time. Whatever&rsquo;s assigned before a session
        has to be done before you walk in, not while you walk in.
      </Point>
      <Point lead="Come prepared, every session.">
        Each session has a short pre-read and, some weeks, an account you need
        to set up in advance. Do it before class. A room full of people
        creating accounts at the same time is not a good use of anyone&rsquo;s
        first ten minutes, least of all yours.
      </Point>
      <Point lead="You're representing more than yourself when you contact a company.">
        Your team will be reaching out to a real business to understand how
        they work and to build something for them. There&rsquo;s a tone that
        says &ldquo;student who needs this for a grade&rdquo; and a tone that
        says &ldquo;person who&rsquo;s actually going to be useful to talk
        to.&rdquo; Aim for the second one, every time. The company can tell
        the difference, and so, honestly, can we. If they go quiet after you
        reach out, that&rsquo;s not a personal referendum on your charm. Real
        businesses ghost real management consultants too. You&rsquo;re in good
        company.
      </Point>
      <Point lead="Using AI is the assignment, not a shortcut around it.">
        This course assumes you&rsquo;ll use AI constantly, for research,
        writing, data work, building, all of it. Expected, encouraged, graded
        on how well you do it. Worth knowing early: think of your AI tool as
        the most confident intern you&rsquo;ve ever worked with. It has read
        almost everything, forgotten none of it, and has somehow still never
        once said &ldquo;I&rsquo;m not sure.&rdquo; It will hand you a
        beautifully formatted answer with a fabricated statistic sitting
        inside it, delivered in exactly the same warm, certain tone it uses
        for a true one. Loving this intern is easy. Trusting it blindly is how
        you end up presenting a number nobody can find the source for, in
        front of the one person in the room who went looking. Your job is to
        be the one who checks. The one hard line: submitting AI output as your
        own understanding without having actually verified it, or claiming
        work you didn&rsquo;t meaningfully touch, isn&rsquo;t acceptable here
        any more than anywhere else. If you&rsquo;re unsure where that line
        sits in a specific case, ask before you submit, not after.
      </Point>
      <Point lead="Team work means real accountability to your team.">
        You&rsquo;ll work in a team of six to eight for the whole course, on
        one industry and one company. Every team has that one member who is
        excellent at scheduling meetings and quiet during them. Your teammates
        will notice, and so will the peer review. Show up, do your share, and
        say something the moment you&rsquo;re stuck, rather than letting a
        teammate discover it at the deadline.
      </Point>
      <Point lead="Expect short, unannounced quizzes through the term.">
        No pattern to guess, no safe week to coast through. Your best scores
        across the term count toward your grade, so one rough morning
        won&rsquo;t sink you. Consistently skipping the pre-reads will, and it
        tends to introduce itself at the worst possible moment.
      </Point>
      <Point lead="Everything you build becomes part of a public professional record.">
        Your work lands on your Praxy profile, a live, checkable portfolio
        that functions closer to a working resume than a grade sheet.
        Somewhere down the line, a recruiter will open it, decide in about
        four seconds whether you&rsquo;re worth a second look, and move on if
        you&rsquo;re not. Build for those four seconds. Assume someone will
        actually click the link, because someone will.
      </Point>
      <Point lead="If something's genuinely not working, tell us early.">
        A stuck team, a company contact gone quiet, a tool that won&rsquo;t
        cooperate: all normal, all fixable, all far easier to sort out in week
        three than week nine. Come talk to us before it becomes a story
        you&rsquo;re telling us in week ten instead.
      </Point>

      <p style={{ ...p, marginTop: "2rem" }}>
        A year from now, someone hands you a problem you&rsquo;ve never seen
        before, in an industry you&rsquo;ve never worked in, with an AI
        that&rsquo;s confident and occasionally wrong sitting right there
        waiting for instructions. The version of you that walks out of this
        course is the one who already knows what to do next. That&rsquo;s what
        these ten sessions are actually for, and it&rsquo;s worth every hour
        you put into them.
      </p>

      <hr style={{ margin: "2rem 0 1.5rem" }} />
      <form action={markWelcomed}>
        <Button type="submit">Let&rsquo;s build</Button>
      </form>
      <p
        style={{
          fontFamily: "var(--font-geist-mono)",
          fontSize: "0.6875rem",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--clay)",
          marginTop: "2rem",
        }}
      >
        Praxel · build@praxel.in · praxel.in
      </p>
    </main>
  );
}
