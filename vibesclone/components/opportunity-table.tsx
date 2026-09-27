"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { founderAudience, formatUsd, type Competition, type Opportunity } from "@/lib/opportunities";

type Sort = "mrr" | "newest" | "audience";
const competitionLevels: readonly (Competition | "all")[] = ["all", "Low", "Medium", "High"];
const tints = ["#e8f4ec", "#e7effd", "#fdf1dc", "#f3e8fd", "#fde8ec", "#e6f6f7"];

export function Monogram({ name }: { name: string }): React.ReactNode {
  const code = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return <span className="monogram" style={{ background: tints[code % tints.length] }} aria-hidden="true">{name.replace(/[^a-z0-9]/gi, "").charAt(0).toUpperCase()}</span>;
}

export function CompetitionPill({ level }: { level: Competition }): React.ReactNode {
  return <span className={`pill competition-${level.toLowerCase()}`}>{level === "Low" ? "Open field" : level === "Medium" ? "Some rivals" : "Crowded"}</span>;
}

export function OpportunityTable({ items, categories, limit, filters = false, initialQuery = "", initialCategory = "all" }: { items: readonly Opportunity[]; categories?: readonly string[]; limit?: number; filters?: boolean; initialQuery?: string; initialCategory?: string }): React.ReactNode {
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<string>(categories?.includes(initialCategory) ? initialCategory : "all");
  const [competition, setCompetition] = useState<Competition | "all">("all");
  const [sort, setSort] = useState<Sort>("mrr");
  const rows = useMemo(() => {
    const value = query.trim().toLowerCase();
    const filtered = items.filter((item) => (category === "all" || item.category === category) && (competition === "all" || item.competition === competition) && (!value || [item.name, item.category, item.summary, item.persona ?? ""].join(" ").toLowerCase().includes(value)));
    const sorted = [...filtered].sort((a, b) => sort === "mrr" ? b.mrr - a.mrr : sort === "newest" ? (b.founded ?? "").localeCompare(a.founded ?? "") : a.founderFollowers - b.founderFollowers);
    return limit ? sorted.slice(0, limit) : sorted;
  }, [items, query, category, competition, sort, limit]);

  return <div className="opportunity-table">
    {filters ? <div className="table-controls">
      <label className="terminal-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`search ${items.length} earning products…`} aria-label="Search earning products" /></label>
      {categories ? <div className="chip-row" role="group" aria-label="Category">{["all", ...categories].map((item) => <button key={item} className={category === item ? "chip active" : "chip"} onClick={() => setCategory(item)}>{item === "all" ? "all categories" : item.toLowerCase()}</button>)}</div> : null}
      <div className="segment-row">
        <span>COMPETITION</span>{competitionLevels.map((level) => <button key={level} className={competition === level ? "segment active" : "segment"} onClick={() => setCompetition(level)}>{level === "all" ? "all" : level.toLowerCase()}</button>)}
        <span>SORT</span>{(["mrr", "newest", "audience"] as const).map((key) => <button key={key} className={sort === key ? "segment active" : "segment"} onClick={() => setSort(key)}>{key === "mrr" ? "revenue" : key === "newest" ? "newest" : "smallest founder"}</button>)}
      </div>
    </div> : null}
    <div className="table-scroll" role="region" aria-label="Earning products" tabIndex={0}>
      <table>
        <thead><tr><th>#</th><th>Product</th><th>Category</th><th className="num">Verified MRR</th><th>Founder audience</th><th>Competition</th><th aria-label="Open" /></tr></thead>
        <tbody>
          {rows.map((item, index) => <tr key={item.slug}>
            <td className="rank">{String(index + 1).padStart(2, "0")}</td>
            <td><Link href={`/opportunities/${item.slug}`} className="product-cell"><Monogram name={item.name} /><span><b>{item.name}</b><small>{item.summary}</small></span></Link></td>
            <td className="mono-cell">{item.category.toLowerCase()}</td>
            <td className="num"><strong>{formatUsd(item.mrr)}</strong><small>/mo</small></td>
            <td className="mono-cell">{founderAudience(item.founderFollowers)}</td>
            <td><CompetitionPill level={item.competition} /></td>
            <td><Link href={`/opportunities/${item.slug}`} aria-label={`Open ${item.name}`} className="row-arrow"><ArrowRight size={16} /></Link></td>
          </tr>)}
        </tbody>
      </table>
      {rows.length === 0 ? <p className="table-empty">No earning products match. Clear a filter, or <Link href="/workspace">analyze any URL</Link>.</p> : null}
    </div>
  </div>;
}
