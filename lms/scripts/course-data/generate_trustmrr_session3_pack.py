#!/usr/bin/env python3
"""Generate the private, reproducible TrustMRR Session 3 teaching data pack."""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import importlib.metadata
import json
import math
import shutil
import tempfile
from collections import Counter
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path
from typing import Any

import tiktoken
from analyze_trustmrr_session3 import (
    build_fact_pack,
    growth_status,
    load_rows,
    mrr_band,
    parse_number,
    sha256_file,
    visitor_status,
    write_json,
)
from build_trustmrr_s3_evaluator_adapter import (
    PINNED_PANDAS_VERSION,
    REQUIRED_ITEM_IDS,
    build_evaluator_adapter,
)

GENERATOR_VERSION = "1.1.0"
DATASET_VERSION = "trustmrr-s3-v1"
SOURCE_SNAPSHOT_DATE = "2026-07-30"
TOKENIZER_NAME = "cl100k_base"
PINNED_TIKTOKEN_VERSION = "0.12.0"
CONTEXT_THRESHOLD_TOKENS = 1_000_000
PEERS_PER_STARTUP = 24
PEER_SAMPLE_SIZE = 12
SAMPLE_PER_MRR_BAND = 6
SAMPLE_SEED = "trustmrr-session3-representative-v1"
PEER_SAMPLE_SEED = "trustmrr-session3-peer-sample-v1"

LEARNER_FILENAME = "trustmrr_s3_learner_v1.csv"
SCHEMA_FILENAME = "trustmrr_s3_schema_v1.json"
SAMPLE_FILENAME = "trustmrr_s3_representative_sample_v1.csv"
PEERS_FILENAME = "trustmrr_s3_peer_comparisons_v1.jsonl.gz"
PEER_SAMPLE_FILENAME = "trustmrr_s3_peer_comparisons_sample_v1.jsonl"
FACTS_FILENAME = "trustmrr_s3_fact_pack_v1.json"
ADAPTER_FILENAME = "trustmrr_s3_evaluator_adapter_v1.json"
MANIFEST_FILENAME = "trustmrr_s3_manifest_v1.json"

EXPECTED_HEADERS = (
    "record_id",
    "source_row_number",
    "startup_name",
    "startup_slug",
    "trustmrr_url",
    "website",
    "country",
    "payment_provider",
    "revenue_30d_usd",
    "revenue_12m_usd",
    "revenue_all_time_usd",
    "revenue_growth_30d_pct",
    "mrr_usd",
    "mrr_growth_30d_pct",
    "active_subscriptions",
    "visitors_30d",
    "revenue_per_visitor_usd",
    "value_proposition",
    "problem_solved",
    "pricing_model",
    "target_persona",
    "audience_type",
    "category",
    "markets_json",
    "tech_frontend_json",
    "tech_backend_json",
    "domain_rating",
    "on_sale",
    "asking_price_usd",
)

FIELD_SPECS: tuple[dict[str, Any], ...] = (
    {
        "name": "record_id",
        "logical_type": "string",
        "nullable": False,
        "description": "Stable teaching-record identifier; primary key.",
    },
    {
        "name": "source_row_number",
        "logical_type": "integer",
        "nullable": False,
        "description": "One-indexed source Sheet row number retained for lineage.",
    },
    {
        "name": "startup_name",
        "logical_type": "string",
        "nullable": False,
        "description": "Startup display name.",
    },
    {
        "name": "startup_slug",
        "logical_type": "string",
        "nullable": False,
        "description": "TrustMRR startup slug.",
    },
    {
        "name": "trustmrr_url",
        "logical_type": "url",
        "nullable": False,
        "description": "TrustMRR profile URL.",
    },
    {
        "name": "website",
        "logical_type": "url",
        "nullable": True,
        "description": "Startup website when present.",
    },
    {
        "name": "country",
        "logical_type": "string",
        "nullable": True,
        "description": "Two-letter country code as supplied.",
    },
    {
        "name": "payment_provider",
        "logical_type": "string",
        "nullable": False,
        "description": "Payment provider / verification route label.",
    },
    {
        "name": "revenue_30d_usd",
        "logical_type": "number",
        "nullable": False,
        "unit": "USD",
        "description": "Revenue over the latest 30-day source window.",
    },
    {
        "name": "revenue_12m_usd",
        "logical_type": "number",
        "nullable": False,
        "unit": "USD",
        "description": "Revenue over the latest 12-month source window.",
    },
    {
        "name": "revenue_all_time_usd",
        "logical_type": "number",
        "nullable": False,
        "unit": "USD",
        "description": "All-time revenue reported by the source.",
    },
    {
        "name": "revenue_growth_30d_pct",
        "logical_type": "number",
        "nullable": True,
        "unit": "percent",
        "description": "Thirty-day revenue growth rate; percentage points, not a decimal fraction.",
    },
    {
        "name": "mrr_usd",
        "logical_type": "number",
        "nullable": False,
        "unit": "USD/month",
        "description": "Monthly recurring revenue reported by the source.",
    },
    {
        "name": "mrr_growth_30d_pct",
        "logical_type": "number",
        "nullable": True,
        "unit": "percent",
        "description": "Thirty-day MRR growth rate; percentage points.",
    },
    {
        "name": "active_subscriptions",
        "logical_type": "integer",
        "nullable": False,
        "unit": "subscriptions",
        "description": "Active subscription count.",
    },
    {
        "name": "visitors_30d",
        "logical_type": "number",
        "nullable": True,
        "unit": "visitors",
        "description": "Visitors in the latest 30-day source window. Blank means unavailable; zero is observed zero.",
    },
    {
        "name": "revenue_per_visitor_usd",
        "logical_type": "number",
        "nullable": True,
        "unit": "USD/visitor",
        "description": "Source-provided revenue per visitor. Blank and zero are distinct.",
    },
    {
        "name": "value_proposition",
        "logical_type": "string",
        "nullable": True,
        "description": "Product value-proposition text.",
    },
    {
        "name": "problem_solved",
        "logical_type": "string",
        "nullable": True,
        "description": "Problem statement text.",
    },
    {
        "name": "pricing_model",
        "logical_type": "string",
        "nullable": True,
        "description": "Pricing description supplied by the source.",
    },
    {
        "name": "target_persona",
        "logical_type": "string",
        "nullable": True,
        "description": "Primary target-user description.",
    },
    {
        "name": "audience_type",
        "logical_type": "string",
        "nullable": True,
        "description": "Broad audience type, such as B2B or B2C.",
    },
    {
        "name": "category",
        "logical_type": "string",
        "nullable": True,
        "description": "Primary product category.",
    },
    {
        "name": "markets_json",
        "logical_type": "json_array_string",
        "nullable": False,
        "description": "JSON-encoded array of market/category tags.",
    },
    {
        "name": "tech_frontend_json",
        "logical_type": "json_array_string",
        "nullable": False,
        "description": "JSON-encoded array of frontend technologies.",
    },
    {
        "name": "tech_backend_json",
        "logical_type": "json_array_string",
        "nullable": False,
        "description": "JSON-encoded array of backend technologies.",
    },
    {
        "name": "domain_rating",
        "logical_type": "number",
        "nullable": True,
        "description": "Source-provided domain rating.",
    },
    {
        "name": "on_sale",
        "logical_type": "boolean_string",
        "nullable": False,
        "description": "Lowercase true/false sale-listing flag.",
    },
    {
        "name": "asking_price_usd",
        "logical_type": "number",
        "nullable": True,
        "unit": "USD",
        "description": "Asking price when a sale listing supplies one.",
    },
)

