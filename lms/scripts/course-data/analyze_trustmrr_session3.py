#!/usr/bin/env python3
"""Build a deterministic fact pack from the private TrustMRR Session 3 CSV.

This file is intentionally standard-library only so it can run in Google Colab.
Upload this script and the learner CSV, then run:

    !python analyze_trustmrr_session3.py \
      --input trustmrr_s3_learner_v1.csv \
      --output trustmrr_s3_fact_pack_v1.json

The generated JSON is evaluator-only. Do not place it on a student or public
surface because it contains row-level names and exact answer-key facts.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import statistics
from collections import Counter, defaultdict
from collections.abc import Iterable, Mapping, Sequence
from pathlib import Path
from typing import Any

VERSION = "1.0.0"
DATASET_VERSION = "trustmrr-s3-v1"

NUMERIC_FIELDS = (
    "source_row_number",
    "revenue_30d_usd",
    "revenue_12m_usd",
    "revenue_all_time_usd",
    "revenue_growth_30d_pct",
    "mrr_usd",
    "mrr_growth_30d_pct",
    "active_subscriptions",
    "visitors_30d",
    "revenue_per_visitor_usd",
    "domain_rating",
    "asking_price_usd",
)

GROUP_FIELDS = (
    "country",
    "category",
    "audience_type",
    "payment_provider",
    "on_sale",
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def parse_number(value: str) -> float | int | None:
    text = (value or "").strip()
    if not text:
        return None
    number = float(text)
    if number.is_integer():
        return int(number)
    return number


def load_rows(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise ValueError(f"No CSV header found in {path}")
        rows = list(reader)
        return list(reader.fieldnames), rows


def round_number(value: float | None, digits: int = 6) -> float | None:
    if value is None:
        return None
    if isinstance(value, int):
        return value
    rounded = round(value, digits)
    return int(rounded) if rounded.is_integer() else rounded


def percentile(values: Sequence[float], probability: float) -> float | None:
    """Inclusive linear-interpolation percentile, matching common sheet logic."""
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    position = (len(ordered) - 1) * probability
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    fraction = position - lower
    return ordered[lower] + (ordered[upper] - ordered[lower]) * fraction


def numeric_summary(values: Iterable[float | None]) -> dict[str, Any]:
    present = [float(value) for value in values if value is not None]
    if not present:
        return {
            "count_present": 0,
            "count_zero": 0,
            "sum": None,
            "mean": None,
            "median": None,
            "min": None,
            "p25": None,
            "p75": None,
            "p90": None,
            "max": None,
        }
    return {
        "count_present": len(present),
        "count_zero": sum(value == 0 for value in present),
        "sum": round_number(math.fsum(present)),
        "mean": round_number(math.fsum(present) / len(present)),
        "median": round_number(statistics.median(present)),
        "min": round_number(min(present)),
        "p25": round_number(percentile(present, 0.25)),
        "p75": round_number(percentile(present, 0.75)),
        "p90": round_number(percentile(present, 0.90)),
        "max": round_number(max(present)),
    }


def mrr_band(value: float | None) -> str:
    if value is None:
        return "missing"
    if value == 0:
        return "zero"
    if value < 100:
        return "micro_1_to_99_99"
    if value < 1_000:
        return "small_100_to_999_99"
    if value < 10_000:
        return "growth_1k_to_9_999_99"
    if value < 100_000:
        return "scaled_10k_to_99_999_99"
    return "large_100k_plus"


def growth_status(value: float | None) -> str:
    if value is None:
        return "missing"
    if value > 0:
        return "positive"
    if value < 0:
        return "negative"
    return "zero"


def visitor_status(value: float | None) -> str:
    if value is None:
        return "missing"
    if value == 0:
        return "zero"
    return "positive"


def pearson_pairs(pairs: Sequence[tuple[float, float]]) -> dict[str, Any]:
    if len(pairs) < 2:
        return {"pair_count": len(pairs), "pearson_r": None}
    xs = [pair[0] for pair in pairs]
    ys = [pair[1] for pair in pairs]
    x_mean = math.fsum(xs) / len(xs)
    y_mean = math.fsum(ys) / len(ys)
    numerator = math.fsum((x - x_mean) * (y - y_mean) for x, y in pairs)
    x_term = math.fsum((x - x_mean) ** 2 for x in xs)
    y_term = math.fsum((y - y_mean) ** 2 for y in ys)
    denominator = math.sqrt(x_term * y_term)
    return {
        "pair_count": len(pairs),
        "pearson_r": round_number(numerator / denominator) if denominator else None,
    }


def group_summary(
    rows: Sequence[Mapping[str, str]], field: str
) -> list[dict[str, Any]]:
    groups: dict[str, list[Mapping[str, str]]] = defaultdict(list)
    for row in rows:
        groups[(row.get(field) or "").strip() or "(missing)"].append(row)

    summaries: list[dict[str, Any]] = []
    for label, members in groups.items():
        mrr = [parse_number(row["mrr_usd"]) for row in members]
        revenue = [parse_number(row["revenue_30d_usd"]) for row in members]
        growth = [parse_number(row["mrr_growth_30d_pct"]) for row in members]
        visitors = [parse_number(row["visitors_30d"]) for row in members]
        asking = [parse_number(row["asking_price_usd"]) for row in members]
        summaries.append(
            {
                "value": label,
                "startup_count": len(members),
                "mrr_total_usd": numeric_summary(mrr)["sum"],
                "mrr_median_usd": numeric_summary(mrr)["median"],
                "revenue_30d_total_usd": numeric_summary(revenue)["sum"],
                "mrr_growth_30d_mean_pct": numeric_summary(growth)["mean"],
                "visitors_present_count": sum(value is not None for value in visitors),
                "on_sale_count": sum(
                    row["on_sale"].strip().lower() == "true" for row in members
                ),
                "asking_price_present_count": sum(
                    value is not None for value in asking
                ),
                "asking_price_median_usd": numeric_summary(asking)["median"],
            }
        )
    return sorted(summaries, key=lambda item: (-item["startup_count"], item["value"]))


def top_records(
    rows: Sequence[Mapping[str, str]], field: str, limit: int = 20
) -> list[dict[str, Any]]:
    present = [row for row in rows if parse_number(row[field]) is not None]
    ranked = sorted(
        present,
        key=lambda row: (-(float(parse_number(row[field]) or 0)), row["record_id"]),
    )[:limit]
    return [
        {
            "rank": index + 1,
            "record_id": row["record_id"],
            "startup_name": row["startup_name"],
            field: parse_number(row[field]),
            "category": row["category"] or None,
            "country": row["country"] or None,
        }
        for index, row in enumerate(ranked)
    ]


def build_fact_pack(input_path: Path) -> dict[str, Any]:
    headers, rows = load_rows(input_path)
    parsed = {
        field: [parse_number(row[field]) for row in rows] for field in NUMERIC_FIELDS
    }

    missingness = {
        field: {
            "missing_count": sum(not (row.get(field) or "").strip() for row in rows),
            "present_count": sum(bool((row.get(field) or "").strip()) for row in rows),
            "missing_pct": round_number(
                100
                * sum(not (row.get(field) or "").strip() for row in rows)
                / len(rows)
            ),
        }
        for field in headers
    }

    mrr_bands = Counter(mrr_band(value) for value in parsed["mrr_usd"])
    growth_counts = Counter(
        growth_status(value) for value in parsed["mrr_growth_30d_pct"]
    )
    visitor_counts = Counter(visitor_status(value) for value in parsed["visitors_30d"])

    visitor_rows = [row for row in rows if (parse_number(row["visitors_30d"]) or 0) > 0]
    weighted_rpv_numerator = math.fsum(
        float(parse_number(row["revenue_30d_usd"]) or 0) for row in visitor_rows
    )
    weighted_rpv_denominator = math.fsum(
        float(parse_number(row["visitors_30d"]) or 0) for row in visitor_rows
    )

    sale_rows = [row for row in rows if row["on_sale"].strip().lower() == "true"]
    sale_multiple_values: list[float] = []
    for row in sale_rows:
        asking_price = parse_number(row["asking_price_usd"])
        mrr = parse_number(row["mrr_usd"])
        if asking_price is not None and mrr is not None and mrr > 0:
            sale_multiple_values.append(float(asking_price) / (12 * float(mrr)))

    correlations = {
        "mrr_vs_revenue_30d": pearson_pairs(
            [
                (float(mrr), float(revenue))
                for mrr, revenue in zip(parsed["mrr_usd"], parsed["revenue_30d_usd"])
                if mrr is not None and revenue is not None
            ]
        ),
        "visitors_vs_revenue_30d": pearson_pairs(
            [
                (float(visitors), float(revenue))
                for visitors, revenue in zip(
                    parsed["visitors_30d"], parsed["revenue_30d_usd"]
                )
                if visitors is not None and revenue is not None
            ]
        ),
        "mrr_vs_active_subscriptions": pearson_pairs(
            [
                (float(mrr), float(subscriptions))
                for mrr, subscriptions in zip(
                    parsed["mrr_usd"], parsed["active_subscriptions"]
                )
                if mrr is not None and subscriptions is not None
            ]
        ),
    }

    duplicate_ids = [
        key
        for key, count in Counter(row["record_id"] for row in rows).items()
        if count > 1
    ]
    duplicate_slugs = [
        key
        for key, count in Counter(row["startup_slug"] for row in rows).items()
        if key and count > 1
    ]
    invalid_json_cells: list[dict[str, str]] = []
    for row in rows:
        for field in ("markets_json", "tech_frontend_json", "tech_backend_json"):
            try:
                parsed_json = json.loads(row[field])
                if not isinstance(parsed_json, list):
                    raise TypeError("value is not a JSON array")
            except (json.JSONDecodeError, TypeError) as exc:
                invalid_json_cells.append(
                    {"record_id": row["record_id"], "field": field, "error": str(exc)}
                )

    fact_pack = {
        "metadata": {
            "analysis_version": VERSION,
            "dataset_version": DATASET_VERSION,
            "input_filename": input_path.name,
            "input_sha256": sha256_file(input_path),
            "row_count": len(rows),
            "column_count": len(headers),
            "rounding": "six decimal places; integer-valued results emitted as integers",
            "percentile_method": "inclusive linear interpolation at (n-1)*p",
        },
        "overview": {
            "startup_count": len(rows),
            "on_sale_count": len(sale_rows),
            "not_on_sale_count": len(rows) - len(sale_rows),
            "mrr_band_counts": dict(sorted(mrr_bands.items())),
            "mrr_growth_status_counts": dict(sorted(growth_counts.items())),
            "visitor_status_counts": dict(sorted(visitor_counts.items())),
        },
        "numeric_summaries": {
            field: numeric_summary(values) for field, values in parsed.items()
        },
        "missingness": missingness,
        "group_summaries": {
            field: group_summary(rows, field) for field in GROUP_FIELDS
        },
        "top_records": {
            field: top_records(rows, field)
            for field in (
                "mrr_usd",
                "revenue_30d_usd",
                "revenue_12m_usd",
                "mrr_growth_30d_pct",
                "visitors_30d",
            )
        },
        "visitor_analysis": {
            "positive_visitor_row_count": len(visitor_rows),
            "weighted_revenue_per_visitor_usd": round_number(
                weighted_rpv_numerator / weighted_rpv_denominator
                if weighted_rpv_denominator
                else None
            ),
            "weighted_revenue_numerator_usd": round_number(weighted_rpv_numerator),
            "visitor_denominator": round_number(weighted_rpv_denominator),
            "warning": "Rows with missing or zero visitors are excluded from the weighted rate.",
        },
        "sale_analysis": {
            "on_sale_count": len(sale_rows),
            "asking_price_summary_usd": numeric_summary(
                parse_number(row["asking_price_usd"]) for row in sale_rows
            ),
            "annualised_mrr_multiple_summary": numeric_summary(sale_multiple_values),
            "annualised_mrr_multiple_formula": "asking_price_usd / (12 * mrr_usd); requires asking price and mrr_usd > 0",
        },
        "correlations": correlations,
        "data_quality": {
            "duplicate_record_ids": sorted(duplicate_ids),
            "duplicate_startup_slugs": sorted(duplicate_slugs),
            "invalid_json_cells": invalid_json_cells,
            "negative_active_subscription_count": sum(
                (value or 0) < 0 for value in parsed["active_subscriptions"]
            ),
            "negative_visitor_count": sum(
                (value or 0) < 0 for value in parsed["visitors_30d"]
            ),
        },
        "answer_key_paths": {
            "total_mrr_usd": "numeric_summaries.mrr_usd.sum",
            "median_mrr_usd": "numeric_summaries.mrr_usd.median",
            "zero_mrr_startups": "numeric_summaries.mrr_usd.count_zero",
            "on_sale_startups": "overview.on_sale_count",
            "visitor_coverage": "missingness.visitors_30d",
            "weighted_revenue_per_visitor_usd": "visitor_analysis.weighted_revenue_per_visitor_usd",
            "category_comparisons": "group_summaries.category",
            "country_comparisons": "group_summaries.country",
            "sale_multiple": "sale_analysis.annualised_mrr_multiple_summary",
        },
        "usage_notice": (
            "Evaluator-only deterministic facts for Masters' Union Course 1 Session 3. "
            "Keep inside the roster-gated course environment; do not expose names, "
            "row-level values, answer paths, or exact keys to learners before assessment closes."
        ),
    }
    return fact_pack


def write_json(path: Path, payload: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(
            payload, handle, ensure_ascii=False, sort_keys=True, separators=(",", ":")
        )
        handle.write("\n")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("trustmrr_s3_learner_v1.csv"),
        help="Path to the canonical learner CSV.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("trustmrr_s3_fact_pack_v1.json"),
        help="Private evaluator-only JSON output path.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    fact_pack = build_fact_pack(args.input)
    write_json(args.output, fact_pack)
    print(
        json.dumps(
            {
                "status": "ok",
                "input": str(args.input),
                "input_sha256": fact_pack["metadata"]["input_sha256"],
                "output": str(args.output),
                "output_sha256": sha256_file(args.output),
                "rows": fact_pack["metadata"]["row_count"],
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
