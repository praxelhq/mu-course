#!/usr/bin/env python3
"""Structural release checks for the Course 1 design package.

This does not claim pedagogical validity or production readiness. It catches
referential drift and missing design assets before independent human review.
"""

from __future__ import annotations

import csv
import json
import re
import sys
import urllib.parse
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LESSONS = ROOT / "docs" / "lessons"
REGISTRY = ROOT / "docs" / "course" / "outcome-registry.md"
INVENTORY = ROOT / "docs" / "operations" / "asset-inventory.csv"
SKILLS = ROOT / ".agents" / "skills"

EXPECTED_SKILLS = {
    "mu-course-architect",
    "mu-map-career-streams",
    "mu-design-lms",
    "mu-plan-lessons",
    "mu-design-simulators",
    "mu-create-quizzes",
    "mu-create-course-materials",
    "mu-validate-learning-assets",
}

ALLOWED_ASSET_STATUS = {
    "Defined",
    "Drafted",
    "Authored",
    "Validated",
    "Piloted",
    "Loaded",
    "Rehearsed",
}
REQUIRED_SESSION_FILES = {
    "lesson-plan.md",
    "quiz.md",
    "session-contract.md",
    "prework.md",
    "student-brief.md",
    "student-handout.md",
    "instructor-runbook.md",
    "slide-outline.md",
    "demo-script.md",
    "source-pack.md",
    "content-packs.md",
    "simulator-spec.md",
    "solution-anchors.md",
    "postwork.md",
    "lms-copy-events.md",
    "accessibility-fallback.md",
}
PATHWAY_PATTERNS = {
    "Consulting": r"\bConsulting\b",
    "FOCOS": r"\bFOCOS\b|Founders'? Office|Chief of Staff",
    "Product Management": r"\bProduct(?: Management)?\b",
    "Investment Banking": r"Investment Banking|Finance\s*[—-]\s*IB|\bIB\b",
    "Venture Capital": r"Venture Capital|Finance\s*[—-]\s*VC|\bVC\b",
    "Corporate Finance": r"Corporate Finance|Corp(?:orate)?\.? Fin(?:ance)?",
    "Human Resources": r"Human Resources|\bHR\b",
    "Supply Chain and Operations": r"Supply Chain(?: and| &)? Operations|Supply Chain|\bOperations\b",
    "Sales": r"\bSales\b",
    "Marketing": r"\bMarketing\b",
    "Data": r"\bData\b",
}
CANONICAL_VALIDATORS = {
    1: ("V00",),
    2: ("V01",),
    3: ("V02",),
    4: ("V03",),
    5: ("V04",),
    6: ("V05",),
    7: ("V06", "V06P"),
    8: ("V07",),
    9: ("V08", "V09"),
    10: ("V10",),
}
INVENTORY_COLUMNS = {
    "asset_id",
    "session",
    "asset",
    "path_or_url",
    "owner_role",
    "status",
    "dependency",
    "due_gate",
    "validation_evidence",
    "signatory",
}


def quiz_family(item_id: str) -> str:
    item_id = re.sub(r"-(A|B)$", "", item_id)
    return re.sub(r"(?<=\d)(A|B)$", "", item_id)


