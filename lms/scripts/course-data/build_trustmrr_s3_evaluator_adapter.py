#!/usr/bin/env python3
"""Build the private, ID-bound Session 3 evaluator adapter.

The tracked module contains only query contracts and computation logic. Exact
answers are resolved from ignored data at generation time and must remain in
the private course-data directory.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import math
import statistics
from collections import defaultdict
from collections.abc import Mapping, Sequence
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path
from typing import Any

import pandas as pd
from analyze_trustmrr_session3 import (
    load_rows,
    parse_number,
    sha256_file,
    write_json,
)

ADAPTER_VERSION = "1.0.0"
DATASET_VERSION = "trustmrr-s3-v1"
PINNED_PANDAS_VERSION = "3.0.0"

REQUIRED_ITEM_IDS = (
    "S3-DATA-01",
    "S3-DATA-02",
    "S3-DATA-03",
    "S3-DATA-04",
    "S3-DATA-05",
    "S3-DATA-06",
    "S3-DATA-07",
    "S3-DATA-08",
    "S3-DATA-09",
    "S3-DATA-10",
    "S3-SCALE-03F",
    "S3-SCALE-03P",
)

ITEM_CONTRACTS: dict[str, dict[str, Any]] = {
    "S3-DATA-01": {
        "evaluation": "deterministic",
        "query_contract": "count parsed data records; assert record_id complete and unique",
        "fact_pack_paths": ["metadata.row_count"],
        "response_schema": "integer",
        "acceptance": {"mode": "exact"},
    },
    "S3-DATA-02": {
        "evaluation": "deterministic",
        "query_contract": "count country values missing after outer-whitespace trim",
        "fact_pack_paths": ["missingness.country.missing_count"],
        "response_schema": "integer",
        "acceptance": {"mode": "exact"},
    },
    "S3-DATA-03": {
        "evaluation": "deterministic",
        "query_contract": "100 * S3-DATA-02 / S3-DATA-01 before display rounding",
        "fact_pack_paths": [
            "metadata.row_count",
            "missingness.country.missing_count",
            "missingness.country.missing_pct",
        ],
        "response_schema": "numeric percentage",
        "acceptance": {"absolute_tolerance_percentage_points": 0.05},
    },
    "S3-DATA-04": {
        "evaluation": "deterministic",
        "query_contract": "median of numeric mrr_usd with legitimate zero retained",
        "fact_pack_paths": ["numeric_summaries.mrr_usd"],
        "response_schema": "numeric USD",
        "acceptance": {"absolute_tolerance_usd": 0.5},
    },
    "S3-DATA-05": {
        "evaluation": "deterministic",
        "query_contract": "nonblank category grouped sum of numeric mrr_usd; total descending then casefolded label ascending",
        "fact_pack_paths": ["group_summaries.category"],
        "response_schema": {"categoryLabel": "string", "totalMrrUsd": "number"},
        "acceptance": {
            "category": "exact canonical label after outer-whitespace trim",
            "absolute_tolerance_usd": 0.5,
        },
    },
    "S3-DATA-06": {
        "evaluation": "deterministic",
        "query_contract": "median numeric asking_price_usd where on_sale is true; legitimate zero retained",
        "fact_pack_paths": ["sale_analysis.asking_price_summary_usd"],
        "response_schema": "numeric USD",
        "acceptance": {"absolute_tolerance_usd": 0.5},
    },
    "S3-DATA-07": {
        "evaluation": "rubric_bound_provisional_ai",
        "query_contract": "cross-check typical-MRR claims against private distribution facts",
        "fact_pack_paths": [
            "numeric_summaries.mrr_usd",
            "overview.mrr_band_counts",
            "metadata.row_count",
        ],
        "response_schema": "120-180 word judgment",
    },
    "S3-DATA-08": {
        "evaluation": "rubric_bound_provisional_ai",
        "query_contract": "cross-check traffic/revenue association and complete-case denominator; never infer causality",
        "fact_pack_paths": [
            "correlations.visitors_vs_revenue_30d",
            "missingness.visitors_30d",
            "visitor_analysis",
            "metadata.row_count",
        ],
        "response_schema": "120-180 word judgment",
    },
    "S3-DATA-09": {
        "evaluation": "rubric_bound_provisional_ai",
        "query_contract": "validate cited segment aggregates while allowing multiple evidence-backed recommendations",
        "fact_pack_paths": [
            "group_summaries.category",
            "group_summaries.audience_type",
            "missingness.category",
            "missingness.audience_type",
            "metadata.row_count",
        ],
        "response_schema": "180-250 word recommendation",
    },
    "S3-DATA-10": {
        "evaluation": "deterministic_checks_plus_provisional_ai",
        "query_contract": "bind to one of S3-DATA-03..06; parse two results, units and claimed gap, then assess method independence",
        "fact_pack_paths": [
            "metadata.dataset_version",
            "metadata.input_sha256",
        ],
        "verifiable_item_ids": [
            "S3-DATA-03",
            "S3-DATA-04",
            "S3-DATA-05",
            "S3-DATA-06",
        ],
        "response_schema": "structured verification trace",
    },
    "S3-SCALE-03F": {
        "evaluation": "deterministic_file_comparison_plus_static_checks",
        "query_contract": "group nonblank audience_type in learner CSV; record count and total mrr_usd including zero; total descending then label ascending",
        "fact_pack_paths": [
            "group_summaries.audience_type",
            "missingness.audience_type",
            "numeric_summaries.mrr_usd",
        ],
        "response_schema": "aggregate rows plus valid/excluded counts and assertion",
    },
    "S3-SCALE-03P": {
        "evaluation": "deterministic_file_comparison_plus_static_checks",
        "query_contract": "group peer JSONL by focal_record_id; median non-null mrr ratio and median absolute non-null MRR gap; require 20 valid ratios; lowest 10",
        "fact_pack_paths": [],
        "response_schema": "10 aggregate rows plus valid/excluded counts and assertion",
    },
}


def canonical_number(value: Any, digits: int = 9) -> int | float | None:
    if value is None or pd.isna(value):
        return None
    rounded = round(float(value), digits)
    return int(rounded) if rounded.is_integer() else rounded


def half_up(value: float, places: int = 0) -> int | float:
    quantum = Decimal(1).scaleb(-places)
    rounded = Decimal(str(value)).quantize(quantum, rounding=ROUND_HALF_UP)
    return int(rounded) if rounded == rounded.to_integral_value() else float(rounded)


def resolve_path(payload: Mapping[str, Any], dotted_path: str) -> Any:
    current: Any = payload
    for part in dotted_path.split("."):
        if not isinstance(current, Mapping) or part not in current:
            raise KeyError(f"Fact-pack path does not exist: {dotted_path}")
        current = current[part]
    return current


def canonical_json_sha256(payload: Any) -> str:
    encoded = json.dumps(
        payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def objective_keys_stdlib(rows: Sequence[Mapping[str, str]]) -> dict[str, Any]:
    if len({row["record_id"] for row in rows}) != len(rows):
        raise ValueError("record_id must be unique before key generation")
    if any(not row["record_id"].strip() for row in rows):
        raise ValueError("record_id must be complete before key generation")

    missing_country = sum(not row["country"].strip() for row in rows)
    mrr_values = [
        float(value)
        for row in rows
        if (value := parse_number(row["mrr_usd"])) is not None
    ]
    categories: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        label = row["category"].strip()
        mrr = parse_number(row["mrr_usd"])
        if label and mrr is not None:
            categories[label].append(float(mrr))
    category_totals = [
        (label, math.fsum(values)) for label, values in categories.items()
    ]
    leading_category, leading_total = min(
        category_totals, key=lambda item: (-item[1], item[0].casefold())
    )
    asking_prices = [
        float(value)
        for row in rows
        if row["on_sale"].strip().lower() == "true"
        and (value := parse_number(row["asking_price_usd"])) is not None
    ]
    missing_country_pct = 100 * missing_country / len(rows)
    median_mrr = statistics.median(mrr_values)
    median_asking = statistics.median(asking_prices)
    return {
        "S3-DATA-01": {"expected": len(rows)},
        "S3-DATA-02": {"expected": missing_country},
        "S3-DATA-03": {
            "expected_numeric": canonical_number(missing_country_pct),
            "display_numeric": half_up(missing_country_pct, 1),
            "unit": "percentage_points",
        },
        "S3-DATA-04": {
            "expected_numeric": canonical_number(median_mrr),
            "display_numeric": half_up(median_mrr),
            "unit": "USD",
        },
        "S3-DATA-05": {
            "categoryLabel": leading_category,
            "expected_numeric": canonical_number(leading_total),
            "display_numeric": half_up(leading_total),
            "unit": "USD",
        },
        "S3-DATA-06": {
            "expected_numeric": canonical_number(median_asking),
            "display_numeric": half_up(median_asking),
            "unit": "USD",
        },
    }


def objective_keys_pandas(learner_path: Path) -> dict[str, Any]:
    frame = pd.read_csv(learner_path, dtype=str, keep_default_na=False)
    if frame["record_id"].str.strip().eq("").any() or not frame["record_id"].is_unique:
        raise ValueError("record_id must be complete and unique before key generation")
    country_missing = frame["country"].str.strip().eq("")
    mrr = pd.to_numeric(frame["mrr_usd"], errors="coerce")
    labels = frame["category"].str.strip()
    category_frame = pd.DataFrame({"category": labels, "mrr": mrr})
    category_frame = category_frame[category_frame["category"].ne("")]
    grouped = category_frame.groupby("category", sort=False, dropna=False)["mrr"].sum()
    category_totals = [(str(label), float(total)) for label, total in grouped.items()]
    leading_category, leading_total = min(
        category_totals, key=lambda item: (-item[1], item[0].casefold())
    )
    on_sale = frame["on_sale"].str.strip().str.lower().eq("true")
    asking = pd.to_numeric(frame.loc[on_sale, "asking_price_usd"], errors="coerce")
    missing_country_pct = 100 * int(country_missing.sum()) / len(frame)
    median_mrr = float(mrr.median())
    median_asking = float(asking.median())
    return {
        "S3-DATA-01": {"expected": len(frame)},
        "S3-DATA-02": {"expected": int(country_missing.sum())},
        "S3-DATA-03": {
            "expected_numeric": canonical_number(missing_country_pct),
            "display_numeric": half_up(missing_country_pct, 1),
            "unit": "percentage_points",
        },
        "S3-DATA-04": {
            "expected_numeric": canonical_number(median_mrr),
            "display_numeric": half_up(median_mrr),
            "unit": "USD",
        },
        "S3-DATA-05": {
            "categoryLabel": leading_category,
            "expected_numeric": canonical_number(leading_total),
            "display_numeric": half_up(leading_total),
            "unit": "USD",
        },
        "S3-DATA-06": {
            "expected_numeric": canonical_number(median_asking),
            "display_numeric": half_up(median_asking),
            "unit": "USD",
        },
    }


def scale_formula_stdlib(rows: Sequence[Mapping[str, str]]) -> dict[str, Any]:
    groups: dict[str, list[float]] = defaultdict(list)
    excluded_count = 0
    for row in rows:
        label = row["audience_type"].strip()
        if not label:
            excluded_count += 1
            continue
        mrr = parse_number(row["mrr_usd"])
        if mrr is None:
            raise ValueError("mrr_usd must be numeric for every learner row")
        groups[label].append(float(mrr))
    output = [
        {
            "audience_type": label,
            "record_count": len(values),
            "total_mrr_usd": canonical_number(math.fsum(values)),
        }
        for label, values in groups.items()
    ]
    output.sort(key=lambda item: (-float(item["total_mrr_usd"]), item["audience_type"]))
    valid_count = sum(item["record_count"] for item in output)
    return {
        "output": output,
        "valid_row_count": valid_count,
        "excluded_row_count": excluded_count,
        "assertions": {
            "valid_plus_excluded_equals_input": valid_count + excluded_count
            == len(rows),
            "all_groups_nonblank": all(item["audience_type"] for item in output),
            "legitimate_zero_policy": "included",
        },
    }


def scale_formula_pandas(learner_path: Path) -> dict[str, Any]:
    frame = pd.read_csv(learner_path, dtype=str, keep_default_na=False)
    labels = frame["audience_type"].str.strip()
    valid_mask = labels.ne("")
    working = pd.DataFrame(
        {
            "audience_type": labels[valid_mask],
            "mrr": pd.to_numeric(frame.loc[valid_mask, "mrr_usd"], errors="raise"),
        }
    )
    grouped = working.groupby("audience_type", sort=False, dropna=False)["mrr"].agg(
        ["count", "sum"]
    )
    output = [
        {
            "audience_type": str(label),
            "record_count": int(row["count"]),
            "total_mrr_usd": canonical_number(row["sum"]),
        }
        for label, row in grouped.iterrows()
    ]
    output.sort(key=lambda item: (-float(item["total_mrr_usd"]), item["audience_type"]))
    valid_count = int(valid_mask.sum())
    excluded_count = int((~valid_mask).sum())
    return {
        "output": output,
        "valid_row_count": valid_count,
        "excluded_row_count": excluded_count,
        "assertions": {
            "valid_plus_excluded_equals_input": valid_count + excluded_count
            == len(frame),
            "all_groups_nonblank": all(item["audience_type"] for item in output),
            "legitimate_zero_policy": "included",
        },
    }


def scale_peer_stdlib(peer_path: Path) -> dict[str, Any]:
    ratios: dict[str, list[float]] = defaultdict(list)
    absolute_gaps: dict[str, list[float]] = defaultdict(list)
    focal_metadata: dict[str, tuple[str, str | None, str | None]] = {}
    input_rows = 0
    valid_ratio_rows = 0
    with gzip.open(peer_path, "rt", encoding="utf-8") as handle:
        for line in handle:
            payload = json.loads(line)
            input_rows += 1
            focal_id = payload["focal_record_id"]
            focal = payload["focal"]
            metadata = (
                focal["startup_name"],
                focal["category"],
                focal["audience_type"],
            )
            previous = focal_metadata.setdefault(focal_id, metadata)
            if previous != metadata:
                raise ValueError(f"Unstable focal metadata for {focal_id}")
            ratio = payload["comparison"]["mrr_ratio_to_peer"]
            gap = payload["comparison"]["mrr_gap_usd"]
            if ratio is not None:
                ratios[focal_id].append(float(ratio))
                valid_ratio_rows += 1
            if gap is not None:
                absolute_gaps[focal_id].append(abs(float(gap)))

    eligible: list[dict[str, Any]] = []
    for focal_id, metadata in focal_metadata.items():
        valid_peers = len(ratios[focal_id])
        if valid_peers < 20:
            continue
        startup_name, category, audience_type = metadata
        eligible.append(
            {
                "focal_record_id": focal_id,
                "startup_name": startup_name,
                "category": category,
                "audience_type": audience_type,
                "valid_peer_count": valid_peers,
                "median_mrr_ratio_to_peer": canonical_number(
                    statistics.median(ratios[focal_id])
                ),
                "median_absolute_mrr_gap_usd": canonical_number(
                    statistics.median(absolute_gaps[focal_id])
                ),
            }
        )
    eligible.sort(
        key=lambda item: (
            float(item["median_mrr_ratio_to_peer"]),
            item["focal_record_id"],
        )
    )
    output = eligible[:10]
    return {
        "output": output,
        "valid_row_count": valid_ratio_rows,
        "excluded_row_count": input_rows - valid_ratio_rows,
        "input_row_count": input_rows,
        "eligible_focal_count": len(eligible),
        "assertions": {
            "valid_plus_excluded_equals_input": valid_ratio_rows
            + (input_rows - valid_ratio_rows)
            == input_rows,
            "every_output_has_at_least_20_valid_ratios": all(
                item["valid_peer_count"] >= 20 for item in output
            ),
            "output_count_at_most_10": len(output) <= 10,
        },
    }


def scale_peer_pandas(peer_path: Path) -> dict[str, Any]:
    frame = pd.read_json(peer_path, lines=True, compression="gzip")
    working = pd.DataFrame(
        {
            "focal_record_id": frame["focal_record_id"].astype(str),
            "startup_name": frame["focal"].map(lambda value: value["startup_name"]),
            "category": frame["focal"].map(lambda value: value["category"]),
            "audience_type": frame["focal"].map(lambda value: value["audience_type"]),
            "ratio": frame["comparison"].map(lambda value: value["mrr_ratio_to_peer"]),
            "absolute_gap": frame["comparison"].map(
                lambda value: (
                    abs(value["mrr_gap_usd"])
                    if value["mrr_gap_usd"] is not None
                    else None
                )
            ),
        }
    )
    working["ratio"] = pd.to_numeric(working["ratio"], errors="coerce")
    working["absolute_gap"] = pd.to_numeric(working["absolute_gap"], errors="coerce")
    grouped = working.groupby("focal_record_id", sort=False, dropna=False).agg(
        startup_name=("startup_name", "first"),
        category=("category", "first"),
        audience_type=("audience_type", "first"),
        valid_peer_count=("ratio", "count"),
        median_mrr_ratio_to_peer=("ratio", "median"),
        median_absolute_mrr_gap_usd=("absolute_gap", "median"),
    )
    grouped = grouped[grouped["valid_peer_count"] >= 20]
    output = [
        {
            "focal_record_id": str(focal_id),
            "startup_name": row["startup_name"],
            "category": None if pd.isna(row["category"]) else row["category"],
            "audience_type": (
                None if pd.isna(row["audience_type"]) else row["audience_type"]
            ),
            "valid_peer_count": int(row["valid_peer_count"]),
            "median_mrr_ratio_to_peer": canonical_number(
                row["median_mrr_ratio_to_peer"]
            ),
            "median_absolute_mrr_gap_usd": canonical_number(
                row["median_absolute_mrr_gap_usd"]
            ),
        }
        for focal_id, row in grouped.iterrows()
    ]
    output.sort(
        key=lambda item: (
            float(item["median_mrr_ratio_to_peer"]),
            item["focal_record_id"],
        )
    )
    output = output[:10]
    valid_ratio_rows = int(working["ratio"].notna().sum())
    input_rows = len(working)
    return {
        "output": output,
        "valid_row_count": valid_ratio_rows,
        "excluded_row_count": input_rows - valid_ratio_rows,
        "input_row_count": input_rows,
        "eligible_focal_count": len(grouped),
        "assertions": {
            "valid_plus_excluded_equals_input": valid_ratio_rows
            + (input_rows - valid_ratio_rows)
            == input_rows,
            "every_output_has_at_least_20_valid_ratios": all(
                item["valid_peer_count"] >= 20 for item in output
            ),
            "output_count_at_most_10": len(output) <= 10,
        },
    }


def assert_fact_pack_matches(
    fact_pack: Mapping[str, Any], objective_keys: Mapping[str, Any]
) -> None:
    checks = {
        "S3-DATA-01": resolve_path(fact_pack, "metadata.row_count"),
        "S3-DATA-02": resolve_path(fact_pack, "missingness.country.missing_count"),
        "S3-DATA-03": resolve_path(fact_pack, "missingness.country.missing_pct"),
        "S3-DATA-04": resolve_path(fact_pack, "numeric_summaries.mrr_usd.median"),
        "S3-DATA-06": resolve_path(
            fact_pack, "sale_analysis.asking_price_summary_usd.median"
        ),
    }
    if checks["S3-DATA-01"] != objective_keys["S3-DATA-01"]["expected"]:
        raise ValueError("Fact pack mismatch for S3-DATA-01")
    if checks["S3-DATA-02"] != objective_keys["S3-DATA-02"]["expected"]:
        raise ValueError("Fact pack mismatch for S3-DATA-02")
    for item_id in ("S3-DATA-03", "S3-DATA-04", "S3-DATA-06"):
        if not math.isclose(
            float(checks[item_id]),
            float(objective_keys[item_id]["expected_numeric"]),
            rel_tol=0,
            abs_tol=1e-6,
        ):
            raise ValueError(f"Fact pack mismatch for {item_id}")
    category_groups = resolve_path(fact_pack, "group_summaries.category")
    eligible_groups = [
        group for group in category_groups if group["value"] != "(missing)"
    ]
    leading = min(
        eligible_groups,
        key=lambda group: (-float(group["mrr_total_usd"]), group["value"].casefold()),
    )
    data_05 = objective_keys["S3-DATA-05"]
    if leading["value"] != data_05["categoryLabel"] or not math.isclose(
        float(leading["mrr_total_usd"]),
        float(data_05["expected_numeric"]),
        rel_tol=0,
        abs_tol=1e-6,
    ):
        raise ValueError("Fact pack mismatch for S3-DATA-05")
    for contract in ITEM_CONTRACTS.values():
        for path in contract.get("fact_pack_paths", []):
            resolve_path(fact_pack, path)


def build_evaluator_adapter(
    learner_path: Path, fact_pack_path: Path, peer_path: Path
) -> dict[str, Any]:
    if pd.__version__ != PINNED_PANDAS_VERSION:
        raise RuntimeError(
            f"Expected pandas {PINNED_PANDAS_VERSION}; found {pd.__version__}."
        )
    _, rows = load_rows(learner_path)
    fact_pack = json.loads(fact_pack_path.read_text(encoding="utf-8"))
    learner_sha256 = sha256_file(learner_path)
    peer_sha256 = sha256_file(peer_path)
    if fact_pack["metadata"]["dataset_version"] != DATASET_VERSION:
        raise ValueError("Fact pack dataset version mismatch")
    if fact_pack["metadata"]["input_sha256"] != learner_sha256:
        raise ValueError("Fact pack learner checksum mismatch")

    objective_stdlib = objective_keys_stdlib(rows)
    objective_pandas = objective_keys_pandas(learner_path)
    formula_stdlib = scale_formula_stdlib(rows)
    formula_pandas = scale_formula_pandas(learner_path)
    peer_stdlib = scale_peer_stdlib(peer_path)
    peer_pandas = scale_peer_pandas(peer_path)

    pairs = {
        "objective_items": (objective_stdlib, objective_pandas),
        "scale_formula": (formula_stdlib, formula_pandas),
        "scale_peer_python": (peer_stdlib, peer_pandas),
    }
    checks: dict[str, Any] = {}
    for label, (stdlib_result, pandas_result) in pairs.items():
        stdlib_sha = canonical_json_sha256(stdlib_result)
        pandas_sha = canonical_json_sha256(pandas_result)
        if stdlib_sha != pandas_sha:
            raise ValueError(f"Independent key implementations disagree: {label}")
        checks[label] = {
            "status": "match",
            "stdlib_result_sha256": stdlib_sha,
            "pandas_result_sha256": pandas_sha,
        }

    assert_fact_pack_matches(fact_pack, objective_stdlib)

    items: dict[str, Any] = {}
    for item_id in REQUIRED_ITEM_IDS:
        item = {"contract": ITEM_CONTRACTS[item_id]}
        if item_id in objective_stdlib:
            item["private_key"] = objective_stdlib[item_id]
        elif item_id in {"S3-DATA-07", "S3-DATA-08", "S3-DATA-09"}:
            item["private_grader_context"] = {
                path: resolve_path(fact_pack, path)
                for path in ITEM_CONTRACTS[item_id]["fact_pack_paths"]
            }
        elif item_id == "S3-DATA-10":
            item["private_key"] = {
                "dataset_version_id": DATASET_VERSION,
                "dataset_sha256": learner_sha256,
                "verifiable_items": {
                    verifiable_id: objective_stdlib[verifiable_id]
                    for verifiable_id in ITEM_CONTRACTS[item_id]["verifiable_item_ids"]
                },
            }
        elif item_id == "S3-SCALE-03F":
            item["private_key"] = formula_stdlib
        elif item_id == "S3-SCALE-03P":
            item["private_key"] = peer_stdlib
        items[item_id] = item

    if tuple(items) != REQUIRED_ITEM_IDS:
        raise ValueError("Evaluator adapter item IDs or ordering changed")

    return {
        "adapter_version": ADAPTER_VERSION,
        "dataset_version": DATASET_VERSION,
        "privacy": "instructor/evaluator-only; never return private_key or private_grader_context through student APIs",
        "bindings": {
            "learner_csv": {
                "filename": learner_path.name,
                "sha256": learner_sha256,
            },
            "fact_pack": {
                "filename": fact_pack_path.name,
                "sha256": sha256_file(fact_pack_path),
            },
            "peer_comparisons": {
                "filename": peer_path.name,
                "sha256": peer_sha256,
            },
        },
        "implementation_checks": {
            "pandas_version": pd.__version__,
            "second_reference": "Python standard library",
            **checks,
            "fact_pack_contract": "match",
        },
        "items": items,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--learner", required=True, type=Path)
    parser.add_argument("--fact-pack", required=True, type=Path)
    parser.add_argument("--peer-comparisons", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    adapter = build_evaluator_adapter(
        args.learner, args.fact_pack, args.peer_comparisons
    )
    write_json(args.output, adapter)
    print(
        json.dumps(
            {
                "status": "ok",
                "output": str(args.output),
                "output_sha256": sha256_file(args.output),
                "item_ids": list(adapter["items"]),
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
