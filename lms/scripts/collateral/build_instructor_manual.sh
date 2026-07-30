#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"
python_bin="/Users/pushpak/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"
soffice_bin="/Users/pushpak/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/soffice"
source_md="$repo_root/lms/output/manuals/sessions-03-05-instructor-manual.md"
output_docx="$repo_root/lms/output/manuals/sessions-03-05-instructor-manual.docx"
output_dir="$repo_root/lms/output/manuals"
profile_dir="$(mktemp -d /tmp/mu-s35-manual.XXXXXX)"

cleanup() {
  rm -rf "$profile_dir"
}
trap cleanup EXIT

"$python_bin" "$repo_root/lms/scripts/collateral/build_instructor_manual.py" "$source_md" "$output_docx"
"$python_bin" "$repo_root/lms/scripts/collateral/audit_instructor_manual.py" "$output_docx"
"$soffice_bin" \
  "-env:UserInstallation=file://$profile_dir" \
  --headless \
  --convert-to pdf \
  --outdir "$output_dir" \
  "$output_docx"
