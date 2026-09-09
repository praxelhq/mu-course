#!/usr/bin/env python3
"""Render the interview scoreboard CSV that goes into the shared Google Sheet.

Reads the raw export feed on stdin and adds the two things a raw export does
not have: a stamp saying how current it is, and a summary a reader can act on
without scrolling. Column order follows the feed, so the sheet and the
instructor download stay the same document in two places.
"""
import csv
import datetime
import io
import sys

IST = datetime.timezone(datetime.timedelta(hours=5, minutes=30))

rows = list(csv.reader(io.StringIO(sys.stdin.read())))
if not rows:
    sys.exit("empty feed")
header, body = rows[0], rows[1:]
col = {name: i for i, name in enumerate(header)}


def cell(row, name):
    i = col.get(name)
    return row[i] if i is not None and i < len(row) else ""


out = io.StringIO()
w = csv.writer(out)
now = datetime.datetime.now(IST)
w.writerow([f"Praxel LMS — AI Interview scores · updated {now:%d %b %Y, %H:%M} IST"])
w.writerow([])

totals = [int(cell(r, "total")) for r in body if cell(r, "total").strip()]
statuses = [cell(r, "status") for r in body]
# Three different things end up as `escalated`, and lumping them together
# reads as an outage when it is a queue of judgement calls. Classify by the
# reason the escalation actually carries.
escalated = [r for r in body if cell(r, "status") == "escalated"]


def _reason(row):
    return cell(row, "escalation_reason").lower()


integrity = [r for r in escalated if "inconsistent" in _reason(r)]
low_confidence = [
    r for r in escalated
    if "inconsistent" not in _reason(r) and "confidence" in _reason(r)
]
platform = [r for r in escalated if r not in integrity and r not in low_confidence]

w.writerow(["SUMMARY"])
w.writerow(["Interviews taken", len(body)])
w.writerow(["Graded", statuses.count("graded")])
w.writerow(["In progress", statuses.count("live")])
w.writerow(["Flagged: answers inconsistent with submissions", len(integrity)])
w.writerow(["Flagged: low grading confidence", len(low_confidence)])
w.writerow(["Cut off by the platform (retake auto-granted)", len(platform)])
if totals:
    w.writerow(["Average total (of 100)", round(sum(totals) / len(totals), 1)])
    w.writerow(["Lowest / highest", f"{min(totals)} / {max(totals)}"])
w.writerow(["With a recording", sum(1 for r in body if cell(r, "recording") == "yes")])
w.writerow(["Total spend (USD)", round(sum(float(cell(r, "cost_usd") or 0) for r in body), 4)])
w.writerow([])

w.writerow(header)
for r in body:
    w.writerow(r)

sys.stdout.write(out.getvalue())
