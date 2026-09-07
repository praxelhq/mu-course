"use client";

import { RouteError } from "@/components/route-error";

export default function ErrorPage(props: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <RouteError
      {...props}
      title="The review queue could not be loaded."
      body="No hold, appeal, or grade was changed. Retry to fetch a fresh queue before taking action."
      returnHref="/instructor"
      returnLabel="Instructor home"
    />
  );
}
