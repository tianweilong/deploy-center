# Deploy Center 开发者指南

## 1. 仓库定位

`deploy-center` 是一个以服务发布状态为中心的多服务部署控制仓库。它本身不承载业务代码，而是承担以下职责：

- 接收应用仓库触发的发布事件，或由维护者手动触发发布工作流。
- 根据服务配置生成构建矩阵，从源仓库检出指定提交，构建并推送镜像到 GHCR。
- 在需要时检出应用源仓库，执行 `make npx-dev-build` 并发布 `@vino.tian/vibe-kanban` 到 npm。
- 将目标服务的期望部署状态写回仓库中的 `environments/` 目录，并提交变更。
- 预留未来的拉模式部署代理协议，使目标机器可以从本仓库拉取期望状态并执行部署。

当前仓库主要服务于 `tianweilong/vibe-kanban`，已纳管两个服务：

- `vibe-kanban-remote`
- `vibe-kanban-relay`

如果把整个链路简化成一句话：**应用仓库负责产生命令，这个仓库负责统一执行镜像发布、npm 发布与服务状态回写。**

## 2. 建议阅读顺序

第一次接手本仓库时，建议按以下顺序阅读：

1. `README.md`：快速了解仓库用途与必需凭据。
2. `docs/architecture.md`：理解状态驱动的整体架构。
3. `docs/rollout.md`：查看发布前置条件与部署主机要求。
4. `docs/developer-guide.md`：按本文理解目录结构、工作流与维护规范。
5. `environments/<service>/deployment.yaml`：查看具体服务的期望状态。
6. `.github/workflows/release-service.yml`：理解实际发布执行路径。

## 3. 目录结构与职责

### 根目录

- `README.md`：仓库简介、GitHub Secrets、环境变量与部署主机凭据说明。
- `.gitignore`：忽略本地环境文件与 `.DS_Store`。

### CI / 发布工作流

- `.github/workflows/validate-deployment-config.yml`：在 `push`、`pull_request`、`workflow_dispatch` 时校验 YAML 可解析、Shell 脚本语法有效。
- `.github/workflows/release-service.yml`：核心发布工作流，负责编排服务镜像构建、npm 打包发布和部署状态回写。

### 配置与服务注册

- `services/registry.yaml`：维护“这个仓库正在管理哪些服务”的注册信息，偏向服务目录视角。
- `config/services.vibe-kanban.json`：维护发布工作流实际使用的构建配置，偏向构建与镜像视角。

这两个文件都描述服务，但关注点不同：

- `services/registry.yaml` 更像服务清单。
- `config/services.vibe-kanban.json` 更像构建元数据来源。

### 服务状态

- `environments/vibe-kanban-remote/...`
- `environments/vibe-kanban-relay/...`

每个服务都有一个独立目录，目录内通常包含四类文件：

- `README.md`：该服务目录的简要说明。
- `.env.example`：目标主机本地环境变量示例。
- `docker-compose.yml`：Compose 服务骨架。
- `deployment.yaml`：**当前最关键的部署期望状态描述符。**

### 脚本与测试

- `scripts/prepare-release-matrix.rb`：根据目标服务列表和环境变量生成 GitHub Actions matrix JSON。
- `scripts/update-deployment-state.sh`：更新 `deployment.yaml` 中的 `source` 和 `image` 字段。
- `scripts/commit-deployment-state-with-retry.sh`：基于最新 `origin/main` 重算部署状态，并在 push 冲突时自动重试提交。
- `tests/*.sh`：以 Shell 形式覆盖关键工作流约束、矩阵生成和状态回写逻辑。

### 未来代理协议

- `agents/webhook/README.md`
- `agents/webhook/protocol.md`
- `agents/webhook/examples/payload.json`

这部分还不是生产可用代理实现，而是提前定义了未来拉模式部署代理的契约与目录形态。

### 规划文档

- `docs/plans/2026-03-11-ghcr-vibe-kanban-design.md`
- `docs/plans/2026-03-11-ghcr-vibe-kanban-migration.md`

这两份文档记录了仓库切换到 GHCR 的设计与实施过程，适合在理解“为什么现在长这样”时参考。

## 4. 核心发布链路

### 4.1 入口

`.github/workflows/release-service.yml` 支持两种触发方式：

