import { Studio } from "@/components/shipyard/studio/studio";
import { hasClerkKeys } from "@/lib/auth/clerk";
export const dynamic = "force-dynamic";
export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  return (
    <Studio
      clerkAvailable={hasClerkKeys()}
      inviteToken={(await searchParams).token}
    />
  );
}
