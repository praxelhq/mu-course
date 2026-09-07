#!/usr/bin/env python3
"""Generate private, deterministic Session 3 Data Race packs from the frozen 1,000-row JSON.

The input is byte-verified against the snapshot published to learners as the Google Sheet
"MU · Session 3 · TrustMRR 1,000-Row Dataset · Frozen 30 Jul 2026"; the sheet's underlying
cell values are identical to this file.

Every item is answerable from that sheet alone and states its own filter, blank rule and
rounding, so exactly one option is defensible. Each of the three distractors is the output
of one named plausible-but-wrong method, so an answer produced without inspecting the data
lands on a distractor instead of nowhere.

Sections are selectable: a section that has already raced must never be regenerated, because
its learners answered the previously released items.
"""

import argparse
import hashlib
import json
import math
import random
import statistics
from pathlib import Path

ALL_SECTIONS = "ABCDEFGH"
TIMES = [60, 75, 75, 90, 90, 105, 120]
DIFFICULTIES = ["Easy", "Moderate", "Moderate", "Challenging", "Challenging", "Hard", "Expert"]
EXPECTED_SOURCE_SHA256 = "36d32ac250effbba9cb2c2fcb2cb3ad4c61396a8b2f501d3d7e20be061f1ff77"
EXPECTED_ROWS = 1000
EXPECTED_COLUMNS = 29

# Per-section parameters, indexed by the section's slot in the release order.
PROVIDERS = ["Stripe (API key)", "RevenueCat (API key)", "Polar (API key)", "Lemon Squeezy (API key)", "Dodo Payments (API key)"]
# (column, mode); "zero" asks for reported zeroes, "blank" asks for empty cells.
BLANK_ZERO_FIELDS = [("visitors_30d", "zero"), ("domain_rating", "zero"), ("mrr_growth_30d_pct", "zero"), ("visitors_30d", "blank"), ("domain_rating", "blank")]
# Tags verified to be substrings of no other tag, so a wildcard search and an exact
# list-membership test agree; only the category-versus-markets mistake can move the number.
MARKET_TAGS = ["SaaS", "Productivity", "Content Creation", "Analytics", "Mobile Apps"]
# (label, predicate key) for the text-typed revenue_multiple item.
MULTIPLE_SLICES = [("B2B", "audience"), ("B2C", "audience"), ("AI", "category"), ("Mobile Apps", "category"), ("SaaS", "category")]
ARPU_CATEGORIES = ["AI", "SaaS", "Mobile Apps", "Marketing", "Productivity"]
# Categories chosen so all four lines separate: each has zero-MRR rows (median with and
# without them differ) and a markets_json slice distinct from the category slice.
MEDIAN_CATEGORIES = ["Content Creation", "Dev Tools", "Education", "Health & Fitness", "Social Media"]
STATEMENT_CATEGORIES = ["Mobile Apps", "Productivity", "Design Tools", "E-comm", "Marketing"]


def number(value):
    """Parse a numeric cell. Numeric zero survives; blanks, booleans and text do not."""
    if value is None or isinstance(value, bool):
        return None
    text = str(value).strip().replace(",", "").replace("$", "")
    if text.endswith("x"):
        text = text[:-1]
    if text == "":
        return None
    try:
        result = float(text)
    except ValueError:
        return None
    return result if math.isfinite(result) else None


def is_blank(row, field):
    value = row[field]
    return value is None or (isinstance(value, str) and value.strip() == "")


def money(value):
    return f"${value:,.0f}"


def cents(value):
    return f"${value:,.2f}"


def counted(value):
    return f"{value:,}"


def multiple(value):
    return f"{value:.2f}x"


def markets(row):
    try:
        parsed = json.loads(row["markets_json"] or "[]")
    except (TypeError, ValueError):
        return []
    return parsed if isinstance(parsed, list) else []


def category_of(row):
    value = row["category"]
    return value.strip() if isinstance(value, str) else ""