- `repository_dispatch`，事件类型为 `deploy-center-release`
- `workflow_dispatch`，由维护者在 GitHub 页面手动填写参数触发

输入参数统一归一到以下环境变量：

- `SOURCE_REPOSITORY`
- `SOURCE_REF`
- `SOURCE_SHA`
- `SOURCE_TAG`
- `RELEASE_TARGETS`
- `NPM_PACKAGE_NAME`
- `NPM_PACKAGE_DIR`
- `NPM_VERSION_STRATEGY`
- `NPM_BASE_VERSION_FILE`（按策略可选）
- `NPM_VERSION_PATCH_FACTOR`（按策略可选）

### 4.2 prepare 阶段

`prepare` 任务运行在 GitHub 托管的 `ubuntu-latest` Runner 上，会做三件事：

1. 校验发布输入是否完整。
2. 将 `release_targets` 解析成服务镜像目标与 npm 目标。
3. 读取仓库变量中的构建参数。
4. 调用 `scripts/prepare-release-matrix.rb` 为服务镜像生成构建矩阵。

目前可以确定的仓库变量是：

- `VIBE_KANBAN_REMOTE_VITE_RELAY_API_BASE_URL`

之所以需要它，是因为 `vibe-kanban-remote` 的镜像构建依赖 build arg `VITE_RELAY_API_BASE_URL`。

### 4.3 build 阶段（服务镜像）

`build` 任务运行在带 `self-hosted`、`Linux`、`ARM64` 标签的自建 Runner 上，并行处理矩阵中的服务项，主要步骤如下：

1. 检出当前仓库。
2. 使用 `SOURCE_REPO_TOKEN` 检出应用源仓库到 `source/` 目录。
3. 初始化 Docker Buildx，并保留 QEMU 配置步骤；当前默认构建 `linux/amd64,linux/arm64` 镜像，服务可按需单独覆盖平台配置。
4. 使用 `GITHUB_TOKEN` 登录 `ghcr.io`。
5. 通过 `docker/build-push-action@v6` 构建并推送镜像。

当前镜像标签策略如下：

- 始终推送 `${SOURCE_TAG}` 对应的镜像 tag。
- 仅当 `SOURCE_TAG` 是仓库中最新的正式语义化版本标签时，额外推送 `latest`。

### 4.4 release-npm 阶段

当 `release_targets` 包含 `npm` 时，工作流会拆成三个阶段执行：

- `release-npm-assets`：按平台矩阵构建 GitHub Release 资产。
- `release-github-release`：创建 GitHub Release 并上传平台资产。
- `release-npm`：发布轻量 npm 包，由安装脚本在安装时按平台下载对应资产。

当前首版支持的平台目标为：

- `linux-x64`
- `win32-x64`
- `darwin-arm64`

其中 Windows 在 workflow 与脚本内部使用 Node/npm 生态常见的标识：

- 操作系统：`win32`
- 架构：`x64`

GitHub Release 仓库固定使用当前仓库 `deploy-center`，即 GitHub Actions 上下文中的 `github.repository`。

`package-key` 不再显式传入，而是由 `NPM_PACKAGE_NAME` 去掉 scope 后自动推导：

- `@vino.tian/vibe-kanban` -> `vibe-kanban`
- `foo` -> `foo`

GitHub Release tag 规则固定为：

- `<package-key>-vX.Y.Z`

典型资产文件名为：

- `<package-key>-vX.Y.Z-linux-x64.tar.gz`
- `<package-key>-vX.Y.Z-win32-x64.zip`
- `<package-key>-vX.Y.Z-darwin-arm64.tar.gz`
- `<package-key>-vX.Y.Z-checksums.txt`

#### 4.4.1 release-npm-assets

`release-npm-assets` 任务运行在 GitHub 托管 Runner 上，并根据矩阵分别使用 `ubuntu-latest`、`windows-latest` 和 `macos-15`。每个矩阵实例会：

1. 检出应用源仓库到 `source/`。
2. 设置 Node.js、pnpm 与 Rust 工具链。
3. 读取 `npm_package_dir` 指向的 `package.json`，并校验其中的包名与请求中的 `npm_package_name` 一致。
4. 按 `npm_version_strategy` 选择版本策略：
   - `package_json`：直接使用包自身版本
   - `source_tag`：直接使用 `SOURCE_TAG` 去掉前缀 `v` 后的值
   - `base_patch_offset`：基于 `npm_base_version_file` 和 `npm_version_patch_factor` 校验映射关系并计算发布版本
