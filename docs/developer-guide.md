# Deploy Center 开发者指南

## 1. 仓库定位

`deploy-center` 是一个以发布编排为中心的仓库，不保存业务代码，也不再维护部署状态文件。

当前主要职责只有两类：

- 根据服务配置生成镜像构建矩阵，从源仓库检出指定提交并发布镜像到 GHCR。
- 在需要时构建多平台 npm 资产、创建 GitHub Release，并发布轻量 npm 包。

如果把当前链路压缩成一句话：**源仓库负责触发，这个仓库负责正式发布。**

## 2. 建议阅读顺序

第一次接手本仓库时，建议按以下顺序阅读：

1. `README.md`：快速了解仓库用途与必需配置。
2. `docs/architecture.md`：了解整体架构背景。
3. `docs/rollout.md`：查看发布前置条件。
4. `.github/workflows/release-service.yml`：理解实际发布执行路径。
5. `config/services.vibe-kanban.json`：理解服务镜像构建配置。
6. `tests/*.sh`：查看当前 workflow 的回归约束。

## 3. 目录结构与职责

### 根目录

- `README.md`：仓库简介、Secrets、变量与发布说明。
- `.gitignore`：忽略本地环境文件与临时文件。

### CI / 发布工作流

- `.github/workflows/validate-deployment-config.yml`：校验 YAML 可解析、当前发布辅助脚本语法有效。
- `.github/workflows/release-service.yml`：核心发布工作流，负责服务镜像构建、GitHub Release 资产发布与 npm 发布。

### 配置文件

- `config/services.vibe-kanban.json`：`vibe-kanban` 服务镜像的构建配置。
- `config/services.new-api.json`：`new-api` 服务镜像的构建配置。
- `services/registry.yaml`：服务登记信息；当前不是发布工作流的直接输入，但可作为服务清单参考。

### 脚本与测试

- `scripts/prepare-release-matrix.rb`：根据目标服务列表和环境变量生成镜像构建矩阵。
- `scripts/release-npm-package.sh`：构建 npm 平台产物并发布轻量 npm 包。
- `scripts/merge-release-checksums.sh`：合并多平台资产生成的校验文件。
- `tests/*.sh`：覆盖工作流结构、矩阵生成、npm 产物和发布约束。

### 未来代理协议

- `agents/webhook/README.md`
- `agents/webhook/protocol.md`
- `agents/webhook/examples/payload.json`

这部分仍是未来自动化代理的协议占位，不代表当前仓库已经具备完整部署能力。

## 4. 核心发布链路

### 4.1 入口

`.github/workflows/release-service.yml` 支持两种触发方式：

- `repository_dispatch`
- `workflow_dispatch`

输入最终归一到以下环境变量：

- `SOURCE_REPOSITORY`
- `SOURCE_REF`
- `SOURCE_SHA`
- `SOURCE_TAG`
- `RELEASE_TARGETS`
- `NPM_PACKAGE_NAME`
- `NPM_PACKAGE_DIR`
- `NPM_VERSION_STRATEGY`
- `NPM_BASE_VERSION_FILE`
- `NPM_VERSION_PATCH_FACTOR`

### 4.2 prepare 阶段

`prepare` 任务运行在 GitHub 托管的 `ubuntu-latest` Runner 上，负责：

1. 校验发布输入。
2. 解析 `release_targets`。
3. 生成服务镜像矩阵。
4. 生成 npm 多平台矩阵。

其中 `release_targets` 当前的规则是：

- `npm` 仍然表示启用 npm 发布链路
- 其他非空值一律按 service 名处理，并在对应的 `config/services.<repo>.json` 中校验

### 4.3 build 阶段

`build` 任务负责构建并推送服务镜像，主要过程如下：

1. 检出当前仓库。
2. 检出源仓库到 `source/`。
3. 配置 QEMU 与 Docker Buildx。
4. 登录 `ghcr.io`。
5. 按矩阵构建并推送镜像。

当前默认镜像平台为：

- `linux/amd64`
- `linux/arm64`

镜像 tag 策略如下：

- 始终发布 `${SOURCE_TAG}`。
- 当 `${SOURCE_TAG}` 是最新正式语义化版本时，同时发布 `latest`。

### 4.4 npm 发布阶段

当 `release_targets` 包含 `npm` 时，工作流会拆成三个阶段：

