import Link from "next/link";
import { SignUpPanel } from "./sign-up-panel";

export default function SignUpPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "4rem 2rem",
        gap: "2rem",
      }}
    >
      <Link
        href="/shipyard"
        style={{ color: "var(--pine)", fontFamily: "var(--font-fraunces)", fontSize: "2rem", textDecoration: "none" }}
      >
        Praxel · Shipyard
      </Link>
      {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
        <SignUpPanel />
      ) : (
        <p>Sign-up is not configured in this environment.</p>
      )}
    </main>
  );
}
