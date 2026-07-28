import { SignIn } from "@clerk/nextjs";
import DemoLogin from "./DemoLogin";
import { isTestLoginEnabled } from "@/lib/auth/test-login";

// Sign-in via Clerk's prebuilt component. Google-only sign-in is Clerk
// dashboard configuration (User & Authentication → Social connections →
// Google enabled, email/password and all other methods disabled) — the
// component then renders exactly one "Continue with Google" button.
// Off-roster Google accounts still authenticate with Clerk here, but the
// proxy roster gate bounces them to /not-on-roster before any page renders.

const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default function SignInPage() {
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
      <div style={{ textAlign: "center" }}>
        <p
          style={{
            fontFamily: "var(--font-geist-mono)",
            fontSize: "0.75rem",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--ochre)",
            marginBottom: "0.75rem",
          }}
        >
          Praxel LMS
        </p>
        <h1 style={{ fontSize: "2.5rem", lineHeight: 1.1, margin: 0 }}>The Forge</h1>
      </div>
      {clerkConfigured ? (
        <SignIn />
      ) : isTestLoginEnabled() ? (
        <DemoLogin />
      ) : (
        <p style={{ color: "var(--charcoal)", maxWidth: "28rem", textAlign: "center" }}>
          Clerk is not configured in this environment. Local dev uses the
          test-login flow (<code>POST /api/test-login</code>) instead.
        </p>
      )}
    </main>
  );
}
