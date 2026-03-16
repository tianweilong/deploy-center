# release-service workflow 公共步骤抽取设计

## 背景

当前 [`.github/workflows/release-service.yml`](/var/folders/qf/rqhtjpgj4rqcgzvcktbyskch0000gn/T/vibe-kanban/worktrees/146b-workflow/deploy-center/.github/workflows/release-service.yml) 已逐步承载服务镜像构建、部署状态更新、npm 多平台资产构建、GitHub Release 分发与 npm 发布等完整流程。随着能力增加，workflow 内部出现了多处重复的“环境准备”步骤，主要包括：

- 多个 job 重复执行当前仓库与源仓库的双 checkout
- npm 相关 job 重复执行 Node、pnpm、cache、npm 升级
- 多个平台 runner 信息打印逻辑直接内联在 workflow 中

这些重复步骤已经开始淹没真正重要的发布编排逻辑，影响可读性。但如果把矩阵生成、输入校验、发布动作也一起抽走，又会让 workflow 变成难以排障的黑盒。

## 目标

- 保留 `release-service.yml` 对发布编排的可读性和可审查性。
- 只抽取稳定、重复、边界清晰的公共步骤为 composite action。
- 不修改现有环境变量名、脚本入口、矩阵结构和发布语义。
- 为后续同类 workflow 提供可复用的 action 基础。

## 非目标

- 不抽取 `prepare` job 中的输入校验、目标解析和矩阵生成逻辑。
- 不抽取真正的发布动作，例如 `docker/build-push-action`、`gh release create/upload`、`./scripts/release-npm-package.sh source`。
- 不引入 reusable workflow；本次只使用仓库内 composite action。
- 不改变现有 runner 类型、工具版本、脚本参数或 job 拓扑。

## 方案对比

### 方案一：只抽 checkout

只把双 checkout 封装为 composite action，其余步骤继续内联在 workflow 中。

优点：

- 风险最低
- 改动最小
- debug 时几乎没有额外跳转成本

缺点：

- workflow 体积下降有限
- npm 环境准备和 runner 信息打印仍然重复

### 方案二：抽 checkout + Node/pnpm 环境准备

把双 checkout 与 npm 环境准备分别抽成两个 composite action，runner 信息仍保留在 workflow 中。

优点：

- 能明显减少重复步骤
- 仍然保留关键日志步骤在 workflow 中

缺点：

- 平台日志块仍然占据较多行数
- 结构不够统一，部分“公共步骤”抽取，部分仍内联

### 方案三：抽 checkout + Node/pnpm 环境准备 + runner 信息打印

新增 3 个 composite action，把所有稳定公共步骤下沉；workflow 继续只保留业务编排与发布动作。

优点：

- 在保证可读性的前提下，最大幅度削减样板代码
- 三类 action 都属于环境准备，边界清晰，复用价值高
- 主 workflow 更聚焦于“准备 -> 构建 -> 更新状态 -> 分发 -> 发布”的主线

缺点：

- 查看 runner 诊断命令时需要跳转到 action 文件
- 首次引入多个 composite action，改动面大于方案一和方案二

## 选型

采用 **方案三**。

理由：

- 用户要求“优先保留 workflow 可读性、只抽最稳定的公共步骤”，并明确希望再加入 `print-runner-info`。
- 本次要抽取的 3 类步骤都不承载业务决策，属于稳定的执行骨架，适合收敛到 composite action。
- 相比继续内联日志块，统一到 action 中后，主 workflow 的结构更紧凑，也更适合作为发布总览阅读。

## 设计细节

### 1. `checkout-source` composite action

位置： [`.github/actions/checkout-source/action.yml`](/var/folders/qf/rqhtjpgj4rqcgzvcktbyskch0000gn/T/vibe-kanban/worktrees/146b-workflow/deploy-center/.github/actions/checkout-source/action.yml)

职责：

- checkout 当前仓库
- checkout 源仓库到指定目录，默认仍使用 `source`

建议输入：

- `repository`
- `ref`
- `path`
- `token`
- `fetch-depth`

使用位置：

- `build`
- `release-npm-assets`
- `release-github-release`
- `release-npm`

保留事项：

- `prepare` 和 `update-state` 只 checkout 当前仓库，不使用该 action
- 现有 `SOURCE_REPOSITORY`、`SOURCE_SHA`、`SOURCE_REPO_TOKEN` 保持不变

### 2. `setup-node-pnpm` composite action

位置： [`.github/actions/setup-node-pnpm/action.yml`](/var/folders/qf/rqhtjpgj4rqcgzvcktbyskch0000gn/T/vibe-kanban/worktrees/146b-workflow/deploy-center/.github/actions/setup-node-pnpm/action.yml)

