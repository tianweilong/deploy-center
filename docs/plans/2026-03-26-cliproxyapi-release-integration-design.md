# CLIProxyAPI 接入 deploy-center 发布设计

## 背景

`CLIProxyAPI` 当前在源仓库内直接执行镜像构建与发布，`.github` 目录中同时存在 Docker 镜像发布、PR 校验与 release 工作流。目标是收敛为：

- `CLIProxyAPI` 源仓库只负责在 tag 发布时通知 `deploy-center`
- `deploy-center` 统一完成多架构镜像构建与推送
- 镜像名称固定为 `ghcr.io/tianweilong/cli-proxy-api`

## 决策

采用“源仓库触发，deploy-center 构建”的现有模式，不保留源仓库内直接推镜像逻辑。

### 源仓库职责

- 保留一个 tag 触发 workflow
- 通过 `repository_dispatch` 触发 `deploy-center`
- 传递 `source_repository`、`source_ref`、`source_sha`、`source_tag`
- `release_targets` 固定传 `cli-proxy-api`

### deploy-center 职责

- 新增 `config/services.CLIProxyAPI.json`
- 将 `cli-proxy-api` 映射到 `source` 仓库根目录下的 `Dockerfile`
- 继续使用 `release-service.yml` 的通用矩阵与 buildx 构建

## Dockerfile 设计

`CLIProxyAPI/Dockerfile` 改为标准跨平台写法：

- builder 阶段使用 `--platform=$BUILDPLATFORM`
- 通过 `TARGETOS`、`TARGETARCH`、`TARGETVARIANT` 控制 `go build`
- 保持运行时镜像与入口行为不变

这样 `docker/build-push-action` 在 `linux/amd64,linux/arm64` 下即可直接复用同一 Dockerfile。

## `.github` 目录策略

按需求删除 `CLIProxyAPI/.github/` 当前已有内容，包括现存 workflow、`FUNDING.yml`、`ISSUE_TEMPLATE`，改为仅保留 deploy-center 集成所需的单个发布 workflow。

## 风险与边界

- `CLIProxyAPI` 现有 PR 构建与路径守卫会被移除，这是本次需求的明确结果，不做保留。
