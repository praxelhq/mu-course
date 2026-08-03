"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, Circle, LoaderCircle, RotateCcw, ScanLine, Sparkles } from "lucide-react";

const analysis = ["Core purpose", "Key user flows", "Feature dependencies", "Niche transformations"];
const sequence = ["Foundation", "Core workflow", "Differentiation", "Quality pass"];

export function MarketingDemo(): React.ReactNode {
  const [platform, setPlatform] = useState("Replit");
  const [stage, setStage] = useState(0);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  const analyze = () => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    setStage(1);
    timers.current.push(window.setTimeout(() => setStage(2), 850));
    timers.current.push(window.setTimeout(() => setStage(3), 1750));
  };

  const progress = stage === 0 ? 0 : stage === 1 ? 58 : 100;
  return (
    <div className="marketing-demo" aria-label="VibesClone workflow preview">
      <div className="demo-pane">
        <div className="demo-number">01 <span>INPUT</span></div>
        <label className="field-label" htmlFor="demo-url">Paste a public product URL</label>
        <div className="demo-input-row"><input id="demo-url" readOnly value="https://linear.app" /><button type="button" onClick={stage === 3 ? () => setStage(0) : analyze} disabled={stage === 1}>{stage === 1 ? <><LoaderCircle className="spin" size={14} /> Analyzing</> : stage === 3 ? <><RotateCcw size={14} /> Replay</> : <>Analyze <span aria-hidden>→</span></>}</button></div>
        <span className="field-label">Platform for prompt style</span>
        <div className="platform-row">{["Lovable", "Replit", "Base44", "Claude Code"].map((item) => <button type="button" className={platform === item ? "selected" : ""} key={item} onClick={() => setPlatform(item)}>{item}{platform === item ? <Check size={14} /> : null}</button>)}</div>
        <div className="demo-number demo-section">02 <span>ANALYSIS</span><em><ScanLine size={14} /> {stage === 0 ? "ready" : stage === 1 ? `scanning · ${progress}%` : "mapped · 100%"}</em></div>
        <div className="scan-list" aria-live="polite">{analysis.map((item, index) => { const complete = stage >= 2 || (stage === 1 && index < 2); return <div className={complete ? "complete" : ""} key={item}><span>{item}</span>{complete ? <Check size={15} /> : stage === 1 && index === 2 ? <LoaderCircle className="spin" size={15} /> : <Circle size={15} />}</div>; })}</div>
      </div>
      <div className="demo-pane sequence-pane">
        <div className="demo-number">03 <span>BUILD SEQUENCE</span><em>{stage >= 2 ? "4 / 4 approved" : "0 / 4 approved"}</em></div>
        <p>Review the understanding. Approve it. Then generate prompts.</p>
        <div className={`active-sequence ${stage >= 2 ? "approved" : ""}`}><b>01</b><div><strong>Project foundation</strong><small>Core stack, entities, routing, and auth</small></div><span>{stage >= 2 ? "Approved" : "Needs review"}</span></div>
        {sequence.slice(1).map((item, index) => <div className={`locked-sequence ${stage >= 2 ? "approved" : ""}`} key={item}><b>0{index + 2}</b><span>{item}</span>{stage >= 2 ? <Check size={14} /> : <Circle size={14} />}</div>)}
        <div className={`demo-output ${stage === 3 ? "ready" : ""}`}>OUTPUT AFTER APPROVAL <strong>{stage === 3 ? `Ordered prompts ready for ${platform}` : "Approve the understanding to generate"}</strong>{stage === 3 ? <Link href="/workspace"><Sparkles size={14} /> Start my build</Link> : null}</div>
      </div>
    </div>
  );
}