职责：

- 安装 Node.js
- 安装 pnpm
- 计算并导出 `STORE_PATH`
- 配置 pnpm store cache
- 升级 npm 以满足 Trusted Publishing 要求

建议输入：

- `node-version`
- `pnpm-version`
- `lockfile-path`
- `npm-version`

使用位置：

- `release-npm-assets`
- `release-npm`

保留事项：

- 仍然由 workflow 在业务 step 中决定 `NODE_OPTIONS`、`BUILD_ONLY` 等环境变量
- `lockfile-path` 继续使用 `source/pnpm-lock.yaml`
- 不把 `release-npm-package.sh` 调用封装进去

### 3. `print-runner-info` composite action

位置： [`.github/actions/print-runner-info/action.yml`](/var/folders/qf/rqhtjpgj4rqcgzvcktbyskch0000gn/T/vibe-kanban/worktrees/146b-workflow/deploy-center/.github/actions/print-runner-info/action.yml)

职责：

- 根据输入的 `target-os` 输出对应 runner 的诊断信息

建议输入：

- `target-os`

分支行为：

- `linux`
  - 输出 `RUNNER_OS`、`RUNNER_ARCH`、`RUNNER_NAME`
  - 输出 `uname -a`、`lscpu`、`free -h`、`df -h`
  - 输出 `docker version`、`docker buildx version`
- `win32`
  - 输出 `RUNNER_*`
  - 输出 `Get-ComputerInfo`、`Get-CimInstance`、`Get-PSDrive`
  - 输出 `node --version`、`npm --version`
- `darwin`
  - 输出 `RUNNER_*`
  - 输出 `sw_vers`、`sysctl -n machdep.cpu.brand_string`、`sysctl -n hw.ncpu`、`sysctl -n hw.memsize`、`df -h`
  - 输出 `node --version`、`npm --version`

使用位置：

- `build` 传入 `linux`
- `release-npm-assets` 传入 `${{ matrix.target_os }}`

保留事项：

- `release-npm` 当前不打印 runner 信息，本次不额外扩展
- 日志内容保持与当前 workflow 等价，不额外裁剪

## workflow 调整边界

保留在 [`.github/workflows/release-service.yml`](/var/folders/qf/rqhtjpgj4rqcgzvcktbyskch0000gn/T/vibe-kanban/worktrees/146b-workflow/deploy-center/.github/workflows/release-service.yml) 中的内容：

- 触发器、输入参数、顶层 `env`、`permissions`
- `prepare` job 的输入校验、发布目标解析、矩阵构建
- 各 job 的 `needs`、`if`、`strategy`
- 具体发布动作和脚本入口

下沉到 composite action 的内容：

- 重复 checkout
- 重复 Node/pnpm 环境准备
- 多平台 runner 信息打印

## 错误处理与兼容性

- `checkout-source` 必须直接透传 token 和 ref，不能重命名任何现有输入来源。
- `setup-node-pnpm` 内部 cache key 必须继续包含 `runner.os`、`runner.arch` 和 lockfile hash，避免缓存行为变化。
- `print-runner-info` 对未知 `target-os` 应失败并输出明确错误，避免静默跳过。
- 所有 action 仅使用现有官方 action 与 shell/pwsh，不新增第三方依赖。

## 测试策略

- 更新 [`.github/workflows/release-service.yml`](/var/folders/qf/rqhtjpgj4rqcgzvcktbyskch0000gn/T/vibe-kanban/worktrees/146b-workflow/deploy-center/.github/workflows/release-service.yml) 后，先做 YAML 静态校验。
- 更新 [tests/release-workflow.sh](/var/folders/qf/rqhtjpgj4rqcgzvcktbyskch0000gn/T/vibe-kanban/worktrees/146b-workflow/deploy-center/tests/release-workflow.sh) 与 [tests/npm-release-workflow.sh](/var/folders/qf/rqhtjpgj4rqcgzvcktbyskch0000gn/T/vibe-kanban/worktrees/146b-workflow/deploy-center/tests/npm-release-workflow.sh)，把断言从具体内联步骤改为对 composite action 引用与关键配置的断言。
- 如本地具备 `actionlint`，额外执行一次 `actionlint .github/workflows/release-service.yml` 与 `.github/actions/*/action.yml` 校验；若缺失，则至少执行 Ruby YAML 解析校验。

## 不做事项

- 不把 `prepare` 中的 shell 逻辑改写为脚本或 action
- 不新增 reusable workflow
- 不改动发布矩阵字段名
- 不顺手重构 `update-state` 或 Docker 构建链路之外的逻辑
