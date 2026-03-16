# release-service npm 支持 Linux 与 Windows 平台设计

## 背景

当前 `deploy-center/.github/workflows/release-service.yml` 中的 npm 发布链路只有一个 `release-npm` job，运行在 `macos-15` 上，并直接调用 `scripts/release-npm-package.sh` 完成“安装依赖、构建、打包、检查版本、发布”整套流程。

这套实现有两个明显限制：

- 只在单一 macOS Runner 上执行，无法原生产出 Linux 与 Windows 平台制品。
- 构建和发布耦合在同一个 job 中，无法保证多个平台都成功产出后再统一发布。

本次需求要求 npm 包发布时支持 Linux 和 Windows 平台。结合用户确认，Windows 平台以 64 位为目标，即 `win32-x64`。

## 目标

- 将 npm 发布链路从“单个 macOS job 直接发布”调整为“Linux / Windows 分平台构建，统一汇总后一次发布”。
- 默认至少支持以下 npm 平台目标：
  - `linux-x64`
  - `win32-x64`
- 保持现有外部输入协议不变，不修改 `NPM_PACKAGE_NAME`、`NPM_PACKAGE_DIR`、`NPM_VERSION_STRATEGY` 等字段名。
- 继续使用 Trusted Publishing 完成最终发布，不回退到长期 token。
- 尽量复用现有 `scripts/release-npm-package.sh` 中的版本计算与打包逻辑，避免在 workflow 中复制业务规则。

## 方案对比

### 方案一：多平台 matrix 构建，单独 job 统一发布

- `prepare` 额外产出 npm 平台矩阵。
- 新增 `release-npm-build` job，在 `ubuntu-latest` 和 `windows-latest` 上分别构建对应平台产物。
- 新增 `release-npm-publish` job，下载所有构建产物并执行一次 `npm publish`。

优点：

- 平台边界清晰，Linux 与 Windows 都在原生 runner 上构建。
- 可以保证“所有平台都成功”后再发布，避免 npm 上出现半套产物。
- 发布权限只集中在最终 job，安全边界更清楚。

缺点：

- 需要拆分现有脚本职责，增加 artifact 上传与下载步骤。
- workflow 结构比当前单 job 更复杂。

### 方案二：单一 runner 上交叉编译 Linux 与 Windows 制品

- 保留单个 `release-npm` job。
- 在一个 runner 上通过交叉编译产出多平台包后直接发布。

优点：

- workflow 表面上更简单。

缺点：

- 强依赖源码仓库构建脚本是否支持稳定交叉编译。
- 若包含 Rust 或平台相关二进制，失败概率和排查成本都更高。
- 与“在目标平台上原生构建”的原则相悖。

### 方案三：只把 workflow 改成多平台 runner，继续发布单一通用包

优点：

- 改动最小。

缺点：

- 不能真正满足“发布时支持 Linux 和 Windows 平台”的目标。
- 只是调整执行环境，不是调整产物结构。

## 选型

采用 **方案一**。

理由：

- 这是唯一既满足“同一次发布包含 Linux 和 Windows 平台产物”，又不强依赖交叉编译的方案。
- 当前工作流已经有 `prepare -> build -> update-state` 的分阶段结构，再为 npm 链路拆成“构建”和“发布”两个阶段，符合现有 workflow 风格。
- Trusted Publishing 只需要放在最终发布阶段，职责更单一，也更容易测试。

## 设计细节

### 工作流结构

- `prepare` job 保留现有服务矩阵输出，同时新增 npm 平台矩阵输出，格式采用 `matrix.include` 风格，便于后续直接 `fromJSON(...)` 使用。
- 现有 `release-npm` job 拆成两个 job：
  - `release-npm-build`
  - `release-npm-publish`
- `release-npm-build` 只在 `needs.prepare.outputs.has_npm == 'true'` 时运行，并使用 npm 平台矩阵展开。
- `release-npm-publish` 依赖全部 `release-npm-build` 实例成功后再执行。

