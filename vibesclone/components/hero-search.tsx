"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { blueprints } from "@/lib/blueprints";
import { formatUsd, opportunities } from "@/lib/opportunities";

type Suggestion = { href: string; name: string; meta: string };

const index: Suggestion[] = [
  ...opportunities.map((item) => ({ href: `/opportunities/${item.slug}`, name: item.name, meta: `${formatUsd(item.mrr)}/mo · ${item.category.toLowerCase()}` })),
  ...blueprints.map((item) => ({ href: `/blueprints/${item.slug}`, name: item.name, meta: `teardown · ${item.category.toLowerCase()}` })),
];

export function HeroSearch(): React.ReactNode {
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const matches = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (value.length < 2) return [];
    return index.filter((item) => `${item.name} ${item.meta}`.toLowerCase().includes(value)).slice(0, 6);
  }, [query]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    const exact = index.find((item) => item.name.toLowerCase() === value.toLowerCase());
    if (exact) return window.location.assign(exact.href);
    if (/\.[a-z]{2,}(\/|$)/i.test(value)) {
      try {
        const url = new URL(value.includes("://") ? value : `https://${value}`);
        if (!/^https?:$/.test(url.protocol)) throw new Error("protocol");
        return window.location.assign(`/workspace?sourceUrl=${encodeURIComponent(url.toString())}&origin=public-scan`);
      } catch {
        return setNotice("That URL doesn’t look right. Paste a public https:// address.");
      }
    }
    window.location.assign(`/opportunities?q=${encodeURIComponent(value)}`);
  }

  return <div className="hero-search">
    <form onSubmit={submit} role="search">
      <span aria-hidden="true">&gt;</span>
      <input value={query} onChange={(event) => { setQuery(event.target.value); setNotice(null); }} aria-label="Search earning products or paste a product URL" placeholder="search a product, or paste a URL" autoComplete="off" />
      <button className="button primary">Find it <ArrowRight size={16} /></button>
    </form>
    {matches.length ? <ul className="hero-suggestions">{matches.map((item) => <li key={item.href}><Link href={item.href}><b>{item.name}</b><small>{item.meta}</small><ArrowRight size={14} /></Link></li>)}</ul> : null}
    {notice ? <p className="explorer-notice">{notice}</p> : null}
  </div>;
}
