# Deploy Center 开发者指南

## 1. 仓库定位

`deploy-center` 是一个以发布编排为中心的仓库，不保存业务代码，也不再维护部署状态文件。

当前主要职责只有两类：

- 根据中心化服务配置解析发布请求，从源仓库检出指定提交并发布镜像到 GHCR。
- 在需要时构建多平台 npm 资产、创建 GitHub Release，并发布轻量 npm 包。

如果把当前链路压缩成一句话：**源仓库负责触发，这个仓库负责正式发布。**

## 2. 建议阅读顺序

第一次接手本仓库时，建议按以下顺序阅读：

1. `README.md`：快速了解仓库用途、发布输入、Secrets 与版本策略。
2. `docs/architecture.md`：了解整体架构背景。
3. `docs/rollout.md`：查看发布前置条件。
4. `config/services.yaml`：理解服务、镜像和 npm 发布配置。
5. `.github/workflows/release-service.yml`：理解实际发布执行路径。
6. `tests/*.mjs`：查看当前 workflow 的回归约束。

## 3. 目录结构与职责

### 根目录

- `README.md`：仓库简介、Secrets、发布输入与 tag 策略说明。
- `.gitignore`：忽略本地环境文件与临时文件。

### CI / 发布工作流

- `.github/workflows/validate-deployment-config.yml`：校验 YAML 可解析、当前发布辅助脚本语法有效。
- `.github/workflows/release-service.yml`：核心发布工作流，负责服务镜像构建、GitHub Release 资产发布与 npm 发布。

### 配置文件

- `config/services.yaml`：发布工作流的唯一服务配置入口，包含源码仓、镜像构建、GHCR 仓库、npm 包和 npm 平台配置。
- `services/registry.yaml`：服务登记信息；当前不是发布工作流的直接输入，但可作为服务清单参考。

### 脚本与测试

- `scripts/resolve-release-request.mjs`：读取发布 payload 和 `config/services.yaml`，输出 workflow 消费的镜像/npm 发布上下文。
- `scripts/npm-release-common.mjs`：复用 npm 发布版本解析、包名校验和 Release 元数据上下文。
- `scripts/prepare-npm-publish-input.mjs`：准备 `release-npm` 消费的发布输入目录。
- `scripts/build-npm-release-assets.mjs`：构建多平台 npm Release 资产与 checksum。
- `scripts/publish-npm-package.mjs`：消费发布输入目录并通过 Trusted Publishing 发布轻量 npm 包。
- `scripts/merge-release-checksums.mjs`：合并多平台资产生成的校验文件。
- `tests/*.mjs`：覆盖工作流结构、请求解析、npm 产物和发布约束。

### 未来代理协议

- `agents/webhook/README.md`
- `agents/webhook/protocol.md`
- `agents/webhook/examples/payload.json`

这部分仍是未来自动化代理的协议占位，不代表当前仓库已经具备完整部署能力。

## 4. 核心发布链路

### 4.1 入口

`.github/workflows/release-service.yml` 支持两种触发方式：

- `repository_dispatch`，事件类型为 `deploy-center-release`。
- `workflow_dispatch`，用于手动触发单个服务发布。

输入最终归一到以下环境变量：

- `SERVICE_NAME`
- `SOURCE_REF`
- `SOURCE_SHA`
- `SOURCE_TAG`

`SOURCE_TAG` 必须匹配 `vYYYY.M.D-tHHmm`，例如 `v2026.4.19-t1116`。`latest`、`vX.Y.Z` 和 `2026.04.19.1` 这类旧格式会被拒绝。

### 4.2 prepare 阶段

`prepare` 任务运行在 GitHub 托管的 `ubuntu-latest` Runner 上，负责：

1. 将发布输入写入临时 payload。
2. 调用 `scripts/resolve-release-request.mjs config/services.yaml /tmp/release-input.json`。
3. 按服务配置输出镜像构建上下文或 npm 发布上下文。
4. 为镜像服务生成平台矩阵，为 npm 服务生成 npm 平台矩阵。

当前不再解析历史的多目标字段或分散 JSON 服务配置。每次发布只通过 `SERVICE_NAME` 指定一个 `config/services.yaml` 中的服务。

### 4.3 build 阶段

`build-and-push-ghcr` 任务负责构建并推送服务镜像，主要过程如下：

