"use client";

import { RouteError } from "@/components/route-error";

export default function ErrorPage(props: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <RouteError
      {...props}
      title="This session could not be loaded."
      body="The release state may have changed while you were here. Try again to fetch the current materials and assignment gates."
      returnHref="/sessions"
      returnLabel="Back to sessions"
    />
  );
}
