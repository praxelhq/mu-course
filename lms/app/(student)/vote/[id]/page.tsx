import { notFound, redirect } from "next/navigation";
import { AuthError, requireUser } from "@/lib/auth";
import { getVoteGallery } from "@/lib/gallery-vote";
import { VoteWall } from "@/components/vote-wall";

// A voting gallery (one meme / AI-image assignment). Students see every
// section's wall but vote only their own; counts + leaderboard stay hidden
// until they unlock (>= threshold votes) AND the instructor reveals.

export const dynamic = "force-dynamic";

export default async function VotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let user: { userId: string; sectionId: string | null; role: string };
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof AuthError) redirect("/sign-in");
    throw e;
  }

  const gallery = await getVoteGallery(
    { id: user.userId, sectionId: user.sectionId, role: user.role },
    id,
  );
  if (!gallery) notFound();

  return <VoteWall gallery={gallery} />;
}