PEER_ENTITY_FIELD_SPECS: tuple[dict[str, Any], ...] = (
    {
        "path": "record_id",
        "logical_type": "string",
        "nullable": False,
        "description": "Stable learner-dataset record identifier.",
    },
    {
        "path": "startup_name",
        "logical_type": "string",
        "nullable": False,
        "description": "Startup display name.",
    },
    {
        "path": "country",
        "logical_type": "string",
        "nullable": True,
        "description": "Country code when supplied.",
    },
    {
        "path": "category",
        "logical_type": "string",
        "nullable": True,
        "description": "Primary category when supplied.",
    },
    {
        "path": "audience_type",
        "logical_type": "string",
        "nullable": True,
        "description": "Broad audience type when supplied.",
    },
    {
        "path": "markets",
        "logical_type": "array<string>",
        "nullable": False,
        "description": "Decoded market/category tags; may be an empty array.",
    },
    {
        "path": "mrr_usd",
        "logical_type": "number",
        "nullable": False,
        "unit": "USD/month",
        "description": "Monthly recurring revenue; observed zero remains zero.",
    },
    {
        "path": "mrr_growth_30d_pct",
        "logical_type": "number",
        "nullable": True,
        "unit": "percentage points",
        "description": "Thirty-day MRR growth when supplied.",
    },
    {
        "path": "revenue_30d_usd",
        "logical_type": "number",
        "nullable": False,
        "unit": "USD",
        "description": "Latest 30-day revenue.",
    },
    {
        "path": "revenue_growth_30d_pct",
        "logical_type": "number",
        "nullable": True,
        "unit": "percentage points",
        "description": "Thirty-day revenue growth when supplied.",
    },
    {
        "path": "revenue_12m_usd",
        "logical_type": "number",
        "nullable": False,
        "unit": "USD",
        "description": "Latest 12-month revenue.",
    },
    {
        "path": "active_subscriptions",
        "logical_type": "integer",
        "nullable": False,
        "unit": "subscriptions",
        "description": "Active subscription count.",
    },
    {
        "path": "visitors_30d",
        "logical_type": "number",
        "nullable": True,
        "unit": "visitors",
        "description": "Latest 30-day visitors; null and observed zero are distinct.",
    },
    {
        "path": "revenue_per_visitor_usd",
        "logical_type": "number",
        "nullable": True,
        "unit": "USD/visitor",
        "description": "Revenue per visitor when supplied.",
    },
    {
        "path": "on_sale",
        "logical_type": "boolean",
        "nullable": False,
        "description": "Whether the source row is listed for sale.",
    },
    {
        "path": "asking_price_usd",
        "logical_type": "number",
        "nullable": True,
        "unit": "USD",
        "description": "Asking price when supplied; null and observed zero are distinct.",
    },
    {
        "path": "value_proposition",
        "logical_type": "string",
        "nullable": True,
        "description": "Value-proposition text when supplied.",
    },
    {
        "path": "problem_solved",
        "logical_type": "string",
        "nullable": True,
        "description": "Problem statement when supplied.",
    },
    {
        "path": "pricing_model",
        "logical_type": "string",
        "nullable": True,
        "description": "Pricing description when supplied.",
    },
    {
        "path": "target_persona",
        "logical_type": "string",
        "nullable": True,
        "description": "Target-persona description when supplied.",
    },
)