5. 执行 `pnpm i --frozen-lockfile`。
6. 带上 `TARGET_OS` 与 `TARGET_ARCH` 执行 `pnpm run build:npx`。
7. 生成带 `package-key` 与平台后缀的压缩包，并输出 `checksums.txt`。
8. 将这些文件作为 workflow artifact 上传。

#### 4.4.2 release-github-release

`release-github-release` 任务运行在 GitHub 托管的 `ubuntu-latest` Runner 上。只有当全部 `release-npm-assets` 实例成功后，它才会执行：

1. 下载全部平台 artifact。
2. 在当前仓库中使用 `<package-key>-vX.Y.Z` 创建 GitHub Release。
3. 上传各平台压缩包和 `checksums.txt`。

#### 4.4.3 release-npm

`release-npm` 任务运行在 GitHub 托管的 `ubuntu-latest` Runner 上。只有当 GitHub Release 资产上传成功后，它才会执行：

1. 检出应用源仓库到 `source/`。
2. 设置 Node.js 与 pnpm，并升级 npm 以满足 Trusted Publishing 要求。
3. 发布一个轻量 npm 包，不再把多平台资产重新打进 npm tarball。
4. 用户在 `npm install -g` 时，由安装脚本识别平台，并只下载当前平台对应的一个 GitHub Release 资产。

### 4.4.4 npm 版本策略

`deploy-center` 本身不写死任何源仓库的 npm 目录结构或版本规则，而是通过 dispatch / workflow 输入获取以下元数据：

- `npm_package_dir`：目标 npm 包所在目录
- `npm_version_strategy`：版本策略
- `npm_base_version_file`：基线版本文件（按策略可选）
- `npm_version_patch_factor`：patch 映射因子（按策略可选）

当前支持的版本策略：

- `package_json`
- `source_tag`
- `base_patch_offset`

### 4.4.5 npm 版本映射（`vibe-kanban` 当前用法）

当根 `package.json` 的基线版本为 `X.Y.Z` 时：

- 合法发布 tag 必须为 `vX.Y.(Zx100+N)`
- 其中 `N` 的合法范围是 `1..99`
- npm 发布版本等于 tag 去掉前缀 `v` 后的值

例如：

- 基线版本：`1.2.30`
- 合法 tag：`v1.2.3001`
- npm 发布版本：`1.2.3001`

这套规则允许 fork 基于同一个上游版本做多次发布，同时不需要把根 `package.json` 改成每次发布后的版本。

### 4.5 update-state 阶段

`update-state` 任务继续运行在 GitHub 托管的 `ubuntu-latest` Runner 上。

如果 `build` 全部成功，`update-state` 任务会：

1. 读取 `prepare` 阶段输出的矩阵。
2. 针对每个服务调用 `scripts/update-deployment-state.sh`。
3. 将 `deployment.yaml` 中的以下字段更新为最新期望状态：
   - `source.ref`
   - `source.sha`
   - `image.repository`
   - `image.tag`
4. 调用 `scripts/commit-deployment-state-with-retry.sh`，基于最新 `origin/main` 重算并提交状态。
5. 若 push 因并发更新失败，则重新同步远端、再次生成状态并在上限内重试。

也就是说，本仓库中的 Git 提交本身就是部署状态审计轨迹的一部分。

## 5. 服务状态模型与文件约定

### 5.1 `deployment.yaml` 是事实来源

每个服务目录下的 `deployment.yaml` 负责表达该服务的期望状态。以现有文件为例，它包含：

- 服务标识：`service`、`project`、`repository`
- 部署模式：`deploy_mode`
- 源码元数据：`source.ref`、`source.sha`
- 镜像元数据：`image.repository`、`image.tag`
- 部署入口：`compose.file`、`compose.service_name`
- 健康检查：`healthcheck.command`
- 代理通道：`agent.channel`

对维护者来说，最重要的是理解这几点：

- `source.sha` 与 `image.tag` 不再相同：前者用于追溯源码提交，后者记录正式发布标签。
- `image.repository` 必须与 `config/services.vibe-kanban.json` 中的定义一致。
- `healthcheck.command` 是后续自动化代理实现时的重要契约字段，不建议随意删改。

### 5.2 `docker-compose.yml` 目前更像模板骨架

