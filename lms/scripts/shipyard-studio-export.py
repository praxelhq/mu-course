"""Normalize only the three public-product tabs of the instructor workbook.

Usage: python shipyard-studio-export.py input.xlsx /private/path/knowledge.ndjson
Requires openpyxl. Revenue history and personal founder/contact columns are omitted.
"""
import datetime
import json
import re
import sys
from pathlib import Path

import openpyxl


def main():
    workbook = openpyxl.load_workbook(sys.argv[1], read_only=True, data_only=True)
    counts = {}
    with Path(sys.argv[2]).open("w") as output:
        for tab, source, name, url in [
            ("TrustMRR Startups", "TrustMRR", "startup name", "trustmrr url"),
            ("Acquire Listings", "Acquire", "listing headline", "listing url"),
            ("AppSumo Products", "AppSumo", "product name", "appsumo url"),
        ]:
            rows = workbook[tab].iter_rows(values_only=True)
            headers = next(rows)
            counts[source] = 0
            for cells in rows:
                raw = dict(zip(headers, cells))
                if not raw.get("record id") or not raw.get(name):
                    continue
                stamp = raw.get("scraped at") or raw.get("first seen at")
                if isinstance(stamp, datetime.datetime):
                    stamp = stamp.isoformat()
                if not stamp:
                    raise ValueError("A record is missing its capture date")
                if not str(stamp).endswith("Z") and "+" not in str(stamp):
                    stamp += "Z"
                data = {
                    k: v for k, v in raw.items()
                    if k and v is not None and not any(term in k for term in
                    ["founder", "followers", "image", "logo", "hash", "record id", "domain rating"])
                }
                text = "\n".join(f"{k}: {v}" for k, v in data.items())
                text = re.sub(r"<[^>]+>", " ", text)[:22000]
                row = {"id": str(raw["record id"]), "source": source,
                       "title": str(raw[name])[:300], "url": raw.get(url) or raw.get("source url"),
                       "capturedAt": stamp, "text": text,
                       "data": {"sheet": tab, "sourceUrl": raw.get("source url"),
                                "disclosure": "Captured source observation. Seller claims and estimates are not independently verified."}}
                output.write(json.dumps(row, default=str) + "\n")
                counts[source] += 1
    print(json.dumps(counts))


if __name__ == "__main__":
    main()
