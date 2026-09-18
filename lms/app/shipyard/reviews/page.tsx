import { Studio } from "@/components/shipyard/studio/studio";
import { hasClerkKeys } from "@/lib/auth/clerk";
export const dynamic = "force-dynamic";
export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string; appeal?: string }>;
}) {
  const params = await searchParams;
  return (
    <Studio
      clerkAvailable={hasClerkKeys()}
      instructor
      workspaceId={params.workspace}
      focusAppeal={params.appeal}
    />
  );
}