def peer_field_specs() -> list[dict[str, Any]]:
    fields: list[dict[str, Any]] = [
        {
            "path": "comparison_id",
            "logical_type": "string",
            "nullable": False,
            "description": "Stable focal/peer pair identifier; primary key.",
        },
        {
            "path": "focal_record_id",
            "logical_type": "string",
            "nullable": False,
            "description": "Foreign key to focal.record_id.",
        },
        {
            "path": "peer_record_id",
            "logical_type": "string",
            "nullable": False,
            "description": "Foreign key to peer.record_id.",
        },
        {
            "path": "peer_rank",
            "logical_type": "integer",
            "nullable": False,
            "description": "One-based deterministic similarity rank within the focal startup.",
        },
        {
            "path": "similarity.category_match",
            "logical_type": "boolean",
            "nullable": False,
            "description": "True only when both non-null canonical categories match.",
        },
        {
            "path": "similarity.audience_type_match",
            "logical_type": "boolean",
            "nullable": False,
            "description": "True only when both non-null audience types match.",
        },
        {
            "path": "similarity.country_match",
            "logical_type": "boolean",
            "nullable": False,
            "description": "True only when both non-null country codes match.",
        },
        {
            "path": "similarity.shared_markets",
            "logical_type": "array<string>",
            "nullable": False,
            "description": "Sorted intersection of focal and peer market tags.",
        },
        {
            "path": "similarity.shared_market_count",
            "logical_type": "integer",
            "nullable": False,
            "description": "Length of similarity.shared_markets.",
        },
        {
            "path": "similarity.absolute_log1p_mrr_distance",
            "logical_type": "number",
            "nullable": False,
            "description": "Absolute log1p MRR distance used after categorical match criteria.",
        },
    ]
    for prefix in ("focal", "peer"):
        for spec in PEER_ENTITY_FIELD_SPECS:
            fields.append({**spec, "path": f"{prefix}.{spec['path']}"})
    fields.extend(
        [
            {
                "path": "comparison.mrr_gap_usd",
                "logical_type": "number",
                "nullable": False,
                "unit": "USD/month",
                "description": "focal.mrr_usd minus peer.mrr_usd.",
            },
            {
                "path": "comparison.mrr_ratio_to_peer",
                "logical_type": "number",
                "nullable": True,
                "description": "focal MRR divided by peer MRR; null when peer MRR is zero.",
            },
            {
                "path": "comparison.revenue_30d_gap_usd",
                "logical_type": "number",
                "nullable": False,
                "unit": "USD",
                "description": "Focal minus peer 30-day revenue.",
            },
            {
                "path": "comparison.revenue_30d_ratio_to_peer",
                "logical_type": "number",
                "nullable": True,
                "description": "Focal divided by peer 30-day revenue; null for a zero peer denominator.",
            },
            {
                "path": "comparison.mrr_growth_gap_pct_points",
                "logical_type": "number",
                "nullable": True,
                "unit": "percentage points",
                "description": "Focal minus peer MRR growth; null if either input is missing.",
            },
            {
                "path": "comparison.active_subscription_gap",
                "logical_type": "number",
                "nullable": False,
                "unit": "subscriptions",
                "description": "Focal minus peer active subscriptions.",
            },
            {
                "path": "comparison.visitor_gap_30d",
                "logical_type": "number",
                "nullable": True,
                "unit": "visitors",
                "description": "Focal minus peer visitors; null if either input is missing.",
            },
            {
                "path": "comparison.revenue_per_visitor_gap_usd",
                "logical_type": "number",
                "nullable": True,
                "unit": "USD/visitor",
                "description": "Focal minus peer revenue per visitor; null if either input is missing.",
            },
            {
                "path": "comparison.asking_price_gap_usd",
                "logical_type": "number",
                "nullable": True,
                "unit": "USD",
                "description": "Focal minus peer asking price; null if either input is missing.",
            },
        ]
    )
    return fields


MRR_BAND_ORDER = (
    "zero",
    "micro_1_to_99_99",
    "small_100_to_999_99",
    "growth_1k_to_9_999_99",
    "scaled_10k_to_99_999_99",
    "large_100k_plus",
)


def stable_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def stable_row_order(row: Mapping[str, str]) -> tuple[str, str]:
    return (stable_hash(f"{SAMPLE_SEED}:{row['record_id']}"), row["record_id"])


def json_array(value: str) -> list[str]:
    parsed = json.loads(value)
    if not isinstance(parsed, list) or not all(
        isinstance(item, str) for item in parsed
    ):
        raise ValueError("expected a JSON array of strings")
    return parsed


def validate_source(headers: Sequence[str], rows: Sequence[Mapping[str, str]]) -> None:
    if tuple(headers) != EXPECTED_HEADERS:
        raise ValueError(
            "Source schema changed. Expected "
            f"{list(EXPECTED_HEADERS)}, received {list(headers)}"
        )
    if not rows:
        raise ValueError("Source CSV has no data rows")
    record_ids = [row["record_id"] for row in rows]
    if len(record_ids) != len(set(record_ids)):
        raise ValueError("record_id must be unique")
    for row in rows:
        if row["on_sale"] not in {"true", "false"}:
            raise ValueError(f"Invalid on_sale value for {row['record_id']}")
        for field in ("markets_json", "tech_frontend_json", "tech_backend_json"):
            try:
                json_array(row[field])
            except (json.JSONDecodeError, ValueError) as exc:
                raise ValueError(
                    f"Invalid {field} for {row['record_id']}: {exc}"
                ) from exc
        for spec in FIELD_SPECS:
            value = row[spec["name"]]
            if not spec["nullable"] and not value.strip():
                raise ValueError(
                    f"Missing required {spec['name']} for {row['record_id']}"
                )
            if value.strip() and spec["logical_type"] in {"integer", "number"}:
                parsed = parse_number(value)
                if spec["logical_type"] == "integer" and not isinstance(parsed, int):
                    raise ValueError(
                        f"Expected integer {spec['name']} for {row['record_id']}"
                    )


def pick_first(
    candidates: Sequence[Mapping[str, str]],
    selected_ids: set[str],
    predicate: Callable[[Mapping[str, str]], bool],
) -> Mapping[str, str] | None:
    eligible = [
        row
        for row in candidates
        if row["record_id"] not in selected_ids and predicate(row)
    ]
    return min(eligible, key=stable_row_order) if eligible else None


def sample_selectors() -> tuple[Callable[[Mapping[str, str]], bool], ...]:
    return (
        lambda row: parse_number(row["asking_price_usd"]) == 0,
        lambda row: (
            (value := parse_number(row["asking_price_usd"])) is not None
            and value > 0
        ),
        lambda row: parse_number(row["asking_price_usd"]) is None,
        lambda row: (
            row["on_sale"] == "true"
            and visitor_status(parse_number(row["visitors_30d"])) == "zero"
        ),
        lambda row: (
            row["on_sale"] == "false"
            and visitor_status(parse_number(row["visitors_30d"])) == "zero"
        ),
        lambda row: (
            row["on_sale"] == "true"
            and visitor_status(parse_number(row["visitors_30d"])) == "positive"
        ),
        lambda row: (
            row["on_sale"] == "false"
            and visitor_status(parse_number(row["visitors_30d"])) == "missing"
        ),
        lambda row: row["on_sale"] == "true",
        lambda row: row["on_sale"] == "false",
        lambda row: visitor_status(parse_number(row["visitors_30d"])) == "positive",
        lambda row: visitor_status(parse_number(row["visitors_30d"])) == "missing",
        lambda row: not row["country"].strip(),
        lambda row: bool(row["country"].strip()),
        lambda row: not row["category"].strip(),
        lambda row: bool(row["category"].strip()),
        lambda row: parse_number(row["revenue_30d_usd"]) == 0,
        lambda row: growth_status(parse_number(row["mrr_growth_30d_pct"])) == "missing",
        lambda row: (
            growth_status(parse_number(row["mrr_growth_30d_pct"])) == "negative"
        ),
        lambda row: (
            growth_status(parse_number(row["mrr_growth_30d_pct"])) == "positive"
        ),
    )


