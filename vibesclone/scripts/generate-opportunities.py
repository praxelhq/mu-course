#!/usr/bin/env python3
"""Regenerate lib/opportunities-data.ts from a Startup Marketplace Intelligence snapshot.

Input is the normalized records.jsonl built from the "Startup Marketplace Intelligence"
sheet (TrustMRR Startups, AppSumo Products, Acquire Listings tabs). Each line has
source/name/mrr/revenue/asking_price/purchase_count/rating/review_count/category/tags/raw.

    python3 scripts/generate-opportunities.py path/to/records.jsonl 2026-09-05

Curation is deliberate: software only, $1.5k-60k MRR, a real description and site,
no services, audiences, adult/gambling, or evasion tools. Review the printed list
before committing, and add names to EXCLUDE when a row is not a buildable product.
"""
import json, re, statistics as st, sys
from collections import Counter
from pathlib import Path

EXCLUDE = {
    "Michael Veail", "SOVEREIGN LEADS LIMITED", "Evergreen Support, LLC", "TradingBox Pro", "STOIC MANUAL LLC",
    "PayHubPartner", "Juiced Leads, LLC", "Akari Tickets", "Dotmarket.eu - Achat / vente de business web", "Monkei, LLC",
    "WriteStack", "Bloom", "Lunchbreak", "Sherpa", "FaceKit", "PepIQ: Shop & Scan Peptides", "Frontproxy", "BambooVPN",
    "Khosmos", "Heron Copier", "Pushouse", "Brainrot.mov", "ColdSire", "Low Content AI", "DM Champ", "Angel Match",
    "DivineTV", "BackPedal Ltd", "Taller",
}
BANNED = re.compile(r"nsfw|adult|porn|onlyfans|casino|betting|gambl|sportsbook|escort|nude|undress|stealth|holding company|crypto signal|forex|prediction market", re.I)
SERVICE = re.compile(r"\bagency\b|done.for.you|consult|coaching|newsletter|course|community membership|marketplace", re.I)
APPSUMO_SOFTWARE = re.compile(r"^software|marketing-sales|operations|media-tools|productivity|development|customer-experience|finance|sales-leads|marketing/", re.I)
APPSUMO_NOT_SOFTWARE = re.compile(r"template|stock|course|academy|plan|bundle|freebie|kit|ebook|photos|vectors|icons|fonts|library", re.I)


def field(record, key):
    value = record["raw"].get(key)
    if isinstance(value, str) and ("Private metric" in value or value.strip() in ("", "[]", "None")):
        return None
    return value


def num(value):
    try:
        return float(re.sub(r"[^0-9.\-]", "", str(value))) if value not in (None, "") else None
    except ValueError:
        return None


def clean(text, limit):
    text = re.sub(r"\s+", " ", str(text or "")).strip()
    return text if len(text) <= limit else text[:limit].rsplit(" ", 1)[0].rstrip(",.;:") + "…"


