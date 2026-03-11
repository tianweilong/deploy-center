#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

output=$( \
  TARGET_SERVICES='vibe-kanban-remote,vibe-kanban-relay' \
  SOURCE_SHA='abc1234' \
  VIBE_KANBAN_REMOTE_VITE_RELAY_API_BASE_URL='https://relay.example.com' \
  ruby scripts/prepare-release-matrix.rb config/services.vibe-kanban.json
)

ruby -rjson -e '
  data = JSON.parse(STDIN.read)
  include_items = data.fetch("include")
  raise "expected two services" unless include_items.size == 2

  remote = include_items.find { |item| item.fetch("service") == "vibe-kanban-remote" }
  relay = include_items.find { |item| item.fetch("service") == "vibe-kanban-relay" }

  raise "missing remote service" unless remote
  raise "missing relay service" unless relay

  raise "wrong remote repo" unless remote.fetch("image_repository") == "ghcr.io/tianweilong/vibe-kanban-remote"
  raise "wrong relay repo" unless relay.fetch("image_repository") == "ghcr.io/tianweilong/vibe-kanban-relay"
  raise "wrong platforms" unless remote.fetch("platforms") == "linux/amd64,linux/arm64"
  raise "missing build arg" unless remote.fetch("build_args") == ["VITE_RELAY_API_BASE_URL=https://relay.example.com"]
  raise "relay should not need build args" unless relay.fetch("build_args") == []
  raise "wrong tag" unless remote.fetch("tag") == "abc1234"
' <<< "$output"

if TARGET_SERVICES='vibe-kanban-remote' SOURCE_SHA='abc1234' ruby scripts/prepare-release-matrix.rb config/services.vibe-kanban.json >/tmp/prepare-matrix.out 2>/tmp/prepare-matrix.err; then
  echo 'expected missing build arg failure' >&2
  exit 1
fi

grep -q 'Missing required build arg env' /tmp/prepare-matrix.err