当前各服务目录下的 `docker-compose.yml` 仍保留 `CHANGE_ME_TAG` 占位符，并没有被发布工作流直接回写。结合 `docs/architecture.md` 与 `agents/webhook/protocol.md` 可以推断：

- 现阶段真正被自动维护的是 `deployment.yaml`。
- `docker-compose.yml` 主要提供服务名与镜像结构骨架。
- 未来的拉模式代理更可能以 `deployment.yaml` 为状态输入，再去协调 Compose 服务。

因此，**不要把 Compose 文件中的 tag 视为当前真实部署状态来源。**

### 5.3 `.env.example`

目前各服务目录下的 `.env.example` 只有占位内容，说明本仓库暂未把运行时环境变量治理收口到统一模板中。若后续需要在目标主机维护更多环境变量，可以在这里补齐示例，但要与实际部署方式保持一致。

## 6. 关键配置文件说明

### 6.1 `services/registry.yaml`

当前登记了两个服务，字段含义如下：

- `name`：服务名，对应 `environments/<service>` 目录名。
- `project`：所属项目，目前为 `vibe-kanban`。
- `repository`：源代码仓库。
- `deploy_mode`：当前值为 `compose`。

如果只是做服务盘点、生成目录或做后续服务发现，这个文件更适合被消费。

### 6.2 `config/services.vibe-kanban.json`

这是发布工作流真正依赖的构建配置。对每个服务，至少要维护：

- `service`
- `image_repository`
- `context`
- `dockerfile`
- `build_args`

其中 `platforms` 为可选字段：未配置时回退到工作流中的默认值 `linux/amd64,linux/arm64`；仅当某个服务需要限制构建平台时，才需要显式填写。

当前两个服务的差异点：

- `vibe-kanban-remote` 需要 build arg `VITE_RELAY_API_BASE_URL`
- `vibe-kanban-relay` 不需要额外 build args

当前两个服务默认都继承工作流中的 `linux/amd64,linux/arm64` 双平台设置。

如果新增服务，这个文件通常是第一个要改、也是最容易漏配的地方。

## 7. 本地维护与验证命令

以下命令都在仓库根目录执行。

### 7.1 基础校验

```bash
ruby -e "require 'yaml'; Dir['**/*.yaml'].each { |f| YAML.load_file(f); puts f }"
bash -n scripts/update-deployment-state.sh
bash -n scripts/commit-deployment-state-with-retry.sh
```

对应 GitHub Actions 中的 `validate-deployment-config.yml`。

### 7.2 运行回归测试

```bash
bash tests/prepare-release-matrix.sh
bash tests/commit-deployment-state-with-retry.sh
bash tests/release-workflow.sh
bash tests/update-deployment-state.sh
bash tests/ghcr-references.sh
```

测试覆盖点分别是：

- 构建矩阵生成是否正确
- 部署状态提交流程在并发 push 冲突下是否会基于最新远端状态重算并重试
- 发布工作流是否仍符合 GHCR 方案
- 部署状态更新脚本是否正确改写 YAML
- 仓库中是否仍错误残留旧镜像仓库引用

### 7.3 本地生成发布矩阵

```bash
TARGET_SERVICES='vibe-kanban-remote,vibe-kanban-relay' \
SOURCE_TAG='v1.2.3' \
VIBE_KANBAN_REMOTE_VITE_RELAY_API_BASE_URL='https://relay.example.com' \
ruby scripts/prepare-release-matrix.rb config/services.vibe-kanban.json
```

这个命令很适合在改动 `config/services.vibe-kanban.json` 后快速确认输出是否符合预期。

### 7.4 本地模拟部署状态更新

```bash
SERVICE_NAME='vibe-kanban-remote' \
SOURCE_REF='refs/tags/v1.2.3' \
SOURCE_SHA='abc1234' \
IMAGE_REPOSITORY='ghcr.io/tianweilong/vibe-kanban-remote' \
IMAGE_TAG='v1.2.3' \
./scripts/update-deployment-state.sh
```

这个脚本只负责改写单个 `deployment.yaml`，不负责 Git 提交、push 或并发冲突处理。

建议在临时目录或测试夹具中验证，不要直接对真实环境文件做试验性覆盖。

如果你要本地验证“基于最新 `origin/main` 重算并重试提交”的完整行为，应改为使用：

