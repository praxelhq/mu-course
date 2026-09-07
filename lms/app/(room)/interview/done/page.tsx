import { redirect } from "next/navigation";

// The old closing screen. Finishing an interview now lands on the result
// itself — a thank-you page with a button to the score was one click of
// nothing. Kept as a redirect so a bookmarked or in-flight link still works.

export default function InterviewDonePage() {
  redirect("/interview/result");
}