def main(records_path: str, snapshot_date: str) -> None:
    records = [json.loads(line) for line in open(records_path)]
    trust = [r for r in records if r["source"] == "trust"]
    appsumo = [r for r in records if r["source"] == "appsumo"]
    acquire = [r for r in records if r["source"] == "acquire"]
    earning = Counter(field(r, "category") for r in trust if (r["mrr"] or 0) >= 100)

    candidates = []
    for r in trust:
        mrr = r["mrr"] or 0
        name = (r["name"] or "").strip()
        desc = field(r, "description") or field(r, "value proposition") or ""
        category, website = field(r, "category"), field(r, "website")
        if not (1500 <= mrr <= 60000) or not category or not website or len(desc) < 50: continue
        if BANNED.search(f"{name} {desc}") or name.lower().startswith("stealth"): continue
        if set(r["tags"]) & {"service_business", "low_proof_product"} or SERVICE.search(desc): continue
        followers = int(num(field(r, "x followers")) or 0)
        founded = str(field(r, "founded date") or "")[:7]
        on_sale = field(r, "on sale") in (True, "TRUE")
        count = earning.get(category, 0)
        growth = num(field(r, "mrr growth 30d pct"))
        candidates.append(dict(
            rawName=name, slug=field(r, "slug"), name=re.sub(r",? (Inc\.|LLC|Ltd)$", "", name).replace("iCollect Everything - All Apps", "iCollect Everything"), website=website, trustmrrUrl=field(r, "trustmrr url"),
            category=category, mrr=int(round(mrr, -2)), growth30d=round(growth, 1) if growth is not None else None,
            founded=founded if re.match(r"20[12]\d-\d\d", founded) else None, founderFollowers=followers, audience=field(r, "audience type"),
            pricing=clean(field(r, "pricing model"), 160) or None, persona=clean(field(r, "target persona"), 120) or None,
            summary=clean(desc, 200), problem=clean(field(r, "problem solved"), 200) or None, onSale=on_sale,
            askingPrice=int(num(field(r, "asking price usd"))) if on_sale and num(field(r, "asking price usd")) else None,
            competition="High" if count >= 250 else "Medium" if count >= 90 else "Low", categoryEarningCount=count,
        ))
    candidates.sort(key=lambda c: (c["founderFollowers"] >= 5000, -c["mrr"]))
    picked, per_category, seen = [], Counter(), set()
    for c in candidates:
        if c["slug"] in seen or per_category[c["category"]] >= 7: continue
        seen.add(c["slug"]); per_category[c["category"]] += 1; picked.append(c)
        if len(picked) >= 72: break
    # Exclusions are reviewed against the capped shortlist, so apply them after the cap.
    picked = [c for c in picked if c.pop("rawName") not in EXCLUDE]
    picked.sort(key=lambda c: -c["mrr"])

    mid = [r for r in trust if 1000 <= (r["mrr"] or 0) <= 50000]
    followers = [num(field(r, "x followers")) or 0 for r in mid]
    for_sale = [r for r in trust if field(r, "on sale") in (True, "TRUE") and (r["mrr"] or 0) >= 1000]
    small_acquire = [r for r in acquire if r["revenue"] and r["asking_price"] and 12000 <= r["revenue"] <= 240000]
    recent = [r for r in mid if str(field(r, "founded date") or "0")[:4] >= "2024" and (num(field(r, "x followers")) or 0) < 1000]
    stats = dict(
        snapshotDate=snapshot_date, trustmrrStartups=len(trust), withRevenue=sum((r["mrr"] or 0) > 0 for r in trust),
        over1k=sum((r["mrr"] or 0) >= 1000 for r in trust), over10k=sum((r["mrr"] or 0) >= 10000 for r in trust), midBand=len(mid),
        midBandSmallAudienceShare=round(sum(x < 1000 for x in followers) / len(followers), 2), midBandMedianFollowers=int(st.median(followers)),
        recentSmallAudience=len(recent), recentSmallAudienceMedianMrr=int(round(st.median([r["mrr"] for r in recent]), -2)),
        forSaleOver1k=len(for_sale), forSaleMedianAsk=int(st.median([num(field(r, "asking price usd")) for r in for_sale if num(field(r, "asking price usd"))])),
        forSaleMedianMultiple=round(st.median([num(field(r, "revenue multiple")) for r in for_sale if num(field(r, "revenue multiple"))]), 1),
        acquireListings=len(acquire), acquireSmallCount=len(small_acquire),
        acquireSmallMedianAsk=int(round(st.median([r["asking_price"] for r in small_acquire]), -2)),
        acquireSmallMedianMultiple=round(st.median([r["asking_price"] / r["revenue"] for r in small_acquire]), 1),
        appsumoProducts=len(appsumo),
        appsumoPaidButPoorlyRated=sum(1 for r in appsumo if (r["purchase_count"] or 0) >= 300 and r["rating"] and r["rating"] < 4.0 and (r["review_count"] or 0) >= 15),
    )

    gaps = [r for r in appsumo if (r["purchase_count"] or 0) >= 500 and r["rating"] and r["rating"] < 4.0 and (r["review_count"] or 0) >= 15
            and APPSUMO_SOFTWARE.search(r["category"] or "") and not APPSUMO_NOT_SOFTWARE.search(f"{r['name']} {r['raw'].get('tagline') or ''}")]
    gaps.sort(key=lambda r: -r["purchase_count"])
    better, seen_names = [], set()
    for r in gaps:
        short = r["name"].split(" - ")[0].split(":")[0].strip()
        if short in seen_names or r["name"].startswith("Hushed") or "Legal" in r["name"]: continue
        seen_names.add(short)
        parts = [p for p in (r["category"] or "").split("/") if p]
        better.append(dict(name=short if len(r["name"]) > 40 else r["name"].strip(), tagline=clean(r["raw"].get("tagline"), 110), purchases=int(r["purchase_count"]),
                           rating=round(r["rating"], 2), reviews=int(r["review_count"]), category=(parts[-1] if parts else "software").replace("-", " "),
                           appsumoUrl=r["raw"].get("appsumo url"), productUrl=r["raw"].get("product url")))
        if len(better) >= 12: break

    template = Path(__file__).with_name("opportunities-data.ts.tmpl").read_text()
    output = (template.replace("__SNAPSHOT__", snapshot_date)
              .replace("__STATS__", json.dumps(stats, indent=2))
              .replace("__OPPORTUNITIES__", json.dumps(picked, indent=2, ensure_ascii=False))
              .replace("__BETTER__", json.dumps(better, indent=2, ensure_ascii=False)))
    Path(__file__).resolve().parents[1].joinpath("lib/opportunities-data.ts").write_text(output)
    for c in picked: print(f"{c['mrr']:>6}  {c['competition']:<6}  {c['name']}")
    print(f"{len(picked)} opportunities, {len(better)} AppSumo gaps")


if __name__ == "__main__":
    if len(sys.argv) != 3: sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
