#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

output=$( \
  TARGET_SERVICES='vibe-kanban-remote,vibe-kanban-relay' \
  SOURCE_TAG='v1.2.3' \
  DEFAULT_IMAGE_PLATFORMS='linux/amd64,linux/arm64' \
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
  raise "remote 平台配置错误" unless remote.fetch("platforms") == "linux/amd64,linux/arm64"
  raise "relay 平台配置错误" unless relay.fetch("platforms") == "linux/amd64,linux/arm64"
  raise "remote 不应需要构建参数" unless remote.fetch("build_args") == []
  raise "relay 不应需要构建参数" unless relay.fetch("build_args") == []
  raise "镜像标签错误" unless remote.fetch("tag") == "v1.2.3"
' <<< "$output"

new_api_output=$( \
  TARGET_SERVICES='new-api' \
  SOURCE_TAG='v2.3.4' \
  DEFAULT_IMAGE_PLATFORMS='linux/amd64,linux/arm64' \
  ruby scripts/prepare-release-matrix.rb config/services.new-api.json
)

ruby -rjson -e '
  data = JSON.parse(STDIN.read)
  include_items = data.fetch("include")
  raise "new-api 应只返回一个服务" unless include_items.size == 1

  new_api = include_items.fetch(0)

  raise "new-api 服务名错误" unless new_api.fetch("service") == "new-api"
  raise "new-api 镜像仓库错误" unless new_api.fetch("image_repository") == "ghcr.io/tianweilong/new-api"
  raise "new-api Dockerfile 错误" unless new_api.fetch("dockerfile") == "Dockerfile"
  raise "new-api 平台配置错误" unless new_api.fetch("platforms") == "linux/amd64,linux/arm64"
  raise "new-api 不应需要构建参数" unless new_api.fetch("build_args") == []
  raise "new-api 镜像标签错误" unless new_api.fetch("tag") == "v2.3.4"
' <<< "$new_api_output"

override_config=$(mktemp)
trap 'rm -f "$override_config"' EXIT

cat > "$override_config" <<'EOF'
{
  "project": "vibe-kanban",
  "services": [
    {
      "service": "vibe-kanban-relay",
      "image_repository": "ghcr.io/tianweilong/vibe-kanban-relay",
      "context": "source",
      "dockerfile": "crates/relay-tunnel/Dockerfile",
      "platforms": "linux/arm64",
      "build_args": []
    }
  ]
}
EOF

override_output=$( \
  TARGET_SERVICES='vibe-kanban-relay' \
  SOURCE_TAG='v1.2.3' \
  DEFAULT_IMAGE_PLATFORMS='linux/amd64,linux/arm64' \
  ruby scripts/prepare-release-matrix.rb "$override_config"
)

ruby -rjson -e '
  data = JSON.parse(STDIN.read)
  item = data.fetch("include").fetch(0)
  raise "服务显式平台覆盖失效" unless item.fetch("platforms") == "linux/arm64"
' <<< "$override_output"

docker_images_output=$( \
  TARGET_SERVICES='redis6,redis7' \
  SOURCE_TAG='latest' \
  DEFAULT_IMAGE_PLATFORMS='linux/amd64,linux/arm64' \
  ruby scripts/prepare-release-matrix.rb config/services.docker-images.json
)

ruby -rjson -e '
  data = JSON.parse(STDIN.read)
  include_items = data.fetch("include")
  raise "docker-images 应返回两个服务" unless include_items.size == 2

  redis6 = include_items.find { |item| item.fetch("service") == "redis6" }
  redis7 = include_items.find { |item| item.fetch("service") == "redis7" }

  raise "缺少 redis6 服务" unless redis6
  raise "缺少 redis7 服务" unless redis7

  raise "redis6 镜像仓库错误" unless redis6.fetch("image_repository") == "ghcr.io/tianweilong/redis6"
  raise "redis7 镜像仓库错误" unless redis7.fetch("image_repository") == "ghcr.io/tianweilong/redis7"
  raise "redis6 构建上下文错误" unless redis6.fetch("context") == "source/images/redis6"
  raise "redis7 构建上下文错误" unless redis7.fetch("context") == "source/images/redis7"
  raise "redis6 Dockerfile 错误" unless redis6.fetch("dockerfile") == "Dockerfile"
  raise "redis7 Dockerfile 错误" unless redis7.fetch("dockerfile") == "Dockerfile"
  raise "redis6 平台配置错误" unless redis6.fetch("platforms") == "linux/amd64,linux/arm64"
  raise "redis7 平台配置错误" unless redis7.fetch("platforms") == "linux/amd64,linux/arm64"
  raise "redis6 不应需要构建参数" unless redis6.fetch("build_args") == []
  raise "redis7 不应需要构建参数" unless redis7.fetch("build_args") == []
  raise "redis6 镜像标签错误" unless redis6.fetch("tag") == "latest"
  raise "redis7 镜像标签错误" unless redis7.fetch("tag") == "latest"
' <<< "$docker_images_output"
