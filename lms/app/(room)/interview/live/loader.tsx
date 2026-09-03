"use client";

import dynamic from "next/dynamic";

// The room touches media devices and WebRTC, so it never server-renders.
// Loading it with ssr:false keeps the page free of hydration guards and the
// portal gymnastics an in-page overlay would need.
const InterviewClient = dynamic(
  () => import("./interview-client").then((m) => m.InterviewRoom),
  {
    ssr: false,
    loading: () => (
      <div style={{ padding: "2rem", color: "var(--charcoal)" }}>Opening the room…</div>
    ),
  },
);

export function InterviewLiveLoader({ textMode }: { textMode: boolean }) {
  return <InterviewClient textMode={textMode} />;
}
