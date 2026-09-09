import hashlib
import json
import re
from pathlib import Path

import numpy as np
import pandas as pd

SOURCE = Path("tmp/session3-instructor-assets/sample_rows.json")
PACK = Path("lms/private/course-data/session-03/generated/data-race/session3-data-race-pack.json")
EXPECTED_SHA = "36d32ac250effbba9cb2c2fcb2cb3ad4c61396a8b2f501d3d7e20be061f1ff77"


def money(value):
    return f"${value:,.0f}"


raw = json.loads(SOURCE.read_text())
df = pd.DataFrame(raw[1:], columns=raw[0])
pack = json.loads(PACK.read_text())

assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == EXPECTED_SHA
assert pack["sourceSha256"] == EXPECTED_SHA
assert pack["rowCount"] == len(df) == 1000

numeric = [
    "x_followers", "revenue_30d_usd", "revenue_3m_usd", "revenue_12m_usd",
    "revenue_all_time_usd", "mrr_usd", "active_subscriptions", "visitors_30d",
    "domain_rating", "revenue_multiple",
]
for column in numeric:
    df[column] = pd.to_numeric(
        df[column].astype("string").str.replace("x", "", regex=False).str.replace(",", "", regex=False),
        errors="coerce",
    )


def key_label(question):
    return next(option["label"] for option in question["options"] if option["id"] == question["correctOptionId"])


def independently_calculate(question):
    prompt = question["prompt"]
    position = question["position"]

    if position == 1:
        field = re.search(r"`([^`]+)`", prompt).group(1)
        return f"{int(df[field].isna().sum() + (df[field] == '').sum()):,}"

    if position == 2:
        provider = re.search(r"exactly equal to '(.+)'\?", prompt).group(1)
        return f"{int((df['payment_provider'] == provider).sum()):,}"

    if position == 3:
        category = re.search(r"for the (.+) category, rounded", prompt).group(1)
        return money(df.loc[df["category"] == category, "revenue_30d_usd"].fillna(0).sum())

    if position == 4:
        category = re.search(r"median MRR for (.+), rounded", prompt).group(1)
        return money(df.loc[df["category"] == category, "mrr_usd"].dropna().median())

    if position == 5:
        countries = re.search(r"among (.+)\?", prompt).group(1).split(", ")
        totals = df[df["country"].isin(countries)].groupby("country", dropna=False)["revenue_30d_usd"].sum()
        return max(countries, key=lambda country: (totals.get(country, 0), country))

    if position == 6:
        providers = [option["label"] for option in question["options"]]
        totals = df[df["payment_provider"].isin(providers)].groupby("payment_provider")["revenue_30d_usd"].sum()
        return max(providers, key=lambda provider: (totals.get(provider, 0), provider))

    if position == 7:
        metric = re.search(r"split by ([^?]+)\?", prompt).group(1)
        anonymous = df["startup_name"].isna() | df["startup_name"].isin(["", "Stealth Company", "Hidden Business"])
        if metric == "companies":
            named_value = int((~anonymous).sum())
            anonymous_value = int(anonymous.sum())
            return f"Named {named_value:,} · Anonymous {anonymous_value:,}"
        named_value = df.loc[~anonymous, metric].fillna(0).sum()
        anonymous_value = df.loc[anonymous, metric].fillna(0).sum()
        return f"Named {money(named_value)} · Anonymous {money(anonymous_value)}"

    if position == 8:
        match = re.search(r"between (.+) and (.+), using", prompt)
        left, right = match.group(1), match.group(2)
        pairs = df[[left, right]].dropna()
        return f"{np.corrcoef(pairs[left], pairs[right])[0, 1]:.3f}"

    if position == 9:
        audience = re.search(r"on-sale (.+) companies", prompt).group(1)
        values = df.loc[(df["on_sale"] == True) & (df["audience_type"] == audience), "revenue_multiple"].dropna()
        return f"{values.median():.2f}x"

    if position == 10:
        category = re.search(r"about the (.+) category", prompt).group(1)
        rows = df[df["category"] == category]
        return (
            f"{category} has {len(rows)} rows, {money(rows['revenue_30d_usd'].fillna(0).sum())} "
            f"total 30-day revenue, and {money(rows['mrr_usd'].dropna().median())} median MRR."
        )

    raise AssertionError(f"Unknown position {position}")


failures = []
audited = []
expected_times = [60, 60, 60, 75, 75, 75, 90, 90, 105, 120]
answer_positions = {"a": 0, "b": 0, "c": 0, "d": 0}
section_answer_positions = {}
for section_pack in pack["packs"]:
    section_answer_positions[section_pack["sectionCode"]] = {"a": 0, "b": 0, "c": 0, "d": 0}
    for question in section_pack["questions"]:
        expected = independently_calculate(question)
        actual = key_label(question)
        audited.append((section_pack["sectionCode"], question["position"], expected))
        answer_positions[question["correctOptionId"]] += 1
        section_answer_positions[section_pack["sectionCode"]][question["correctOptionId"]] += 1
        if actual != expected:
            failures.append({
                "section": section_pack["sectionCode"],
                "position": question["position"],
                "prompt": question["prompt"],
                "key": actual,
                "independent": expected,
            })
        labels = [option["label"] for option in question["options"]]
        if len(labels) != 4 or len(set(labels)) != 4:
            failures.append({"section": section_pack["sectionCode"], "position": question["position"], "problem": "options are not four unique labels"})
        if question["durationSeconds"] != expected_times[question["position"] - 1]:
            failures.append({"section": section_pack["sectionCode"], "position": question["position"], "problem": "unexpected timer", "actual": question["durationSeconds"]})
        if question["position"] == 6 and not all(label in question["prompt"] for label in labels):
            failures.append({"section": section_pack["sectionCode"], "position": 6, "problem": "provider referents are not explicit"})
        if question["position"] == 7 and not all(term in question["prompt"] for term in ["blank startup_name", "Stealth Company", "Hidden Business"]):
            failures.append({"section": section_pack["sectionCode"], "position": 7, "problem": "anonymity definition is incomplete"})
        format_patterns = {
            1: r"^[\d,]+$", 2: r"^[\d,]+$", 3: r"^\$[\d,]+$", 4: r"^\$[\d,]+$",
            7: r"^Named .+ · Anonymous .+$", 8: r"^-?\d\.\d{3}$", 9: r"^\d+\.\d{2}x$",
        }
        if question["position"] in format_patterns and not all(re.match(format_patterns[question["position"]], label) for label in labels):
            failures.append({"section": section_pack["sectionCode"], "position": question["position"], "problem": "option formats leak or mismatch"})
        if question["position"] == 10:
            lengths = [len(label.split()) for label in labels]
            if max(lengths) - min(lengths) > 3:
                failures.append({"section": section_pack["sectionCode"], "position": 10, "problem": "final option lengths are imbalanced", "lengths": lengths})

for section, distribution in section_answer_positions.items():
    if max(distribution.values()) - min(distribution.values()) > 1:
        failures.append({"section": section, "problem": "answer positions are imbalanced", "distribution": distribution})

print(json.dumps({
    "dataset_sha256": EXPECTED_SHA,
    "rows": len(df),
    "questions_audited": len(audited),
    "answer_positions": answer_positions,
    "section_answer_positions": section_answer_positions,
    "failures": failures,
}, indent=2))
assert not failures
