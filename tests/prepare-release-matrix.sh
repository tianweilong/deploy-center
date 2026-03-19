#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

output=$( \
  TARGET_SERVICES='vibe-kanban-remote,vibe-kanban-relay' \
  SOURCE_TAG='v1.2.3' \
  DEFAULT_IMAGE_PLATFORMS='linux/amd64,linux/arm64' \
  node scripts/prepare-release-matrix.mjs config/services.vibe-kanban.json
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
  node scripts/prepare-release-matrix.mjs config/services.new-api.json
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
docker_images_config=$(mktemp)
trap 'rm -f "$override_config" "$docker_images_config"' EXIT

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
  node scripts/prepare-release-matrix.mjs "$override_config"
)

ruby -rjson -e '
  data = JSON.parse(STDIN.read)
  item = data.fetch("include").fetch(0)
  raise "服务显式平台覆盖失效" unless item.fetch("platforms") == "linux/arm64"
' <<< "$override_output"

cat > "$docker_images_config" <<'EOF'
{
  "project": "docker-images",
  "services": [
    {
      "service": "image-a",
      "image_repository": "ghcr.io/tianweilong/image-a",
      "context": "source/images/image-a",
      "dockerfile": "Dockerfile",
      "build_args": []
    },
    {
      "service": "image-b",
      "image_repository": "ghcr.io/tianweilong/image-b",
      "context": "source/images/image-b",
      "dockerfile": "Dockerfile",
      "build_args": []
    }
  ]
}
EOF

docker_images_output=$( \
  TARGET_SERVICES='image-a,image-b' \
  SOURCE_TAG='latest' \
  DEFAULT_IMAGE_PLATFORMS='linux/amd64,linux/arm64' \
  node scripts/prepare-release-matrix.mjs "$docker_images_config"
)

ruby -rjson -e '
  data = JSON.parse(STDIN.read)
  include_items = data.fetch("include")
  raise "docker-images 应返回两个服务" unless include_items.size == 2

  image_a = include_items.find { |item| item.fetch("service") == "image-a" }
  image_b = include_items.find { |item| item.fetch("service") == "image-b" }

  raise "缺少 image-a 服务" unless image_a
  raise "缺少 image-b 服务" unless image_b

  raise "image-a 镜像仓库错误" unless image_a.fetch("image_repository") == "ghcr.io/tianweilong/image-a"
  raise "image-b 镜像仓库错误" unless image_b.fetch("image_repository") == "ghcr.io/tianweilong/image-b"
  raise "image-a 构建上下文错误" unless image_a.fetch("context") == "source/images/image-a"
  raise "image-b 构建上下文错误" unless image_b.fetch("context") == "source/images/image-b"
  raise "image-a Dockerfile 错误" unless image_a.fetch("dockerfile") == "Dockerfile"
  raise "image-b Dockerfile 错误" unless image_b.fetch("dockerfile") == "Dockerfile"
  raise "image-a 平台配置错误" unless image_a.fetch("platforms") == "linux/amd64,linux/arm64"
  raise "image-b 平台配置错误" unless image_b.fetch("platforms") == "linux/amd64,linux/arm64"
  raise "image-a 不应需要构建参数" unless image_a.fetch("build_args") == []
  raise "image-b 不应需要构建参数" unless image_b.fetch("build_args") == []
  raise "image-a 镜像标签错误" unless image_a.fetch("tag") == "latest"
  raise "image-b 镜像标签错误" unless image_b.fetch("tag") == "latest"
' <<< "$docker_images_output"

docker_mirror_output=$( \
  TARGET_SERVICES='postgres16,azure-storage-azurite,azure-cli,electricsql-electric,nginx,bitwarden' \
  SOURCE_TAG='latest' \
  DEFAULT_IMAGE_PLATFORMS='linux/amd64,linux/arm64' \
  node scripts/prepare-release-matrix.mjs config/services.docker-mirror.json
)

ruby -rjson -e '
  data = JSON.parse(STDIN.read)
  include_items = data.fetch("include")
  raise "docker-mirror 应返回六个服务" unless include_items.size == 6

  bitwarden = include_items.find { |item| item.fetch("service") == "bitwarden" }
  postgres16 = include_items.find { |item| item.fetch("service") == "postgres16" }

  raise "缺少 bitwarden 服务" unless bitwarden
  raise "缺少 postgres16 服务" unless postgres16

  raise "bitwarden 镜像仓库错误" unless bitwarden.fetch("image_repository") == "ghcr.io/tianweilong/bitwarden"
  raise "bitwarden 构建上下文错误" unless bitwarden.fetch("context") == "source/images/bitwarden"
  raise "bitwarden Dockerfile 错误" unless bitwarden.fetch("dockerfile") == "Dockerfile"
  raise "bitwarden 平台配置错误" unless bitwarden.fetch("platforms") == "linux/amd64,linux/arm64"
  raise "bitwarden 不应需要构建参数" unless bitwarden.fetch("build_args") == []
  raise "bitwarden 镜像标签错误" unless bitwarden.fetch("tag") == "latest"

  raise "postgres16 镜像仓库错误" unless postgres16.fetch("image_repository") == "ghcr.io/tianweilong/postgres16"
' <<< "$docker_mirror_output"
