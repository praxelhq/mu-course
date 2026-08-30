import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveGateDetail } from "@/lib/gates";
import { APP_REVIEW_ROUND_ID } from "@/lib/app-reviews/policy";
import { appReviewOverview } from "@/lib/app-reviews/service";
import { AppReviewControls } from "./controls";

export default async function InstructorAppReviewsPage() {
  await requireRole("instructor");
  const [data, sections] = await Promise.all([appReviewOverview(), prisma.section.findMany({ orderBy: { code: "asc" } })]);
  const gates = await Promise.all(sections.map(async (section) => ({ id: section.id, code: section.code,
    state: (await resolveGateDetail({ targetType: "app_review", targetId: APP_REVIEW_ROUND_ID, sectionId: section.id })).ownState })));
  const issues = data.reviews.filter((review) => review.accessIssue && !review.retiredAt && !review.completedAt);
  const complete = data.users.filter((user) => user.completed === 5).length;
  return <main style={{ maxWidth: "72rem", padding: "2rem", margin: "auto", lineHeight: 1.6 }}>
    <h1>Lovable app peer reviews</h1>
    <p>{complete} / {data.users.length} students have completed five reviews · {data.entries.length} app snapshots · {issues.length} unresolved access reports.</p>
    <p>This is separate from teammate contribution. No peer-review score weight or automatic grade-release restriction is applied.</p>
    <p><Link href="/api/exports/app-reviews?kind=completion">Completion CSV</Link>{" · "}<Link href="/api/exports/app-reviews?kind=scores">App score summary CSV</Link>{" · "}<Link href="/api/exports/app-reviews">All review evidence CSV</Link></p>
    <AppReviewControls sections={gates} issues={issues.map((review) => ({ id: review.id,
      reviewer: data.users.find((user) => user.id === review.reviewerId)?.name ?? "Student",
      appUrl: data.entries.find((entry) => entry.id === review.entryId)?.appUrl ?? "",
      comment: review.accessIssue!, slot: review.slot }))} />
    <h2>Every student</h2><p>Students without their own app submission must still complete five reviews. Blank-section accounts require roster correction. Blocked assignments require resolving a roster change or completing the existing privacy workflow; do not bypass privacy fences or delete evidence to free a slot.</p>
    <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
      <thead><tr>{["Student", "Section", "Assigned", "Completed", "Blocked", "Requirement"].map((label) => <th key={label} style={{ padding: ".5rem", borderBottom: "1px solid var(--sand)" }}>{label}</th>)}</tr></thead>
      <tbody>{data.users.map((user) => <tr key={user.id}><td style={{ padding: ".5rem" }}>{user.name}<br /><small>{user.email}</small></td><td>{user.section?.code ?? "Missing"}</td><td>{user.assigned}/5</td><td>{user.completed}/5</td><td>{user.blocked}</td><td>{user.blocked ? "Needs instructor action" : user.completed === 5 ? "Complete" : "Outstanding"}</td></tr>)}</tbody>
    </table></div>
  </main>;
}
