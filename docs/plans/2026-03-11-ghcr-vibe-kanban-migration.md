# GHCR Migration for vibe-kanban Release Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**目标：** 将 `deploy-center` 中 `vibe-kanban` 的镜像发布从腾讯云 CCR 迁移到私有 GHCR，移除对 `vibe-kanban/Makefile` 的构建依赖，并将 workflow 重构为服务清单驱动的三段式发布流程。

**架构：** 在 `deploy-center` 中新增一份 JSON 服务清单和一个 Ruby matrix 生成脚本，`prepare` job 负责校验输入并产出构建 matrix，`build` job 直接使用 `docker/build-push-action` 构建 `linux/amd64,linux/arm64` 镜像并推送到 `ghcr.io`，`update-state` job 统一回写 `deployment.yaml`。保留 `deployment.yaml` 作为版本真源，`docker-compose.yml` 仅做一次性 GHCR 地址迁移。

**技术栈：** GitHub Actions、Docker Buildx、docker/build-push-action、Bash、Ruby、JSON、YAML、ripgrep

---

### Task 1: 新增服务清单与 matrix 生成脚本

**Files:**
- Create: `config/services.vibe-kanban.json`
- Create: `scripts/prepare-release-matrix.rb`
- Test: `tests/prepare-release-matrix.sh`

**Step 1: Write the failing test**

创建 `tests/prepare-release-matrix.sh`：

```bash
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

grep -q '缺少必填构建参数环境变量' /tmp/prepare-matrix.err
```

**Step 2: Run test to verify it fails**

Run: `bash tests/prepare-release-matrix.sh`

Expected: FAIL with `No such file or directory` for `scripts/prepare-release-matrix.rb` or `config/services.vibe-kanban.json`.

**Step 3: Write minimal implementation**

创建 `config/services.vibe-kanban.json`：

```json
{
  "project": "vibe-kanban",
  "services": [
    {
      "service": "vibe-kanban-remote",
      "image_repository": "ghcr.io/tianweilong/vibe-kanban-remote",
      "context": "source",
      "dockerfile": "crates/remote/Dockerfile",
      "platforms": "linux/amd64,linux/arm64",
      "build_args": [
        {
          "name": "VITE_RELAY_API_BASE_URL",
          "env": "VIBE_KANBAN_REMOTE_VITE_RELAY_API_BASE_URL"
        }
      ]
    },
    {
      "service": "vibe-kanban-relay",
      "image_repository": "ghcr.io/tianweilong/vibe-kanban-relay",
      "context": "source",
      "dockerfile": "crates/relay-tunnel/Dockerfile",
      "platforms": "linux/amd64,linux/arm64",
      "build_args": []
    }
  ]
}
```

创建 `scripts/prepare-release-matrix.rb`：

```ruby
#!/usr/bin/env ruby
require 'json'

config_path = ARGV.fetch(0)
config = JSON.parse(File.read(config_path))
requested_services = ENV.fetch('TARGET_SERVICES')
                       .split(',')
                       .map(&:strip)
                       .reject(&:empty?)
                       .uniq
source_sha = ENV.fetch('SOURCE_SHA')
service_map = config.fetch('services').each_with_object({}) do |service, memo|
  memo[service.fetch('service')] = service
end

include_items = requested_services.map do |name|
  service = service_map[name]
  abort("不支持的服务：#{name}") unless service

  build_args = service.fetch('build_args').map do |build_arg|
    env_name = build_arg.fetch('env')
    value = ENV[env_name].to_s
    if value.empty? || value.start_with?('CHANGE_ME')
      abort("缺少必填构建参数环境变量：#{env_name}")
    end
    "#{build_arg.fetch('name')}=#{value}"
  end

  {
    'service' => service.fetch('service'),
    'image_repository' => service.fetch('image_repository'),
    'context' => service.fetch('context'),
    'dockerfile' => service.fetch('dockerfile'),
    'platforms' => service.fetch('platforms'),
    'build_args' => build_args,
    'tag' => source_sha
  }
end

puts JSON.generate({ 'include' => include_items })
```

运行：`chmod +x scripts/prepare-release-matrix.rb tests/prepare-release-matrix.sh`

**Step 4: Run test to verify it passes**

Run: `bash tests/prepare-release-matrix.sh`

