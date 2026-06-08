# deploy-center 发布逻辑对齐设计

## 背景

`deploy-center` 当前发布工作流由源仓库、发布目标和 npm 参数共同驱动，镜像构建通过多平台矩阵构建 digest 后合并 manifest，npm 发布通过额外输入控制包名、目录、版本策略和 dist-tag。`deploy-center-lindos` 的发布链路更集中：业务仓只发送服务名、源码引用和正式 tag，部署中心根据统一服务配置解析构建事实，再执行镜像构建发布。

本次调整目标是让 `deploy-center` 的构建触发、镜像打包和 npm 发布逻辑向 `deploy-center-lindos` 对齐，但暂不引入 `deploy-center-lindos` 的 candidate release 更新和测试环境部署流程。

## 目标

- 发布触发改为以 `service_name` 为核心，而不是由触发方传入多组构建细节。
- `source_tag` 统一使用 Lindos 风格正式发布 tag：`vYYYY.M.D-tHHmm`，例如 `v2026.4.19-t1116`。
- 禁止 `latest`、`vX.Y.Z`、`2026.04.19.1` 等旧格式作为输入发布 tag。
- 镜像构建只发布到 GHCR，构建成功后同时推送 `${SOURCE_TAG}` 和 `latest` 两个 tag。
- npm 发布版本与正式发布 tag 保持语义一致：`v2026.4.19-t1116` 映射为 npm version `2026.4.19-t1116`。
- npm 发布显式使用 `--tag latest`，使 `npm install <pkg>` 默认安装最新 calendar 版本。
- 保留现有 npm 轻量包、平台资产、GitHub Release 和 Trusted Publishing 能力。

## 非目标

- 不引入 `releases/candidates` 更新。
- 不触发测试环境部署。
- 不实现 ACR 或其他外部镜像仓库 mirror。
- 不重构业务仓 release-tag-dispatch 工作流之外的 CI 流程。
- 不改变已发布 npm 包名、镜像仓库名或外部协议字段含义。

## 方案比较

### 方案 A：最小补丁

只在现有 `release_targets` 模式上增加 tag 校验、镜像 latest tag 和 npm calendar 版本策略。该方案改动小，但继续保留触发方传构建细节的模式，后续会继续偏离 Lindos 的中心化配置模型。

### 方案 B：完整搬迁 Lindos 流程

完整引入 Lindos 的请求解析、GHCR 构建、ACR mirror、candidate 更新和 test 部署。该方案一致性最高，但超出当前需求，且会引入 `deploy-center` 暂不需要的部署状态管理。

### 方案 C：推荐方案

采用 Lindos 的触发与解析模型，保留 `deploy-center` 自有 npm 发布扩展。统一由 `service_name` 和 `config/services.yaml` 解析构建事实；镜像只推 GHCR；npm 从服务配置解析发布上下文。该方案对齐核心逻辑，同时避免引入暂不需要的 candidate/deploy-test 复杂度。

## 发布触发契约

`repository_dispatch` 和 `workflow_dispatch` 的核心输入统一为：

- `service_name`：发布服务标识。
- `source_ref`：源码引用，通常为 `refs/tags/<source_tag>`。
- `source_sha`：源码提交 SHA。
- `source_tag`：正式发布 tag，必须匹配 `vYYYY.M.D-tHHmm`。

触发方不再传入镜像仓库、构建上下文、Dockerfile、npm 包名、npm 包目录或 npm 版本策略等服务静态事实。这些信息由 `deploy-center` 的服务配置维护。

## 服务配置模型

新增统一配置文件 `config/services.yaml`，以服务名为 key。基础字段对齐 Lindos：

- `sourceRepository`：业务源码仓库。
- `buildContext`：Docker build context。
- `dockerfilePath`：Dockerfile 路径。
- `ghcrImageRepository`：GHCR 目标镜像仓库。
- `defaultPlatforms`：默认构建平台列表。
- `buildArgs`：静态或环境变量映射的 Docker build args。
- `releaseMode`：可选，默认 `managed`，支持 `build-only`。
- `publishMode`：可选，当前只支持 `ghcr-only`。

npm 服务额外支持：

- `npmPackageName`：npm 包名。
- `npmPackageDir`：源码仓内 npm 包目录。
- `npmVersionStrategy`：当前新增并推荐 `calendar_tag`。
- `npmDistTag`：默认 `latest`。
- `npmPlatforms`：可选，覆盖默认 npm 平台矩阵。

服务可以同时具有镜像发布能力和 npm 发布能力。是否执行镜像构建、npm 发布由服务配置中的能力字段决定，而不是由触发 payload 中的 `release_targets` 决定。

## 请求解析

新增解析层，职责是读取 payload 和 `config/services.yaml`，输出 workflow 所需上下文。

解析规则：

