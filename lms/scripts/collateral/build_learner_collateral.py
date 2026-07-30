#!/usr/bin/env python3
"""Build and validate answer-free Session 3 learner collateral and quiz imports.

This builder intentionally reads only the authored Session 3-5 course packages and
the public-safe Session 3 schema/manifest. It never reads learner rows, fact packs,
or evaluator adapters.
"""

from __future__ import annotations

import csv
import gzip
import hashlib
import json
import re
import shutil
import subprocess
import tempfile
import textwrap
from datetime import datetime
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
SESSION_03 = ROOT / "lms/course/session-03"
SESSION_04 = ROOT / "lms/course/session-04"
SESSION_05 = ROOT / "lms/course/session-05"
SAFE_SCHEMA = ROOT / "lms/private/course-data/session-03/generated/v1/trustmrr_s3_schema_v1.json"
SAFE_MANIFEST = ROOT / "lms/private/course-data/session-03/generated/v1/trustmrr_s3_manifest_v1.json"
SESSION_03_OUTPUT = ROOT / "lms/output/session-03"
SESSION_03_OFFLINE_SOURCE = SESSION_03 / "offline"
SESSION_03_OFFLINE_OUTPUT = SESSION_03_OUTPUT / "offline"
SESSION_05_OUTPUT = ROOT / "lms/output/session-05"
QUIZ_OUTPUT = ROOT / "lms/output/quizzes"
INSTRUCTOR_QUIZ_OUTPUT = ROOT / "lms/output/instructor/quizzes"

IMPORT_SCHEMA_VERSION = "mu-lms-assessment-import/1.0"
KEY_SCHEMA_VERSION = "mu-lms-instructor-key/1.0"


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def source_ref(path: Path, source_id: str, version_id: str) -> dict[str, str]:
    return {
        "source_id": source_id,
        "source_version_id": version_id,
        "source_path": path.relative_to(ROOT).as_posix(),
        "source_content_sha256": sha256_file(path),
    }


def section_blocks(text: str, pattern: str) -> list[tuple[re.Match[str], str]]:
    matches = list(re.finditer(pattern, text, flags=re.MULTILINE))
    blocks: list[tuple[re.Match[str], str]] = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        blocks.append((match, text[match.end() : end]))
    return blocks


def clean_inline_markdown(value: str) -> str:
    value = value.strip()
    value = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1 (\2)", value)
    value = value.replace("**", "").replace("`", "")
    return value.strip().rstrip(".")


def parse_markdown_table(block: str) -> tuple[list[str], list[list[str]]]:
    lines = [line.strip() for line in block.splitlines() if line.strip().startswith("|")]
    if len(lines) < 2:
        return [], []
    rows = [[cell.strip() for cell in line.strip("|").split("|")] for line in lines]
    headers = rows[0]
    body = [row for row in rows[2:] if len(row) == len(headers)]
    return headers, body


def parse_accessible_artifacts(path: Path) -> dict[str, dict[str, Any]]:
    text = read_text(path)
    artifacts: dict[str, dict[str, Any]] = {}
    pattern = r"^##\s+`(?P<artifact_id>S3-VIZ-\d{2}-A11Y@\d+)`\s+·\s+(?P<title>.+)$"
    for match, block in section_blocks(text, pattern):
        alt_match = re.search(r"\*\*Text alternative:\*\*\s*(.+)", block)
        if not alt_match:
            raise ValueError(f"Missing text alternative for {match.group('artifact_id')}")
        headers, rows = parse_markdown_table(block)
        if not headers or not rows:
            raise ValueError(f"Missing accessible table for {match.group('artifact_id')}")
        artifacts[match.group("artifact_id")] = {
            "artifact_id": match.group("artifact_id"),
            "artifact_set_version": "S3-VIZ-A11Y-v1",
            "title": clean_inline_markdown(match.group("title")),
            "text_alternative": clean_inline_markdown(alt_match.group(1)),
            "table": {"headers": headers, "rows": rows},
        }
    if len(artifacts) != 6:
        raise ValueError(f"Expected 6 accessible artifacts, found {len(artifacts)}")
    return artifacts


