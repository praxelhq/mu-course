import collections
import copy
import csv
import json
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
SOURCE = json.loads((ROOT / "source.json").read_text())
reviews = {}
for path in sorted(ROOT.glob("batch-*.json")):
    for item in json.loads(path.read_text()):
        number = item["sourceRow"]
        assert number not in reviews, f"Repeated source row {number}"
        reviews[number] = item

audit = []

for path in sorted(ROOT.glob("supplemental-*.json")):
    item = json.loads(path.read_text())
    assert item["sourceRow"] in reviews
    audit.append({"sourceRow": item["sourceRow"], "secondPass": path.name,
                  "before": copy.deepcopy(reviews[item["sourceRow"]]), "after": item})
    reviews[item["sourceRow"]] = item

def patch(number, **changes):
    before = {key: reviews[number].get(key) for key in changes}
    reviews[number].update(changes)
    audit.append({"sourceRow": number, "before": before, "after": changes})

def normalized_url(raw):
    raw = raw.strip()
    value = urlsplit(raw if "://" in raw else "https://" + raw)
    return value.netloc.lower() + value.path.rstrip("/") + ("?" + value.query if value.query else "") + ("#" + value.fragment if value.fragment else "")

def as_text(value):
    return "; ".join(str(part) for part in value) if isinstance(value, list) else str(value or "")

groups = collections.defaultdict(list)
for number, cells in enumerate(SOURCE["rows"][1:], 2):
    groups[normalized_url(cells[5])].append(number)

# Row 208 is the same submitted app as row 7 and was assigned to the root reviewer.
reviews[208] = copy.deepcopy(reviews[7])
reviews[208]["sourceRow"] = 208

# Do not infer canned generation from a test using only the supplied sample.
patch(39, feedback="The sample-room flow reaches a comparison screen with furniture hotspots, but the hero text is almost white on white and the saved render disappeared on reload. Improve contrast and persistence, replace generic retailer-homepage links with actual product destinations, and demonstrate room-specific generation from a fresh uploaded image.")
if not (ROOT / "supplemental-308.json").exists():
    patch(308, feedback="The wellness onboarding has a calm visual hierarchy and an explicit demo entry. Native date entry could not be completed reliably through the review tool, so the tracking workflow remains unverified. A sample-data or skip path would make the core experience easier to assess.",
          limitations="Review-tool limitation: the visible native date value did not commit to application state. No app defect inferred; core tracking and persistence unverified. No real health data used.")

# Shared-app grades use the combined evidence, with a single score per app.
canonical = {7: 7, 12: 12, 38: 38, 47: 47, 80: 80, 101: 101, 104: 104,
             144: 144, 162: 162, 218: 218, 273: 273, 331: 387,
             332: 332, 333: 333, 397: 397, 400: 400}
patch(12, functionality=6.5, overall=6.5,
      feedback="The quiz, product swaps, saved routine and context-aware chat form a coherent experience, and the routine survives reload. But selecting under ₹1,000 returned routines costing over ₹3,500, with the moisturiser counted twice. I expected the recommendations to respect the budget and explain upfront cost versus monthly replenishment.")
patch(162, visual=7.5, functionality=6, overall=7, status="Partial review",
      feedback="The gig-worker focus is well developed: fuel, maintenance and waiting time feed clear take-home calculations, and preferences survive reload. Avoid displaying thousands of rupees per hour before required times are entered, and make the AI analysis resolve or show a useful fallback. A complete saved-shift flow remains unverified.")
patch(218, visual=7, functionality=5, overall=5.5, status="Partial review",
      feedback="The city filter and detailed property views work, and agreement review and resident services give the concept breadth. But every initial property showed the same 92% fit, the under-₹15,000 action left expensive listings visible, and the sample agreement audit produced no observed result. Make matching and the core audit dependable before claiming verified fit.")

missing = sorted(set(range(2, 414)) - reviews.keys())
assert not missing, f"Unreviewed source rows: {missing}"
assert set(reviews) == set(range(2, 414))

for url, numbers in groups.items():
    if len(numbers) < 2:
        continue
    selected = canonical[numbers[0]]
    shared = copy.deepcopy(reviews[selected])
    combined_tested = list(dict.fromkeys(as_text(reviews[n]["tested"]) for n in numbers))
    combined_limits = list(dict.fromkeys(as_text(reviews[n]["limitations"]) for n in numbers))
    audit.append({"duplicateSourceRows": numbers, "canonicalEvidenceRow": selected,
                  "url": url, "scores": [shared["visual"], shared["functionality"], shared["overall"]]})
    for number in numbers:
        item = reviews[number]
        for field in ("appName", "visual", "functionality", "overall", "feedback", "status"):
            item[field] = shared.get(field, "")
        item["tested"] = " | ".join(combined_tested) + f" | Same submitted app at source rows {', '.join(map(str, numbers))}; combined review evidence."
        item["limitations"] = " | ".join(combined_limits)

headers = ["Source row", "Student name", "Section", "Visual /10", "Functionality /10",
           "Overall /10", "Instructor feedback", "Review status", "Submitted app link",
           "Artifact brief", "Email", "Tested / limitations"]
values = [headers]
for number in range(2, 414):
    cells = SOURCE["rows"][number - 1]
    item = reviews[number]
    item.update(name=cells[2], url=cells[5], section=cells[4], email=cells[3], brief=cells[6])
    assert item["status"] in {"Reviewed", "Partial review", "Access blocked"}
    for field in ("visual", "functionality", "overall"):
        score = item[field]
        assert score is None or (isinstance(score, (int, float)) and 0 <= score <= 10), (number, field)
    assert item["functionality"] is not None or item["overall"] is None, number
    assert item["feedback"].strip() and item["tested"], number
    scores = ["N/V" if item[field] is None else item[field] for field in ("visual", "functionality", "overall")]
    evidence = f"App: {item.get('appName', '')}. Tested: {as_text(item['tested'])} | Limitations: {as_text(item['limitations'])}"
    values.append([number, cells[2], cells[4], *scores, item["feedback"], item["status"], cells[5], cells[6], cells[3], evidence])

final = [reviews[number] for number in sorted(reviews)]
(ROOT / "reviews-final.json").write_text(json.dumps(final, ensure_ascii=False, indent=2))
(ROOT / "sheet-values-final.json").write_text(json.dumps(values, ensure_ascii=False))
(ROOT / "calibration-audit.json").write_text(json.dumps(audit, ensure_ascii=False, indent=2))
with (ROOT / "app-reviews-final.csv").open("w", newline="") as stream:
    csv.writer(stream).writerows(values)
print(json.dumps({"reviews": len(final), "distinctApps": len(groups),
                  "duplicateGroups": {url: numbers for url, numbers in groups.items() if len(numbers) > 1},
                  "statuses": dict(collections.Counter(item["status"] for item in final)),
                  "numericOverall": sum(item["overall"] is not None for item in final),
                  "unknownOverall": sum(item["overall"] is None for item in final)}, ensure_ascii=False))
