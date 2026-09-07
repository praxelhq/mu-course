"use client";

import { RouteError } from "@/components/route-error";

export default function ErrorPage(props: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <RouteError
      {...props}
      title="Your assignment is still safe."
      body="We could not load the assignment or its latest saved state. Try again before entering new work; an immutable submission receipt is never removed by this screen error."
      returnHref="/assignments"
      returnLabel="Back to assignments"
    />
  );
}
