#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

mkdir -p "$tmpdir/environments/test/vibe-kanban-remote"
cat > "$tmpdir/environments/test/vibe-kanban-remote/deployment.yaml" <<'YAML'
service: vibe-kanban-remote
project: vibe-kanban
repository: tianweilong/vibe-kanban
environment: test
deploy_mode: compose
source:
  ref: refs/heads/main
  sha: oldsha
image:
  repository: old.repo/example
  tag: oldtag
YAML

cp scripts/update-deployment-state.sh "$tmpdir/update-deployment-state.sh"
chmod +x "$tmpdir/update-deployment-state.sh"

(
  cd "$tmpdir"
  DEPLOY_ENV='test' \
  SERVICE_NAME='vibe-kanban-remote' \
  SOURCE_REF='refs/tags/v1' \
  SOURCE_SHA='newsha123' \
  IMAGE_REPOSITORY='ghcr.io/tianweilong/vibe-kanban-remote' \
  IMAGE_TAG='newsha123' \
  ./update-deployment-state.sh
)

ruby -ryaml -e '
  data = YAML.load_file(ARGV.fetch(0))
  raise "wrong ref" unless data.dig("source", "ref") == "refs/tags/v1"
  raise "wrong sha" unless data.dig("source", "sha") == "newsha123"
  raise "wrong repo" unless data.dig("image", "repository") == "ghcr.io/tianweilong/vibe-kanban-remote"
  raise "wrong tag" unless data.dig("image", "tag") == "newsha123"
' "$tmpdir/environments/test/vibe-kanban-remote/deployment.yaml"
