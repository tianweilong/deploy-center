# deploy-center 中 vibe-kanban 镜像切换到 GHCR 设计

## 背景

当前 `deploy-center` 为 `vibe-kanban` 提供镜像构建与部署状态记录能力，但现有链路仍绑定腾讯云 CCR：

- `release-service.yml` 通过腾讯云仓库登录并推送镜像；
- `deployment.yaml` 和 `docker-compose.yml` 中镜像仓库地址写死为 `ccr.ccs.tencentyun.com/vino/...`；
- 构建动作通过 `source` 仓库中的 `make push-remote` / `make push-relay` 间接执行。

这带来三个问题：

1. 镜像仓库不在 GitHub 生态内，权限、可见性和审计链路分裂；
2. `deploy-center` 只是转发 `vibe-kanban/Makefile`，并不真正拥有构建编排；
3. workflow 的服务差异通过 shell `case` 堆叠，后续扩展可维护性较差。

本次调整目标是把 `vibe-kanban` 的镜像发布统一迁移到 GitHub Container Registry，并让 `deploy-center` 成为自描述、自执行的发布编排中心。

## 目标

- 将 `vibe-kanban-remote` 与 `vibe-kanban-relay` 的镜像仓库改为：
  - `ghcr.io/tianweilong/vibe-kanban-remote`
  - `ghcr.io/tianweilong/vibe-kanban-relay`
- `deploy-center` 的发布流程不再依赖 `vibe-kanban/Makefile`。
- 发布镜像仅支持部署所需平台：`linux/amd64` 与 `linux/arm64`。
- GHCR 包保持私有可见性。
- 部署状态文件、compose 模板与文档全部改为 GHCR 语义。

## 非目标

- 不修改 `vibe-kanban/Makefile`；
- 不引入 `darwin/arm64` 部署镜像；
- 不在本次迁移中扩展到 `vibe-kanban` 以外的项目；
- 不实现服务器侧 GHCR 登录自动化，只在文档中说明部署机需配置只读 PAT。

## 方案对比

### 方案一：保留单 job，直接把 shell 中的 `make` 替换为 `docker buildx build`

优点：改动最小。

缺点：workflow 仍是大量内联 shell，服务差异与构建参数继续分散在脚本里，可维护性不佳。

### 方案二：`prepare / build / update-state` 三段式 job，但服务配置仍写死在 workflow 中

优点：状态更新和构建解耦，结构比现状清晰。

缺点：服务清单仍埋在 workflow 内，后续增加服务仍需编辑 job 脚本。

### 方案三：`prepare / build / update-state` 三段式 job，服务差异收敛到清单文件（采用）

优点：

- `deploy-center` 自己管理服务构建事实；
- workflow 只负责读取清单、构造 matrix、执行通用构建；
- 后续新增服务仅需补充清单项与部署描述；
- 最符合“构建编排中心”的定位。

代价：需要新增一个小型配置文件，并稍微增加 workflow 的解析逻辑。

## 架构设计

### 1. 服务清单

新增 `config/services.vibe-kanban.json`，只描述构建事实，不描述部署状态。每个服务项包含：

- `service`：服务名，如 `vibe-kanban-remote`；
- `image_repository`：GHCR 镜像仓库地址；
- `context`：构建上下文目录，当前统一为 `source`；
- `dockerfile`：相对 `source` 的 Dockerfile 路径；
- `platforms`：固定为 `linux/amd64,linux/arm64`；
- `build_args`：需要传入的构建参数列表。

其中：

- `vibe-kanban-remote` 使用 `crates/remote/Dockerfile`，需要 `VITE_RELAY_API_BASE_URL`；
- `vibe-kanban-relay` 使用 `crates/relay-tunnel/Dockerfile`，无需额外构建参数。

清单采用 JSON，是因为 GitHub Actions 的 `fromJSON()` 可直接消费，无需再引入额外 YAML/JSON 解析器。

### 2. 发布 workflow

`release-service.yml` 调整为三段式：

#### prepare

职责：

- 归一化 `repository_dispatch` / `workflow_dispatch` 输入；
- 校验 `SOURCE_REPOSITORY`、`SOURCE_REF`、`SOURCE_SHA`、`TARGET_ENVIRONMENT`、`TARGET_SERVICES`；
- 读取服务清单，过滤本次要发布的服务；
- 对 `vibe-kanban-remote` 强制校验环境变量 `VIBE_KANBAN_REMOTE_VITE_RELAY_API_BASE_URL`；
- 产出 matrix JSON，供后续 `build` job 使用。

失败策略：任何输入或清单不合法，立即终止，不触发构建。

#### build

职责：

- checkout `deploy-center` 与 `source` 仓库；
- 配置 SSH agent，支持私有依赖；
- 配置 `docker/setup-qemu-action` 与 `docker/setup-buildx-action`；
- 使用 workflow 的 `GITHUB_TOKEN` 登录 `ghcr.io`；
- 根据 matrix 使用 `docker/build-push-action` 直接构建并推送镜像。

关键约束：

- job permission 增加 `packages: write`；
- 平台固定为 `linux/amd64,linux/arm64`；
- 镜像 tag 使用 `${SOURCE_SHA}`；
- `fail-fast` 设为 `false`，便于一次看到所有服务的失败情况。

这一步不再调用 `make push-remote` 或 `make push-relay`，`deploy-center` 直接依据清单和 Dockerfile 执行构建。

#### update-state

职责：

- 仅在全部 `build` 成功后执行；
- 更新目标环境下已发布服务的 `deployment.yaml`：
  - `source.ref`
  - `source.sha`
  - `image.repository`
  - `image.tag`