def main() -> int:
    errors: list[str] = []
    metrics: dict[str, object] = {}

    lesson_dirs = sorted(path for path in LESSONS.iterdir() if path.is_dir())
    metrics["lesson_directories"] = len(lesson_dirs)
    if len(lesson_dirs) != 10:
        errors.append(f"expected 10 lesson directories; found {len(lesson_dirs)}")

    source_families: set[str] = set()
    item_ids: set[str] = set()
    total_items = 0
    total_structured_fixtures = 0
    total_session_files = 0

    for index, lesson_dir in enumerate(lesson_dirs, start=1):
        total_session_files += sum(1 for path in lesson_dir.rglob("*") if path.is_file())
        lesson = lesson_dir / "lesson-plan.md"
        quiz = lesson_dir / "quiz.md"
        if not lesson.exists() or not quiz.exists():
            errors.append(f"{lesson_dir.name}: missing lesson-plan.md or quiz.md")
            continue

        lesson_text = lesson.read_text(encoding="utf-8")
        quiz_text = quiz.read_text(encoding="utf-8")
        canonical_prefix = f"L{index:02d}-O"

        missing_session_files = sorted(
            name for name in REQUIRED_SESSION_FILES if not (lesson_dir / name).exists()
        )
        if missing_session_files:
            errors.append(
                f"{lesson_dir.name}: missing session-package files {missing_session_files}"
            )
        for required_name in sorted(REQUIRED_SESSION_FILES):
            required_path = lesson_dir / required_name
            if required_path.exists() and required_path.stat().st_size < 200:
                errors.append(
                    f"{lesson_dir.name}: required asset is implausibly small: {required_name}"
                )
        audit_paths = [
            lesson_dir / name
            for name in ("audit.md", "self-audit.md")
            if (lesson_dir / name).exists()
        ]
        if not audit_paths:
            errors.append(f"{lesson_dir.name}: no audit.md or self-audit.md release record")
        elif not any(
            "Independent cross-audit" in path.read_text(encoding="utf-8")
            for path in audit_paths
        ):
            errors.append(f"{lesson_dir.name}: no independent cross-audit record")
        content_pack = lesson_dir / "content-packs.md"
        if content_pack.exists():
            content_pack_text = content_pack.read_text(encoding="utf-8")
            missing_pathways = sorted(
                label
                for label, pattern in PATHWAY_PATTERNS.items()
                if not re.search(pattern, content_pack_text, re.IGNORECASE)
            )
            if missing_pathways:
                errors.append(
                    f"{lesson_dir.name}: content pack missing pathway labels {missing_pathways}"
                )
            pack_ids = set(
                re.findall(
                    rf"S{index:02d}-[A-Z0-9-]*PACK-01", content_pack_text, re.IGNORECASE
                )
            )
            if len(pack_ids) < 11:
                errors.append(
                    f"{lesson_dir.name}: expected at least 11 stable pathway pack IDs; found {len(pack_ids)}"
                )
        structured_fixtures = [
            path
            for path in lesson_dir.rglob("*")
            if path.is_file() and path.suffix.lower() in {".csv", ".json", ".jsonl"}
        ]
        total_structured_fixtures += len(structured_fixtures)
        if not structured_fixtures:
            errors.append(f"{lesson_dir.name}: no structured CSV/JSON fixture")
        synthetic_marked = False
        for fixture in structured_fixtures:
            fixture_text = fixture.read_text(encoding="utf-8", errors="ignore")
            if "synthetic" in fixture.name.lower() or "synthetic" in fixture_text.lower():
                synthetic_marked = True
            try:
                if fixture.suffix.lower() == ".json":
                    json.loads(fixture_text)
                elif fixture.suffix.lower() == ".jsonl":
                    for line in fixture_text.splitlines():
                        if line.strip():
                            json.loads(line)
                elif fixture.suffix.lower() == ".csv":
                    parsed_rows = list(csv.reader(fixture_text.splitlines()))
                    if len(parsed_rows) < 2:
                        raise ValueError("CSV has no data rows")
            except (json.JSONDecodeError, csv.Error, ValueError) as exc:
                errors.append(
                    f"{lesson_dir.name}: invalid structured fixture {fixture.relative_to(lesson_dir)}: {exc}"
                )
        if structured_fixtures and not synthetic_marked:
            errors.append(f"{lesson_dir.name}: structured fixtures lack a synthetic-data label")
        session_contract = lesson_dir / "session-contract.md"
        if session_contract.exists():
            contract_text = session_contract.read_text(encoding="utf-8")
            if canonical_prefix not in contract_text:
                errors.append(
                    f"{lesson_dir.name}: session contract missing canonical outcome prefix {canonical_prefix}"
                )
            missing_validators = [
                validator
                for validator in CANONICAL_VALIDATORS[index]
                if not re.search(rf"(?<![A-Z0-9]){re.escape(validator)}(?![A-Z0-9])", contract_text)
            ]
            if missing_validators:
                errors.append(
                    f"{lesson_dir.name}: session contract missing canonical validators {missing_validators}"
                )

        if "120 minutes" not in lesson_text:
            errors.append(f"{lesson_dir.name}: no 120-minute duration")
        if "Minute-by-minute run of show" not in lesson_text:
            errors.append(f"{lesson_dir.name}: no standardized run-of-show heading")
        if f"Canonical outcome IDs:** {canonical_prefix}" not in lesson_text:
            errors.append(f"{lesson_dir.name}: canonical lesson outcome metadata missing")
        if "review_due:** 2026-10-17" not in quiz_text:
            errors.append(f"{lesson_dir.name}: machine-readable quiz review_due missing")
        if "Form B" not in quiz_text:
            errors.append(f"{lesson_dir.name}: Form B contract missing")

        current_items = re.findall(r"^### (S\S+)", quiz_text, re.MULTILINE)
        if len(current_items) != 8:
            errors.append(f"{lesson_dir.name}: expected 8 item records; found {len(current_items)}")
        total_items += len(current_items)

        for item_id in current_items:
            if item_id in item_ids:
                errors.append(f"duplicate quiz item ID: {item_id}")
            item_ids.add(item_id)
            source_families.add(quiz_family(item_id))

    metrics["quiz_item_records"] = total_items
    metrics["quiz_families"] = len(source_families)
    metrics["session_files"] = total_session_files
    metrics["structured_fixtures"] = total_structured_fixtures

    registry_text = REGISTRY.read_text(encoding="utf-8")
    mapped_families = set(
        re.findall(r"^\| (S\d[^ |]*) \| L", registry_text, re.MULTILINE)
    )
    missing_family_joins = sorted(source_families - mapped_families)
    unused_family_joins = sorted(mapped_families - source_families)
    if missing_family_joins:
        errors.append(f"quiz families missing registry joins: {missing_family_joins}")
    if unused_family_joins:
        errors.append(f"registry quiz joins without source items: {unused_family_joins}")
    if "`V00`–`V10`, plus `V06P`" not in registry_text:
        errors.append("validator namespace does not register V06P")
    if "| L07-O5 |" not in registry_text or "| V06P |" not in registry_text:
        errors.append("L07 tester-participation outcome does not map to V06P")

    local_links_checked = 0
    for markdown in ROOT.rglob("*.md"):
        text = markdown.read_text(encoding="utf-8", errors="ignore")
        for match in re.finditer(r"(?<!!)\[[^\]]*\]\(([^)]+)\)", text):
            target = match.group(1).strip().strip("<>")
            if not target or target.startswith(("http://", "https://", "mailto:", "#")):
                continue
            target = urllib.parse.unquote(target.split("#", 1)[0])
            if not target:
                continue
            local_links_checked += 1
            resolved = Path(target) if target.startswith("/") else markdown.parent / target
            if not resolved.exists():
                errors.append(
                    f"broken local link in {markdown.relative_to(ROOT)}: {target}"
                )
    metrics["local_links_checked"] = local_links_checked

    with INVENTORY.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
        if set(reader.fieldnames or []) != INVENTORY_COLUMNS:
            errors.append("asset inventory columns do not match the canonical schema")

    asset_ids: set[str] = set()
    for row_number, row in enumerate(rows, start=2):
        asset_id = row.get("asset_id", "")
        if not asset_id or asset_id in asset_ids:
            errors.append(f"asset inventory row {row_number}: missing/duplicate asset_id")
        asset_ids.add(asset_id)
        if row.get("status") not in ALLOWED_ASSET_STATUS:
            errors.append(f"asset {asset_id}: invalid status {row.get('status')!r}")
        path = row.get("path_or_url", "")
        status = row.get("status")
        if status in {"Drafted", "Authored", "Validated", "Piloted", "Loaded", "Rehearsed"}:
            if path == "TBD" or not path:
                errors.append(f"asset {asset_id}: {status} but path is {path!r}")
            elif not path.startswith(("http://", "https://")) and not (ROOT / path).exists():
                errors.append(f"asset {asset_id}: declared path does not exist: {path}")

    metrics["asset_inventory_rows"] = len(rows)
    metrics["asset_status_counts"] = {
        status: sum(row.get("status") == status for row in rows)
        for status in sorted(ALLOWED_ASSET_STATUS)
    }

    found_skills = {path.name for path in SKILLS.iterdir() if (path / "SKILL.md").exists()}
    if found_skills != EXPECTED_SKILLS:
        errors.append(
            f"skill set mismatch; missing={sorted(EXPECTED_SKILLS-found_skills)}, "
            f"unexpected={sorted(found_skills-EXPECTED_SKILLS)}"
        )
    for skill in sorted(found_skills):
        if not (SKILLS / skill / "agents" / "openai.yaml").exists():
            errors.append(f"skill {skill}: agents/openai.yaml missing")
    metrics["repo_skills"] = len(found_skills)

    result = {
        "status": "pass" if not errors else "fail",
        "scope": "structural design-package checks; not production readiness",
        "metrics": metrics,
        "errors": errors,
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
