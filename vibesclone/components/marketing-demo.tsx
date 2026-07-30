"use client";

import { useState } from "react";
import { Check, Circle, ScanLine } from "lucide-react";

const analysis = ["Core purpose", "Key user flows", "Feature dependencies", "Niche transformations"];
const sequence = ["Foundation", "Core workflow", "Differentiation", "Quality pass"];

export function MarketingDemo(): React.ReactNode {
  const [platform, setPlatform] = useState("Replit");
  return (
    <div className="marketing-demo" aria-label="VibesClone workflow preview">
      <div className="demo-pane">
        <div className="demo-number">01 <span>INPUT</span></div>
        <label className="field-label" htmlFor="demo-url">Paste a public product URL</label>
        <div className="demo-input-row"><input id="demo-url" readOnly value="https://linear.app" /><button type="button">Analyze <span aria-hidden>→</span></button></div>
        <span className="field-label">Platform for prompt style</span>
        <div className="platform-row">{["Lovable", "Replit", "Base44", "Claude Code"].map((item) => <button type="button" className={platform === item ? "selected" : ""} key={item} onClick={() => setPlatform(item)}>{item}{platform === item ? <Check size={14} /> : null}</button>)}</div>
        <div className="demo-number demo-section">02 <span>ANALYSIS</span><em><ScanLine size={14} /> scanning · 68%</em></div>
        <div className="scan-list">{analysis.map((item, index) => <div key={item}><span>{item}</span>{index < 2 ? <Check size={15} /> : <Circle size={15} />}</div>)}</div>
      </div>
      <div className="demo-pane sequence-pane">
        <div className="demo-number">03 <span>BUILD SEQUENCE</span><em>0 / 4 approved</em></div>
        <p>Review the understanding. Approve it. Then generate prompts.</p>
        <div className="active-sequence"><b>01</b><div><strong>Project foundation</strong><small>Core stack, entities, routing, and auth</small></div><span>Needs review</span></div>
        {sequence.slice(1).map((item, index) => <div className="locked-sequence" key={item}><b>0{index + 2}</b><span>{item}</span><Circle size={14} /></div>)}
        <div className="demo-output">OUTPUT AFTER APPROVAL <strong>Ordered prompts ready for {platform}</strong></div>
      </div>
    </div>
  );
}