def audience_of(row):
    value = row["audience_type"]
    return value.strip() if isinstance(value, str) else ""


def median(values):
    clean = [value for value in values if value is not None]
    return statistics.median(clean) if clean else 0.0


def answer_position(section, position):
    """Per-section 2/2/2/1 spread, rotated by section so no option dominates the release."""
    base_counts = [2, 2, 2, 1]
    shift = (ord(section) - ord("A")) % 4
    counts = base_counts[-shift:] + base_counts[:-shift] if shift else base_counts
    positions = [index for index, quantity in enumerate(counts) for _ in range(quantity)]
    random.Random(f"data-race-answer-positions-v2-{section}").shuffle(positions)
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
    return rendered, chr(97 + correct_index)


def item(section, position, prompt, correct, wrong, note, trap):
    stable_id = f"S3-DATA-RACE-{section}-{position:02d}@2"
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
        "trapNote": trap,
    }


def question_one(section, index, rows):
    """payment_provider holds composite values, so exact match and contains disagree."""
    provider = PROVIDERS[index]
    exact = sum(1 for row in rows if row["payment_provider"] == provider)
    contains = sum(1 for row in rows if provider in row["payment_provider"])
    composite = sum(1 for row in rows if "," in row["payment_provider"])
    prompt = (
        f"Some payment_provider cells list two providers separated by a comma; those are their own "
        f"distinct values. How many rows have payment_provider exactly equal to '{provider}' and nothing else?"
    )
    return item(
        section, 1, prompt, counted(exact),
        [counted(contains), counted(exact + composite), counted(len(rows) - exact)],
        f"Exact-equality count of payment_provider = '{provider}' over {len(rows)} data rows",
        f"A contains/wildcard match returns {contains}; adding every multi-provider row returns {exact + composite}.",
    )


def question_two(section, index, rows):
    """A blank cell was never recorded; a reported zero is an observation."""
    field, mode = BLANK_ZERO_FIELDS[index]
    blanks = sum(1 for row in rows if is_blank(row, field))
    zeroes = sum(1 for row in rows if number(row[field]) == 0)
    if mode == "zero":
        prompt = (
            f"In `{field}`, how many rows report a value of exactly zero? An empty cell means the "
            "value was never recorded and does not count as a zero."
        )
        correct, wrong = zeroes, [blanks, blanks + zeroes, len(rows) - blanks]
        note = f"Count rows where {field} equals numeric 0; empty cells excluded"
        trap = f"Treating empty cells as zeroes returns {blanks + zeroes}; counting empty cells instead returns {blanks}."
    else:
        prompt = (
            f"In `{field}`, how many rows are empty? A reported zero is a recorded observation and "
            "does not count as empty."
        )
        correct, wrong = blanks, [blanks + zeroes, zeroes, len(rows) - blanks]
        note = f"Count rows where {field} is an empty cell; reported zeroes excluded"
        trap = f"Folding reported zeroes into the empty cells returns {blanks + zeroes}."
    return item(section, 2, prompt, counted(correct), [counted(value) for value in wrong], note, trap)


def question_three(section, index, rows):
    """`category` is one value per row; `markets_json` is a list the row also belongs to."""
    tag = MARKET_TAGS[index]
    tagged = [row for row in rows if tag in markets(row)]
    categorised = [row for row in rows if category_of(row) == tag]
    both = [row for row in tagged if category_of(row) == tag]
    answer = len(tagged) - len(both)
    prompt = (
        f"`markets_json` holds a JSON list of tags, while `category` holds a single value. How many "
        f"rows include '{tag}' in their markets_json list but do NOT have '{tag}' as their category?"
    )
    return item(
        section, 3, prompt, counted(answer),
        [counted(len(tagged)), counted(len(categorised)), counted(len(tagged) + len(categorised))],
        f"Rows whose markets_json list contains '{tag}', minus those whose category is also '{tag}'",
        f"Counting markets_json alone returns {len(tagged)}; reading the category column instead returns {len(categorised)}.",
    )


