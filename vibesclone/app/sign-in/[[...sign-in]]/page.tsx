import { hasClerkKeys } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SignInPage(): Promise<React.ReactNode> {
  if (!hasClerkKeys()) return <main className="setup-message"><h1>Authentication setup required</h1><p>Add the Clerk publishable and secret keys to enable sign-in.</p></main>;
  const { SignIn } = await import("@clerk/nextjs");
  return <main className="auth-page"><SignIn /></main>;
}
