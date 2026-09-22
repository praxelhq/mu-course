"use client";

import Link from "next/link";
import { Show, SignUp } from "@clerk/nextjs";

export function SignUpPanel() {
  return (
    <>
      <Show when="signed-out">
        <SignUp
          routing="path"
          path="/sign-up"
          signInUrl="/sign-in"
          fallbackRedirectUrl="/shipyard"
        />
      </Show>
      <Show when="signed-in">
        <Link href="/shipyard">Continue to Shipyard</Link>
      </Show>
    </>
  );
}
