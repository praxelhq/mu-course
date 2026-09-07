import Link from "next/link";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const ROLE_HOME: Record<Role, string> = {
  student: "/dashboard",
  instructor: "/instructor",
  admin: "/admin",
};

export default async function Home() {
  const user = await getSessionUser();
  if (user) redirect(ROLE_HOME[user.role]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "4rem 2rem",
        maxWidth: "48rem",
        margin: "0 auto",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-geist-mono)",
          fontSize: "0.75rem",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--ochre)",
          marginBottom: "1rem",
        }}
      >
        Praxel LMS
      </p>
      <h1
        style={{
          fontSize: "3.5rem",
          lineHeight: 1.1,
          margin: "0 0 1.5rem",
        }}
      >
        The Forge
      </h1>
      <hr style={{ margin: "0 0 1.5rem" }} />
      <p
        style={{
          fontSize: "1.125rem",
          lineHeight: 1.6,
          color: "var(--charcoal)",
          margin: "0 0 2rem",
        }}
      >
        Where the work gets made. One course, eight sections, and everything a
        student ships — assignments, interviews, quizzes, and the gallery —
        under one roof.
      </p>
      <p style={{ margin: 0 }}>
        <Link
          href="/sign-in"
          style={{
            display: "inline-block",
            background: "var(--pine)",
            color: "var(--cream)",
            border: "1px solid var(--pine)",
            padding: "0.625rem 1.5rem",
            textDecoration: "none",
            fontSize: "0.9375rem",
          }}
        >
          Sign in
        </Link>
      </p>
    </main>
  );
}
