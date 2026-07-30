"use client";

import Script from "next/script";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

declare global {
  interface Window { clarity?: (...args: unknown[]) => void }
}

const allowedEvents = new Set(["landing_view", "project_started", "analysis_completed", "understanding_approved", "checkout_started", "entitlement_verified", "prompt_set_generated", "prompt_copied"]);

export function track(event: string): void {
  if (allowedEvents.has(event)) window.clarity?.("event", event);
}

export function Clarity(): React.ReactNode {
  const id = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;
  const pathname = usePathname();
  useEffect(() => { if (id && pathname === "/") track("landing_view"); }, [id, pathname]);
  if (!id) return null;
  return <Script id="clarity" strategy="afterInteractive">{`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,"clarity","script","${id}");`}</Script>;
}