- `release-npm-assets`
- `release-github-release`
- `release-npm`

当前支持的平台目标为：

- `linux-x64`
- `linux-arm64`
- `win32-x64`
- `darwin-arm64`

`release-github-release` 会在当前仓库创建 GitHub Release，并上传各平台产物；`release-npm` 再发布轻量 npm 包。

### 4.5 当前边界

`release-service` 已不再包含 `update-state` 阶段，也不会回写任何 `environments/*` 或 `deployment.yaml`。

当前仓库只负责：

1. 镜像构建与推送。
2. GitHub Release 资产发布。
3. npm 轻量包发布。

## 5. 关键配置文件说明

### 5.1 `config/services.vibe-kanban.json`

这是当前 `vibe-kanban` 发布链路真正依赖的构建配置。每个服务至少包含：

- `service`
- `image_repository`
- `context`
- `dockerfile`
- `build_args`

`platforms` 是可选字段；未配置时回退到 workflow 默认值。

对于使用 `images/<目录名>/Dockerfile` 结构的公共镜像仓库，也建议单独新增一份 `config/services.<repo>.json`，并遵循同一套配置格式：

- `service`：直接使用目录名，例如 `image-a`
- `context`：写成 `source/images/<目录名>`
- `dockerfile`：固定为 `Dockerfile`
- `image_repository`：对应 GHCR 目标地址

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
ruby -c scripts/prepare-release-matrix.rb
bash -n scripts/release-npm-package.sh
bash -n scripts/merge-release-checksums.sh
```

### 6.2 运行回归测试

```bash
bash tests/prepare-release-matrix.sh
bash tests/release-workflow.sh
bash tests/ghcr-references.sh
bash tests/localization-language.sh
```

这些测试主要覆盖：

- 构建矩阵生成是否正确。
- 发布工作流是否仍符合当前 GHCR / npm 发布方案。
- 仓库中是否残留旧镜像仓库引用或过时英文文案。

### 6.3 本地生成发布矩阵

```bash
TARGET_SERVICES='vibe-kanban-remote,vibe-kanban-relay' \
SOURCE_TAG='v1.2.3' \
VIBE_KANBAN_REMOTE_VITE_RELAY_API_BASE_URL='https://relay.example.com' \
ruby scripts/prepare-release-matrix.rb config/services.vibe-kanban.json
```

## 7. GitHub 配置与外部依赖

### 7.1 仓库 Secrets

- `SOURCE_REPO_TOKEN`

### 7.2 GitHub Token 权限

- `GITHUB_TOKEN` 需要具备 `packages: write`

### 7.3 目标主机侧要求

- 具备 `read:packages` 的 PAT
- 已执行 `docker login ghcr.io`

### 7.4 应用仓库触发密钥

- `DEPLOY_CENTER_TRIGGER_TOKEN`

## 8. 常见变更场景

### 8.1 新增一个服务

建议按下面顺序操作：

1. 在对应的 `config/services.*.json` 中增加构建配置。
2. 若需要服务盘点信息，再同步 `services/registry.yaml`。
3. 若新服务有额外 build args，确保仓库变量也已创建。
4. 补充或更新 `tests/*.sh`。
5. 运行基础校验与回归测试。

对于公共镜像仓库，推荐额外约定：

1. 源仓库维护 `images/<目录名>/Dockerfile` 结构。
2. 源仓库在 `main` 分支变更后自行识别变更目录。
3. 源仓库把变更目录名列表直接作为 `release_targets` 传给 `deploy-center`。
4. 若没有任何 `images/` 目录变化，则不触发发布。

### 8.2 修改镜像构建逻辑

重点检查：

- `config/services.*.json`
- `.github/workflows/release-service.yml`
- `tests/prepare-release-matrix.sh`
- `tests/release-workflow.sh`

### 8.3 修改 npm 发布逻辑

重点检查：

- `scripts/release-npm-package.sh`
- `scripts/merge-release-checksums.sh`
- `tests/npm-release-workflow.sh`
- `tests/release-npm-package-artifact-path.sh`

## 9. 快速心智模型

记住下面四句话就够了：

1. **源仓库负责触发，这个仓库负责发布。**
2. **镜像发布到 GHCR。**
3. **npm 通过 GitHub Release 资产分发多平台 bundle。**
4. **当前仓库不再维护部署状态目录。**