def select_representative_sample(
    rows: Sequence[Mapping[str, str]],
) -> list[Mapping[str, str]]:
    selected: list[Mapping[str, str]] = []
    selected_ids: set[str] = set()
    selectors = sample_selectors()
    for band in MRR_BAND_ORDER:
        candidates = [
            row for row in rows if mrr_band(parse_number(row["mrr_usd"])) == band
        ]
        if len(candidates) < SAMPLE_PER_MRR_BAND:
            raise ValueError(
                f"MRR band {band} cannot supply {SAMPLE_PER_MRR_BAND} rows"
            )
        band_selected: list[Mapping[str, str]] = []
        for selector in selectors:
            if len(band_selected) >= SAMPLE_PER_MRR_BAND:
                break
            candidate = pick_first(candidates, selected_ids, selector)
            if candidate is not None:
                selected.append(candidate)
                band_selected.append(candidate)
                selected_ids.add(candidate["record_id"])
        if len(band_selected) < SAMPLE_PER_MRR_BAND:
            for candidate in sorted(candidates, key=stable_row_order):
                if candidate["record_id"] in selected_ids:
                    continue
                selected.append(candidate)
                band_selected.append(candidate)
                selected_ids.add(candidate["record_id"])
                if len(band_selected) >= SAMPLE_PER_MRR_BAND:
                    break

    selected = sorted(selected, key=lambda row: int(row["source_row_number"]))
    coverage = sample_coverage(selected)
    required = {
        ("on_sale", "true"),
        ("on_sale", "false"),
        ("visitor_status", "missing"),
        ("visitor_status", "zero"),
        ("visitor_status", "positive"),
        ("asking_price_status", "missing"),
        ("asking_price_status", "zero"),
        ("asking_price_status", "positive"),
        ("country_status", "missing"),
        ("country_status", "present"),
        ("category_status", "missing"),
        ("category_status", "present"),
        ("revenue_30d_status", "zero"),
        ("revenue_30d_status", "positive"),
    }
    source_coverage = sample_coverage(rows)
    missing_requirements = [
        f"{group}.{label}"
        for group, label in sorted(required)
        if source_coverage[group].get(label, 0) > 0
        and coverage[group].get(label, 0) == 0
    ]
    if missing_requirements:
        raise ValueError(f"Representative sample missed: {missing_requirements}")
    return selected


def sample_coverage(rows: Sequence[Mapping[str, str]]) -> dict[str, dict[str, int]]:
    def asking_status(row: Mapping[str, str]) -> str:
        value = parse_number(row["asking_price_usd"])
        return "missing" if value is None else "zero" if value == 0 else "positive"

    def presence(row: Mapping[str, str], field: str) -> str:
        return "present" if row[field].strip() else "missing"

    def revenue_status(row: Mapping[str, str]) -> str:
        value = parse_number(row["revenue_30d_usd"])
        return "zero" if value == 0 else "positive"

    return {
        "mrr_band": dict(
            sorted(
                Counter(mrr_band(parse_number(row["mrr_usd"])) for row in rows).items()
            )
        ),
        "on_sale": dict(sorted(Counter(row["on_sale"] for row in rows).items())),
        "visitor_status": dict(
            sorted(
                Counter(
                    visitor_status(parse_number(row["visitors_30d"])) for row in rows
                ).items()
            )
        ),
        "asking_price_status": dict(
            sorted(Counter(asking_status(row) for row in rows).items())
        ),
        "country_status": dict(
            sorted(Counter(presence(row, "country") for row in rows).items())
        ),
        "category_status": dict(
            sorted(Counter(presence(row, "category") for row in rows).items())
        ),
        "revenue_30d_status": dict(
            sorted(Counter(revenue_status(row) for row in rows).items())
        ),
        "mrr_growth_status": dict(
            sorted(
                Counter(
                    growth_status(parse_number(row["mrr_growth_30d_pct"]))
                    for row in rows
                ).items()
            )
        ),
    }


