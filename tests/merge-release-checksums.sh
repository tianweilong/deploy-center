#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

tmp_root="$(mktemp -d)"
trap 'rm -rf "$tmp_root"' EXIT

release_root="$tmp_root/release-artifacts"
mkdir -p "$release_root/npm-package-linux-x64" "$release_root/npm-package-win32-x64" "$release_root/npm-package-darwin-arm64"

printf 'sha-linux  myte-v0.1.9-linux-x64.tar.gz\n' > "$release_root/npm-package-linux-x64/myte-v0.1.9-checksums.txt"
printf 'sha-win  myte-v0.1.9-win32-x64.zip\n' > "$release_root/npm-package-win32-x64/myte-v0.1.9-checksums.txt"
printf 'sha-darwin  myte-v0.1.9-darwin-arm64.tar.gz\n' > "$release_root/npm-package-darwin-arm64/myte-v0.1.9-checksums.txt"

node ./scripts/merge-release-checksums.mjs "$release_root"

merged_file="$release_root/myte-v0.1.9-checksums.txt"

if [ ! -f "$merged_file" ]; then
  echo "缺少合并后的校验文件：$merged_file" >&2
  exit 1
fi

grep -q 'myte-v0.1.9-linux-x64.tar.gz' "$merged_file"
grep -q 'myte-v0.1.9-win32-x64.zip' "$merged_file"
grep -q 'myte-v0.1.9-darwin-arm64.tar.gz' "$merged_file"

if [ "$(wc -l < "$merged_file" | tr -d ' ')" -ne 3 ]; then
  echo '合并后的校验文件应包含 3 条平台记录。' >&2
  exit 1
fi
