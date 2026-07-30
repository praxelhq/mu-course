"use client";

import { RouteError } from "@/components/route-error";

export default function ErrorPage(props: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <RouteError
      {...props}
      title="Publication curation could not be loaded."
      body="No consent or instructor publication decision was changed. Retry to load the latest audited states."
      returnHref="/instructor"
      returnLabel="Instructor home"
    />
  );
}
