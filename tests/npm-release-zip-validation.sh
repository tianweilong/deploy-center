#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if rg -q '\[System\.IO\.Compression\.ZipArchiveMode\]' scripts/npm-release-common.sh; then
  echo 'Windows zip 打包脚本不应直接引用 ZipArchiveMode 类型，避免在部分 PowerShell 环境解析失败。' >&2
  exit 1
fi

tmp_root="$(mktemp -d)"
trap 'rm -rf "$tmp_root"' EXIT

source_dir="$tmp_root/source"
archive_path="$tmp_root/manifest-only.zip"
stderr_file="$tmp_root/stderr.log"
valid_source_dir="$tmp_root/valid-source"
valid_archive_path="$tmp_root/valid.zip"

mkdir -p "$source_dir"
printf '%s\n' '{"schemaVersion":1,"platform":"windows-x64","targetOs":"win32","targetArch":"x64","files":["myte.exe"]}' > "$source_dir/manifest.json"

tar -a -cf "$archive_path" -C "$source_dir" . >/dev/null 2>&1

if bash -c "source scripts/npm-release-common.sh; validate_zip_archive_contents '$archive_path'" 2>"$stderr_file"; then
  echo '只包含 manifest.json 的 zip 应当校验失败。' >&2
  exit 1
fi

grep -q 'zip 产物仅包含 manifest.json' "$stderr_file"

mkdir -p "$valid_source_dir"
printf '%s\n' '{"schemaVersion":1,"platform":"windows-x64","targetOs":"win32","targetArch":"x64","files":["myte.exe"]}' > "$valid_source_dir/manifest.json"
printf '%s\n' 'fake binary' > "$valid_source_dir/myte.exe"
tar -a -cf "$valid_archive_path" -C "$valid_source_dir" . >/dev/null 2>&1

bash -c "source scripts/npm-release-common.sh; validate_zip_archive_contents '$valid_archive_path'"
