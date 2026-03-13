# release-service 构建迁移到自建 Runner 设计

## 背景

当前 `deploy-center/.github/workflows/release-service.yml` 中，`prepare`、`build`、`update-state` 三个 job 全部运行在 GitHub 托管 Runner 上。其中 `build` job 包含源码检出、多架构构建环境初始化、GHCR 登录以及镜像构建推送，是整个发布流程中最耗时的一段。

现有需求是将这段耗时构建迁移到用户自有机器，同时尽量减少对现有发布链路、矩阵结构和部署状态回写逻辑的影响。

## 目标

- 将镜像构建相关执行环境从 `ubuntu-latest` 切换到自建 GitHub Actions Runner。
- 使用用户已提供的 Runner 标签：`self-hosted`、`Linux`、`ARM64`。
- 保持 `prepare` 与 `update-state` 继续运行在 GitHub 托管 Runner 上。
- 不修改现有输入参数、环境变量名、镜像仓库名、矩阵结构和部署状态更新逻辑。

## 方案对比

### 方案一：整段 `build` job 迁移到自建 Runner

直接将 `build` job 的 `runs-on` 从 `ubuntu-latest` 改为标签数组 `['self-hosted', 'Linux', 'ARM64']`。

优点：
- 改动最小。
- 现有 `needs`、矩阵、`docker/build-push-action` 配置都可复用。
- 风险集中，便于快速验证。

缺点：
- `build` job 中的轻量步骤也会一起迁移到自建机器执行。

### 方案二：拆分 `build` job

将现有 `build` 拆成 GitHub Runner 上的元数据准备 job 与自建 Runner 上的镜像构建 job。

优点：
- 更精确地只迁移耗时步骤。

缺点：
- 需要增加 job 间输出传递。
- YAML 复杂度和维护成本明显增加。
- 本次需求没有必要为此扩大改动面。

## 选型

采用 **方案一**。

理由：GitHub Actions 的执行机器切换是 job 级别，不是 step 级别。本次性能瓶颈明确位于 `build` job，直接迁移整个 job 能最小化改动并快速达成目标。后续若需要更细粒度拆分，再基于实际运行数据继续演进。

## 设计细节

### 架构调整

- `prepare`：保持 `runs-on: ubuntu-latest`。
- `build`：改为 `runs-on: [self-hosted, Linux, ARM64]`。
- `update-state`：保持 `runs-on: ubuntu-latest`。

### 数据流

- `prepare` 继续生成 `matrix` 输出。
- `build` 继续消费 `prepare.outputs.matrix`，不改变矩阵字段和镜像标签生成方式。
- `update-state` 继续依赖 `build` 成功后回写 `environments/`。

### 错误处理

- 若自建 Runner 不在线、标签不匹配或机器缺少 Docker/Buildx 运行条件，`build` job 将排队或失败。
- 工作流不增加自动回退到 GitHub 托管 Runner 的逻辑，避免在构建资源异常时产生隐式行为变化。

### 测试策略

- 先更新 `tests/release-workflow.sh`，新增对 `build` job 自建 Runner 标签的断言。
- 在代码修改前运行测试，确认新增断言会失败。
- 修改工作流后再次运行测试，确认通过。
- 如有必要，更新 `docs/developer-guide.md` 中对 `build` 阶段执行环境的说明。

## 影响范围

- 工作流：`.github/workflows/release-service.yml`
- 测试：`tests/release-workflow.sh`
- 文档：`docs/developer-guide.md`

## 不做事项

- 不新增工作流输入参数。
- 不增加 GitHub Runner / 自建 Runner 的运行时切换开关。
- 不重构矩阵格式。
- 不调整镜像标签策略、GHCR 登录方式和部署状态提交逻辑。