def parse_s3_items(path: Path, artifacts: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    text = read_text(path)
    items: list[dict[str, Any]] = []
    pattern = r"^##\s+(?P<item_id>S3-VIZ-\d{2})\s+·\s+(?P<title>.+)$"
    for order, (match, block) in enumerate(section_blocks(text, pattern), start=1):
        item_id = match.group("item_id")
        metadata = re.search(
            r"\*\*Metadata:\*\*\s+`(?P<version>[^`]+)`\s+·\s+(?P<outcome>[^·]+)\s+·\s+(?P<difficulty>[^·]+)\s+·\s+(?P<minutes>\d+)\s+minutes\s+·\s+(?P<stale>.+)",
            block,
        )
        scenario = re.search(r"\*\*Scenario:\*\*\s*(.+)", block)
        artifact_match = re.search(r"\*\*Accessible artifact:\*\*\s+`([^`]+)`", block)
        if not metadata or not scenario or not artifact_match:
            raise ValueError(f"Incomplete S3 metadata for {item_id}")
        options = [
            {"option_id": option_id, "canonical_order": index, "text": option_text.strip()}
            for index, (option_id, option_text) in enumerate(
                re.findall(r"^-\s+`([^`]+)`\s+—\s+(.+)$", block, flags=re.MULTILINE), start=1
            )
        ]
        if len(options) != 4:
            raise ValueError(f"Expected 4 options for {item_id}, found {len(options)}")
        artifact_id = artifact_match.group(1)
        if artifact_id not in artifacts:
            raise ValueError(f"Missing artifact {artifact_id} for {item_id}")
        items.append(
            {
                "item_id": item_id,
                "item_version_id": metadata.group("version"),
                "item_order": order,
                "title": clean_inline_markdown(match.group("title")),
                "outcome_ids": [metadata.group("outcome").strip()],
                "difficulty": metadata.group("difficulty").strip(),
                "item_time_seconds": int(metadata.group("minutes")) * 60,
                "prompt": scenario.group(1).strip(),
                "response": {
                    "type": "single_choice_plus_rationale",
                    "selected_option_field": "selectedOptionId",
                    "rationale_required": True,
                    "rationale_min_words": 40,
                    "rationale_max_words": 80,
                },
                "shuffle_options": True,
                "volatile": True,
                "stale_check_rule": metadata.group("stale").strip(),
                "accessible_artifact": artifacts[artifact_id],
                "options": options,
            }
        )
    if len(items) != 6:
        raise ValueError(f"Expected 6 S3 visualization items, found {len(items)}")
    return items


def parse_blueprint(path: Path, prefix: str) -> dict[str, dict[str, Any]]:
    text = read_text(path)
    metadata: dict[str, dict[str, Any]] = {}
    for line in text.splitlines():
        if not line.startswith(f"| `{prefix}"):
            continue
        cells = [cell.strip() for cell in line.strip("|").split("|")]
        item_version_id = cells[0].strip("`")
        if prefix == "S4-Q":
            outcome, demand, seconds, stale = cells[1], cells[2], cells[3], cells[4]
            metadata[item_version_id] = {
                "outcome_ids": [outcome],
                "demand": demand,
                "item_time_seconds": int(re.search(r"\d+", seconds).group()),
                "difficulty": None,
                "volatile": "Yes" in stale,
                "stale_check_rule": stale,
            }
        else:
            outcome, evidence, demand, difficulty, seconds, evaluation = cells[1:7]
            outcome_parts = outcome.split("/")
            session_prefix = outcome_parts[0].split("-", 1)[0] + "-"
            outcome_ids = [
                part if part.startswith("S") else session_prefix + part
                for part in outcome_parts
            ]
            metadata[item_version_id] = {
                "outcome_ids": outcome_ids,
                "evidence": evidence,
                "demand": demand,
                "difficulty": difficulty,
                "item_time_seconds": int(re.search(r"\d+", seconds).group()),
                "volatile": "T-7" in evaluation,
                "stale_check_rule": evaluation,
            }
    return metadata


def parse_stable_learner_items(
    path: Path,
    prefix: str,
    blueprint: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    text = read_text(path)
    pattern = rf"^##\s+`(?P<version>{re.escape(prefix)}\d+@\d+)`(?P<suffix>.*)$"
    items: list[dict[str, Any]] = []
    for order, (match, block) in enumerate(section_blocks(text, pattern), start=1):
        version = match.group("version")
        lines = [line.strip() for line in block.splitlines()]
        prompt_lines: list[str] = []
        for line in lines:
            if line.startswith("- `"):
                break
            if line:
                prompt_lines.append(line)
        prompt = " ".join(prompt_lines).strip()
        options = [
            {"option_id": option_id, "canonical_order": index, "text": option_text.strip()}
            for index, (option_id, option_text) in enumerate(
                re.findall(r"^-\s+`([^`]+)`\s+—\s+(.+)$", block, flags=re.MULTILINE), start=1
            )
        ]
        if len(options) != 4:
            raise ValueError(f"Expected 4 options for {version}, found {len(options)}")
        item_id = version.split("@")[0]
        meta = blueprint.get(version, {})
        items.append(
            {
                "item_id": item_id,
                "item_version_id": version,
                "item_order": order,
                "outcome_ids": meta.get("outcome_ids", []),
                "demand": meta.get("demand"),
                "difficulty": meta.get("difficulty"),
                "item_time_seconds": meta.get("item_time_seconds"),
                "prompt": prompt,
                "response": {"type": "single_choice", "selected_option_field": "selectedOptionId"},
                "shuffle_options": True,
                "volatile": bool(meta.get("volatile") or "volatile" in match.group("suffix")),
                "stale_check_rule": meta.get("stale_check_rule"),
                "options": options,
            }
        )
    return items


def extract_field(block: str, labels: list[str]) -> str | None:
    for label in labels:
        match = re.search(rf"\*\*{re.escape(label)}:\*\*\s*(.+)", block)
        if match:
            return clean_inline_markdown(match.group(1))
    return None


def parse_instructor_key(path: Path, prefix: str) -> dict[str, dict[str, Any]]:
    text = read_text(path)
    pattern = rf"^###\s+`(?P<version>{re.escape(prefix)}\d+@\d+)`(?P<suffix>.*)$"
    keys: dict[str, dict[str, Any]] = {}
    for match, block in section_blocks(text, pattern):
        version = match.group("version")
        correct = re.search(r"\*\*Correct option ID:\*\*\s+`([^`]+)`", block)
        if not correct:
            correct = re.search(r"Correct\s+`([^`]+)`", match.group("suffix"))
        if not correct:
            raise ValueError(f"Missing correct option ID for {version}")
        diagnoses = {
            option_id: clean_inline_markdown(diagnosis)
            for option_id, diagnosis in re.findall(
                r"\*\*`([^`]+)` diagnosis:\*\*\s*(.+)$", block, flags=re.MULTILINE
            )
        }
        keys[version] = {
            "item_version_id": version,
            "correct_option_id": correct.group(1),
            "rationale": extract_field(block, ["Rationale"]),
            "distractor_diagnoses": diagnoses or extract_field(block, ["Wrong-path diagnosis"]),
            "feedback": extract_field(block, ["Feedback", "Released feedback"]),
            "t7_rule": extract_field(block, ["T-7 rule"]),
            "t7_source": extract_field(block, ["T-7 source"]),
        }
    return keys


def parse_s3_key(path: Path) -> dict[str, dict[str, Any]]:
    text = read_text(path)
    keys: dict[str, dict[str, Any]] = {}
    pattern = r"^##\s+(?P<item_id>S3-VIZ-\d{2})\s+·\s+.+$"
    for match, block in section_blocks(text, pattern):
        metadata = re.search(r"\*\*Metadata:\*\*\s+`([^`]+)`", block)
        correct = re.search(r"\*\*Key:\*\*\s+`([^`]+)`", block)
        anchors = re.search(r"\*\*Strong rationale anchors:\*\*\s*(.+)", block)
        feedback = re.search(r"\*\*Feedback:\*\*\s*(.+)", block)
        if not metadata or not correct or not anchors or not feedback:
            raise ValueError(f"Incomplete S3 key for {match.group('item_id')}")
        diagnosis_block = block.split("**Distractor diagnoses**", 1)[1].split("**Feedback:**", 1)[0]
        diagnoses: dict[str, str] = {}
        for line in diagnosis_block.splitlines():
            option_ids = re.findall(r"`([^`]+)`", line)
            if not option_ids or ":" not in line:
                continue
            diagnosis = clean_inline_markdown(line.split(":", 1)[1])
            for option_id in option_ids:
                diagnoses[option_id] = diagnosis
        keys[metadata.group(1)] = {
            "item_version_id": metadata.group(1),
            "correct_option_id": correct.group(1),
            "selection_points": 1,
            "rationale_points_max": 2,
            "strong_rationale_anchors": clean_inline_markdown(anchors.group(1)),
            "distractor_diagnoses": diagnoses,
            "feedback": clean_inline_markdown(feedback.group(1)),
        }
    return keys


def make_assessment_payloads() -> tuple[list[dict[str, Any]], dict[str, Any], list[dict[str, Any]]]:
    s3_source = SESSION_03 / "visualization-quiz.md"
    s3_artifact_source = SESSION_03 / "visualization-quiz-accessible-artifacts.md"
    s4_student = SESSION_04 / "12-student-quiz.md"
    s4_key_source = SESSION_04 / "12-instructor-quiz-bank.md"
    s5_student = SESSION_05 / "assessment/surprise-quiz-student.md"
    s5_key_source = SESSION_05 / "assessment/surprise-quiz-key.md"

    artifacts = parse_accessible_artifacts(s3_artifact_source)
    s3_items = parse_s3_items(s3_source, artifacts)
    s4_items = parse_stable_learner_items(s4_student, "S4-Q", parse_blueprint(s4_key_source, "S4-Q"))
    s5_items = parse_stable_learner_items(s5_student, "S5-Q", parse_blueprint(s5_key_source, "S5-Q"))
    if len(s4_items) != 7 or len(s5_items) != 8:
        raise ValueError(f"Unexpected quiz counts: S4={len(s4_items)}, S5={len(s5_items)}")

    s3_manifest = SESSION_03 / "lms-manifest.md"
    s4_manifest = SESSION_04 / "09-lms-manifest.yaml"
    s5_manifest = SESSION_05 / "lms-manifest.yaml"
    s4_lesson = SESSION_04 / "01-lesson-plan.md"
    s5_lesson = SESSION_05 / "lesson-plan.md"

    payloads = [
        {
            "import_schema_version": IMPORT_SCHEMA_VERSION,
            "audience": "learner",
            "assessment": {
                "assessment_id": "assess_s3_visuals_v1",
                "assessment_version_id": "assess_s3_visuals_v1",
                "session_no": 3,
                "title": "Session 3 visualization scenario check",
                "assessment_class": "formative_mixed_scenario",
                "activation_rule": "opens at 01:39 and closes at 01:54 per section",
                "time_limit_seconds": 900,
                "attempt_policy": "one attempt plus one retry after delayed feedback",
                "course_weight": 0,
                "mastery_rule": "14/18 with at least four correct selections",
                "answer_release_rule": "attempt receipt only until the last participating section using this assessment version closes",
                "scoring_identity": "stable option ID; never display letter or array index",
                "manifest_registration": {
                    "registered": "assess_s3_visuals_v1" in read_text(s3_manifest),
                    **source_ref(s3_manifest, "lms.course.session-03.lms-manifest", "assess_s3_visuals_v1"),
                },
                "accessible_artifact_source": source_ref(
                    s3_artifact_source,
                    "lms.course.session-03.visualization-quiz-accessible-artifacts",
                    "S3-VIZ-A11Y-v1",
                ),
                **source_ref(s3_source, "lms.course.session-03.visualization-quiz", "assess_s3_visuals_v1"),
            },
            "items": s3_items,
        },
        {
            "import_schema_version": IMPORT_SCHEMA_VERSION,
            "audience": "learner",
            "assessment": {
                "assessment_id": "quiz_s4_product-build-judgment",
                "assessment_version_id": "S4-SQ-v1",
                "session_no": 4,
                "title": "S4 · Product build judgment",
                "assessment_class": "counted_surprise_candidate_or_retention_check",
                "activation_rule": "dormant by default; when armed, replaces the protected 04–10 retrieval-prediction row",
                "time_limit_seconds": 360,
                "attempt_policy": "one attempt when counted",
                "course_weight": "best-three surprise-quiz percentages when counted; none when retention",
                "mastery_rule": "5/7",
                "answer_release_rule": "attempt receipt only until the last participating section using S4-SQ-v1 closes",
                "scoring_identity": "stable option ID; never display letter or array index",
                "protected_time_source": source_ref(
                    s4_lesson, "lms.course.session-04.lesson-plan", "S4-SQ-v1-protected-04-10"
                ),
                "manifest_registration": {
                    "registered": "version: \"S4-SQ-v1\"" in read_text(s4_manifest),
                    **source_ref(s4_manifest, "lms.course.session-04.lms-manifest", "1.0"),
                },
                **source_ref(s4_student, "lms.course.session-04.student-quiz", "S4-SQ-v1"),
            },
            "items": s4_items,
        },
        {
            "import_schema_version": IMPORT_SCHEMA_VERSION,
            "audience": "learner",
            "assessment": {
                "assessment_id": "quiz_s5_workflow-control",
                "assessment_version_id": "S5-SQ-v1",
                "session_no": 5,
                "title": "S5 · Workflow control",
                "assessment_class": "counted_surprise_if_activated",
                "activation_rule": "dormant by default; when armed, runs 00–07 and replaces retrieval without shortening assessed build work",
                "time_limit_seconds": 420,
                "attempt_policy": "one attempt when counted; no replacement retake",
                "course_weight": "best-three surprise-quiz percentages within existing 5% component when counted",
                "mastery_rule": "6/8",
                "answer_release_rule": "attempt receipt only until the last participating section using S5-SQ-v1 closes",
                "scoring_identity": "stable option ID; never display letter or array index",
                "protected_time_source": source_ref(
                    s5_lesson, "lms.course.session-05.lesson-plan", "S5-SQ-v1-protected-00-07"
                ),
                "manifest_registration": {
                    "registered": "version: \"S5-SQ-v1\"" in read_text(s5_manifest),
                    **source_ref(s5_manifest, "lms.course.session-05.lms-manifest", "0.1.0"),
                },
                **source_ref(s5_student, "lms.course.session-05.surprise-quiz-student", "S5-SQ-v1"),
            },
            "items": s5_items,
        },
    ]

    key_sources = [s3_source, s4_key_source, s5_key_source]
    key_maps = [parse_s3_key(s3_source), parse_instructor_key(s4_key_source, "S4-Q"), parse_instructor_key(s5_key_source, "S5-Q")]
    key_assessments: list[dict[str, Any]] = []
    for payload, key_source, key_map in zip(payloads, key_sources, key_maps, strict=True):
        learner_versions = {item["item_version_id"] for item in payload["items"]}
        if set(key_map) != learner_versions:
            raise ValueError(f"Key/item mismatch for {payload['assessment']['assessment_id']}")
        option_ids = {
            item["item_version_id"]: {option["option_id"] for option in item["options"]}
            for item in payload["items"]
        }
        for item_version, item_key in key_map.items():
            if item_key["correct_option_id"] not in option_ids[item_version]:
                raise ValueError(f"Key option not found: {item_version}")
        key_assessments.append(
            {
                "assessment_id": payload["assessment"]["assessment_id"],
                "assessment_version_id": payload["assessment"]["assessment_version_id"],
                "source": source_ref(
                    key_source,
                    f"{payload['assessment']['source_id']}.instructor-key",
                    payload["assessment"]["assessment_version_id"],
                ),
                "items": [key_map[item["item_version_id"]] for item in payload["items"]],
            }
        )
    instructor_key = {
        "key_schema_version": KEY_SCHEMA_VERSION,
        "classification": "INSTRUCTOR_ONLY",
        "do_not_publish": True,
        "handling": "Never load into learner materials, previews, search, exports, or model context.",
        "assessments": key_assessments,
    }
    return payloads, instructor_key, list(artifacts.values())


CSV_FIELDS = [
    "import_schema_version",
    "assessment_id",
    "assessment_version_id",
    "source_id",
    "source_version_id",
    "source_path",
    "source_content_sha256",
    "session_no",
    "assessment_class",
    "activation_rule",
    "answer_release_rule",
    "time_limit_seconds",
    "item_id",
    "item_version_id",
    "item_order",
    "outcome_ids",
    "demand",
    "difficulty",
    "item_time_seconds",
    "prompt",
    "response_type",
    "rationale_required",
    "rationale_min_words",
    "rationale_max_words",
    "shuffle_options",
    "volatile",
    "stale_check_rule",
    "accessible_artifact_id",
    "accessible_text",
    "accessible_table_json",
    "option_id",
    "option_order",
    "option_text",
]


def payload_to_rows(payload: dict[str, Any]) -> list[dict[str, Any]]:
    assessment = payload["assessment"]
    rows: list[dict[str, Any]] = []
    for item in payload["items"]:
        response = item["response"]
        artifact = item.get("accessible_artifact") or {}
        for option in item["options"]:
            rows.append(
                {
                    "import_schema_version": payload["import_schema_version"],
                    "assessment_id": assessment["assessment_id"],
                    "assessment_version_id": assessment["assessment_version_id"],
                    "source_id": assessment["source_id"],
                    "source_version_id": assessment["source_version_id"],
                    "source_path": assessment["source_path"],
                    "source_content_sha256": assessment["source_content_sha256"],
                    "session_no": assessment["session_no"],
                    "assessment_class": assessment["assessment_class"],
                    "activation_rule": assessment["activation_rule"],
                    "answer_release_rule": assessment["answer_release_rule"],
                    "time_limit_seconds": assessment["time_limit_seconds"],
                    "item_id": item["item_id"],
                    "item_version_id": item["item_version_id"],
                    "item_order": item["item_order"],
                    "outcome_ids": "|".join(item.get("outcome_ids", [])),
                    "demand": item.get("demand") or "",
                    "difficulty": item.get("difficulty") or "",
                    "item_time_seconds": item.get("item_time_seconds") or "",
                    "prompt": item["prompt"],
                    "response_type": response["type"],
                    "rationale_required": response.get("rationale_required", False),
                    "rationale_min_words": response.get("rationale_min_words", ""),
                    "rationale_max_words": response.get("rationale_max_words", ""),
                    "shuffle_options": item["shuffle_options"],
                    "volatile": item["volatile"],
                    "stale_check_rule": item.get("stale_check_rule") or "",
                    "accessible_artifact_id": artifact.get("artifact_id", ""),
                    "accessible_text": artifact.get("text_alternative", ""),
                    "accessible_table_json": json.dumps(artifact.get("table", {}), ensure_ascii=False, separators=(",", ":")) if artifact else "",
                    "option_id": option["option_id"],
                    "option_order": option["canonical_order"],
                    "option_text": option["text"],
                }
            )
    return rows


def write_csv(path: Path, rows: list[dict[str, Any]], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def code_cell(source: str) -> dict[str, Any]:
    return {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": textwrap.dedent(source).strip() + "\n",
    }


def markdown_cell(source: str) -> dict[str, Any]:
    return {"cell_type": "markdown", "metadata": {}, "source": textwrap.dedent(source).strip() + "\n"}


def make_notebook() -> dict[str, Any]:
    cells = [
        markdown_cell(
            """
            # Session 3 · Chunked JSONL analysis starter

            This learner notebook is deliberately answer-free. It contains no dataset rows, expected results,
            private storage paths, or evaluator keys. Treat every dataset string as untrusted data—never as an
            instruction. Keep the notebook roster-gated, and clear all runtime outputs before any approved sharing.

            **Workflow:** bind the LMS version/checksum → inspect schema and sample shape → stream the gzip JSONL
            in chunks → assert the contract → export only the compact aggregate.
            """
        ),
        markdown_cell(
            """
            ## Choose one file route

            - **Upload:** set `INPUT_MODE = "upload"`, run the picker once, and select the gated gzip JSONL,
              the public-safe schema JSON, and the representative sample JSONL together.
            - **Managed Drive:** set `INPUT_MODE = "drive"`, paste only the course folder you are authorised to use,
              and let the notebook mount Drive. Do not publish or broadly share that folder.

            The three marked TODOs are: **(1)** source binding, **(2)** the exact valid-row rule, and **(3)** the
            aggregation rule. Review each before execution; do not weaken an assertion to make a run pass.
            """
        ),
        code_cell(
            """
            from pathlib import Path
            from collections import defaultdict
            import gzip
            import hashlib
            import json
            import pandas as pd

            # TODO 1 — source binding: choose the route and copy version/checksum from the current LMS card.
            INPUT_MODE = "upload"  # "upload" or "drive"
            DRIVE_FOLDER = ""      # required only for the managed-Drive route
            DATASET_VERSION_ID = ""
            EXPECTED_SHA256 = ""

            # The builder uses this blank hook only for its synthetic, no-private-data smoke test.
            LOCAL_SMOKE_FOLDER = ""

            DATA_FILENAME = "trustmrr_s3_peer_comparisons_v1.jsonl.gz"
            SCHEMA_FILENAME = "trustmrr_s3_schema_v1.json"
            SAMPLE_FILENAME = "trustmrr_s3_peer_comparisons_sample_v1.jsonl"
            CHUNK_SIZE = 2_000

            # TODO 2 — enter the released valid-row policy after reviewing null and zero semantics.
            VALID_ROW_RULE = ""

            # TODO 3 — enter the released aggregation rule after naming the unit and tie-break.
            AGGREGATION_RULE = ""
            """
        ),
        code_cell(
            """
            if INPUT_MODE == "upload":
                try:
                    from google.colab import files
                except ImportError as exc:
                    raise RuntimeError("Upload mode requires Google Colab. Use Drive in Colab or the instructor's local runner.") from exc
                uploaded = files.upload()
                print("Uploaded files:", sorted(uploaded))
                base_folder = Path(".")
            elif INPUT_MODE == "drive":
                if not DRIVE_FOLDER.strip():
                    raise AssertionError("TODO 1: paste the authorised Drive course folder path.")
                try:
                    from google.colab import drive
                except ImportError as exc:
                    raise RuntimeError("Drive mode requires Google Colab. Use the instructor's local runner offline.") from exc
                drive.mount("/content/drive")
                base_folder = Path(DRIVE_FOLDER)
            elif INPUT_MODE == "local_smoke":
                # Reserved for the reproducible builder's synthetic smoke; do not use for graded work.
                base_folder = Path(LOCAL_SMOKE_FOLDER)
            else:
                raise ValueError("INPUT_MODE must be 'upload' or 'drive'.")

            DATA_FILE = base_folder / DATA_FILENAME
            SCHEMA_FILE = base_folder / SCHEMA_FILENAME
            SAMPLE_FILE = base_folder / SAMPLE_FILENAME
            for required_file in (DATA_FILE, SCHEMA_FILE, SAMPLE_FILE):
                assert required_file.is_file(), f"Missing required file: {required_file.name}"
            """
        ),
        code_cell(
            """
            def sha256_path(path: Path, block_size: int = 1024 * 1024) -> str:
                digest = hashlib.sha256()
                with path.open("rb") as handle:
                    for block in iter(lambda: handle.read(block_size), b""):
                        digest.update(block)
                return digest.hexdigest()

            assert DATASET_VERSION_ID.strip(), "TODO 1: copy the dataset-version ID from the LMS material card."
            assert len(EXPECTED_SHA256) == 64 and all(ch in "0123456789abcdef" for ch in EXPECTED_SHA256), \
                "TODO 1: copy the 64-character lowercase SHA-256 from the LMS material card."
            observed_sha256 = sha256_path(DATA_FILE)
            assert observed_sha256 == EXPECTED_SHA256, "Dataset version/checksum mismatch. Stop and download the current gated file."
            print({"dataset_version_id": DATASET_VERSION_ID, "checksum_verified": True})
            """
        ),
        markdown_cell(
            """
            ## Inspect the schema and sample without printing rows

            This inspection lists paths, types, and sample missingness only. It does not echo record values into
            saved notebook output. The sample teaches shape and edge cases; it never supplies the graded result.
            """
        ),
        code_cell(
            """
            schema_payload = json.loads(SCHEMA_FILE.read_text(encoding="utf-8"))
            schema_dataset = schema_payload["datasets"][DATA_FILENAME]
            schema_fields = schema_dataset["fields"]
            schema_table = pd.DataFrame([
                {
                    "path": field["path"],
                    "logical_type": field["logical_type"],
                    "nullable": field["nullable"],
                    "unit": field.get("unit", ""),
                }
                for field in schema_fields
            ])
            print(schema_table.to_string(index=False))

            sample_records = []
            with SAMPLE_FILE.open("rt", encoding="utf-8") as handle:
                for line_number, line in enumerate(handle, start=1):
                    if line.strip():
                        sample_records.append(json.loads(line))
                    if line_number >= 12:
                        break
            assert sample_records, "Representative sample is empty."
            sample_frame = pd.json_normalize(sample_records, sep=".")
            sample_profile = pd.DataFrame({
                "column": sample_frame.columns,
                "dtype": [str(sample_frame[column].dtype) for column in sample_frame.columns],
                "missing_in_sample": [int(sample_frame[column].isna().sum()) for column in sample_frame.columns],
            })
            print({"sample_rows_inspected": len(sample_frame), "sample_columns": len(sample_frame.columns)})
            print(sample_profile.to_string(index=False))
            """
        ),
        markdown_cell(
            """
            ## Synthetic worked example (different columns; non-graded)

            This tiny example shows the mechanics of a grouped median without using course fields or values.
            """
        ),
        code_cell(
            """
            demo = pd.DataFrame({
                "service_tier": ["basic", "basic", "pro", "pro"],
                "resolution_minutes": [12, 20, 8, 14],
            })
            demo_result = demo.groupby("service_tier", as_index=False).agg(
                median_resolution_minutes=("resolution_minutes", "median")
            )
            assert len(demo_result) == 2
            print(demo_result.to_string(index=False))
            """
        ),
        markdown_cell(
            """
            ## Stream, assert, aggregate

            The iterator reads one bounded group of JSON objects at a time. Only the columns required for the
            released aggregate are retained between chunks; raw comparison lines are never exported.
            """
        ),
        code_cell(
            """
            REQUIRED_COLUMNS = {
                "comparison_id",
                "focal_record_id",
                "peer_record_id",
                "peer_rank",
                "focal.startup_name",
                "focal.category",
                "focal.audience_type",
                "comparison.mrr_gap_usd",
                "comparison.mrr_ratio_to_peer",
            }

            def iter_jsonl_gz_chunks(path: Path, chunk_size: int):
                chunk = []
                with gzip.open(path, "rt", encoding="utf-8") as handle:
                    for line_number, line in enumerate(handle, start=1):
                        if not line.strip():
                            continue
                        try:
                            chunk.append(json.loads(line))
                        except json.JSONDecodeError as exc:
                            raise ValueError(f"Invalid JSON on non-empty line {line_number}") from exc
                        if len(chunk) >= chunk_size:
                            yield chunk
                            chunk = []
                if chunk:
                    yield chunk

            def numeric_with_audit(series: pd.Series, field: str) -> pd.Series:
                original_present = series.notna() & series.astype("string").str.strip().ne("")
                parsed = pd.to_numeric(series, errors="coerce")
                newly_missing = original_present & parsed.isna()
                assert not newly_missing.any(), f"{field}: non-numeric tokens would be dropped"
                return parsed
            """
        ),
        code_cell(
            """
            assert VALID_ROW_RULE == "non_null_numeric_ratio", \
                "TODO 2: encode the released valid-row rule; null denominator results must not become zero."
            assert AGGREGATION_RULE == "median", \
                "TODO 3: encode the released aggregation rule and verify its unit."

            comparison_ids_seen = set()
            ranks_by_focal = defaultdict(set)
            labels_by_focal = {}
            compact_parts = []
            rows_loaded = 0
            valid_count = 0
            excluded_count = 0

            for records in iter_jsonl_gz_chunks(DATA_FILE, CHUNK_SIZE):
                flat = pd.json_normalize(records, sep=".")
                missing_columns = REQUIRED_COLUMNS - set(flat.columns)
                assert not missing_columns, f"Missing columns: {sorted(missing_columns)}"
                assert flat["comparison_id"].notna().all(), "comparison_id contains missing values"
                chunk_ids = flat["comparison_id"].astype("string")
                assert chunk_ids.is_unique, "comparison_id duplicates within a chunk"
                overlap = comparison_ids_seen.intersection(chunk_ids.tolist())
                assert not overlap, "comparison_id duplicates across chunks"
                comparison_ids_seen.update(chunk_ids.tolist())

                peer_rank = numeric_with_audit(flat["peer_rank"], "peer_rank")
                assert peer_rank.between(1, 24).all(), "peer_rank must stay within 1–24"
                for focal_id, ranks in zip(flat["focal_record_id"], peer_rank, strict=True):
                    ranks_by_focal[str(focal_id)].add(int(ranks))

                label_columns = ["focal.startup_name", "focal.category", "focal.audience_type"]
                for row in flat[["focal_record_id", *label_columns]].itertuples(index=False, name=None):
                    focal_id, *labels = row
                    label_tuple = tuple(None if pd.isna(value) else value for value in labels)
                    prior = labels_by_focal.setdefault(str(focal_id), label_tuple)
                    assert prior == label_tuple, f"Focal labels changed within {focal_id}"

                ratio = numeric_with_audit(flat["comparison.mrr_ratio_to_peer"], "comparison.mrr_ratio_to_peer")
                gap = numeric_with_audit(flat["comparison.mrr_gap_usd"], "comparison.mrr_gap_usd")
                valid_mask = ratio.notna()
                valid_count += int(valid_mask.sum())
                excluded_count += int((~valid_mask).sum())
                rows_loaded += len(flat)

                compact = flat.loc[valid_mask, ["focal_record_id", *label_columns]].copy()
                compact["mrr_ratio_to_peer"] = ratio.loc[valid_mask].to_numpy()
                compact["abs_mrr_gap_usd"] = gap.loc[valid_mask].abs().to_numpy()
                compact_parts.append(compact)

            assert rows_loaded > 0, "No records loaded"
            assert rows_loaded == len(comparison_ids_seen), "Loaded-row and unique-ID counts differ"
            assert valid_count + excluded_count == rows_loaded
            assert all(ranks == set(range(1, 25)) for ranks in ranks_by_focal.values()), \
                "Every focal must have exactly the 24 unique peer ranks declared by the schema"
            """
        ),
        code_cell(
            """
            valid_frame = pd.concat(compact_parts, ignore_index=True)
            group_columns = ["focal_record_id", "focal.startup_name", "focal.category", "focal.audience_type"]
            result_table = (
                valid_frame.groupby(group_columns, dropna=False, as_index=False)
                .agg(
                    valid_peer_count=("mrr_ratio_to_peer", "size"),
                    median_mrr_ratio_to_peer=("mrr_ratio_to_peer", "median"),
                    median_abs_mrr_gap_usd=("abs_mrr_gap_usd", "median"),
                )
            )
            result_table = (
                result_table.loc[result_table["valid_peer_count"].ge(20)]
                .sort_values(["median_mrr_ratio_to_peer", "focal_record_id"], kind="mergesort")
                .head(10)
                .reset_index(drop=True)
            )
            expected_columns = [
                "focal_record_id",
                "focal.startup_name",
                "focal.category",
                "focal.audience_type",
                "valid_peer_count",
                "median_mrr_ratio_to_peer",
                "median_abs_mrr_gap_usd",
            ]
            assert list(result_table.columns) == expected_columns
            assert result_table["focal_record_id"].is_unique
            assert len(result_table) <= 10
            assert result_table["valid_peer_count"].ge(20).all()
            assert result_table["median_mrr_ratio_to_peer"].ge(0).all()
            sorted_check = result_table.sort_values(
                ["median_mrr_ratio_to_peer", "focal_record_id"], kind="mergesort"
            )["focal_record_id"].tolist()
            assert result_table["focal_record_id"].tolist() == sorted_check

            print({
                "rows_loaded": rows_loaded,
                "valid_rows": valid_count,
                "excluded_rows": excluded_count,
                "aggregate_rows": len(result_table),
                "assertions_passed": True,
            })
            print(result_table.to_string(index=False))
            """
        ),
        markdown_cell(
            """
            ## Export compact evidence

            Export only the one-row-per-focal aggregate. Submit this file with your method, counts, one passed
            assertion, and dataset binding. Never submit the source gzip, raw comparison lines, or saved private
            notebook output to a public surface.
            """
        ),
        code_cell(
            """
            EXPORT_FILE = Path("session3_aggregate_output.csv")
            result_table.to_csv(EXPORT_FILE, index=False)
            assert EXPORT_FILE.is_file() and EXPORT_FILE.stat().st_size > 0
            print({"aggregate_export": EXPORT_FILE.name, "rows_exported": len(result_table)})
            """
        ),
        markdown_cell(
            """
            ## Independent verification and hand-in checklist

            - Recompute one focal group using a mechanically different operation or approved tool.
            - Confirm the same inclusion rule, unit, rounding, and stable tie-break.
            - Explain any gap; two prompts to the same model are not independent.
            - Record the dataset version and checksum status, not a private path.
            - Clear all data-derived cell outputs before any approved notebook sharing.
            """
        ),
    ]
    return {
        "cells": cells,
        "metadata": {
            "colab": {"name": "Session 3 chunked JSONL starter", "provenance": []},
            "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
            "language_info": {"name": "python", "version": "3"},
            "mu_course": {
                "artifact_id": "mat_s3_colab_starter_v1",
                "dataset_version_placeholder": True,
                "answer_free": True,
            },
        },
        "nbformat": 4,
        "nbformat_minor": 5,
    }


def make_synthetic_records() -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for focal_index, focal_id in enumerate(("synthetic-focal-a", "synthetic-focal-b"), start=1):
        for peer_rank in range(1, 25):
            peer_mrr = 0 if peer_rank == 24 else 100 + peer_rank
            focal_mrr = 80 + focal_index * 20
            ratio = None if peer_mrr == 0 else focal_mrr / peer_mrr
            records.append(
                {
                    "comparison_id": f"synthetic-{focal_index}-{peer_rank}",
                    "focal_record_id": focal_id,
                    "peer_record_id": f"synthetic-peer-{focal_index}-{peer_rank}",
                    "peer_rank": peer_rank,
                    "focal": {
                        "startup_name": f"Synthetic {focal_index}",
                        "category": "Demo category",
                        "audience_type": "Demo audience",
                    },
                    "comparison": {
                        "mrr_gap_usd": focal_mrr - peer_mrr,
                        "mrr_ratio_to_peer": ratio,
                    },
                }
            )
    return records


def smoke_notebook(notebook: dict[str, Any]) -> dict[str, Any]:
    records = make_synthetic_records()
    with tempfile.TemporaryDirectory(prefix="mu-s3-notebook-smoke-") as temp_dir:
        folder = Path(temp_dir)
        data_path = folder / "trustmrr_s3_peer_comparisons_v1.jsonl.gz"
        with gzip.open(data_path, "wt", encoding="utf-8", newline="\n") as handle:
            for record in records:
                handle.write(json.dumps(record, separators=(",", ":")) + "\n")
        sample_path = folder / "trustmrr_s3_peer_comparisons_sample_v1.jsonl"
        sample_path.write_text(
            "".join(json.dumps(record, separators=(",", ":")) + "\n" for record in records[:4]),
            encoding="utf-8",
        )
        fields = [
            {"path": "comparison_id", "logical_type": "string", "nullable": False},
            {"path": "focal_record_id", "logical_type": "string", "nullable": False},
            {"path": "peer_record_id", "logical_type": "string", "nullable": False},
            {"path": "peer_rank", "logical_type": "integer", "nullable": False},
            {"path": "focal.startup_name", "logical_type": "string", "nullable": False},
            {"path": "focal.category", "logical_type": "string", "nullable": True},
            {"path": "focal.audience_type", "logical_type": "string", "nullable": True},
            {"path": "comparison.mrr_gap_usd", "logical_type": "number", "nullable": False, "unit": "synthetic units"},
            {"path": "comparison.mrr_ratio_to_peer", "logical_type": "number", "nullable": True},
        ]
        schema_path = folder / "trustmrr_s3_schema_v1.json"
        write_json(
            schema_path,
            {
                "datasets": {
                    "trustmrr_s3_peer_comparisons_v1.jsonl.gz": {"fields": fields}
                },
                "metadata": {"dataset_version": "synthetic-smoke-v1"},
            },
        )
        expected_sha = sha256_file(data_path)
        export_path = folder / "synthetic_aggregate_output.csv"
        namespace: dict[str, Any] = {"__name__": "__main__"}
        code_cells = [cell for cell in notebook["cells"] if cell["cell_type"] == "code"]
        for index, cell in enumerate(code_cells):
            source = cell["source"]
            if index == 0:
                source = source.replace('INPUT_MODE = "upload"', 'INPUT_MODE = "local_smoke"')
                source = source.replace('LOCAL_SMOKE_FOLDER = ""', f'LOCAL_SMOKE_FOLDER = {str(folder)!r}')
                source = source.replace('DATASET_VERSION_ID = ""', 'DATASET_VERSION_ID = "synthetic-smoke-v1"')
                source = source.replace('EXPECTED_SHA256 = ""', f'EXPECTED_SHA256 = "{expected_sha}"')
                source = source.replace('VALID_ROW_RULE = ""', 'VALID_ROW_RULE = "non_null_numeric_ratio"')
                source = source.replace('AGGREGATION_RULE = ""', 'AGGREGATION_RULE = "median"')
            source = source.replace(
                'EXPORT_FILE = Path("session3_aggregate_output.csv")',
                f'EXPORT_FILE = Path({str(export_path)!r})',
            )
            exec(compile(source, f"<notebook-cell-{index + 1}>", "exec"), namespace)
        result = namespace["result_table"]
        assert len(result) == 2
        assert export_path.is_file()
        return {
            "status": "pass",
            "synthetic_only": True,
            "private_data_read": False,
            "records_streamed": len(records),
            "chunks_processed": len(records) // 2_000 + 1,
            "aggregate_rows": len(result),
            "export_created": True,
        }


def validate_notebook(notebook_path: Path, manifest_payload: dict[str, Any]) -> dict[str, Any]:
    notebook = json.loads(notebook_path.read_text(encoding="utf-8"))
    assert notebook["nbformat"] == 4 and isinstance(notebook["cells"], list)
    assert all(cell.get("outputs", []) == [] for cell in notebook["cells"] if cell["cell_type"] == "code")
    assert all(cell.get("execution_count") is None for cell in notebook["cells"] if cell["cell_type"] == "code")
    for index, cell in enumerate(notebook["cells"]):
        if cell["cell_type"] == "code":
            compile(cell["source"], f"<validation-cell-{index + 1}>", "exec")
    raw = notebook_path.read_text(encoding="utf-8")
    notebook_source = "\n".join(cell["source"] for cell in notebook["cells"])
    forbidden_fragments = [
        "/Users/",
        "lms/private/",
        "correctOptionId",
        "fact_pack",
        "evaluator_adapter",
        manifest_payload["artifacts"]["peer_comparisons"]["sha256"],
        manifest_payload["artifacts"]["learner_csv"]["sha256"],
    ]
    for fragment in forbidden_fragments:
        assert fragment not in raw, f"Forbidden notebook fragment: {fragment}"
    required_fragments = [
        'INPUT_MODE = "upload"',
        'elif INPUT_MODE == "drive"',
        "iter_jsonl_gz_chunks",
        "numeric_with_audit",
        "pd.json_normalize",
        "result_table.to_csv",
        "TODO 1",
        "TODO 2",
        "TODO 3",
    ]
    for fragment in required_fragments:
        assert fragment in notebook_source, f"Notebook is missing required fragment: {fragment}"
    return {
        "json_parse": "pass",
        "nbformat": "4.5",
        "code_cells_compile": "pass",
        "saved_outputs_empty": True,
        "private_path_scan": "pass",
        "private_checksum_scan": "pass",
        "required_workflow_scan": "pass",
        "synthetic_smoke": smoke_notebook(notebook),
    }


def validate_quizzes(
    payloads: list[dict[str, Any]],
    instructor_key: dict[str, Any],
    json_paths: list[Path],
    csv_paths: list[Path],
) -> dict[str, Any]:
    forbidden_key_names = {
        "correct_option_id",
        "correct_index",
        "strong_rationale_anchors",
        "distractor_diagnoses",
        "feedback",
        "rationale_key",
    }
    def walk_keys(value: Any) -> set[str]:
        if isinstance(value, dict):
            return set(value) | set().union(*(walk_keys(child) for child in value.values()))
        if isinstance(value, list):
            return set().union(*(walk_keys(child) for child in value)) if value else set()
        return set()

    all_item_versions: list[str] = []
    all_option_ids: list[str] = []
    roundtrip_checks: list[dict[str, Any]] = []
    for payload, json_path, csv_path in zip(payloads, json_paths, csv_paths, strict=True):
        loaded_json = json.loads(json_path.read_text(encoding="utf-8"))
        assert loaded_json == payload
        leaked = forbidden_key_names.intersection(walk_keys(loaded_json))
        assert not leaked, f"Learner JSON key leak: {sorted(leaked)}"
        with csv_path.open("r", encoding="utf-8", newline="") as handle:
            loaded_rows = list(csv.DictReader(handle))
        assert not forbidden_key_names.intersection(loaded_rows[0])
        expected_rows = payload_to_rows(payload)
        assert len(loaded_rows) == len(expected_rows)
        csv_pairs = {(row["item_version_id"], row["option_id"]) for row in loaded_rows}
        json_pairs = {
            (item["item_version_id"], option["option_id"])
            for item in payload["items"]
            for option in item["options"]
        }
        assert csv_pairs == json_pairs
        all_item_versions.extend(item["item_version_id"] for item in payload["items"])
        all_option_ids.extend(option["option_id"] for item in payload["items"] for option in item["options"])
        assert payload["assessment"]["manifest_registration"]["registered"] is True
        assert "last participating section" in payload["assessment"]["answer_release_rule"]
        roundtrip_checks.append(
            {
                "assessment_id": payload["assessment"]["assessment_id"],
                "items": len(payload["items"]),
                "options": len(json_pairs),
                "json_csv_id_roundtrip": "pass",
                "learner_key_field_scan": "pass",
            }
        )
    assert len(all_item_versions) == len(set(all_item_versions))
    assert len(all_option_ids) == len(set(all_option_ids))

    key_items = [item for assessment in instructor_key["assessments"] for item in assessment["items"]]
    assert len(key_items) == len(all_item_versions)
    assert {item["item_version_id"] for item in key_items} == set(all_item_versions)
    s4_payload = next(payload for payload in payloads if payload["assessment"]["session_no"] == 4)
    s4_key = next(
        assessment for assessment in instructor_key["assessments"] if assessment["assessment_version_id"] == "S4-SQ-v1"
    )
    s4_key_map = {item["item_version_id"]: item["correct_option_id"] for item in s4_key["items"]}
    position_letters = []
    for item in s4_payload["items"]:
        ids = [option["option_id"] for option in item["options"]]
        position_letters.append("ABCD"[ids.index(s4_key_map[item["item_version_id"]])])
    assert position_letters == list("BDACADB")
    s3_payload = next(payload for payload in payloads if payload["assessment"]["session_no"] == 3)
    assert len({item["accessible_artifact"]["artifact_id"] for item in s3_payload["items"]}) == 6
    return {
        "status": "pass",
        "assessment_count": len(payloads),
        "item_count": len(all_item_versions),
        "option_count": len(all_option_ids),
        "unique_item_versions": True,
        "unique_option_ids": True,
        "instructor_key_separate": True,
        "s3_accessible_artifact_count": 6,
        "s4_canonical_correct_positions": position_letters,
        "s4_non_patterned_position_check": "pass",
        "delivery_window_release_checks": "pass",
        "roundtrip": roundtrip_checks,
    }


def parse_utc(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def validate_s5_sample_evidence() -> dict[str, Any]:
    summary_path = SESSION_05 / "samples/redacted-sample-output.json"
    log_path = SESSION_05 / "samples/redacted-run-log.jsonl"
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    rows = [json.loads(line) for line in log_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    assert rows, "Session 5 sample run log is empty"
    suite_id = summary["suite_id"]
    assert all(row["suite_id"] == suite_id for row in rows), "Session 5 sample suite IDs drift"
    expected_ids = {
        "S5-FIX-NORMAL-01",
        "S5-FIX-DUPLICATE-01",
        "S5-FIX-MALFORMED-01",
        "S5-FIX-TIMEOUT-01",
        "S5-FIX-APPROVAL-01",
    }
    by_id = {row["fixture_id"]: row for row in rows}
    assert set(by_id) == expected_ids, "Session 5 sample fixture set drift"
    state_by_id = {item["fixture_id"]: item["state"] for item in summary["states"]}
    assert set(state_by_id) == expected_ids, "Session 5 summary fixture set drift"
    assert all(by_id[item_id]["final_state"] == state for item_id, state in state_by_id.items())
    assert all(row["external_action_count"] == 0 for row in rows)
    assert summary["result"] == {
        "fixtures_run": 5,
        "normal_drafts_or_queue_items": 1,
        "duplicates_suppressed": 1,
        "validation_quarantines": 1,
        "manual_recovery_after_three_timeouts": 1,
        "pending_approval": 1,
        "external_actions_executed": 0,
    }
    latest_end = max(parse_utc(row["ended_at"]) for row in rows)
    generated_at = parse_utc(summary["generated_at"])
    replay_completed_at = parse_utc(summary["replay_completed_at"])
    assert generated_at >= latest_end, "Session 5 summary predates its run evidence"
    assert replay_completed_at == latest_end, "Session 5 replay completion does not match latest trace"
    assert summary["evidence_mode"] == "controlled classroom replay"
    return {
        "status": "pass",
        "suite_id": suite_id,
        "fixture_count": len(rows),
        "fixture_set_match": "pass",
        "state_match": "pass",
        "zero_external_actions": "pass",
        "monotonic_summary_time": "pass",
        "latest_trace_end": latest_end.isoformat(),
        "summary_generated_at": generated_at.isoformat(),
        "source_files": {
            summary_path.relative_to(ROOT).as_posix(): sha256_file(summary_path),
            log_path.relative_to(ROOT).as_posix(): sha256_file(log_path),
        },
    }


def build_s3_offline_pack() -> dict[str, Any]:
    SESSION_03_OFFLINE_OUTPUT.mkdir(parents=True, exist_ok=True)
    source_names = [
        "session-03-local-runner.py",
        "offline-answer-sheet.md",
        "offline-lab.html",
        "README.md",
    ]
    copied: list[Path] = []
    for name in source_names:
        source = SESSION_03_OFFLINE_SOURCE / name
        target = SESSION_03_OFFLINE_OUTPUT / name
        shutil.copy2(source, target)
        copied.append(target)
    weasyprint = shutil.which("weasyprint")
    assert weasyprint, "weasyprint is required to build the printable offline lab PDF"
    pdf_path = SESSION_03_OFFLINE_OUTPUT / "offline-lab.pdf"
    subprocess.run(
        [weasyprint, str(SESSION_03_OFFLINE_OUTPUT / "offline-lab.html"), str(pdf_path)],
        check=True,
        capture_output=True,
        text=True,
    )
    copied.append(pdf_path)
    manifest = {
        "package_version": "session-03-offline-v1",
        "audience": "roster-gated learners and instructors",
        "contains_private_rows_or_answer_values": False,
        "private_section_additions": [
            "trustmrr_s3_peer_comparisons_v1.jsonl.gz",
            "session-03-scale-output.csv",
            "session-03-scale-trace.json",
        ],
        "files": [
            {
                "path": path.relative_to(ROOT).as_posix(),
                "sha256": sha256_file(path),
                "bytes": path.stat().st_size,
            }
            for path in copied
        ],
        "source_hashes": {
            (SESSION_03_OFFLINE_SOURCE / name).relative_to(ROOT).as_posix(): sha256_file(
                SESSION_03_OFFLINE_SOURCE / name
            )
            for name in source_names
        },
        "validation_status": "pass",
    }
    manifest_path = SESSION_03_OFFLINE_OUTPUT / "offline-pack-manifest.v1.json"
    write_json(manifest_path, manifest)
    return {**manifest, "manifest": manifest_path.relative_to(ROOT).as_posix()}


def build() -> None:
    SESSION_03_OUTPUT.mkdir(parents=True, exist_ok=True)
    SESSION_05_OUTPUT.mkdir(parents=True, exist_ok=True)
    QUIZ_OUTPUT.mkdir(parents=True, exist_ok=True)
    INSTRUCTOR_QUIZ_OUTPUT.mkdir(parents=True, exist_ok=True)
    stale_key = QUIZ_OUTPUT / "INSTRUCTOR_ONLY_quiz-keys.v1.json"
    if stale_key.exists():
        stale_key.unlink()
    safe_schema_payload = json.loads(SAFE_SCHEMA.read_text(encoding="utf-8"))
    safe_manifest_payload = json.loads(SAFE_MANIFEST.read_text(encoding="utf-8"))

    notebook = make_notebook()
    notebook_path = SESSION_03_OUTPUT / "session-03-colab-starter.ipynb"
    write_json(notebook_path, notebook)
    notebook_validation = validate_notebook(notebook_path, safe_manifest_payload)
    notebook_validation.update(
        {
            "artifact": notebook_path.relative_to(ROOT).as_posix(),
            "artifact_sha256": sha256_file(notebook_path),
            "source_schema": source_ref(
                SAFE_SCHEMA, "private-safe.trustmrr-s3-schema", safe_schema_payload["metadata"]["dataset_version"]
            ),
            "source_manifest": {
                "source_id": "private-safe.trustmrr-s3-manifest",
                "source_version_id": safe_manifest_payload["manifest_version"],
                "source_path": SAFE_MANIFEST.relative_to(ROOT).as_posix(),
                "source_content_sha256": sha256_file(SAFE_MANIFEST),
            },
        }
    )
    write_json(SESSION_03_OUTPUT / "session-03-notebook-validation.json", notebook_validation)

    payloads, instructor_key, artifacts = make_assessment_payloads()
    stems = [
        "s3-visualization-scenarios.v1",
        "s4-product-build-judgment.v1",
        "s5-workflow-control.v1",
    ]
    json_paths: list[Path] = []
    csv_paths: list[Path] = []
    for stem, payload in zip(stems, payloads, strict=True):
        json_path = QUIZ_OUTPUT / f"{stem}.json"
        csv_path = QUIZ_OUTPUT / f"{stem}.csv"
        write_json(json_path, payload)
        write_csv(csv_path, payload_to_rows(payload), CSV_FIELDS)
        json_paths.append(json_path)
        csv_paths.append(csv_path)

    artifact_json = QUIZ_OUTPUT / "s3-visualization-accessible-artifacts.v1.json"
    artifact_csv = QUIZ_OUTPUT / "s3-visualization-accessible-artifacts.v1.csv"
    write_json(
        artifact_json,
        {
            "artifact_set_version": "S3-VIZ-A11Y-v1",
            "audience": "learner",
            "key_boundary": "contains no correct-option IDs, scores, rationales, or private data",
            "artifacts": artifacts,
        },
    )
    artifact_rows = []
    for artifact in artifacts:
        for row_order, row in enumerate(artifact["table"]["rows"], start=1):
            artifact_rows.append(
                {
                    "artifact_set_version": artifact["artifact_set_version"],
                    "artifact_id": artifact["artifact_id"],
                    "title": artifact["title"],
                    "text_alternative": artifact["text_alternative"],
                    "row_order": row_order,
                    "headers_json": json.dumps(artifact["table"]["headers"], ensure_ascii=False, separators=(",", ":")),
                    "row_json": json.dumps(row, ensure_ascii=False, separators=(",", ":")),
                }
            )
    write_csv(
        artifact_csv,
        artifact_rows,
        ["artifact_set_version", "artifact_id", "title", "text_alternative", "row_order", "headers_json", "row_json"],
    )

    key_path = INSTRUCTOR_QUIZ_OUTPUT / "INSTRUCTOR_ONLY_quiz-keys.v1.json"
    write_json(key_path, instructor_key)
    quiz_validation = validate_quizzes(payloads, instructor_key, json_paths, csv_paths)
    quiz_validation.update(
        {
            "learner_files": [path.relative_to(ROOT).as_posix() for pair in zip(json_paths, csv_paths) for path in pair],
            "accessible_artifact_files": [artifact_json.relative_to(ROOT).as_posix(), artifact_csv.relative_to(ROOT).as_posix()],
            "instructor_key_file": key_path.relative_to(ROOT).as_posix(),
        }
    )
    instructor_validation_path = INSTRUCTOR_QUIZ_OUTPUT / "validation-report.v1.json"
    write_json(instructor_validation_path, quiz_validation)

    learner_validation = {
        key: value
        for key, value in quiz_validation.items()
        if key not in {"s4_canonical_correct_positions", "instructor_key_file"}
    }
    learner_validation["learner_output_answer_key_scan"] = "pass"
    validation_path = QUIZ_OUTPUT / "validation-report.v1.json"
    write_json(validation_path, learner_validation)

    package_files = [*json_paths, *csv_paths, artifact_json, artifact_csv, validation_path]
    package_manifest = {
        "package_version": "learner-collateral-2026-07-30-v1",
        "generated_by": "lms/scripts/collateral/build_learner_collateral.py",
        "files": [
            {
                "path": path.relative_to(ROOT).as_posix(),
                "sha256": sha256_file(path),
                "bytes": path.stat().st_size,
                "audience": "learner_or_validation",
            }
            for path in package_files
        ],
        "validation_status": "pass",
    }
    write_json(QUIZ_OUTPUT / "import-package-manifest.v1.json", package_manifest)

    instructor_package_files = [key_path, instructor_validation_path]
    instructor_package_manifest = {
        "package_version": "instructor-quiz-collateral-2026-07-30-v1",
        "generated_by": "lms/scripts/collateral/build_learner_collateral.py",
        "files": [
            {
                "path": path.relative_to(ROOT).as_posix(),
                "sha256": sha256_file(path),
                "bytes": path.stat().st_size,
                "audience": "instructor_only",
            }
            for path in instructor_package_files
        ],
        "validation_status": "pass",
    }
    write_json(
        INSTRUCTOR_QUIZ_OUTPUT / "import-package-manifest.v1.json",
        instructor_package_manifest,
    )

    s5_sample_validation = validate_s5_sample_evidence()
    write_json(
        SESSION_05_OUTPUT / "session-05-sample-evidence-validation.json",
        s5_sample_validation,
    )
    s3_offline_pack = build_s3_offline_pack()

    forbidden_learner_keys = {
        "correct_option_id",
        "correct_index",
        "strong_rationale_anchors",
        "distractor_diagnoses",
        "rationale_key",
    }
    for path in QUIZ_OUTPUT.iterdir():
        assert "instructor" not in path.name.lower() and "key" not in path.name.lower(), (
            f"Instructor/key artifact leaked into learner output: {path.name}"
        )
        if path.suffix != ".json":
            continue
        payload = json.loads(path.read_text(encoding="utf-8"))

        def learner_keys(value: Any) -> set[str]:
            if isinstance(value, dict):
                return set(value) | set().union(*(learner_keys(child) for child in value.values()))
            if isinstance(value, list):
                return set().union(*(learner_keys(child) for child in value)) if value else set()
            return set()

        leaked = forbidden_learner_keys.intersection(learner_keys(payload))
        assert not leaked, f"Answer-key fields leaked into learner output {path.name}: {sorted(leaked)}"

    print(
        json.dumps(
            {
                "notebook": notebook_path.relative_to(ROOT).as_posix(),
                "notebook_validation": notebook_validation,
                "quiz_validation": quiz_validation,
                "session_05_sample_validation": s5_sample_validation,
                "session_03_offline_pack": s3_offline_pack,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    build()
