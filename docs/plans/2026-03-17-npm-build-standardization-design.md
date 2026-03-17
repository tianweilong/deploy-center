# npm 构建规范统一设计

## 背景

当前 `myte` 与 `vibe-kanban` 的 npm 发布都由 `deploy-center/.github/workflows/release-service.yml` 驱动，但两个源仓库并没有真正遵守同一份构建契约：

- `deploy-center/scripts/release-npm-package.sh` 在 `BUILD_ONLY=true` 时固定要求源仓库输出 `${NPM_PACKAGE_DIR}/dist/<platform>/`
- `vibe-kanban` 的 `build:npx` 已经输出 `npx-cli/dist/<platform>/`
- `myte` 的 `build:npx` 仍输出 `npm/myte/vendor/<target>`

结果是同一套发布中心脚本在两个仓库之间来回适配，修复一个仓库后经常打破另一个仓库，形成“一个好一个坏”的循环。

当前最新暴露的问题是 `myte` 在 GitHub Actions 中执行：

- `./scripts/release-npm-package.sh source`

时未能生成 `npm/myte/dist/linux-x64`，导致 `deploy-center` 直接失败。

## 目标

- 定义一份唯一的 npm 构建标准契约，由 `deploy-center` 作为发布中心统一消费。
- 要求 `myte` 与 `vibe-kanban` 都通过 `pnpm run build:npx` 接受同一组输入并产出同一结构。
- 统一平台目录命名、目录内容和元数据格式，消除隐式约定。
- 把“仓库特例”前移到源仓库自己的构建阶段，而不是堆积在 `deploy-center`。
- 增加跨仓库的契约校验与 smoke test，避免回归在发布阶段才暴露。

## 非目标

- 不把 Go、Rust、Node 的具体构建实现塞进 `deploy-center`。
- 不在本次统一 npm 包内部运行时的业务逻辑，只统一发布交付物契约。
- 不为旧目录结构长期保留兼容分支；迁移完成后只保留单一标准。

## 方案对比

### 方案一：发布中心定义唯一契约，所有源仓库对齐

- `deploy-center` 定义标准目录与元数据
- `myte`、`vibe-kanban` 都改造 `build:npx` 输出

优点：

- 契约单一，后续新增仓库时接入成本最低。
- 问题会在源仓库自己的构建测试中尽早暴露。
- `deploy-center` 的职责边界最清晰。

缺点：

- 首次改动涉及三个仓库。
- 需要同步调整现有测试与文档。

### 方案二：允许源仓库保留各自结构，由 `deploy-center` 做适配

优点：

- 源仓库迁移成本较低。

缺点：

- `deploy-center` 会长期维护多套规则。
- 回归风险仍会在仓库之间相互传导。

### 方案三：把构建细节进一步集中到 `deploy-center`

优点：

- 理论上集中化最强。

缺点：

- `deploy-center` 会强耦合 Go/Rust/Node 构建细节。
- 排障和维护成本都会上升。

## 选型

采用 **方案一**。

理由：

- 这次问题的根因就是“发布中心假设统一，源仓库实际上不统一”。
- 只有把目录结构、平台命名、元数据和校验点全部收敛到单一标准，才能从机制上避免“修一个坏一个”的循环。
- `deploy-center` 应该消费标准产物，而不是理解每个仓库的内部布局。

## 标准契约

### 统一构建入口

两个源仓库都必须提供：

- `pnpm run build:npx`

并统一接受以下环境变量：

- `TARGET_OS`
- `TARGET_ARCH`
- `SOURCE_TAG`

约束：

- `TARGET_OS` 与 `TARGET_ARCH` 必须同时提供或同时缺省。
- 提供平台参数时，`build:npx` 只构建单个平台产物。
- 不提供平台参数时，可以执行源码态构建或本地辅助构建，但不得破坏平台构建模式。

### 统一平台命名

标准平台目录名固定为：

- `linux-x64`
- `linux-arm64`
- `windows-x64`
- `macos-arm64`

对应关系：

- `linux` + `x64` -> `linux-x64`
- `linux` + `arm64` -> `linux-arm64`
- `win32` + `x64` -> `windows-x64`
- `darwin` + `arm64` -> `macos-arm64`

### 统一产物目录

每个源仓库必须在 `${NPM_PACKAGE_DIR}/dist/<platform>/` 下输出标准平台目录。

示例：

- `myte/npm/myte/dist/linux-x64/`
- `vibe-kanban/npx-cli/dist/linux-x64/`

`deploy-center` 不再接受 `vendor/<target>` 等非标准目录作为发布输入。

### 统一目录内容

每个平台目录至少包含：

- `manifest.json`
- `files` 字段中声明的全部文件

平台目录内允许保留仓库特有文件，但必须满足：

- 标准元数据完整
- 被声明为发布输入的文件全部存在
- 文件路径相对当前平台目录可解析

### 统一 manifest

每个平台目录下的 `manifest.json` 至少包含：

- `schemaVersion`
- `packageName`
- `packageVersion`
- `platform`
- `targetOs`
- `targetArch`
- `generatedAt`
- `files`

字段约束：

