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
  raise "应返回两个服务" unless include_items.size == 2

  remote = include_items.find { |item| item.fetch("service") == "vibe-kanban-remote" }
  relay = include_items.find { |item| item.fetch("service") == "vibe-kanban-relay" }

  raise "缺少 remote 服务" unless remote
  raise "缺少 relay 服务" unless relay

  raise "remote 镜像仓库错误" unless remote.fetch("image_repository") == "ghcr.io/tianweilong/vibe-kanban-remote"
  raise "relay 镜像仓库错误" unless relay.fetch("image_repository") == "ghcr.io/tianweilong/vibe-kanban-relay"
  raise "平台配置错误" unless remote.fetch("platforms") == "linux/amd64,linux/arm64"
  raise "缺少构建参数" unless remote.fetch("build_args") == ["VITE_RELAY_API_BASE_URL=https://relay.example.com"]
  raise "relay 不应需要构建参数" unless relay.fetch("build_args") == []
  raise "镜像标签错误" unless remote.fetch("tag") == "abc1234"
' <<< "$output"

if TARGET_SERVICES='vibe-kanban-remote' SOURCE_SHA='abc1234' ruby scripts/prepare-release-matrix.rb config/services.vibe-kanban.json >/tmp/prepare-matrix.out 2>/tmp/prepare-matrix.err; then
  echo '预期缺少构建参数时失败' >&2
  exit 1
fi

grep -q '缺少必填构建参数环境变量' /tmp/prepare-matrix.err
