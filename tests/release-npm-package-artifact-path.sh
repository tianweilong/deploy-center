#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

repo_root="$(pwd)"
tmp_root="$(mktemp -d)"
trap 'rm -rf "$tmp_root"' EXIT

workspace_root="$tmp_root/workspace"
source_root="$workspace_root/source"
artifact_root="$workspace_root/npm-artifacts/linux-x64"
fixture_source="$repo_root/tests/fixtures/release-npm-package-source"

mkdir -p "$workspace_root"
cp -R "$fixture_source" "$source_root"
rm -rf "$source_root/npm-artifacts"

(
  cd "$workspace_root"
  BUILD_ONLY=true \
  TARGET_OS=linux \
  TARGET_ARCH=x64 \
  ARCHIVE_EXT=tar.gz \
  BUILD_ARTIFACT_DIR=../npm-artifacts/linux-x64 \
  SOURCE_TAG=v0.1.4 \
  NPM_PACKAGE_NAME=@vino.tian/myte \
  NPM_PACKAGE_DIR=npm/myte \
  NPM_VERSION_STRATEGY=source_tag \
  bash "$repo_root/scripts/release-npm-package.sh" source
)

if [ ! -d "$artifact_root" ]; then
  echo "期望在工作目录生成平台产物目录：$artifact_root" >&2
  exit 1
fi

if [ -d "$source_root/npm-artifacts" ]; then
  echo "平台产物目录不应落在 source 子目录内。" >&2
  exit 1
fi

if [ -d "$artifact_root/stage" ]; then
  echo "平台产物目录不应残留 stage 临时目录。" >&2
  exit 1
fi

find "$artifact_root" -maxdepth 1 -type f | grep -q 'myte-v0.1.4-linux-x64.tar.gz'
find "$artifact_root" -maxdepth 1 -type f | grep -q 'myte-v0.1.4-checksums.txt'
