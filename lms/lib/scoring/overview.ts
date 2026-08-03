import { prisma } from "@/lib/db";
import { combinePci, nearIdenticalFlag, pciForCheckpoint } from "./pci";

// Instructor-facing peer-review overview: per-team checkpoint
// completion, the PCI table, and the §5 near-identical safeguard flag
// (surfaced only — never auto-resolved). Also feeds the peer CSV export.

export type MemberPci = {
  userId: string;
  name: string;
  cp1: number | null;
  cp2: number | null;
  /** Combined 40/60, clipped — 1.0 when pending. */
  pci: number;
  pending: boolean;
};

export type TeamPeerOverview = {
  teamId: string;
  teamName: string;
  sectionCode: string;
  teamSize: number;
  /** Reviewers who submitted, per checkpoint. */
  submitted: { cp1: number; cp2: number };
  nearIdentical: { cp1: boolean; cp2: boolean };
  members: MemberPci[];
};

export async function getPeerOverview(): Promise<TeamPeerOverview[]> {
  const [teams, reviews] = await Promise.all([
    prisma.team.findMany({
      select: {
        id: true,
        name: true,
        section: { select: { code: true } },
        members: { select: { id: true, name: true }, orderBy: { id: "asc" } },
      },
      orderBy: { id: "asc" },
    }),
    prisma.peerReview.findMany({
      select: {
        checkpoint: true,
        reviewerId: true,
        revieweeId: true,
        pointsAllocated: true,
      },
    }),
  ]);

  const byReviewer = new Map<string, { checkpoint: number; revieweeId: string; points: number }[]>();
  for (const r of reviews) {
    const list = byReviewer.get(r.reviewerId) ?? [];
    list.push({ checkpoint: r.checkpoint, revieweeId: r.revieweeId, points: r.pointsAllocated });
    byReviewer.set(r.reviewerId, list);
  }

  return teams.map((team) => {
    const memberIds = new Set(team.members.map((m) => m.id));
    const teamSize = team.members.length;

    const perCheckpoint = (cp: number) => {
      // Allocation vectors per reviewer (only this team's members count).
      const allocations: number[][] = [];
      let submitted = 0;
      const received = new Map<string, number>();
      for (const member of team.members) {
        const given = (byReviewer.get(member.id) ?? []).filter(
          (r) => r.checkpoint === cp && memberIds.has(r.revieweeId),
        );
        if (given.length === 0) continue;
        submitted += 1;
        allocations.push(given.map((g) => g.points));
        for (const g of given) received.set(g.revieweeId, (received.get(g.revieweeId) ?? 0) + g.points);
      }
      return { submitted, allocations, received };
    };

    const cp1 = perCheckpoint(1);
    const cp2 = perCheckpoint(2);

    const members: MemberPci[] = team.members.map((m) => {
      const cp1Pci =
        cp1.received.has(m.id) && teamSize >= 2
          ? pciForCheckpoint({ pointsReceived: cp1.received.get(m.id)!, teamSize })
          : null;
      const cp2Pci =
        cp2.received.has(m.id) && teamSize >= 2
          ? pciForCheckpoint({ pointsReceived: cp2.received.get(m.id)!, teamSize })
          : null;
      const combined = combinePci({ cp1: cp1Pci, cp2: cp2Pci });
      return {
        userId: m.id,
        name: m.name,
        cp1: cp1Pci,
        cp2: cp2Pci,
        pci: combined.pci,
        pending: combined.pending,
      };
    });

    return {
      teamId: team.id,
      teamName: team.name,
      sectionCode: team.section.code,
      teamSize,
      submitted: { cp1: cp1.submitted, cp2: cp2.submitted },
      nearIdentical: {
        cp1: nearIdenticalFlag(cp1.allocations),
        cp2: nearIdenticalFlag(cp2.allocations),
      },
      members,
    };
  });
}