1. 检出当前仓库。
2. 检出源仓库到 `source/`。
3. 按平台选择原生 GitHub 托管 Runner：`linux/amd64` 使用 `ubuntu-latest`，`linux/arm64` 使用 `ubuntu-24.04-arm`。
4. 登录 `ghcr.io`。
5. 按平台构建并推送 digest 镜像。
6. `merge-ghcr-manifest` 任务下载同一服务的各平台 digest，并通过 `docker buildx imagetools create` 合并多架构 manifest。

当前默认镜像平台为：

- `linux/amd64`
- `linux/arm64`

镜像 tag 策略如下：

- 始终发布 `${SOURCE_TAG}`，作为不可变正式发布 tag。
- 同时发布 `latest`，方便 `docker-compose.yaml` 继续固定写 `latest` 并拉取最新镜像。

当前只执行 `build-and-push-ghcr`，不执行 ACR mirror。

### 4.4 npm 发布阶段

当 `SERVICE_NAME` 指向 npm 服务时，工作流会拆成三个阶段：

- `release-npm-assets`
- `release-github-release`
- `release-npm`

当前支持的平台目标为：

- `linux-x64`
- `linux-arm64`
- `win32-x64`
- `darwin-arm64`

`release-github-release` 会在当前仓库创建 GitHub Release，并上传各平台产物；`release-npm` 再发布轻量 npm 包。

`vYYYY.M.D-tHHmm` 会按 `calendar_tag` 策略转换为合法 npm 版本 `YYYY.M.D-tHHmm`，也就是正式 tag 去掉前导 `v`。例如 `v2026.4.19-t1116` 发布为 npm 版本 `2026.4.19-t1116`。该版本在 npm 语义中属于 prerelease，本仓库按内部工具约定显式使用 `--tag latest`，让 `npm install <pkg>` 和 `npx <pkg>` 默认拿到最新发布。

### 4.5 当前边界

`release-service` 暂不包含 Lindos 的 candidate release 更新，也不会触发测试环境部署。

当前仓库只负责：

1. 镜像构建与推送。
2. GitHub Release 资产发布。
3. npm 轻量包发布。

## 5. 关键配置文件说明

### 5.1 `config/services.yaml`

`config/services.yaml` 是当前发布链路唯一依赖的服务配置。每个服务以服务名为 key，并按需要声明镜像或 npm 发布字段。

镜像服务常用字段：

- `sourceRepository`：源仓库，例如 `tianweilong/vibe-kanban`。
- `buildContext`：传给 Docker 的构建上下文，相对源仓库根目录。
- `dockerfilePath`：Dockerfile 路径，相对源仓库根目录。
- `ghcrImageRepository`：GHCR 目标镜像仓库。
- `defaultPlatforms`：镜像平台列表，当前只支持 `linux/amd64` 和 `linux/arm64`。
- `buildArgs`：可选构建参数，可写固定值，也可用 `{ env: SOURCE_TAG }` 读取解析器内置环境。

npm 服务常用字段：

- `sourceRepository`：源仓库。
- `npmPackageName`：npm 包名。
- `npmPackageDir`：源仓库内 npm 包目录。
- `npmVersionStrategy`：当前使用 `calendar_tag`。
- `npmDistTag`：当前内部工具约定为 `latest`。
- `npmPlatforms`：npm 多平台资产构建矩阵。

对于使用 `images/<目录名>/Dockerfile` 结构的公共镜像仓库，也直接在 `config/services.yaml` 新增服务项：

- `buildContext`：写成 `images/<目录名>`。
- `dockerfilePath`：写成 `images/<目录名>/Dockerfile`。
- `ghcrImageRepository`：写成对应 GHCR 目标地址。

### 5.2 `services/registry.yaml`

这是一个服务清单文件，字段包括：

- `name`
- `project`
- `repository`
- `deploy_mode`

它更适合用于服务盘点或后续扩展，不是当前 `release-service` 的直接输入。

## 6. 本地维护与验证命令

以下命令都在仓库根目录执行。

### 6.1 基础校验

```bash
ruby -e "require 'yaml'; Dir['**/*.yaml'].each { |f| YAML.load_file(f); puts f }"
node --check scripts/resolve-release-request.mjs
node --check scripts/npm-release-common.mjs
node --check scripts/prepare-npm-publish-input.mjs
node --check scripts/build-npm-release-assets.mjs
node --check scripts/publish-npm-package.mjs
node --check scripts/merge-release-checksums.mjs
node --check scripts/merge-tauri-updater-json.mjs
node --check scripts/release-meta.mjs
node --check scripts/validate-npm-build-contract.mjs
```

### 6.2 运行回归测试

```bash
node --test tests/resolve-release-request.mjs tests/ghcr-references.mjs tests/localization-language.mjs tests/release-workflow.mjs tests/npm-release-workflow.mjs
```