def question_four(section, index, rows):
    """revenue_multiple is text ('2.4x') and a stated 0.0x is a real stated multiple."""
    label, kind = MULTIPLE_SLICES[index]
    match = (lambda row: audience_of(row) == label) if kind == "audience" else (lambda row: category_of(row) == label)
    stated = [row for row in rows if match(row) and not is_blank(row, "revenue_multiple")]
    values = [number(row["revenue_multiple"]) for row in stated]
    non_zero = [value for value in values if value > 0]
    descriptor = f"{label} companies" if kind == "audience" else f"companies in the {label} category"
    prompt = (
        f"`revenue_multiple` is stored as text such as '2.4x'. Across {descriptor} whose revenue_multiple "
        "is not blank — a stated 0.0x counts as stated — what is the median multiple, to two decimal places?"
    )
    return item(
        section, 4, prompt, multiple(median(values)),
        [multiple(median(non_zero)), multiple(statistics.mean(values)), multiple(median(values) * 10)],
        f"Strip the trailing 'x', take MEDIAN over {len(values)} non-blank revenue_multiple rows for {label}; 0.0x retained",
        f"Discarding the {len(values) - len(non_zero)} stated 0.0x rows returns {multiple(median(non_zero))}; "
        f"using the mean returns {multiple(statistics.mean(values))}.",
    )


def question_five(section, index, rows):
    """A group rate is a ratio of sums, not an average of per-row ratios."""
    category = ARPU_CATEGORIES[index]
    paying = [row for row in rows if category_of(row) == category and (number(row["active_subscriptions"]) or 0) > 0]
    revenue = sum(number(row["revenue_30d_usd"]) or 0 for row in paying)
    subscriptions = sum(number(row["active_subscriptions"]) for row in paying)
    answer = revenue / subscriptions
    ratios = [(number(row["revenue_30d_usd"]) or 0) / number(row["active_subscriptions"]) for row in paying]
    tagged = [row for row in rows if category in markets(row) and (number(row["active_subscriptions"]) or 0) > 0]
    tagged_rate = (
        sum(number(row["revenue_30d_usd"]) or 0 for row in tagged)
        / sum(number(row["active_subscriptions"]) for row in tagged)
    )
    # A money distractor closer than 2% to the answer reads as a rounding artifact rather
    # than a method error, so fall back to revenue per company when the slices nearly agree.
    third, third_label = tagged_rate, "filtering markets_json instead of category"
    if abs(tagged_rate - answer) / answer < 0.02:
        third, third_label = revenue / len(paying), "dividing by the number of companies instead of subscriptions"
    prompt = (
        f"Take every row whose category is {category} and whose active_subscriptions is greater than zero. "
        "For that group as a whole, what is total revenue_30d_usd divided by total active_subscriptions, "
        "to the nearest cent?"
    )
    return item(
        section, 5, prompt, cents(answer),
        [cents(statistics.mean(ratios)), cents(statistics.median(ratios)), cents(third)],
        f"SUM(revenue_30d_usd) / SUM(active_subscriptions) over {len(paying)} {category} rows with subscriptions > 0",
        f"Averaging each row's own ratio returns {cents(statistics.mean(ratios))}; taking the median of those "
        f"ratios returns {cents(statistics.median(ratios))}; {third_label} returns {cents(third)}.",
    )


def question_six(section, index, rows):
    """Median across the whole category, with reported zeroes kept in."""
    category = MEDIAN_CATEGORIES[index]
    in_category = [row for row in rows if category_of(row) == category]
    values = [number(row["mrr_usd"]) or 0 for row in in_category]
    non_zero = [value for value in values if value > 0]
    tagged = [number(row["mrr_usd"]) or 0 for row in rows if category in markets(row)]
    prompt = (
        f"Across all {len(in_category)} rows whose category is {category}, what is the median mrr_usd? "
        "Rows reporting an MRR of zero are real observations and stay in. Round to the nearest dollar."
    )
    return item(
        section, 6, prompt, money(median(values)),
        [money(median(non_zero)), money(statistics.mean(values)), money(median(tagged))],
        f"MEDIAN(mrr_usd) over all rows with category = {category}; reported zeroes retained; nearest dollar",
        f"Dropping the {len(values) - len(non_zero)} zero-MRR rows returns {money(median(non_zero))}; using the mean "
        f"returns {money(statistics.mean(values))}; filtering markets_json instead of category returns {money(median(tagged))}.",
    )


