import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getStudentAppReviews } from "@/lib/app-reviews/service";
import { AppReviews } from "./review-form";

export default async function AppReviewPage() {
  const user = await requireUser();
  if (user.role !== "student") redirect("/instructor/app-reviews");
  if (!user.sectionId) return <main style={{ padding: "2rem" }}><h1>App peer review</h1><p>Ask your instructor to add your account to a section before reviewing.</p></main>;
  return <AppReviews initial={await getStudentAppReviews(user)} />;
}
