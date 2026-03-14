# release-service 打印 Runner 信息设计

## 背景

当前 `release-service` 工作流已经将主要执行阶段切换到 GitHub-hosted runner：

- `build` 使用 `ubuntu-latest`
- `release-npm` 使用 `macos-15`

用户希望在 workflow 运行时直接打印 runner 的配置信息，便于从日志里快速判断机器的大致性能，例如 CPU、内存、磁盘空间以及关键工具版本。

本次需求只针对真正消耗资源的两个 job：

- `build`
- `release-npm`

不对 `prepare` 和 `update-state` 增加额外日志，避免噪音。

## 目标

- 在 `build` job 中打印 Linux runner 的基础系统信息与资源信息。
- 在 `release-npm` job 中打印 macOS runner 的基础系统信息与资源信息。
- 输出信息足够判断机器大致性能，但不过度冗长。
- 保持现有工作流输入、环境变量、发布逻辑和工具链行为不变。

## 方案对比

### 方案一：在 workflow 内联 shell 步骤中直接打印

在 `build` 与 `release-npm` 各新增一个 step，分别使用 Linux 与 macOS 常见系统命令输出 runner 信息。

优点：

- 改动最小。
- 日志离业务步骤最近，排查时最直观。
- 不需要新增脚本文件。

缺点：

- Linux / macOS 命令需要分别维护。

### 方案二：抽成仓库脚本

新增脚本，根据操作系统类型统一输出资源信息，再在两个 job 中调用。

优点：

- 可复用性更好。

缺点：

- 本次只有一个 workflow 使用，新增脚本会增加维护点。
- 脚本需要自行处理跨平台分支，复杂度不比内联更低。

### 方案三：只打印 GitHub runner 上下文

只输出 `RUNNER_OS`、`RUNNER_ARCH`、`RUNNER_NAME` 等环境信息，不再调用系统命令。

优点：

- 最稳定，跨平台成本低。

缺点：

- 无法看到 CPU、内存、磁盘等性能指标，不能满足需求。

## 选型

采用 **方案一**。

理由：本次需求明确是“从日志中看到机器大致性能”，而 GitHub Actions 自身并没有提供统一的 CPU / 内存标准输出。直接在目标 job 中用系统命令打印，是最常见、最直接、也是改动最小的方案。

## 设计细节

### `build` job 输出内容

在 `actions/checkout` 之后新增一个 step，例如“打印 Linux Runner 信息”，输出：

- `RUNNER_OS`、`RUNNER_ARCH`、`RUNNER_NAME`
- `uname -a`
- `lscpu` 的关键字段
- `free -h`
- `df -h`
- `docker version --format '{{.Server.Version}}'`
- `docker buildx version`

只选取关键字段，避免日志过长。

### `release-npm` job 输出内容

在 `actions/checkout` 之后新增一个 step，例如“打印 macOS Runner 信息”，输出：

- `RUNNER_OS`、`RUNNER_ARCH`、`RUNNER_NAME`
- `sw_vers`
- `sysctl -n machdep.cpu.brand_string`
- `sysctl -n hw.ncpu`
- `sysctl -n hw.memsize`
- `df -h`
- `node --version`
- `npm --version`

`pnpm` 与 Rust 版本不放在该 step 中，因为当时工具链尚未安装；继续由原有安装步骤管理。

### 测试策略

- 先更新 `tests/release-workflow.sh`
- 增加对两个新 step 名称和关键命令的断言
- 先运行测试确认失败，再补 workflow 实现
- 修改完成后重新运行测试，并额外做一次 YAML 解析校验

## 不做事项

- 不为 `prepare` 与 `update-state` 增加 runner 信息输出
- 不新增单独脚本文件
- 不引入第三方 action 来探测机器配置
- 不修改现有发布逻辑、环境变量名、输入参数或工具链版本
