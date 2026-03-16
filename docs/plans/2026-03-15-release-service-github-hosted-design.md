# release-service 切回 GitHub Hosted Runner 与 Trusted Publishing 设计

## 背景

当前 `release-service` 工作流中：

- 服务镜像构建 `build` job 运行在 `self-hosted Linux ARM64`。
- npm 发布 `release-npm` job 运行在 `self-hosted macOS ARM64`。
- npm 发布脚本 `scripts/release-npm-package.sh` 依赖 `NODE_AUTH_TOKEN`，工作流已移除 `id-token: write`。

用户的目标有两个：

1. 将当前项目所有构建执行环境调整为 GitHub Hosted Runner。
2. 将 npm 发包方式从 `NPM_TOKEN` 切回 Trusted Publishing。

额外约束是，仓库后续计划切换为 public，希望尽量使用 GitHub 对 public 仓库提供的免费标准 Runner 配额。

## 官方约束

基于 2026-03-15 查到的官方文档：

- GitHub standard hosted runner 在 public 仓库上可免费使用，包含 `ubuntu-latest` 与 `macos-15`。
- `macos-15-xlarge` 属于 larger runner，即使 public 仓库也按分钟计费。
- npm Trusted Publishing 在 GitHub Actions 上要求使用 GitHub-hosted runner，并要求工作流具备 `id-token: write`。
- npm Trusted Publishing 不再需要长期 `NPM_TOKEN`；在符合条件时，`npm publish` 会自动生成 provenance，不需要额外传 `--provenance`。

## 方案对比

### 方案一：全部切回标准 GitHub Hosted Runner

- `build` 使用 `ubuntu-latest`
- `release-npm` 使用 `macos-15`
- 恢复 `id-token: write`
- 发布脚本移除 `NODE_AUTH_TOKEN` 强依赖

优点：

- 与“public 仓库免费配额”目标完全一致。
- 满足 npm Trusted Publishing 对 GitHub-hosted runner 的要求。
- 改动面小，基本只涉及 workflow 与发布脚本。

缺点：

- `macos-15` 资源低于 `macos-15-xlarge`，若后续构建变重，发布耗时可能增加。

### 方案二：Linux 用标准 Runner，macOS 继续 larger runner

- `build` 使用 `ubuntu-latest`
- `release-npm` 使用 `macos-15-xlarge`
- 恢复 Trusted Publishing

优点：

- 保持较强 macOS 构建资源。

缺点：

- 不符合 public 仓库免费配额目标。
- larger runner 成本会持续存在。

### 方案三：继续自托管 runner，仅恢复 Trusted Publishing

优点：

- 改动最小。

缺点：

- npm 官方文档明确说明 Trusted Publishing 不支持 self-hosted runner。
- 不符合用户希望全部切到 GitHub Hosted Runner 的目标。

## 选型

采用 **方案一**。

理由：

- 这是唯一同时满足“GitHub Hosted Runner”“public 仓库免费配额”“Trusted Publishing 官方要求”三项约束的方案。
- 当前工作流规模不大，`ubuntu-latest` 与 `macos-15` 足以先完成迁移；如果未来性能不足，再基于真实耗时数据决定是否升级。

## 设计细节

### Runner 调整

- `prepare` 保持 `ubuntu-latest`
- `build` 从 `[self-hosted, Linux, ARM64]` 改为 `ubuntu-latest`
- `update-state` 保持 `ubuntu-latest`
- `release-npm` 从 `[self-hosted, macOS, ARM64]` 改为 `macos-15`

### npm 发布链路调整

- 在工作流顶层恢复 `permissions.id-token: write`
- 删除 `release-npm` job 中注入的 `NODE_AUTH_TOKEN`
- 保持发布命令仍由 `scripts/release-npm-package.sh` 驱动
- 发布脚本改为不再校验 `NODE_AUTH_TOKEN`
- 保持 `npm publish "$PACKAGE_FILE" --access public`，依赖 npm Trusted Publishing 在 GitHub-hosted runner 上完成认证

### 文档与测试

- 更新 `tests/release-workflow.sh`
  - 断言 workflow 恢复 `id-token: write`
  - 断言不再使用 self-hosted runner
  - 断言 npm job 使用 `macos-15`
  - 断言 workflow 中不再引用 `NODE_AUTH_TOKEN`
- 更新 `tests/npm-release-workflow.sh`
  - 断言脚本不再要求 token
  - 断言 workflow 仍保留 npm 发布入口
- 视需要补充说明文档，避免后续再次误切到 larger runner 或 token 方案

## 错误处理

- 若 npm Trusted Publisher 尚未在 npm 包设置中完成绑定，`npm publish` 会在 GitHub Actions 中报认证错误。
- 若仓库尚未公开，Trusted Publishing 依然可以工作，但 provenance 不会自动生成。这是 npm 官方已知限制，不影响发布本身。
- 若 `macos-15` 资源不足导致构建超时，可后续再评估拆分构建步骤或调优构建脚本，但本次不提前复杂化。

## 不做事项

- 不修改现有工作流输入参数、环境变量名、包名、包目录与版本策略字段。
- 不引入 larger runner。
- 不保留 `NPM_TOKEN` 与 Trusted Publishing 的双轨回退逻辑。
- 不改造 npm Trusted Publisher 的 npmjs.com 后台配置，本次只调整仓库内工作流与脚本。
