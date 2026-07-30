import { getSessionIdentity, hasClerkKeys } from "@/lib/auth";
import { Workspace } from "@/components/workspace";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function WorkspacePage(): Promise<React.ReactNode> {
  const identity = await getSessionIdentity();
  if (!identity) {
    return <main className="setup-message"><h1>{hasClerkKeys() ? "Sign in to build" : "Production activation pending"}</h1><p>{hasClerkKeys() ? "Your projects and approvals are private to your account." : "The marketing site is live. Add Clerk keys to activate protected workspaces."}</p><Link className="button primary" href="/sign-in">{hasClerkKeys() ? "Continue to sign in" : "View setup state"}</Link></main>;
  }
  return <Workspace />;
}