Expected: PASS with no output and exit code `0`.

**Step 5: Commit**

```bash
git add config/services.vibe-kanban.json scripts/prepare-release-matrix.rb tests/prepare-release-matrix.sh
git commit -m "test: add release matrix generator"
```

### Task 2: 重构 release workflow 为三段式 GHCR 发布流程

**Files:**
- Modify: `.github/workflows/release-service.yml`
- Test: `tests/release-workflow.sh`

**Step 1: Write the failing test**

创建 `tests/release-workflow.sh`：

```bash
#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
file='.github/workflows/release-service.yml'

grep -q 'packages: write' "$file"
grep -q 'docker/setup-qemu-action@v3' "$file"
grep -q 'docker/build-push-action@v6' "$file"
grep -q 'registry: ghcr.io' "$file"
grep -q 'fromJSON(needs.prepare.outputs.matrix)' "$file"
grep -q 'fail-fast: false' "$file"
grep -q 'linux/amd64,linux/arm64' "$file"
! grep -q 'TENCENT_REGISTRY' "$file"
! grep -q 'ccr.ccs.tencentyun.com' "$file"
! grep -q 'make push-' "$file"
! grep -q 'Install source dependencies for make metadata' "$file"
```

运行：`chmod +x tests/release-workflow.sh`

**Step 2: Run test to verify it fails**

Run: `bash tests/release-workflow.sh`

Expected: FAIL because the current workflow still references Tencent CCR, lacks `packages: write`, and still calls `make push-*`.

**Step 3: Write minimal implementation**

将 `.github/workflows/release-service.yml` 重写为以下结构：

