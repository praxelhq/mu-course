#!/usr/bin/env python3
"""Generate private, deterministic Session 3 Data Race packs from the frozen 1,000-row JSON."""

import argparse
import hashlib
import json
import math
import random
import statistics
from pathlib import Path

SECTIONS = "ABCDEFGH"
TIMES = [60, 60, 60, 75, 75, 75, 90, 90, 105, 120]
DIFFICULTIES = ["Easy", "Easy", "Easy", "Moderate", "Moderate", "Moderate", "Challenging", "Challenging", "Hard", "Expert"]
EXPECTED_SOURCE_SHA256 = "36d32ac250effbba9cb2c2fcb2cb3ad4c61396a8b2f501d3d7e20be061f1ff77"


def number(value):
    # Keep numeric 0 and 1. Equality-based membership would treat them as
    # False and True in Python and silently drop legitimate observations.
    if value is None or value == "" or isinstance(value, bool):
        return None
    try:
        result = float(str(value).replace("x", "").replace(",", ""))
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def money(value):
    return f"${value:,.0f}"


def median(values):
    clean = [value for value in values if value is not None]
    return statistics.median(clean) if clean else 0


def distinct_distractors(correct, candidates, formatter):
    correct_label = formatter(correct)
    labels = []
    for candidate in candidates:
        label = formatter(candidate)
        if label != correct_label and label not in labels:
            labels.append(label)
        if len(labels) == 3:
            return labels
    raise ValueError(f"Could not create three distinct distractors for {correct_label}")


def corr(xs, ys):
    pairs = [(x, y) for x, y in zip(xs, ys) if x is not None and y is not None]
    if len(pairs) < 3:
        return 0
    left, right = zip(*pairs)
    mx, my = statistics.mean(left), statistics.mean(right)
    numerator = sum((x - mx) * (y - my) for x, y in pairs)
    denominator = math.sqrt(sum((x - mx) ** 2 for x in left) * sum((y - my) ** 2 for y in right))
    return numerator / denominator if denominator else 0


def ranked_values(rows, field):
    """Rank populated values by frequency, then value, so ties are deterministic."""
    values = {row[field] for row in rows if row[field] not in (None, "")}
    return sorted(values, key=lambda value: (-sum(row[field] == value for row in rows), str(value)))


def answer_position(section, position):
    # Each section gets a non-sequential 3/3/2/2 distribution, rotated so
    # A-D are exactly balanced across the full 80-question release.
    base_counts = [3, 3, 2, 2]
    shift = (ord(section) - ord("A")) % 4
    counts = base_counts[-shift:] + base_counts[:-shift] if shift else base_counts
    positions = [index for index, count in enumerate(counts) for _ in range(count)]
    random.Random(f"data-race-answer-positions-{section}").shuffle(positions)
    return positions[position - 1]


def options(question_id, section, position, correct, wrong):
    correct_label = str(correct)
    wrong_labels = list(dict.fromkeys(str(item) for item in wrong))
    if correct_label in wrong_labels or len(wrong_labels) != 3:
        raise ValueError(f"{question_id} does not have four distinct, plausible answer labels")
    rng = random.Random(int(hashlib.sha256(question_id.encode()).hexdigest()[:12], 16))
    rng.shuffle(wrong_labels)
    correct_index = answer_position(section, position)
    labels = wrong_labels.copy()
    labels.insert(correct_index, correct_label)
    rendered = [{"id": chr(97 + index), "label": label} for index, label in enumerate(labels)]
    correct_id = chr(97 + correct_index)
    return rendered, correct_id