- 校验 `service_name` 存在于配置。
- 校验 `source_ref`、`source_sha`、`source_tag` 非空。
- 校验 `source_tag` 匹配 `\Av\d{4}\.\d{1,2}\.\d{1,2}-\d{4}\z`。
- 拒绝 `latest`、`v1.2.3`、`2026.04.19.1` 等非标准 tag。
- 镜像 tag 等于原始 `source_tag`。
- npm version 由 `calendar_tag` 解析为去掉前导 `v` 的版本号。
- npm dist-tag 默认补齐为 `latest`。
- 对缺失的服务必填字段给出明确中文错误。

解析输出供 workflow job 使用，不让业务仓重复传入静态构建事实。

## 镜像构建与发布

镜像构建 workflow 改为单一 `build-and-push-ghcr` 链路：

1. checkout `deploy-center`。
2. 解析发布请求。
3. 使用 GitHub App token checkout 源码仓。
4. 设置 Docker Buildx。
5. 按服务配置执行 Docker build。
6. 推送 `${ghcrImageRepository}:${SOURCE_TAG}`。
7. 构建成功后同时推送 `${ghcrImageRepository}:latest`。

当前不做 ACR mirror。`latest` 只作为输出 tag，不允许作为输入 `source_tag`。

多架构镜像继续由服务配置的 `defaultPlatforms` 控制。若服务只需单架构，可配置为 `linux/amd64`。若需要多架构，使用 Buildx 一次性 push 多平台 manifest，并同时带 `${SOURCE_TAG}` 和 `latest` 两个 tag。

## npm 发布

npm 继续使用现有 Node 脚本体系：准备发布输入、构建平台资产、创建 GitHub Release、Trusted Publishing 发布轻量包。

新增 `calendar_tag` 版本策略：

- 输入：`source_tag = v2026.4.19-t1116`。
- npm version：`2026.4.19-t1116`，即 `source_tag` 去掉前导 `v`。
- GitHub Release tag 和资产命名仍可继续使用包含 `v` 的 `source_tag`，保持与正式发布 tag 对齐。

发布时必须显式传 `--tag latest`。该版本在 npm 语义中属于 prerelease；不显式设置 dist-tag 时 npm 会拒绝发布。使用 `latest` 是明确产品选择：内部工具希望 `npm install <pkg>` 默认获得最新 calendar 版本。

npm 发布输入不再来自 dispatch payload，而是来自服务配置和请求解析结果。

## 兼容与迁移

推荐第一版直接切到新触发模型，移除旧 `release_targets` 主路径，避免两套入口长期并存。

需要迁移的内容：

- 将现有 `config/services.*.json` 合并或迁移到 `config/services.yaml`。
- 将业务仓触发 workflow 统一改为发送 `service_name`、`source_ref`、`source_sha`、`source_tag`。
- 将旧 npm 输入项迁移到服务配置。
- 更新文档，说明 tag 格式、镜像 latest tag 和 npm latest dist-tag 语义。

如需临时兼容旧入口，可只保留为显式 legacy 分支，并在测试中确保新入口为默认路径。但本设计不推荐长期保留 legacy 行为。

## 错误处理

- 缺少必填 payload 字段时立即失败，并输出具体字段名。
- 未知服务名立即失败。
- tag 格式不合法立即失败，错误信息说明必须匹配 `vYYYY.M.D-tHHmm`。
- 配置中缺少镜像或 npm 必填字段时立即失败。
- npm calendar 版本发布时若没有 dist-tag，解析层补齐 `latest`；发布脚本仍应校验最终 dist-tag 非空。
- Docker build 成功但 push 失败时 workflow 失败，不更新任何外部部署状态。

## 测试与验证

需要更新或新增以下测试：

- resolver 测试：合法 payload 解析为源码仓、构建上下文、GHCR 仓库、平台、npm 上下文。
- tag 校验测试：接受 `v2026.4.19-t1116`，拒绝 `latest`、`v1.2.3`、`2026.04.19.1` 和空值。
- workflow contract 测试：确认使用 `service_name`、统一配置和 `build-and-push-ghcr`，不包含 ACR mirror、candidate update 或 deploy-test。
- 镜像发布测试：确认 workflow 包含 `${SOURCE_TAG}` 和 `latest` 两个 GHCR tag。
- npm 版本测试：`calendar_tag` 将 `v2026.4.19-t1116` 解析为 `2026.4.19-t1116`。
- npm 发布测试：确认 publish 参数包含 `--tag latest`，且不依赖旧 dispatch npm 输入。
- 旧行为移除测试：不再允许 `latest` 或 `vX.Y.Z` 作为输入 `SOURCE_TAG`。

本地验证建议先运行现有 Node 测试，再运行 workflow contract 测试。若实现涉及 GitHub Actions YAML，应同步运行相关脚本语法校验。

## 开放问题

当前设计没有未决实现问题。若后续需要 ACR mirror 或 candidate 发布，应作为独立设计补充，不纳入本次改造。