```yaml
name: Release Service

on:
  repository_dispatch:
    types:
      - deploy-center-release
  workflow_dispatch:
    inputs:
      source_repository:
        description: 源仓库
        required: true
        type: string
      source_ref:
        description: 源引用
        required: true
        type: string
      source_sha:
        description: 源提交 SHA
        required: true
        type: string
      target_environment:
        description: 目标环境
        required: true
        type: choice
        options:
          - dev
          - prod
      services:
        description: 逗号分隔的服务列表
        required: true
        type: string

permissions:
  contents: write
  packages: write

env:
  SOURCE_REPOSITORY: ${{ github.event.client_payload.source_repository || inputs.source_repository }}
  SOURCE_REF: ${{ github.event.client_payload.source_ref || inputs.source_ref }}
  SOURCE_SHA: ${{ github.event.client_payload.source_sha || inputs.source_sha }}
  TARGET_ENVIRONMENT: ${{ github.event.client_payload.target_environment || inputs.target_environment }}
  TARGET_SERVICES: ${{ github.event.client_payload.services || inputs.services }}

jobs:
  prepare:
    runs-on: ubuntu-latest
    environment:
      name: ${{ github.event.client_payload.target_environment || inputs.target_environment }}
    env:
      VIBE_KANBAN_REMOTE_VITE_RELAY_API_BASE_URL: ${{ vars.VIBE_KANBAN_REMOTE_VITE_RELAY_API_BASE_URL }}
    outputs:
      matrix: ${{ steps.matrix.outputs.matrix }}
    steps:
      - uses: actions/checkout@v6

      - name: 校验发布输入
        run: |
          set -euo pipefail
          if [ -z "${SOURCE_REPOSITORY}" ] || [ -z "${SOURCE_REF}" ] || [ -z "${SOURCE_SHA}" ] || [ -z "${TARGET_ENVIRONMENT}" ] || [ -z "${TARGET_SERVICES}" ]; then
            echo '缺少必填发布输入。' >&2
            exit 1
          fi

      - id: matrix
        name: 构建服务矩阵
        run: |
          matrix=$(TARGET_SERVICES="${TARGET_SERVICES}" \
            SOURCE_SHA="${SOURCE_SHA}" \
            VIBE_KANBAN_REMOTE_VITE_RELAY_API_BASE_URL="${VIBE_KANBAN_REMOTE_VITE_RELAY_API_BASE_URL:-}" \
            ruby scripts/prepare-release-matrix.rb config/services.vibe-kanban.json)
          {
            echo 'matrix<<EOF'
            echo "$matrix"
            echo 'EOF'
          } >> "$GITHUB_OUTPUT"

  build:
    needs: prepare
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix: ${{ fromJSON(needs.prepare.outputs.matrix) }}
    steps:
      - uses: actions/checkout@v6

      - name: 检出源仓库
        uses: actions/checkout@v6
        with:
          repository: ${{ env.SOURCE_REPOSITORY }}
          ref: ${{ env.SOURCE_SHA }}
          path: source
          token: ${{ secrets.SOURCE_REPO_TOKEN }}

      - name: 为私有依赖配置 SSH Agent
        uses: webfactory/ssh-agent@v0.9.0
        with:
          ssh-private-key: ${{ secrets.VK_PRIVATE_DEPLOY_KEY }}

      - name: 配置 QEMU
        uses: docker/setup-qemu-action@v3

      - name: 配置 Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: 登录 GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: 构建并推送镜像
        uses: docker/build-push-action@v6
        with:
          context: ${{ matrix.context }}
          file: ${{ matrix.context }}/${{ matrix.dockerfile }}
          platforms: ${{ matrix.platforms }}
          push: true
          ssh: default
          tags: ${{ matrix.image_repository }}:${{ matrix.tag }}
          build-args: |
            ${{ join(matrix.build_args, '\n') }}

  update-state:
    needs:
      - prepare
      - build
    if: ${{ needs.build.result == 'success' }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - name: 更新部署状态文件
        env:
          RELEASE_MATRIX: ${{ needs.prepare.outputs.matrix }}
        run: |
          ruby <<'RUBY'
          require 'json'
          matrix = JSON.parse(ENV.fetch('RELEASE_MATRIX')).fetch('include')
          matrix.each do |service|
            ok = system(
              {
                'DEPLOY_ENV' => ENV.fetch('TARGET_ENVIRONMENT'),
                'SERVICE_NAME' => service.fetch('service'),
                'SOURCE_REF' => ENV.fetch('SOURCE_REF'),
                'SOURCE_SHA' => ENV.fetch('SOURCE_SHA'),
                'IMAGE_REPOSITORY' => service.fetch('image_repository'),
                'IMAGE_TAG' => ENV.fetch('SOURCE_SHA')
              },
              './scripts/update-deployment-state.sh'
            )
            abort("Failed to update #{service.fetch('service')}") unless ok
          end
          RUBY

      - name: 提交部署状态变更
        run: |
          git config user.email 'action@github.com'
          git config user.name 'GitHub Action'
          if git diff --quiet; then
            echo 'No deployment state changes to commit.'
            exit 0
          fi
          git add environments
          git commit -m "chore: update deployment state for ${TARGET_ENVIRONMENT} (${SOURCE_SHA})"
          git push
```

注意：不要在这个任务里改 `vibe-kanban/Makefile`。

**Step 4: Run test to verify it passes**

Run: `bash tests/release-workflow.sh`

Expected: PASS with no output and exit code `0`.

**Step 5: Commit**

```bash
git add .github/workflows/release-service.yml tests/release-workflow.sh
git commit -m "feat: move release workflow to ghcr buildx pipeline"
```

### Task 3: 让 deployment state 更新脚本摆脱外部 `TARGET_FILE` 依赖

**Files:**
- Modify: `scripts/update-deployment-state.sh`
- Test: `tests/update-deployment-state.sh`

**Step 1: Write the failing test**

创建 `tests/update-deployment-state.sh`：

```bash
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
```

运行：`chmod +x tests/update-deployment-state.sh`

**Step 2: Run test to verify it fails**

Run: `bash tests/update-deployment-state.sh`

Expected: FAIL with `key not found: "TARGET_FILE"` because the current script only works when the caller manually injects `TARGET_FILE`.

**Step 3: Write minimal implementation**

将 `scripts/update-deployment-state.sh` 中的 Ruby 调用改成自包含形式：

```bash
file="environments/${DEPLOY_ENV}/${SERVICE_NAME}/deployment.yaml"
[ -f "$file" ] || { echo "缺少部署描述文件：$file" >&2; exit 1; }

TARGET_FILE="$file" ruby <<'RUBY'
require 'yaml'
file = ENV.fetch('TARGET_FILE')
data = YAML.load_file(file)
data['source']['ref'] = ENV.fetch('SOURCE_REF')
data['source']['sha'] = ENV.fetch('SOURCE_SHA')
data['image']['repository'] = ENV.fetch('IMAGE_REPOSITORY')
data['image']['tag'] = ENV.fetch('IMAGE_TAG')
File.write(file, YAML.dump(data))
RUBY
```

