import { withAuth } from "@/lib/auth";
import { resolveMany } from "@/lib/gates";

// Gate snapshot for live propagation (short-poll, see docs/DECISIONS.md).
// GET /api/gates/state?sectionId=sec_A&ifVersion=<hash>
//   students   → always their own section; naming any other section is 403.
//   instructor/admin → any section, or all sections when sectionId is omitted.
// Response: { version, gates: [{ targetType, targetId, sectionId, state }] }
// where state is the EFFECTIVE state (opensAt applied). When ifVersion matches
// the current hash the response is just { unchanged: true, version } so 4s
// polls stay cheap.

export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, { user }) => {
  const url = new URL(req.url);
  const requested = url.searchParams.get("sectionId");
  const ifVersion = url.searchParams.get("ifVersion");

  let sectionId: string | null;
  if (user.role === "student") {
    if (requested && requested !== user.sectionId) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!user.sectionId) return Response.json({ version: "none", gates: [] });
    sectionId = user.sectionId;
  } else {
    sectionId = requested; // null = all sections (Unlock Console)
  }

  const { version, rows } = await resolveMany(sectionId);
  if (ifVersion && ifVersion === version) {
    return Response.json({ unchanged: true, version });
  }
  return Response.json({ version, gates: rows });
});
