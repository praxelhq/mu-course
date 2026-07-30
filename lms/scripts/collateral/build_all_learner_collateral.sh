#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
python_bin="/Users/pushpak/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"
node_bin="/Users/pushpak/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
node_modules_source="/Users/pushpak/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules"
node_modules_link="$script_dir/node_modules"
created_link=0

cleanup() {
  if [[ "$created_link" == "1" && -L "$node_modules_link" ]]; then
    unlink "$node_modules_link"
  fi
}
trap cleanup EXIT

if [[ -e "$node_modules_link" || -L "$node_modules_link" ]]; then
  if [[ ! -L "$node_modules_link" || "$(readlink "$node_modules_link")" != "$node_modules_source" ]]; then
    echo "Refusing to replace existing $node_modules_link" >&2
    exit 1
  fi
else
  ln -s "$node_modules_source" "$node_modules_link"
  created_link=1
fi

PYTHONDONTWRITEBYTECODE=1 "$python_bin" "$script_dir/build_learner_collateral.py"
"$node_bin" "$script_dir/build_s3_workbook.mjs"