除了把 `TARGET_FILE` 由脚本内部设置，不要扩展脚本职责。

**Step 4: Run test to verify it passes**

Run: `bash tests/update-deployment-state.sh`

Expected: PASS with no output and exit code `0`.

**Step 5: Commit**

```bash
git add scripts/update-deployment-state.sh tests/update-deployment-state.sh
git commit -m "test: cover deployment state updater"
```

### Task 4: 迁移 deployment 描述、compose 模板与文档到 GHCR

**Files:**
- Modify: `environments/dev/vibe-kanban-remote/deployment.yaml`
- Modify: `environments/dev/vibe-kanban-remote/docker-compose.yml`
- Modify: `environments/dev/vibe-kanban-relay/deployment.yaml`
- Modify: `environments/dev/vibe-kanban-relay/docker-compose.yml`
- Modify: `environments/prod/vibe-kanban-remote/deployment.yaml`
- Modify: `environments/prod/vibe-kanban-remote/docker-compose.yml`
- Modify: `environments/prod/vibe-kanban-relay/deployment.yaml`
- Modify: `environments/prod/vibe-kanban-relay/docker-compose.yml`
- Modify: `README.md`
- Modify: `docs/rollout.md`
- Test: `tests/ghcr-references.sh`

**Step 1: Write the failing test**

创建 `tests/ghcr-references.sh`：

```bash
#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

files=(
  README.md
  docs/rollout.md
  environments/dev/vibe-kanban-remote/deployment.yaml
  environments/dev/vibe-kanban-remote/docker-compose.yml
  environments/dev/vibe-kanban-relay/deployment.yaml
  environments/dev/vibe-kanban-relay/docker-compose.yml
  environments/prod/vibe-kanban-remote/deployment.yaml
  environments/prod/vibe-kanban-remote/docker-compose.yml
  environments/prod/vibe-kanban-relay/deployment.yaml
  environments/prod/vibe-kanban-relay/docker-compose.yml
)

for file in "${files[@]}"; do
  ! grep -q 'ccr.ccs.tencentyun.com' "$file"
done

! grep -q 'TENCENT_REGISTRY' README.md
! grep -q 'TENCENT_REGISTRY' docs/rollout.md

grep -q 'ghcr.io/tianweilong/vibe-kanban-remote' environments/dev/vibe-kanban-remote/deployment.yaml
grep -q 'ghcr.io/tianweilong/vibe-kanban-remote' environments/dev/vibe-kanban-remote/docker-compose.yml
grep -q 'ghcr.io/tianweilong/vibe-kanban-relay' environments/dev/vibe-kanban-relay/deployment.yaml
grep -q 'ghcr.io/tianweilong/vibe-kanban-relay' environments/dev/vibe-kanban-relay/docker-compose.yml
grep -q 'ghcr.io/tianweilong/vibe-kanban-remote' environments/prod/vibe-kanban-remote/deployment.yaml
grep -q 'ghcr.io/tianweilong/vibe-kanban-remote' environments/prod/vibe-kanban-remote/docker-compose.yml
grep -q 'ghcr.io/tianweilong/vibe-kanban-relay' environments/prod/vibe-kanban-relay/deployment.yaml
grep -q 'ghcr.io/tianweilong/vibe-kanban-relay' environments/prod/vibe-kanban-relay/docker-compose.yml

grep -q 'GITHUB_TOKEN' README.md
grep -q 'read:packages' README.md
grep -q 'read:packages' docs/rollout.md
```

运行：`chmod +x tests/ghcr-references.sh`

**Step 2: Run test to verify it fails**

Run: `bash tests/ghcr-references.sh`

Expected: FAIL because the repository still contains Tencent registry references and lacks GHCR private pull guidance.

**Step 3: Write minimal implementation**

对 8 个环境文件进行以下替换：

