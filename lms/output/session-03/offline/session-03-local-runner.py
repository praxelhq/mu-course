#!/usr/bin/env python3
"""Run the Session 3 peer-comparison aggregate without a notebook.

This learner-safe runner contains no dataset rows or answer values. It reads the
full gzip JSONL only at runtime, validates the declared shape, writes a compact
aggregate CSV, and records an audit trace beside it.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
from pathlib import Path
from typing import Any

import pandas as pd


REQUIRED_PATHS = {
    "comparison_id",
    "focal_record_id",
    "focal.startup_name",
    "focal.category",
    "focal.audience_type",
    "comparison.mrr_ratio_to_peer",
    "comparison.mrr_gap_usd",
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read_peer_file(path: Path, chunksize: int) -> tuple[pd.DataFrame, dict[str, int]]:
    selected: list[pd.DataFrame] = []
    rows_loaded = 0
    comparison_ids: set[str] = set()
    for records in pd.read_json(
        path,
        lines=True,
        compression="gzip",
        chunksize=chunksize,
    ):
        flat = pd.json_normalize(records.to_dict(orient="records"))
        missing = sorted(REQUIRED_PATHS.difference(flat.columns))
        if missing:
            raise ValueError(f"Input is missing required paths: {', '.join(missing)}")
        rows_loaded += len(flat)
        ids = flat["comparison_id"].astype("string")
        if ids.isna().any() or ids.duplicated().any() or any(value in comparison_ids for value in ids):
            raise ValueError("comparison_id must be complete and globally unique")
        comparison_ids.update(str(value) for value in ids)
        selected.append(flat[sorted(REQUIRED_PATHS)].copy())
    if not selected:
        raise ValueError("Input contains no JSONL records")
    return pd.concat(selected, ignore_index=True), {
        "rows_loaded": rows_loaded,
        "unique_comparison_ids": len(comparison_ids),
    }


def aggregate(frame: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, int]]:
    work = frame.copy()
    work["ratio"] = pd.to_numeric(
        work["comparison.mrr_ratio_to_peer"],
        errors="coerce",
    )
    work["abs_gap"] = pd.to_numeric(
        work["comparison.mrr_gap_usd"],
        errors="coerce",
    ).abs()
    valid_rows = int(work["ratio"].notna().sum())
    excluded_rows = int(work["ratio"].isna().sum())

    grouped = (
        work.groupby("focal_record_id", dropna=False)
        .agg(
            startup_name=("focal.startup_name", "first"),
            category=("focal.category", "first"),
            audience_type=("focal.audience_type", "first"),
            valid_peer_count=("ratio", "count"),
            median_mrr_ratio_to_peer=("ratio", "median"),
            median_abs_mrr_gap_usd=("abs_gap", "median"),
        )
        .reset_index()
    )
    qualified = grouped[grouped["valid_peer_count"] >= 20].copy()
    qualified = qualified.sort_values(
        ["median_mrr_ratio_to_peer", "focal_record_id"],
        kind="mergesort",
    ).head(10)
    if qualified.empty:
        raise ValueError("No focal startup has at least 20 valid ratio comparisons")
    if not qualified["median_mrr_ratio_to_peer"].is_monotonic_increasing:
        raise AssertionError("Output ratio order is not ascending")
    if (qualified["valid_peer_count"] < 20).any():
        raise AssertionError("Output contains a focal startup below the peer threshold")

    return qualified, {
        "valid_rows": valid_rows,
        "excluded_rows": excluded_rows,
        "focal_groups": len(grouped),
        "qualifying_groups": len(qualified),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path, help="Peer-comparison .jsonl.gz")
    parser.add_argument("--output", required=True, type=Path, help="Compact aggregate CSV")
    parser.add_argument("--trace", required=True, type=Path, help="Private audit trace JSON")
    parser.add_argument("--dataset-version", required=True)
    parser.add_argument("--expected-sha256", required=True)
    parser.add_argument("--chunksize", type=int, default=50_000)
    args = parser.parse_args()

    actual_sha256 = sha256_file(args.input)
    if actual_sha256 != args.expected_sha256:
        raise ValueError("Input checksum does not match the LMS material card")
    frame, read_stats = read_peer_file(args.input, args.chunksize)
    result, aggregate_stats = aggregate(frame)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    result.to_csv(args.output, index=False)
    trace: dict[str, Any] = {
        "dataset_version": args.dataset_version,
        "input_sha256": actual_sha256,
        "input_filename": args.input.name,
        **read_stats,
        **aggregate_stats,
        "assertions_passed": True,
        "output_sha256": sha256_file(args.output),
        "runtime": {
            "python": platform.python_version(),
            "pandas": pd.__version__,
        },
    }
    args.trace.parent.mkdir(parents=True, exist_ok=True)
    args.trace.write_text(json.dumps(trace, indent=2) + "\n", encoding="utf-8")
    print(f"PASS · wrote {args.output.name} and {args.trace.name}")


if __name__ == "__main__":
    main()
