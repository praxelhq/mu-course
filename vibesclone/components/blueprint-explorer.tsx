"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { blueprints, findBlueprint } from "@/lib/blueprints";

export function BlueprintExplorer({ compact = false }: { compact?: boolean }): React.ReactNode {
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const matches = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return blueprints;
    return blueprints.filter((item) => [item.name, item.category, item.tagline, ...item.coreFeatures].join(" ").toLowerCase().includes(value));
  }, [query]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    const known = findBlueprint(value);
    if (known) return window.location.assign(`/blueprints/${known.slug}`);
    try {
      const url = new URL(value.includes("://") ? value : `https://${value}`);
      if (!/^https?:$/.test(url.protocol)) throw new Error("protocol");
      window.location.assign(`/workspace?sourceUrl=${encodeURIComponent(url.toString())}&origin=public-scan`);
    } catch {
      setNotice("Search by product name, or paste its public website URL.");
    }
  }

  return <div className={`blueprint-explorer ${compact ? "compact" : ""}`}>
    <form onSubmit={submit}><Search size={20} /><input value={query} onChange={(event) => { setQuery(event.target.value); setNotice(null); }} aria-label="Search products or paste a URL" placeholder="Search Linear, Notion… or paste any product URL" /><button className="button primary">Explore <ArrowRight size={17} /></button></form>
    {notice ? <p className="explorer-notice">{notice}</p> : null}
    {!compact ? <div className="blueprint-results">{matches.slice(0, query ? 8 : 4).map((item) => <Link href={`/blueprints/${item.slug}`} key={item.slug}><span><b>{item.name}</b><small>{item.category}</small></span><strong>{item.cloneabilityScore}<em>/100</em></strong><ArrowRight size={16} /></Link>)}</div> : null}
  </div>;
}