### npm 平台矩阵

首版矩阵固定包含两个目标：

- `ubuntu-latest` / `linux` / `x64`
- `windows-latest` / `win32` / `x64`

这样可以覆盖本次明确需求，同时避免把 `arm64`、macOS 等额外平台一起引入，导致范围扩大。

### 脚本职责拆分

当前 `scripts/release-npm-package.sh` 同时负责：

- 版本计算
- 安装依赖
- 构建
- 修改包版本
- `npm pack`
- 版本是否已存在检查
- `npm publish`

为支持多平台构建，需要将它拆成可组合的两种模式：

1. 构建模式
   - 安装依赖
   - 执行 `pnpm run build:npx`
   - 写入平台版本
   - 生成该平台的 `tgz`
   - 输出产物路径与发布版本

2. 发布模式
   - 汇总已下载的多平台制品
   - 检查目标版本是否已存在
   - 执行一次 `npm publish`

实现上不强制拆成两个脚本；也可以保留单脚本，通过环境变量或子命令切换模式。重点是避免把版本计算逻辑在 workflow 中重复写一遍。

### 平台信息传递

`release-npm-build` 需要把平台信息显式传给源码构建过程。建议由 workflow 注入如下环境变量：

- `TARGET_OS`
- `TARGET_ARCH`

`deploy-center` 不在这里写死源码仓库内部目录结构，只负责把平台元数据传下去。如果源码仓库已有既定变量名，则在实现阶段对齐现有约定。

### Artifact 约定

- 每个平台构建完成后上传独立 artifact，命名中包含 `TARGET_OS` 与 `TARGET_ARCH`，避免覆盖。
- `release-npm-publish` 下载全部 artifact 到统一目录后再汇总。
- 若未来源码仓库已采用 npm workspaces 或自定义输出目录，本次仍以“上传最终 `tgz` 文件”为边界，不传递整个构建目录，尽量减少 artifact 体积。

### 失败处理

- 任一 `release-npm-build` 失败，`release-npm-publish` 不执行。
- 若 `npm view "${package}@${version}"` 已存在，则最终发布 job 直接跳过发布，并输出中文提示。
- 若 artifact 缺失或数量不完整，最终发布 job 直接失败，避免发布半套平台包。

### 权限与安全边界

- 顶层继续保留 `id-token: write`，供 Trusted Publishing 使用。
- 只有 `release-npm-publish` 持有真正的发布步骤。
- `release-npm-build` 不执行 `npm publish`，只构建并上传 artifact。

### 文档与测试

- 更新 `tests/release-workflow.sh`
  - 断言 `release-npm` 已拆成构建 job 与发布 job。
  - 断言 workflow 中存在 `windows-latest` 与 `ubuntu-latest` 的 npm 平台矩阵。
  - 断言只有最终发布 job 执行发布命令。
- 更新 `tests/npm-release-workflow.sh`
  - 断言脚本支持“构建但不发布”的模式。
  - 断言脚本支持“仅发布已准备产物”的模式，或等价的子命令 / 开关。
- 更新 `docs/developer-guide.md`
  - 将 2026-03-15 仍描述为“自托管 macOS / 单 job 发布”的内容改成 Linux / Windows 分平台构建。

## 影响范围

- 工作流：`.github/workflows/release-service.yml`
- 脚本：`scripts/release-npm-package.sh`
- 测试：`tests/release-workflow.sh`、`tests/npm-release-workflow.sh`
- 文档：`docs/developer-guide.md`

## 不做事项

- 不修改现有 dispatch 输入字段或环境变量名。
- 不在本次引入 Windows ARM64、Linux ARM64 或 macOS 平台 npm 构建。
- 不回退到 `NPM_TOKEN` 或混用 token 与 Trusted Publishing。
- 不改造源码仓库的发布协议，只在 `deploy-center` 侧提供清晰的平台矩阵和构建 / 发布编排能力。