def question_seven(section, index, rows):
    """One wrong line per wrong method: wrong filter, wrong zero rule, wrong statistic."""
    category = STATEMENT_CATEGORIES[index]
    in_category = [row for row in rows if category_of(row) == category]
    tagged = [row for row in rows if category in markets(row)]
    values = [number(row["mrr_usd"]) or 0 for row in in_category]
    non_zero = [value for value in values if value > 0]
    revenue = sum(number(row["revenue_30d_usd"]) or 0 for row in in_category)
    tagged_revenue = sum(number(row["revenue_30d_usd"]) or 0 for row in tagged)
    tagged_values = [number(row["mrr_usd"]) or 0 for row in tagged]

    def line(rows_count, total_revenue, median_mrr):
        return f"{rows_count:,} rows · {money(total_revenue)} total 30-day revenue · {money(median_mrr)} median MRR"

    prompt = (
        f"Which line is fully supported for {category}? Use rows whose `category` field is exactly "
        f"{category}, keep rows reporting zero MRR, and read median as the middle value rather than the "
        "average. Dollar values are rounded to the nearest dollar."
    )
    return item(
        section, 7, prompt, line(len(in_category), revenue, median(values)),
        [
            line(len(tagged), tagged_revenue, median(tagged_values)),
            line(len(in_category), revenue, median(non_zero)),
            line(len(in_category), revenue, statistics.mean(values)),
        ],
        f"COUNT, SUM(revenue_30d_usd) and MEDIAN(mrr_usd) over rows with category = {category}",
        "The wrong lines are, in turn: filtering markets_json instead of category, dropping zero-MRR rows, "
        "and reporting the mean in the median slot.",
    )


BUILDERS = [question_one, question_two, question_three, question_four, question_five, question_six, question_seven]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument(
        "--sections", required=True,
        help="Section codes to generate, e.g. BCDEG. Never include a section that has already raced.",
    )
    args = parser.parse_args()

    sections = list(dict.fromkeys(args.sections.strip().upper()))
    if not sections or any(code not in ALL_SECTIONS for code in sections):
        raise ValueError(f"--sections must be a non-empty subset of {ALL_SECTIONS}")
    if len(sections) > len(PROVIDERS):
        raise ValueError(f"Only {len(PROVIDERS)} distinct section parameter sets are defined")

    source = Path(args.input)
    raw = json.loads(source.read_text())
    header, body = raw[0], raw[1:]
    rows = [dict(zip(header, row + [None] * (len(header) - len(row)))) for row in body]
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    if source_hash != EXPECTED_SOURCE_SHA256 or len(rows) != EXPECTED_ROWS or len(header) != EXPECTED_COLUMNS:
        raise ValueError("Input is not the frozen 1,000-row, 29-column Session 3 dataset")

    packs = [
        {"sectionCode": section, "title": "Data Race", "questions": [builder(section, index, rows) for builder in BUILDERS]}
        for index, section in enumerate(sections)
    ]
    output = {
        "schemaVersion": "data-race-pack/1.0",
        "datasetId": "trustmrr-s3-live-2026-07-30-v1",
        "sourceSha256": source_hash,
        "rowCount": len(rows),
        "packs": packs,
    }
    destination = Path(args.output)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(f"Generated {len(packs)} section packs ({', '.join(sections)}) / {sum(len(pack['questions']) for pack in packs)} questions -> {destination}")


if __name__ == "__main__":
    main()