- `schemaVersion` 首版固定为 `1`
- `packageName` 必须等于 `${NPM_PACKAGE_DIR}/package.json` 中的 `name`
- `packageVersion` 来源于 `SOURCE_TAG` 或包版本解析结果
- `platform` 必须等于当前目录名
- `targetOs`、`targetArch` 必须与 workflow 输入一致
- `generatedAt` 使用 ISO 8601 时间格式
- `files` 为非空字符串数组，表示需要打包和发布的相对文件路径

示例：

```json
{
  "schemaVersion": 1,
  "packageName": "@vino.tian/myte",
  "packageVersion": "0.1.2",
  "platform": "linux-x64",
  "targetOs": "linux",
  "targetArch": "x64",
  "generatedAt": "2026-03-17T08:00:00.000Z",
  "files": [
    "myte"
  ]
}
```

## 三仓库职责

### deploy-center

`deploy-center` 继续负责：

- 解析 workflow 输入
- 驱动 `pnpm install --frozen-lockfile`
- 驱动 `pnpm run build:npx`
- 校验标准目录和 `manifest.json`
- 根据 `files` 打包平台资产
- 生成 checksum
- 发布 GitHub Release 资产与 npm 包

需要新增一个通用契约校验脚本，避免把校验逻辑散落在 workflow 和 shell 片段中。

### myte

`myte` 需要从当前的：

- `npm/myte/vendor/<target>`

迁移到：

- `npm/myte/dist/<platform>/`

改造点：

- `scripts/build-npx.mjs` 统一平台目录映射
- 为每个平台生成 `manifest.json`
- 若安装脚本仍依赖 `vendor` 布局，则同步改造安装逻辑消费 `dist/<platform>`；不推荐同时保留 `vendor` 与 `dist` 两套正式布局
- 增加构建契约测试，确保 `build:npx` 产物满足标准

### vibe-kanban

`vibe-kanban` 已有：

- `npx-cli/dist/<platform>/`

因此改造重点是补齐契约，而不是重写目录结构：

- 为每个平台目录补充标准 `manifest.json`
- 将当前隐式约定的发布文件写入 `files`
- 增加契约校验测试，防止未来产物结构偏移

## 发布数据流

1. `deploy-center` workflow 解析平台矩阵和 npm 输入。
2. 源仓库执行 `pnpm install --frozen-lockfile`。
3. 源仓库执行 `TARGET_OS=... TARGET_ARCH=... SOURCE_TAG=... pnpm run build:npx`。
4. 源仓库在 `${NPM_PACKAGE_DIR}/dist/<platform>/` 生成标准平台目录。
5. `deploy-center` 执行通用契约校验：
   - 平台目录存在
   - `manifest.json` 存在且字段完整
   - `manifest.files` 非空
   - `manifest.files` 中声明的文件全部存在
6. `deploy-center` 仅打包 `manifest.files` 中声明的文件。
7. `deploy-center` 生成 `${package-key}-${SOURCE_TAG}-${target}.${ext}` 与 checksum。
8. 后续 GitHub Release 与 npm 发布沿用现有流程。

## 错误处理

标准错误收敛为以下几类：

- 缺少平台目录
- 缺少 `manifest.json`
- `manifest.json` 字段非法或与输入不一致
- `files` 为空
- `files` 中声明文件不存在
- 平台映射不支持

原则：

- 构建失败时直接指出缺少的标准目录或元数据，不再依赖人工推断
- 错误优先在源仓库构建测试阶段暴露，而不是等到发布工作流末端

## 测试策略

### 源仓库契约测试

两个源仓库都增加构建后契约检查：

- 执行一次 `TARGET_OS=linux TARGET_ARCH=x64 pnpm run build:npx`
- 校验标准目录存在
- 校验 `manifest.json` 字段
- 校验 `files` 中声明文件存在

### deploy-center 契约测试

`deploy-center` 增加针对标准契约的通用测试：

- 给定平台目录与 `manifest.json` 样例，验证校验脚本通过
- 给定缺失文件、字段不一致等错误样例，验证校验脚本失败

### 跨仓库 smoke test

至少保留两条最小链路：

- `myte` 的 `linux-x64` 平台构建与契约校验
- `vibe-kanban` 的 `linux-x64` 平台构建与契约校验

目标是让回归在仓库自身和通用契约层就被拦截。

## 迁移顺序

1. 在 `deploy-center` 冻结标准契约文档。
2. 为 `deploy-center` 增加通用契约校验脚本和测试。
3. 改造 `myte` 的 `build:npx` 输出为 `dist/<platform>` 并补测试。
4. 改造 `vibe-kanban` 补齐标准 `manifest.json` 与测试。
5. 调整 `deploy-center` 的打包逻辑为严格消费 `manifest.files`。
6. 跑通三仓库 smoke test 后，移除旧布局假设。

## 风险与约束

- `myte` 当前的 npm 安装逻辑很可能默认读取 `vendor/<target>`，迁移时必须一并确认运行时消费路径。
- `vibe-kanban` 的平台目录中包含多个文件时，`files` 顺序和命名必须稳定，否则 checksum 和资产内容会抖动。
- `deploy-center` 是中心仓库，一旦先改脚本而未同步改源仓库，会出现短期不兼容；因此实现应尽量保持“先加校验能力，再切换消费路径”的顺序。

## 不做事项

- 不长期维护旧目录结构兼容层。
- 不为单个仓库保留特殊平台名映射。
- 不在本次引入更复杂的包级签名、SBOM 或额外发布元数据。