```bash
RELEASE_MATRIX='{"include":[{"service":"vibe-kanban-remote","image_repository":"ghcr.io/tianweilong/vibe-kanban-remote","tag":"v1.2.3"}]}' \
SOURCE_REF='refs/tags/v1.2.3' \
SOURCE_SHA='abc1234' \
SOURCE_TAG='v1.2.3' \
./scripts/commit-deployment-state-with-retry.sh
```

该脚本会在每次尝试前先同步最新 `origin/main`，重新执行状态写入，并仅在 `git push` 失败时重试。

## 8. GitHub 配置与外部依赖

根据 `README.md` 与 `docs/rollout.md`，当前维护者需要关注以下配置：

### 8.1 仓库 Secrets

- `SOURCE_REPO_TOKEN`

### 8.2 GitHub Token 权限

- `GITHUB_TOKEN` 需要具备 `packages: write`

### 8.3 仓库变量

- 需要配置 `VIBE_KANBAN_REMOTE_VITE_RELAY_API_BASE_URL`

### 8.4 目标部署主机侧要求

- 需要 GHCR 读取权限：PAT classic with `read:packages`
- 需要已执行 `docker login ghcr.io`

### 8.5 npm 发布目标

- 当前 npm 包名固定为 `@vino.tian/vibe-kanban`
- 统一发布 payload 中若包含 `npm`，必须同时提供 `npm_package_name`
- 需要在 `deploy-center` 仓库配置 `NPM_TOKEN`，且该 token 必须是对目标包具备写权限的 granular access token
- npm 发布版本由 `SOURCE_TAG` 按映射规则推导，不要求源码仓库中 `npx-cli/package.json` 的静态版本与 tag 一致

### 8.6 应用仓库触发密钥

应用仓库只需要保留一个触发 `deploy-center` 的窄权限 secret：

- `DEPLOY_CENTER_TRIGGER_TOKEN`

## 9. 常见变更场景

### 9.1 新增一个服务

建议按下面顺序操作：

1. 在 `services/registry.yaml` 增加服务登记。
2. 在 `config/services.vibe-kanban.json` 增加构建配置。
3. 创建一个 `environments/<service>/` 目录。
4. 至少补齐 `README.md`、`.env.example`、`docker-compose.yml`、`deployment.yaml`。
5. 若新服务有额外 build args，确保对应仓库变量也已创建。
6. 视改动范围补充或更新 `tests/*.sh`。
7. 运行基础校验与回归测试。

### 9.2 修改镜像构建逻辑

重点检查这几个位置是否需要同时修改：

- `config/services.vibe-kanban.json`
- `.github/workflows/release-service.yml`
- `tests/prepare-release-matrix.sh`
- `tests/release-workflow.sh`

只改工作流、不改测试，通常会让后续维护者失去对约束的保护。

### 9.3 修改部署状态 schema

如果你修改了 `deployment.yaml` 字段结构，至少要同步考虑：

- `scripts/update-deployment-state.sh` 是否仍能正确写入
- `tests/update-deployment-state.sh` 是否需要扩展断言
- `agents/webhook/protocol.md` 是否仍与状态模型一致

这是最容易产生“工作流能跑，但代理无法消费”的地方。

## 10. 当前边界与维护建议

### 当前边界

- 生产级拉模式代理尚未落地，`agents/webhook/` 目前只有协议定义。
- 本仓库不会构建业务源码以外的部署资产，它只负责编排和状态记录。
- `docker-compose.yml` 目前不是自动回写对象，不能单独代表真实目标版本。

### 维护建议

- 优先把 `deployment.yaml` 视为自动化系统事实来源。
- 让 `config/services.vibe-kanban.json` 与 `services/registry.yaml` 保持同一组服务集合。
- 改动 GHCR、Secrets、仓库变量时，记得同步更新 `README.md` 与 `docs/rollout.md`。
- 改动工作流前先看测试，改完后立即跑测试，避免无约束重构。

## 11. 快速心智模型

如果你只想快速建立整体印象，可以记住下面四句话：

1. **源仓库负责触发，这个仓库负责发布。**
2. **GHCR 镜像 tag 直接等于源仓库正式标签，`latest` 永远跟随最新正式标签。**
3. **`deployment.yaml` 是服务期望状态的核心记录。**
4. **未来代理会围绕这里的状态文件进行拉模式部署。**
