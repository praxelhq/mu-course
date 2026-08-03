"use client";

import { useEffect, useState } from "react";
import { Check, Circle, ScanSearch, Sparkles } from "lucide-react";

const scenes = [
  { label: "SOURCE", title: "linear.app", detail: "Public product captured", icon: ScanSearch },
  { label: "PRODUCT MAP", title: "12 flows · 18 features", detail: "Evidence and dependencies mapped", icon: Circle },
  { label: "YOUR VERSION", title: "ScoutFlow", detail: "Niche, USP, and scope approved", icon: Check },
  { label: "BUILD SEQUENCE", title: "1 base + 6 follow-ups", detail: "Ready for Claude Code", icon: Sparkles },
];

export function HeroFlow(): React.ReactNode {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % scenes.length), 1900);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="hero-flow" aria-label="A product URL becomes a verified build sequence">
      <div className="hero-flow-top"><span>LIVE PRODUCT MAP</span><i><span /> VERIFIED FIRST</i></div>
      <div className="hero-flow-source"><span>PASTE URL</span><strong>https://linear.app</strong><b aria-hidden>→</b></div>
      <div className="hero-flow-scenes" aria-live="off">
        {scenes.map((scene, index) => {
          const Icon = scene.icon;
          const state = index < active ? "complete" : index === active ? "active" : "queued";
          return <div className={`hero-flow-scene ${state}`} key={scene.label}><span className="scene-number">0{index + 1}</span><Icon size={17} /><div><small>{scene.label}</small><strong>{scene.title}</strong><p>{scene.detail}</p></div>{state === "complete" ? <Check size={15} /> : <Circle size={14} />}</div>;
        })}
      </div>
      <div className="hero-flow-footer"><span>ADAPT THE LOGIC</span><strong>{String(active + 1).padStart(2, "0")} / 04</strong></div>
    </div>
  );
}