- 提交并推送 `environments/` 变更。

这样可以保证“镜像发布成功”与“状态入库成功”有清晰边界，避免当前边构建边修改仓库状态造成的耦合。

## 镜像与权限模型

### 发布端

- `deploy-center` workflow 使用 `GITHUB_TOKEN` 登录 `ghcr.io`；
- 对应 workflow/job 需要 `packages: write` 权限；
- 目标镜像仓库：
  - `ghcr.io/tianweilong/vibe-kanban-remote`
  - `ghcr.io/tianweilong/vibe-kanban-relay`

若 GHCR 包首次创建后未自动关联到 `deploy-center` 仓库，需要在 GitHub Packages 设置中显式为该仓库授予写权限。

### 拉取端

由于镜像保持 private，部署机不能使用 workflow 的 `GITHUB_TOKEN` 拉取镜像。部署机需要：

- 一个 PAT classic；
- 至少具备 `read:packages` 权限；
- 通过 `docker login ghcr.io` 完成认证。

本次变更只更新文档与镜像地址，不在 `deploy-center` 中实现部署机认证自动化。

## 部署描述文件策略

### deployment.yaml

继续作为发布状态真源，每次发布后更新：

- `source.ref`
- `source.sha`
- `image.repository`
- `image.tag`

`image.tag` 继续使用 `SOURCE_SHA`，保持与源码版本的一一对应关系，便于回滚与审计。

### docker-compose.yml

Compose 模板只做一次性迁移：

- 将镜像仓库地址从腾讯云改为 GHCR；
- 保留 `CHANGE_ME_TAG` 模板值不变。

后续常规发布不再修改 compose 文件，只修改 `deployment.yaml`。这样 compose 文件继续表达部署拓扑，deployment 描述文件继续表达当前生效版本。

## 错误处理与幂等性

- `prepare` 失败：无镜像推送、无状态更新；
- 单个 `build` 失败：允许其他服务构建结果保留在 GHCR，但 `update-state` 不执行；
- `update-state` 失败：已推送镜像不回滚，只报告状态提交失败；
- 同一 `SOURCE_SHA` 重复运行：会生成相同 tag 的镜像引用，状态文件更新是幂等的。

这种策略优先保证部署状态不会指向不存在的镜像；即使 GHCR 中存在“未被引用的失败尝试产物”，也不会影响当前环境。

## 测试与验证设计

### 静态验证

- 检查 workflow 语法与关键字段：
  - 使用 `ghcr.io` 登录；
  - 包含 `packages: write`；
  - 使用 `docker/build-push-action`；
  - 平台为 `linux/amd64,linux/arm64`。
- 检查部署描述与 compose 模板已切到 GHCR；
- 检查文档不再引用腾讯云 secrets。

### 运行期验证

- 对指定 tag 执行 `docker buildx imagetools inspect ghcr.io/tianweilong/<service>:<sha>`，确认 manifest 同时含 `linux/amd64` 与 `linux/arm64`；
- 在部署机文档中给出 `docker login ghcr.io` 和镜像拉取前提；
- 对 `update-deployment-state.sh` 的行为做一次脚本级验证，确保目标字段被正确写入。

## 涉及文件

预计会修改或新增以下文件：

- 新增 `deploy-center/config/services.vibe-kanban.json`
- 修改 `deploy-center/.github/workflows/release-service.yml`
- 修改 `deploy-center/README.md`
- 修改 `deploy-center/docs/rollout.md`
- 修改 `deploy-center/environments/dev/vibe-kanban-remote/deployment.yaml`
- 修改 `deploy-center/environments/dev/vibe-kanban-remote/docker-compose.yml`
- 修改 `deploy-center/environments/dev/vibe-kanban-relay/deployment.yaml`
- 修改 `deploy-center/environments/dev/vibe-kanban-relay/docker-compose.yml`
- 修改 `deploy-center/environments/prod/vibe-kanban-remote/deployment.yaml`
- 修改 `deploy-center/environments/prod/vibe-kanban-remote/docker-compose.yml`
- 修改 `deploy-center/environments/prod/vibe-kanban-relay/deployment.yaml`
- 修改 `deploy-center/environments/prod/vibe-kanban-relay/docker-compose.yml`
- 视实现方式决定是否修改 `deploy-center/scripts/update-deployment-state.sh`

## 风险与缓解

### GHCR 包权限未自动关联

风险：workflow 能登录但推送被拒绝。

缓解：在文档中明确包与仓库权限检查项；首次启用后优先跑一次手动发布验证。

### source 仓库 Dockerfile 未来变更

风险：服务清单中的 Dockerfile 路径或 build args 与 `vibe-kanban` 实际构建要求漂移。

缓解：清单只存放最小必要信息；如新增构建参数，由 `deploy-center` 明确同步更新，不再依赖 `Makefile` 间接继承。

### 私有镜像拉取失败

风险：部署机未完成 `ghcr.io` 登录。

缓解：在 rollout 文档中明确 PAT classic 与 `read:packages` 要求，把部署机认证作为迁移检查项。

## 决策结论

采用“GHCR 私有镜像 + Linux 双架构 + 三段式 workflow + JSON 服务清单”的方案：

- 镜像统一迁移到 `ghcr.io/tianweilong/...`；
- `deploy-center` 直接执行构建，不再依赖 `vibe-kanban/Makefile`；
- 发布 workflow 以服务清单驱动，结构清晰、可扩展；
- 部署状态与镜像构建解耦，失败边界更清晰；
- 部署机通过只读 PAT 拉取私有 GHCR 镜像。
