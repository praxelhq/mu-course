"use client";

import { RouteError } from "@/components/route-error";

export default function ErrorPage(props: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <RouteError
      {...props}
      title="The matrix could not be loaded."
      body="No workflow version was selected and no company sign-off was changed. Retry to load a fresh view."
      returnHref="/instructor"
      returnLabel="Instructor home"
    />
  );
}