这些测试主要覆盖：

- 发布请求解析是否符合 `service_name + source_tag` 模型。
- 发布工作流是否仍符合当前 GHCR / npm 发布方案。
- 仓库中是否残留旧镜像仓库引用、旧矩阵脚本依赖或过时英文文案。

### 6.3 本地解析发布请求

```bash
cat > /tmp/release-input.json <<'JSON'
{
  "service_name": "vibe-kanban-remote",
  "source_ref": "refs/tags/v2026.4.19-t1116",
  "source_sha": "0123456789abcdef0123456789abcdef01234567",
  "source_tag": "v2026.4.19-t1116"
}
JSON

BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  node scripts/resolve-release-request.mjs config/services.yaml /tmp/release-input.json
```

## 7. GitHub 配置与外部依赖

### 7.1 GitHub App 配置

发布链路统一使用 GitHub App，不再配置 `SOURCE_REPO_TOKEN`、`DEPLOY_CENTER_TRIGGER_TOKEN` 或其它长期 PAT。

- `DEPLOY_CENTER_APP_ID`：仓库 variable，值为 GitHub App ID。
- `DEPLOY_CENTER_APP_PRIVATE_KEY`：仓库 secret，值为 GitHub App private key PEM。
- GitHub App 需安装到 `tianweilong/deploy-center` 与所有发布源仓库，例如 `tianweilong/vibe-kanban`、`tianweilong/myte`。
- Repository permissions 至少包含 `Contents: Read and write`。

### 7.2 GitHub Token 权限

- `contents: write`：`GITHUB_TOKEN` 用于在 `deploy-center` 创建 GitHub Release 和上传资产。
- `packages: write`：`GITHUB_TOKEN` 用于推送 GHCR 镜像。
- `id-token: write`：npm Trusted Publishing 使用 OIDC 发包。

### 7.3 npm Trusted Publishing

npm 包侧为每个包配置 trusted publisher：

- Repository：`tianweilong/deploy-center`
- Workflow：`release-service.yml`
- Environment：留空，除非 workflow 后续显式配置同名 environment

发布脚本不使用 `NPM_TOKEN` 或 `NODE_AUTH_TOKEN`。

Trusted Publishing 侧允许的 action 至少选择 `npm publish`。当前 workflow 使用 GitHub-hosted runner、Node 24 与 npm 11.5.1，满足 npm 官方对 OIDC 发布的最低版本要求。

### 7.4 目标主机侧要求

- 具备 `read:packages` 的 PAT
- 已执行 `docker login ghcr.io`

## 8. 常见变更场景

### 8.1 新增一个服务

建议按下面顺序操作：

1. 在 `config/services.yaml` 中增加服务配置。
2. 若需要服务盘点信息，再同步 `services/registry.yaml`。
3. 若新服务有额外 build args，确保解析器能提供对应环境值，或在服务配置中写入固定值。
4. 补充或更新 `tests/*.mjs`。
5. 运行基础校验与回归测试。

对于公共镜像仓库，推荐额外约定：

1. 源仓库维护 `images/<目录名>/Dockerfile` 结构。
2. 源仓库在 `main` 分支变更后自行识别变更目录。
3. 源仓库把变更目录名映射为 `config/services.yaml` 中的 `SERVICE_NAME` 后触发 `deploy-center`。
4. 若没有任何 `images/` 目录变化，则不触发发布。

### 8.2 修改镜像构建逻辑

重点检查：

- `config/services.yaml`
- `scripts/resolve-release-request.mjs`
- `.github/workflows/release-service.yml`
- `tests/resolve-release-request.mjs`
- `tests/release-workflow.mjs`

### 8.3 修改 npm 发布逻辑

重点检查：

- `config/services.yaml`
- `scripts/npm-release-common.mjs`
- `scripts/prepare-npm-publish-input.mjs`
- `scripts/build-npm-release-assets.mjs`
- `scripts/publish-npm-package.mjs`
- `scripts/merge-release-checksums.mjs`
- `tests/npm-release-workflow.mjs`
- `tests/release-npm-package-artifact-path.mjs`

## 9. 快速心智模型

记住下面四句话就够了：

1. **源仓库负责触发，这个仓库负责发布。**
2. **所有服务配置集中在 `config/services.yaml`。**
3. **镜像发布 `${SOURCE_TAG}` 和 `latest` 到 GHCR。**
4. **当前仓库暂不更新 candidate release，也不触发测试环境部署。**