def write_csv(
    path: Path, headers: Sequence[str], rows: Sequence[Mapping[str, str]]
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def scalar_leaf_count(value: Any) -> int:
    if isinstance(value, dict):
        return sum(scalar_leaf_count(item) for item in value.values())
    if isinstance(value, list):
        return sum(scalar_leaf_count(item) for item in value)
    return 1


def row_payload(row: Mapping[str, str]) -> dict[str, Any]:
    return {
        "record_id": row["record_id"],
        "startup_name": row["startup_name"],
        "country": row["country"] or None,
        "category": row["category"] or None,
        "audience_type": row["audience_type"] or None,
        "markets": json_array(row["markets_json"]),
        "mrr_usd": parse_number(row["mrr_usd"]),
        "mrr_growth_30d_pct": parse_number(row["mrr_growth_30d_pct"]),
        "revenue_30d_usd": parse_number(row["revenue_30d_usd"]),
        "revenue_growth_30d_pct": parse_number(row["revenue_growth_30d_pct"]),
        "revenue_12m_usd": parse_number(row["revenue_12m_usd"]),
        "active_subscriptions": parse_number(row["active_subscriptions"]),
        "visitors_30d": parse_number(row["visitors_30d"]),
        "revenue_per_visitor_usd": parse_number(row["revenue_per_visitor_usd"]),
        "on_sale": row["on_sale"] == "true",
        "asking_price_usd": parse_number(row["asking_price_usd"]),
        "value_proposition": row["value_proposition"] or None,
        "problem_solved": row["problem_solved"] or None,
        "pricing_model": row["pricing_model"] or None,
        "target_persona": row["target_persona"] or None,
    }


def safe_difference(left: float | None, right: float | None) -> float | None:
    if left is None or right is None:
        return None
    value = float(left) - float(right)
    rounded = round(value, 6)
    return int(rounded) if rounded.is_integer() else rounded


def safe_ratio(left: float | None, right: float | None) -> float | None:
    if left is None or right in {None, 0}:
        return None
    rounded = round(float(left) / float(right), 6)
    return int(rounded) if rounded.is_integer() else rounded


def peer_rank_key(focal: Mapping[str, str], peer: Mapping[str, str]) -> tuple[Any, ...]:
    focal_markets = set(json_array(focal["markets_json"]))
    peer_markets = set(json_array(peer["markets_json"]))
    category_match = bool(focal["category"] and focal["category"] == peer["category"])
    audience_match = bool(
        focal["audience_type"] and focal["audience_type"] == peer["audience_type"]
    )
    country_match = bool(focal["country"] and focal["country"] == peer["country"])
    market_overlap = len(focal_markets & peer_markets)
    focal_mrr = float(parse_number(focal["mrr_usd"]) or 0)
    peer_mrr = float(parse_number(peer["mrr_usd"]) or 0)
    log_mrr_distance = abs(math.log1p(focal_mrr) - math.log1p(peer_mrr))
    return (
        -int(category_match),
        -int(audience_match),
        -market_overlap,
        -int(country_match),
        round(log_mrr_distance, 12),
        peer["record_id"],
    )


def comparison_payload(
    focal: Mapping[str, str], peer: Mapping[str, str], peer_rank: int
) -> dict[str, Any]:
    focal_data = row_payload(focal)
    peer_data = row_payload(peer)
    focal_markets = set(focal_data["markets"])
    peer_markets = set(peer_data["markets"])
    return {
        "comparison_id": f"{focal['record_id']}__{peer['record_id']}",
        "focal_record_id": focal["record_id"],
        "peer_record_id": peer["record_id"],
        "peer_rank": peer_rank,
        "similarity": {
            "category_match": bool(
                focal_data["category"]
                and focal_data["category"] == peer_data["category"]
            ),
            "audience_type_match": bool(
                focal_data["audience_type"]
                and focal_data["audience_type"] == peer_data["audience_type"]
            ),
            "country_match": bool(
                focal_data["country"] and focal_data["country"] == peer_data["country"]
            ),
            "shared_markets": sorted(focal_markets & peer_markets),
            "shared_market_count": len(focal_markets & peer_markets),
            "absolute_log1p_mrr_distance": round(
                abs(
                    math.log1p(float(focal_data["mrr_usd"] or 0))
                    - math.log1p(float(peer_data["mrr_usd"] or 0))
                ),
                6,
            ),
        },
        "focal": focal_data,
        "peer": peer_data,
        "comparison": {
            "mrr_gap_usd": safe_difference(focal_data["mrr_usd"], peer_data["mrr_usd"]),
            "mrr_ratio_to_peer": safe_ratio(
                focal_data["mrr_usd"], peer_data["mrr_usd"]
            ),
            "revenue_30d_gap_usd": safe_difference(
                focal_data["revenue_30d_usd"], peer_data["revenue_30d_usd"]
            ),
            "revenue_30d_ratio_to_peer": safe_ratio(
                focal_data["revenue_30d_usd"], peer_data["revenue_30d_usd"]
            ),
            "mrr_growth_gap_pct_points": safe_difference(
                focal_data["mrr_growth_30d_pct"], peer_data["mrr_growth_30d_pct"]
            ),
            "active_subscription_gap": safe_difference(
                focal_data["active_subscriptions"], peer_data["active_subscriptions"]
            ),
            "visitor_gap_30d": safe_difference(
                focal_data["visitors_30d"], peer_data["visitors_30d"]
            ),
            "revenue_per_visitor_gap_usd": safe_difference(
                focal_data["revenue_per_visitor_usd"],
                peer_data["revenue_per_visitor_usd"],
            ),
            "asking_price_gap_usd": safe_difference(
                focal_data["asking_price_usd"], peer_data["asking_price_usd"]
            ),
        },
    }


PEER_SAMPLE_REQUIRED_TAGS = {
    "category_match:false",
    "category_match:true",
    "shared_markets:none",
    "shared_markets:present",
    "focal_visitors:missing",
    "focal_visitors:zero",
    "focal_visitors:positive",
    "peer_visitors:missing",
    "peer_visitors:zero",
    "peer_visitors:positive",
    "focal_on_sale:false",
    "focal_on_sale:true",
    "peer_on_sale:false",
    "peer_on_sale:true",
    "mrr_ratio:null",
    "mrr_ratio:present",
    "growth_gap:null",
    "growth_gap:present",
    "visitor_gap:null",
    "visitor_gap:present",
    "asking_price_gap:null",
    "asking_price_gap:present",
}


def peer_sample_tags(payload: Mapping[str, Any]) -> set[str]:
    def numeric_state(value: Any) -> str:
        if value is None:
            return "missing"
        if float(value) == 0:
            return "zero"
        return "positive"

    similarity = payload["similarity"]
    focal = payload["focal"]
    peer = payload["peer"]
    comparison = payload["comparison"]
    return {
        f"category_match:{str(similarity['category_match']).lower()}",
        f"audience_match:{str(similarity['audience_type_match']).lower()}",
        (
            "shared_markets:present"
            if similarity["shared_market_count"]
            else "shared_markets:none"
        ),
        f"focal_visitors:{numeric_state(focal['visitors_30d'])}",
        f"peer_visitors:{numeric_state(peer['visitors_30d'])}",
        f"focal_on_sale:{str(focal['on_sale']).lower()}",
        f"peer_on_sale:{str(peer['on_sale']).lower()}",
        (
            "mrr_ratio:null"
            if comparison["mrr_ratio_to_peer"] is None
            else "mrr_ratio:present"
        ),
        (
            "revenue_ratio:null"
            if comparison["revenue_30d_ratio_to_peer"] is None
            else "revenue_ratio:present"
        ),
        (
            "growth_gap:null"
            if comparison["mrr_growth_gap_pct_points"] is None
            else "growth_gap:present"
        ),
        (
            "visitor_gap:null"
            if comparison["visitor_gap_30d"] is None
            else "visitor_gap:present"
        ),
        (
            "asking_price_gap:null"
            if comparison["asking_price_gap_usd"] is None
            else "asking_price_gap:present"
        ),
        f"focal_category:{'missing' if focal['category'] is None else 'present'}",
        f"peer_category:{'missing' if peer['category'] is None else 'present'}",
    }


def select_peer_sample(
    payloads: Sequence[Mapping[str, Any]],
) -> list[Mapping[str, Any]]:
    candidates = {payload["comparison_id"]: payload for payload in payloads}
    selected: list[Mapping[str, Any]] = []
    selected_ids: set[str] = set()
    uncovered = set(PEER_SAMPLE_REQUIRED_TAGS)
    while uncovered and len(selected) < PEER_SAMPLE_SIZE:
        ranked = sorted(
            (
                (
                    -len(peer_sample_tags(payload) & uncovered),
                    stable_hash(f"{PEER_SAMPLE_SEED}:{payload['comparison_id']}"),
                    payload["comparison_id"],
                    payload,
                )
                for payload in candidates.values()
                if payload["comparison_id"] not in selected_ids
            ),
            key=lambda item: item[:3],
        )
        if not ranked or ranked[0][0] == 0:
            break
        payload = ranked[0][3]
        selected.append(payload)
        selected_ids.add(payload["comparison_id"])
        uncovered -= peer_sample_tags(payload)

    if uncovered:
        raise ValueError(
            f"Peer sample missed required coverage tags: {sorted(uncovered)}"
        )
    if len(selected) < PEER_SAMPLE_SIZE:
        fillers = sorted(
            (
                payload
                for payload in candidates.values()
                if payload["comparison_id"] not in selected_ids
            ),
            key=lambda payload: (
                stable_hash(f"{PEER_SAMPLE_SEED}:{payload['comparison_id']}"),
                payload["comparison_id"],
            ),
        )
        selected.extend(fillers[: PEER_SAMPLE_SIZE - len(selected)])
    return sorted(selected, key=lambda payload: payload["comparison_id"])


def write_jsonl(path: Path, payloads: Sequence[Mapping[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for payload in payloads:
            handle.write(
                json.dumps(
                    payload,
                    ensure_ascii=False,
                    sort_keys=True,
                    separators=(",", ":"),
                )
            )
            handle.write("\n")


def build_peer_comparisons(
    rows: Sequence[Mapping[str, str]], output_path: Path, sample_path: Path
) -> tuple[dict[str, Any], dict[str, Any]]:
    tiktoken_version = importlib.metadata.version("tiktoken")
    if tiktoken_version != PINNED_TIKTOKEN_VERSION:
        raise RuntimeError(
            f"Expected tiktoken {PINNED_TIKTOKEN_VERSION}; found {tiktoken_version}. "
            "Run with the pinned requirements file."
        )
    encoding = tiktoken.get_encoding(TOKENIZER_NAME)
    row_count = 0
    scalar_cells = 0
    sample_tag_best: dict[str, tuple[str, Mapping[str, Any]]] = {}
    sample_fillers: list[tuple[str, Mapping[str, Any]]] = []
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="trustmrr-s3-jsonl-") as temp_dir:
        uncompressed_path = Path(temp_dir) / "peer_comparisons.jsonl"
        with uncompressed_path.open("w", encoding="utf-8", newline="\n") as handle:
            for focal in sorted(rows, key=lambda row: row["record_id"]):
                peers = sorted(
                    (row for row in rows if row["record_id"] != focal["record_id"]),
                    key=lambda peer: peer_rank_key(focal, peer),
                )[:PEERS_PER_STARTUP]
                for peer_rank, peer in enumerate(peers, start=1):
                    payload = comparison_payload(focal, peer, peer_rank)
                    handle.write(
                        json.dumps(
                            payload,
                            ensure_ascii=False,
                            sort_keys=True,
                            separators=(",", ":"),
                        )
                    )
                    handle.write("\n")
                    row_count += 1
                    scalar_cells += scalar_leaf_count(payload)
                    sample_hash = stable_hash(
                        f"{PEER_SAMPLE_SEED}:{payload['comparison_id']}"
                    )
                    for tag in peer_sample_tags(payload):
                        previous = sample_tag_best.get(tag)
                        if previous is None or sample_hash < previous[0]:
                            sample_tag_best[tag] = (sample_hash, payload)
                    sample_fillers.append((sample_hash, payload))
                    sample_fillers.sort(
                        key=lambda item: (item[0], item[1]["comparison_id"])
                    )
                    del sample_fillers[64:]

        uncompressed_bytes = uncompressed_path.read_bytes()
        uncompressed_sha256 = hashlib.sha256(uncompressed_bytes).hexdigest()
        token_count = len(encoding.encode_ordinary(uncompressed_bytes.decode("utf-8")))
        with (
            output_path.open("wb") as raw_output,
            gzip.GzipFile(
                filename="",
                mode="wb",
                fileobj=raw_output,
                compresslevel=9,
                mtime=0,
            ) as compressed,
        ):
            compressed.write(uncompressed_bytes)

    sample_candidates = [payload for _, payload in sample_tag_best.values()]
    sample_candidates.extend(payload for _, payload in sample_fillers)
    sample_payloads = select_peer_sample(sample_candidates)
    write_jsonl(sample_path, sample_payloads)
    sample_coverage = Counter(
        tag for payload in sample_payloads for tag in peer_sample_tags(payload)
    )

    if token_count <= CONTEXT_THRESHOLD_TOKENS:
        raise RuntimeError(
            f"Peer dataset produced only {token_count:,} {TOKENIZER_NAME} tokens; "
            f"must exceed {CONTEXT_THRESHOLD_TOKENS:,}."
        )
    size_proof = {
        "jsonl_row_count": row_count,
        "scalar_cell_count": scalar_cells,
        "compressed_bytes": output_path.stat().st_size,
        "uncompressed_bytes": len(uncompressed_bytes),
        "uncompressed_sha256": uncompressed_sha256,
        "token_count": token_count,
        "tokenizer": TOKENIZER_NAME,
        "tokenizer_library": "tiktoken",
        "tokenizer_library_version": tiktoken_version,
        "threshold_tokens": CONTEXT_THRESHOLD_TOKENS,
        "exceeds_threshold": token_count > CONTEXT_THRESHOLD_TOKENS,
        "peers_per_startup": PEERS_PER_STARTUP,
    }
    sample_proof = {
        "jsonl_row_count": len(sample_payloads),
        "scalar_cell_count": sum(
            scalar_leaf_count(payload) for payload in sample_payloads
        ),
        "field_path_count": len(peer_field_specs()),
        "coverage": dict(sorted(sample_coverage.items())),
        "required_coverage_tags": sorted(PEER_SAMPLE_REQUIRED_TAGS),
        "selection_seed": PEER_SAMPLE_SEED,
        "selection_semantics": "deterministic nested-shape coverage sample; not statistically proportional and not an answer key",
    }
    return size_proof, sample_proof


def schema_payload() -> dict[str, Any]:
    peer_fields = peer_field_specs()
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "metadata": {
            "dataset_version": DATASET_VERSION,
            "generator_version": GENERATOR_VERSION,
            "source_snapshot_date": SOURCE_SNAPSHOT_DATE,
            "blank_cell_semantics": "Blank means unavailable/not supplied. It is never interchangeable with observed zero.",
        },
        "datasets": {
            LEARNER_FILENAME: {
                "format": "CSV with UTF-8 encoding and a header row",
                "primary_key": "record_id",
                "fields": list(FIELD_SPECS),
            },
            SAMPLE_FILENAME: {
                "format": "CSV with UTF-8 encoding and the same fields as the learner CSV",
                "selection": "Six deterministic coverage cases from each MRR band; not a proportional statistical sample.",
                "fields_ref": LEARNER_FILENAME,
            },
            PEERS_FILENAME: {
                "format": "gzip-compressed UTF-8 JSON Lines",
                "record_semantics": "One focal-startup/peer-startup comparison; peers are deterministic similarity candidates, not causal or investment claims.",
                "primary_key": "comparison_id",
                "field_count": len(peer_fields),
                "fields": peer_fields,
                "null_semantics": "A null comparison metric means one input was missing or the ratio denominator was zero.",
            },
            PEER_SAMPLE_FILENAME: {
                "format": "UTF-8 JSON Lines with the same nested record shape as the compressed peer dataset",
                "selection": "Twelve deterministic coverage cases spanning matches, nulls, zeros, visitor states, sale states and ratio-denominator cases; not statistically proportional.",
                "fields_ref": PEERS_FILENAME,
            },
            FACTS_FILENAME: {
                "format": "JSON",
                "audience": "evaluator-only",
                "record_semantics": "Deterministic aggregate, group, rank, data-quality, and answer-key facts computed by analyze_trustmrr_session3.py.",
            },
            ADAPTER_FILENAME: {
                "format": "JSON",
                "audience": "instructor/evaluator-only",
                "record_semantics": "Dataset-bound item contracts and private keys for S3-DATA-01..10 and S3-SCALE-03F/P.",
            },
        },
    }


def artifact_metadata(path: Path, **extra: Any) -> dict[str, Any]:
    return {
        "filename": path.name,
        "sha256": sha256_file(path),
        "bytes": path.stat().st_size,
        **extra,
    }


def generate(source_path: Path, output_dir: Path) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    headers, rows = load_rows(source_path)
    validate_source(headers, rows)
    source_sha256 = sha256_file(source_path)

    learner_path = output_dir / LEARNER_FILENAME
    shutil.copyfile(source_path, learner_path)
    if sha256_file(learner_path) != source_sha256:
        raise RuntimeError("Canonical learner copy is not byte-identical to source")

    schema_path = output_dir / SCHEMA_FILENAME
    write_json(schema_path, schema_payload())

    sample_rows = select_representative_sample(rows)
    sample_path = output_dir / SAMPLE_FILENAME
    write_csv(sample_path, headers, sample_rows)
    coverage = sample_coverage(sample_rows)

    peer_path = output_dir / PEERS_FILENAME
    peer_sample_path = output_dir / PEER_SAMPLE_FILENAME
    peer_size_proof, peer_sample_proof = build_peer_comparisons(
        rows, peer_path, peer_sample_path
    )

    facts_path = output_dir / FACTS_FILENAME
    fact_pack = build_fact_pack(learner_path)
    write_json(facts_path, fact_pack)

    adapter_path = output_dir / ADAPTER_FILENAME
    evaluator_adapter = build_evaluator_adapter(learner_path, facts_path, peer_path)
    write_json(adapter_path, evaluator_adapter)

    manifest = {
        "manifest_version": "1.1",
        "dataset_version": DATASET_VERSION,
        "generation": {
            "generator_version": GENERATOR_VERSION,
            "source_snapshot_date": SOURCE_SNAPSHOT_DATE,
            "deterministic": True,
            "sample_seed": SAMPLE_SEED,
            "peer_sample_seed": PEER_SAMPLE_SEED,
            "tokenizer_dependency": f"tiktoken=={PINNED_TIKTOKEN_VERSION}",
            "pandas_dependency": f"pandas=={PINNED_PANDAS_VERSION}",
            "python_requirement": ">=3.11",
        },
        "lineage": {
            "source_title": "Startup Marketplace Intelligence — Full Public Backfill",
            "source_sheet_tab": "TrustMRR Startups",
            "source_sheet_gid": 849064270,
            "source_snapshot_date": SOURCE_SNAPSHOT_DATE,
            "source_slice_filename": source_path.name,
            "source_slice_sha256": source_sha256,
            "source_rows_represented": len(rows),
            "source_row_pointer_field": "source_row_number",
            "transformations": [
                "learner CSV is a byte-identical copy of the private frozen source slice",
                "schema is emitted from generator-owned machine-readable field specifications",
                "sample chooses six deterministic coverage cases per MRR band and preserves null/zero/sale/visitor edge cases",
                f"oversized JSONL ranks {PEERS_PER_STARTUP} deterministic similarity peers for every startup and computes pairwise differences/ratios",
                f"peer JSONL sample selects {PEER_SAMPLE_SIZE} deterministic records that cover nested null/zero/match/sale/visitor states",
                "fact pack is recomputed from the canonical learner CSV by the standard-library Colab-ready analysis script",
                "evaluator adapter resolves stable S3 item IDs from private facts and dual-checks deterministic keys with pandas and the Python standard library",
            ],
        },
        "artifacts": {
            "learner_csv": artifact_metadata(
                learner_path,
                row_count=len(rows),
                column_count=len(headers),
                data_cell_count=len(rows) * len(headers),
                private=True,
                audience="roster-gated learners and instructors",
            ),
            "schema": artifact_metadata(
                schema_path,
                learner_field_count=len(FIELD_SPECS),
                peer_field_path_count=len(peer_field_specs()),
                private=False,
                audience="roster-gated learners and instructors",
            ),
            "representative_sample": artifact_metadata(
                sample_path,
                row_count=len(sample_rows),
                column_count=len(headers),
                data_cell_count=len(sample_rows) * len(headers),
                coverage=coverage,
                private=True,
                audience="roster-gated learners and instructors",
            ),
            "peer_comparisons": artifact_metadata(
                peer_path,
                private=True,
                audience="roster-gated learners and instructors",
                **peer_size_proof,
            ),
            "peer_comparisons_sample": artifact_metadata(
                peer_sample_path,
                private=True,
                audience="roster-gated learners and instructors after the scale reveal",
                **peer_sample_proof,
            ),
            "fact_pack": artifact_metadata(
                facts_path,
                row_count=len(rows),
                private=True,
                audience="instructors/evaluators only",
            ),
            "evaluator_adapter": artifact_metadata(
                adapter_path,
                item_ids=list(REQUIRED_ITEM_IDS),
                item_count=len(REQUIRED_ITEM_IDS),
                implementation_checks={
                    "pandas_version": evaluator_adapter["implementation_checks"][
                        "pandas_version"
                    ],
                    "second_reference": evaluator_adapter["implementation_checks"][
                        "second_reference"
                    ],
                    "fact_pack_contract": evaluator_adapter["implementation_checks"][
                        "fact_pack_contract"
                    ],
                    "objective_items": evaluator_adapter["implementation_checks"][
                        "objective_items"
                    ]["status"],
                    "scale_formula": evaluator_adapter["implementation_checks"][
                        "scale_formula"
                    ]["status"],
                    "scale_peer_python": evaluator_adapter["implementation_checks"][
                        "scale_peer_python"
                    ]["status"],
                },
                private=True,
                audience="instructors/evaluators only",
            ),
        },
        "size_proof": {
            "artifact": PEERS_FILENAME,
            **peer_size_proof,
            "interpretation": (
                f"The uncompressed JSONL is {peer_size_proof['token_count']:,} "
                f"{TOKENIZER_NAME} tokens, above the {CONTEXT_THRESHOLD_TOKENS:,}-token "
                "teaching threshold. This is a tokenizer-specific size proof, not a claim "
                "about every vendor's upload or context limit."
            ),
        },
        "usage_notice": {
            "authorization": "Project-specific user authorization recorded 30 July 2026 in lms/docs/build/SOURCE_OF_TRUTH.md.",
            "allowed": [
                "private Masters' Union Course 1 teaching and roster-gated learner access",
                "private AI-assisted analysis and grading for this course",
                "private derivative-data exercises and Session 4 shortlisting",
            ],
            "prohibited": [
                "public repository commits of row-level or derivative files",
                "public Praxy/gallery exposure of row-level TrustMRR data",
                "reuse of this project-specific authorization outside this course",
                "treating algorithmic peer rank as causal, investment, or valuation advice",
            ],
            "assessment_integrity": "Keep the fact pack evaluator-only until the relevant assessment closes.",
            "adapter_integrity": "Never expose evaluator-adapter private keys, grader contexts or independent-check hashes through student APIs.",
            "nulls": "Missing values and observed zeros are intentionally distinct; do not coerce blanks to zero.",
        },
    }
    manifest_path = output_dir / MANIFEST_FILENAME
    write_json(manifest_path, manifest)

    return {
        "output_dir": str(output_dir),
        "files": {
            path.name: sha256_file(path)
            for path in sorted(output_dir.iterdir())
            if path.is_file()
        },
        "manifest_sha256": sha256_file(manifest_path),
        "rows": len(rows),
        "sample_rows": len(sample_rows),
        "peer_sample_rows": peer_sample_proof["jsonl_row_count"],
        "evaluator_item_count": len(evaluator_adapter["items"]),
        "token_count": peer_size_proof["token_count"],
    }


def verify_determinism(source_path: Path, output_dir: Path) -> dict[str, Any]:
    first = generate(source_path, output_dir)
    with tempfile.TemporaryDirectory(
        prefix="trustmrr-s3-verify-", dir=output_dir.parent
    ) as temp_dir:
        second = generate(source_path, Path(temp_dir))
        if first["files"] != second["files"]:
            changed = sorted(
                filename
                for filename in set(first["files"]) | set(second["files"])
                if first["files"].get(filename) != second["files"].get(filename)
            )
            raise RuntimeError(f"Determinism check failed for: {changed}")
    return {**first, "determinism_verified": True, "runs_compared": 2}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source", type=Path, required=True, help="Frozen private source slice CSV."
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        required=True,
        help="Private generated output directory.",
    )
    parser.add_argument(
        "--verify-determinism",
        action="store_true",
        help="Generate twice and require identical SHA-256 checksums for every artifact.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    result = (
        verify_determinism(args.source, args.output_dir)
        if args.verify_determinism
        else generate(args.source, args.output_dir)
    )
    print(json.dumps({"status": "ok", **result}, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