- `ccr.ccs.tencentyun.com/vino/vibe-kanban-remote` → `ghcr.io/tianweilong/vibe-kanban-remote`
- `ccr.ccs.tencentyun.com/vino/vibe-kanban-relay` → `ghcr.io/tianweilong/vibe-kanban-relay`

`deployment.yaml` 保持 `CHANGE_ME_SHA` / `CHANGE_ME_TAG` 占位不变，`docker-compose.yml` 保持 `CHANGE_ME_TAG` 占位不变。

将 `README.md` 改为以下要点：

```markdown
## GitHub configuration

必需的仓库密钥：

- `VK_PRIVATE_DEPLOY_KEY`
- `SOURCE_REPO_TOKEN`

Required workflow permissions:

- `GITHUB_TOKEN` with `packages: write`

Required environment variables:

- `dev` → `VIBE_KANBAN_REMOTE_VITE_RELAY_API_BASE_URL`
- `prod` → `VIBE_KANBAN_REMOTE_VITE_RELAY_API_BASE_URL`

Required deployment-host credentials:

- PAT classic with `read:packages`
- `docker login ghcr.io`

`vibe-kanban` only keeps one trigger secret:

- `DEPLOY_CENTER_TRIGGER_TOKEN`
```

将 `docs/rollout.md` 改为以下要点：

```markdown
## 必需的仓库密钥

- `VK_PRIVATE_DEPLOY_KEY`
- `SOURCE_REPO_TOKEN`

## 必需的部署主机凭据

- PAT classic with `read:packages`
- Login command: `docker login ghcr.io`

## Required application-repo trigger secret

- `DEPLOY_CENTER_TRIGGER_TOKEN`
```

**Step 4: Run test to verify it passes**

Run: `bash tests/ghcr-references.sh`

Expected: PASS with no output and exit code `0`.

**Step 5: Commit**

```bash
git add README.md docs/rollout.md environments/dev/vibe-kanban-remote/deployment.yaml environments/dev/vibe-kanban-remote/docker-compose.yml environments/dev/vibe-kanban-relay/deployment.yaml environments/dev/vibe-kanban-relay/docker-compose.yml environments/prod/vibe-kanban-remote/deployment.yaml environments/prod/vibe-kanban-remote/docker-compose.yml environments/prod/vibe-kanban-relay/deployment.yaml environments/prod/vibe-kanban-relay/docker-compose.yml tests/ghcr-references.sh
git commit -m "docs: switch vibe-kanban deployment descriptors to ghcr"
```

### Task 5: 全量验证并准备执行记录

**Files:**
- Modify: none unless verification finds gaps
- Test: `tests/prepare-release-matrix.sh`
- Test: `tests/release-workflow.sh`
- Test: `tests/update-deployment-state.sh`
- Test: `tests/ghcr-references.sh`

**Step 1: Run the full local verification suite**

Run:

```bash
bash tests/prepare-release-matrix.sh
bash tests/release-workflow.sh
bash tests/update-deployment-state.sh
bash tests/ghcr-references.sh
```

Expected: all four commands exit `0` with no output.

**Step 2: Verify Tencent registry references are gone**

Run: `rg 'ccr\.ccs\.tencentyun\.com|TENCENT_REGISTRY|make push-' .`

Expected: no matches in tracked source files.

**Step 3: Verify deployment descriptors parse and point at GHCR**

Run:

```bash
ruby -ryaml -e '
  Dir["environments/*/*/deployment.yaml"].sort.each do |file|
    data = YAML.load_file(file)
    repo = data.dig("image", "repository")
    abort("bad repo in #{file}: #{repo}") unless repo.start_with?("ghcr.io/tianweilong/")
  end
'
```

Expected: exit `0` with no output.

**Step 4: Review the final diff with @verification-before-completion**

Run:

```bash
git status --short
git diff --stat
```

Expected: only the planned `deploy-center` files are modified; no accidental edits to `vibe-kanban/Makefile`.

**Step 5: Optional first-run operational smoke check after merge**

After the first successful GitHub Actions run, execute:

```bash
docker buildx imagetools inspect ghcr.io/tianweilong/vibe-kanban-remote:${SOURCE_SHA}
docker buildx imagetools inspect ghcr.io/tianweilong/vibe-kanban-relay:${SOURCE_SHA}
```

Expected: each manifest lists both `linux/amd64` and `linux/arm64`.
