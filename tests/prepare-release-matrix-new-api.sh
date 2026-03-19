#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

output=$(
  TARGET_SERVICES='new-api' \
  SOURCE_TAG='v1.2.3' \
  DEFAULT_IMAGE_PLATFORMS='linux/amd64,linux/arm64' \
  node scripts/prepare-release-matrix.mjs config/services.new-api.json
)

ruby -rjson -e '
  data = JSON.parse(STDIN.read)
  include_items = data.fetch("include")
  raise "new-api 应只返回一个服务" unless include_items.size == 1

  item = include_items.fetch(0)
  raise "服务名错误" unless item.fetch("service") == "new-api"
  raise "镜像仓库错误" unless item.fetch("image_repository") == "ghcr.io/tianweilong/new-api"
  raise "上下文错误" unless item.fetch("context") == "source"
  raise "Dockerfile 错误" unless item.fetch("dockerfile") == "Dockerfile"
  raise "平台配置错误" unless item.fetch("platforms") == "linux/amd64,linux/arm64"
  raise "构建参数错误" unless item.fetch("build_args") == []
  raise "标签错误" unless item.fetch("tag") == "v1.2.3"
' <<< "${output}"
