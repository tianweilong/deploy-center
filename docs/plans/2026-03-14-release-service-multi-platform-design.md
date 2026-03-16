# release-service 多平台镜像构建设计

## 背景

当前 `deploy-center/.github/workflows/release-service.yml` 中通过 `DEFAULT_IMAGE_PLATFORMS` 与服务矩阵配置控制镜像构建平台。现状是工作流默认值和 `config/services.vibe-kanban.json` 中两个服务的 `platforms` 都固定为 `linux/arm64`，这导致发布流程只能产出 ARM64 镜像。

本次需求要求发布工作流同时支持 `linux/amd64` 与 `linux/arm64` 两种平台镜像，并顺手清理 `README.md` 中过时内容，将其中遗留英文翻译成中文。

## 目标

- 默认将服务镜像构建平台调整为 `linux/amd64,linux/arm64`。
- 保留“服务可单独覆盖平台配置”的扩展能力，避免把多平台行为硬编码到单一配置点。
- 不修改现有工作流输入参数、镜像仓库名、构建参数名和矩阵输出结构。
- 更新 `README.md` 与相关开发文档，去除与现状不一致的说明并统一为中文。

## 方案对比

### 方案一：只修改服务配置为双平台

直接把 `config/services.vibe-kanban.json` 中每个服务的 `platforms` 改成 `linux/amd64,linux/arm64`。

优点：
- 改动最小。
- 工作流和矩阵生成脚本几乎不用动。

缺点：
- 没有形成真正的“默认值”机制。
- 新增服务时若漏配 `platforms`，仍会失败或行为不一致。

### 方案二：工作流提供默认双平台，服务配置按需覆盖

将工作流默认平台改成 `linux/amd64,linux/arm64`，并让矩阵生成脚本在服务未显式配置 `platforms` 时回退到该默认值。现有服务配置移除冗余 `platforms` 字段，直接走默认值。

优点：
- 符合“默认双平台、单服务可覆盖”的目标。
- 新增服务时更不容易漏配。
- 工作流、脚本与配置职责更清晰。

缺点：
- 需要同步更新测试和文档。

### 方案三：拆分双架构构建任务并合并 manifest

为 `amd64` 和 `arm64` 分别创建构建任务，最后再创建多架构 manifest。

优点：
- 对不同 Runner 或构建缓存策略控制更细。

缺点：
- 明显超出当前需求。
- 会增加工作流复杂度与维护成本。

## 选型

采用 **方案二**。

理由：该方案既满足“默认支持双平台”的需求，也保留了单服务未来按需覆盖的能力，同时改动范围仍然可控。与直接在服务配置里重复填写双平台相比，这种做法更不容易在后续新增服务时产生遗漏。

## 设计细节

### 工作流

- 将 `DEFAULT_IMAGE_PLATFORMS` 从 `linux/arm64` 调整为 `linux/amd64,linux/arm64`。
- `prepare` job 继续生成矩阵，不改变现有输出字段名。
- `build` job 继续使用 `matrix.platforms` 驱动 `docker/build-push-action` 的 `platforms` 参数。

### 矩阵生成

- `scripts/prepare-release-matrix.rb` 改为：
  - 若服务显式配置了 `platforms`，优先使用服务配置。
  - 若服务未配置 `platforms`，回退到环境变量 `DEFAULT_IMAGE_PLATFORMS`。
- 若默认值为空，则直接报错，避免生成不完整矩阵。

### 服务配置

- 从 `config/services.vibe-kanban.json` 中移除当前两个服务冗余的 `platforms` 字段。
- 这样当前服务默认构建 `linux/amd64,linux/arm64`；未来若某个服务有特殊要求，可重新单独配置 `platforms`。

### 文档

- 更新 `README.md`：
  - 将英文小节标题改为中文。
  - 修正与当前发布流程不一致的旧描述。
  - 补充默认双平台与服务可覆盖的说明。
- 更新 `docs/developer-guide.md`：
  - 将“当前固定为 `linux/arm64`”修正为“默认是 `linux/amd64,linux/arm64`，服务可覆盖”。

### 测试策略

- 先修改 `tests/prepare-release-matrix.sh`，让它断言默认平台应为 `linux/amd64,linux/arm64`。
- 运行测试，确认在代码修改前按预期失败。
- 修改脚本、配置和工作流后再次运行测试，确认通过。

## 影响范围

- 工作流：`.github/workflows/release-service.yml`
- 脚本：`scripts/prepare-release-matrix.rb`
- 配置：`config/services.vibe-kanban.json`
- 测试：`tests/prepare-release-matrix.sh`
- 文档：`README.md`、`docs/developer-guide.md`

## 不做事项

- 不拆分 `amd64` / `arm64` 为两个独立 job。
- 不新增工作流输入参数。
- 不修改镜像标签逻辑、构建参数名、镜像仓库名或部署状态更新逻辑。
- 不改动与本次需求无关的其他发布流程。