def item(section, position, prompt, correct, wrong, note):
    stable_id = f"S3-DATA-RACE-{section}-{position:02d}@1"
    choices, answer = options(stable_id, section, position, correct, wrong)
    return {
        "stableId": stable_id,
        "position": position,
        "prompt": prompt,
        "options": choices,
        "correctOptionId": answer,
        "difficulty": DIFFICULTIES[position - 1],
        "durationSeconds": TIMES[position - 1],
        "sourceNote": note,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    raw = json.loads(Path(args.input).read_text())
    header, body = raw[0], raw[1:]
    rows = [dict(zip(header, row + [None] * (len(header) - len(row)))) for row in body]
    source_hash = hashlib.sha256(Path(args.input).read_bytes()).hexdigest()
    if source_hash != EXPECTED_SOURCE_SHA256 or len(rows) != 1000 or len(header) != 29:
        raise ValueError("Input is not the frozen 1,000-row, 29-column Session 3 live dataset")

    missing_fields = ["country", "audience_type", "category", "domain", "x_followers", "domain_rating", "visitors_30d", "value_proposition"]
    providers = ranked_values(rows, "payment_provider")
    categories = ranked_values(rows, "category")
    countries = ranked_values(rows, "country")
    packs = []

    for index, section in enumerate(SECTIONS):
        questions = []
        field = missing_fields[index]
        answer = sum(row[field] in (None, "") for row in rows)
        questions.append(item(section, 1, f"How many rows have a blank or null value in `{field}`?", f"{answer:,}", [f"{answer+1:,}", f"{1000-answer:,}", f"{round(answer/10):,}"], f"COUNTBLANK({field}) over 1,000 data rows"))

        provider = providers[index % len(providers)]
        count = sum(row["payment_provider"] == provider for row in rows)
        questions.append(item(section, 2, f"How many rows have payment_provider exactly equal to '{provider}'?", f"{count:,}", [f"{count+1:,}", f"{max(0,count-1):,}", f"{round(count/10):,}"], "Count rows after exact payment_provider filter; composite values are separate labels"))

        category = categories[index % len(categories)]
        total = sum(number(row["revenue_30d_usd"]) or 0 for row in rows if row["category"] == category)
        questions.append(item(section, 3, f"What is total 30-day revenue for the {category} category, rounded to the nearest dollar?", money(total), [money(total/10), money(total*1.1), money(total + median([number(r["revenue_30d_usd"]) for r in rows]))], "SUM revenue_30d_usd after category filter; round to nearest dollar"))

        median_category = categories[(index + 5) % len(categories)]
        vals = [number(row["mrr_usd"]) for row in rows if row["category"] == median_category]
        med = median(vals)
        avg = statistics.mean([v for v in vals if v is not None]) if any(v is not None for v in vals) else 0
        wrong_medians = distinct_distractors(med, [avg, sum(v or 0 for v in vals), median([v for v in vals if v]), med + 1, med * 10 + 10], money)
        questions.append(item(section, 4, f"Including zeroes but excluding blanks, what is median MRR for {median_category}, rounded to the nearest dollar?", money(med), wrong_medians, "MEDIAN of nonblank mrr_usd after category filter; zero retained; round to nearest dollar"))

        pool = [countries[(index + offset * 3) % len(countries)] for offset in range(4)]
        country_totals = {country: sum(number(row["revenue_30d_usd"]) or 0 for row in rows if row["country"] == country) for country in pool}
        winner = max(pool, key=lambda country: (country_totals[country], country))
        questions.append(item(section, 5, f"Which country has the highest total 30-day revenue among {', '.join(pool)}?", winner, [country for country in pool if country != winner], "Group by country, sum revenue_30d_usd, compare listed countries"))

        provider_pool = [providers[(index + offset) % len(providers)] for offset in range(4)]
        provider_totals = {name: sum(number(row["revenue_30d_usd"]) or 0 for row in rows if row["payment_provider"] == name) for name in provider_pool}
        winner = max(provider_pool, key=lambda name: (provider_totals[name], name))
        provider_referents = "; ".join(f"'{name}'" for name in provider_pool)
        questions.append(item(section, 6, f"Among these four exact payment_provider values — {provider_referents} — which has the highest total 30-day revenue?", winner, [name for name in provider_pool if name != winner], "Group by exact payment_provider value and sum revenue_30d_usd"))

        metrics = ["companies", "revenue_30d_usd", "mrr_usd", "revenue_all_time_usd"]
        metric = metrics[index % len(metrics)]
        anonymous = lambda row: row["startup_name"] in (None, "", "Stealth Company", "Hidden Business")
        if metric == "companies":
            named_value = sum(not anonymous(row) for row in rows)
            anon_value = len(rows) - named_value
            answer_label = f"Named {named_value:,} · Anonymous {anon_value:,}"
            wrong = [f"Named {anon_value:,} · Anonymous {named_value:,}", f"Named {named_value+1:,} · Anonymous {anon_value-1:,}", f"Named {len(rows):,} · Anonymous 0"]
        else:
            named_value = sum(number(row[metric]) or 0 for row in rows if not anonymous(row))
            anon_value = sum(number(row[metric]) or 0 for row in rows if anonymous(row))
            answer_label = f"Named {money(named_value)} · Anonymous {money(anon_value)}"
            wrong = [f"Named {money(anon_value)} · Anonymous {money(named_value)}", f"Named {money(named_value/10)} · Anonymous {money(anon_value/10)}", f"Named {money(named_value+anon_value)} · Anonymous $0"]
        rounding = " Values are rounded to the nearest dollar." if metric != "companies" else ""
        questions.append(item(section, 7, f"Treat a blank startup_name, 'Stealth Company', or 'Hidden Business' as anonymous. What is the named-versus-anonymous split by {metric}?{rounding}", answer_label, wrong, f"Conditional aggregation of {metric}; blank/Stealth Company/Hidden Business are anonymous" + ("; round to nearest dollar" if metric != "companies" else "")))

        pairs = [("x_followers", "revenue_30d_usd"), ("x_followers", "mrr_usd"), ("domain_rating", "mrr_usd"), ("domain_rating", "revenue_30d_usd"), ("active_subscriptions", "mrr_usd"), ("active_subscriptions", "revenue_30d_usd"), ("visitors_30d", "revenue_30d_usd"), ("revenue_3m_usd", "mrr_usd")]
        left, right = pairs[index]
        correlation = corr([number(row[left]) for row in rows], [number(row[right]) for row in rows])
        correct_corr = f"{correlation:.3f}"
        corr_candidates = [-correlation, max(-0.999, min(0.999, correlation + 0.2)), max(-0.999, min(0.999, correlation - 0.2)), 0.0, 0.5, -0.5]
        corr_wrong = []
        for candidate in corr_candidates:
            label = f"{candidate:.3f}"
            if label != correct_corr and label not in corr_wrong:
                corr_wrong.append(label)
            if len(corr_wrong) == 3:
                break
        questions.append(item(section, 8, f"What is the Pearson correlation between {left} and {right}, using complete pairs only and rounded to three decimal places?", correct_corr, corr_wrong, "Pearson r on rows where both variables are nonblank; round to three decimal places"))

        audience = ["B2B", "B2C", "Both"][index % 3]
        multiples = [number(row["revenue_multiple"]) for row in rows if row["audience_type"] == audience and row["on_sale"] is True]
        multiple = median(multiples)
        mean_multiple = statistics.mean([v for v in multiples if v is not None])
        multiple_format = lambda value: f"{value:.2f}x"
        wrong_multiples = distinct_distractors(multiple, [mean_multiple, multiple * 10, max(0, multiple - 1), multiple + 1, multiple / 10], multiple_format)
        questions.append(item(section, 9, f"For on-sale {audience} companies with a stated multiple, what is the median revenue multiple, rounded to two decimal places?", multiple_format(multiple), wrong_multiples, "Filter on_sale=true and audience_type; parse revenue_multiple; median; round to two decimal places"))

        focus = categories[(index + 9) % len(categories)]
        focus_rows = [row for row in rows if row["category"] == focus]
        focus_revenue = sum(number(row["revenue_30d_usd"]) or 0 for row in focus_rows)
        focus_median = median([number(row["mrr_usd"]) for row in focus_rows])
        focus_count = len(focus_rows)
        true_statement = f"{focus} has {focus_count} rows, {money(focus_revenue)} total 30-day revenue, and {money(focus_median)} median MRR."
        wrong = [
            f"{focus} has {focus_count} rows, {money(focus_median)} total 30-day revenue, and {money(focus_revenue)} median MRR.",
            f"{focus} has {focus_count+1} rows, {money(focus_revenue)} total 30-day revenue, and {money(focus_median)} median MRR.",
            f"{focus} has {focus_count} rows, {money(focus_revenue/max(1,focus_count))} total 30-day revenue, and {money(focus_median)} median MRR.",
        ]
        questions.append(item(section, 10, f"Which statement about the {focus} category is fully supported by the dataset? All dollar values are rounded to the nearest dollar.", true_statement, wrong, "Multi-step filter, row count, total revenue, and median MRR verification; round money to nearest dollar"))
        packs.append({"sectionCode": section, "title": "Data Race", "questions": questions})

    output = {"schemaVersion": "data-race-pack/1.0", "datasetId": "trustmrr-s3-live-2026-07-30-v1", "sourceSha256": source_hash, "rowCount": len(rows), "packs": packs}
    destination = Path(args.output)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(f"Generated {len(packs)} section packs / {sum(len(p['questions']) for p in packs)} questions -> {destination}")


if __name__ == "__main__":
    main()
