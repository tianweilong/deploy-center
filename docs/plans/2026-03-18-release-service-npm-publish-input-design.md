# npm 发布输入拆分设计

## 背景

当前 `deploy-center/.github/workflows/release-service.yml` 中：

- `release-npm-assets` 负责多平台构建并上传 GitHub Actions artifact；
- `release-github-release` 负责创建 GitHub Release 并上传平台资产；
- `release-npm` 负责通过 Trusted Publishing 发布轻量 npm 包。

但 `deploy-center/scripts/release-npm-package.sh` 同时承担“构建平台 Release 资产”和“构建并发布 npm 包”两类职责。结果是：

- workflow 中同一个脚本在两个 job 里被调用，意图不直观；
- `release-npm` 虽然名义上只是发布，但仍会重复执行 `pnpm i` 与 `pnpm run build:npx`；
- 后续若继续扩展 npm 发布链路，脚本分支会继续膨胀。

## 目标

- 将“构建平台 Release 资产”和“准备 / 发布轻量 npm 包”拆成独立脚本职责。
- 保留现有三段式 workflow，不改变 job 边界。
- 让 `release-npm` 只消费前序 job 产出的发布输入，不再重新构建源码。
- 保持现有版本策略、GitHub Release tag 规则、环境变量名不变。

## 非目标

- 本次不改动 `SOURCE_TAG`、`NPM_VERSION_STRATEGY` 等现有版本语义。
- 本次不改 GitHub Release 资产命名规则。
- 本次不把 npm 发布改成单 job 串行执行。
- 本次不重新设计外部仓库的 `build:npx` 行为。

## 方案对比

### 方案一：仅复用现有产物，在原脚本里增加 publish-only 分支

优点：

- 改动小；
- 可以较快消除重复构建。

缺点：

- 原脚本仍是多职责；
- 后续维护仍需要理解多个模式与分支组合；
- workflow 可读性改善有限。

### 方案二：拆脚本职责，发布 job 只消费“发布输入目录”

优点：

- 直接解决脚本职责混杂问题；
- `release-npm-assets` 与 `release-npm` 的意图能体现在脚本名和 artifact 名上；
- 后续无论扩展校验、元数据还是缓存策略，都可以在单一职责脚本内演进。

缺点：

- 需要定义并维护一份稳定的“发布输入目录”契约；
- 需要同步更新 workflow 和测试。

## 选型

采用方案二：**拆脚本职责，前序 job 生成 npm 发布输入，发布 job 仅消费该输入。**

原因：

- 用户已明确要求方案二；
- 当前主要问题不是单次重复构建本身，而是职责边界不清；
- 只要发布输入契约稳定，后续可以在不改 `release-npm` 的情况下调整构建细节。

## 设计

### 1. 发布输入目录契约

新增一个标准化目录，例如 `npm-publish-input/`，作为 `release-npm` 的唯一输入。目录至少包含：

- `package/`
  - 轻量 npm 包的发布目录快照；
  - 必须已经包含 `npm pack` 所需的源码文件与构建结果；
- `package/release-meta.json`
  - 已写入的发布元数据；
- `publish-context.json`
  - 记录 `packageName`、`publishVersion`、`sourceTag`、`packageDir` 等关键上下文；
- `manifest.txt`
  - 列出发布前必须存在的关键文件，供发布 job 做快速校验。

约束：

- `release-npm` 不依赖源仓库工作区内重新执行构建；
- `release-npm` 只对下载后的 `npm-publish-input` 做校验、打包、发布；
- 发布输入目录必须是自包含的，不能隐式依赖 job 间未传递的缓存目录。

### 2. 脚本职责拆分

保留公共版本解析逻辑，但拆成三个脚本：

1. `scripts/prepare-npm-publish-input.sh`
   - 校验 `SOURCE_TAG`、`NPM_PACKAGE_NAME`、`NPM_PACKAGE_DIR`、`NPM_VERSION_STRATEGY`；
   - 解析发布版本；
   - 执行依赖安装与 `pnpm run build:npx`；
   - 将可发布内容整理到 `npm-publish-input/package/`；
   - 写入 `release-meta.json`、`publish-context.json`、`manifest.txt`。

2. `scripts/build-npm-release-assets.sh`
   - 只负责按平台读取构建结果；
   - 生成多平台压缩包与 checksum；
   - 不再包含 npm 发布逻辑。

3. `scripts/publish-npm-package.sh`
   - 只消费已下载的 `npm-publish-input/`；
   - 校验 `manifest.txt` 与 `publish-context.json`；
   - 在 `package/` 目录内执行 `npm version --no-git-tag-version --allow-same-version`、`npm pack`、`npm publish`；
   - 如目标版本已存在则跳过发布。

如有必要，可保留一个小型公共脚本或公共函数文件，承载版本解析、包名校验、`release_meta` 生成等共享逻辑。

### 3. workflow 调整

#### `release-npm-assets`

- 保留现有平台矩阵；
- 在“构建 npm 平台产物”之前或之后，新增一步执行 `prepare-npm-publish-input.sh`；
- 将输出目录上传为单独 artifact，例如 `npm-publish-input`；
- 多平台 Release 资产构建改为调用 `build-npm-release-assets.sh`。

注意：

- `npm-publish-input` 只需要构建一次，不应跟平台矩阵重复上传多个等价副本；
- 更稳妥的做法是在矩阵外单独增加一个准备 job，或在矩阵中限制仅一个 target 负责上传该 artifact。

#### `release-github-release`

- 逻辑基本保持不变；
- 继续只关心多平台 Release 资产与 checksum。

#### `release-npm`

- 下载 `npm-publish-input` artifact；
- 不再执行构建命令；
- 调用 `publish-npm-package.sh` 完成校验、打包、发布。

### 4. 错误处理

需要保证脚本输出足够明确：

- 发布输入目录缺失时，输出缺失路径和预期 artifact 名；
- `publish-context.json` 缺字段时，指出字段名；
- `manifest.txt` 校验失败时，指出缺失文件；
- npm 版本已存在时，继续维持“跳过发布”的幂等行为；
- 禁止发布脚本静默回退到源码重新构建，避免掩盖契约破坏。

## 测试策略

### shell 测试

更新现有测试，覆盖：

- workflow 中 `release-npm` 会下载 `npm-publish-input` artifact；
- workflow 中 `release-npm` 不再直接调用旧的混合脚本；
- `prepare-npm-publish-input.sh` 会生成 `publish-context.json`、`manifest.txt`、`release-meta.json`；
- `publish-npm-package.sh` 在缺少发布输入时失败并给出明确报错。

### 回归点

- 版本策略 `package_json`、`source_tag`、`base_patch_offset` 的行为保持不变；
- GitHub Release 资产产物名与 checksum 文件名保持不变；
- npm 已存在版本时仍跳过发布；
- `release-github-release` 仍然先于 `release-npm`。

## 风险与缓解

### 风险一：发布输入目录契约不完整

缓解：

- 先用 `manifest.txt` 和测试把必须文件列死；
- 发布脚本严格校验，不做隐式补救。

### 风险二：在矩阵 job 中重复生成发布输入

缓解：

- 将发布输入准备限制在单一 job 或单一矩阵分支；
- artifact 命名固定，避免并发覆盖。

### 风险三：拆分后共享逻辑漂移

缓解：

- 将版本解析、包名校验、`release_meta` 写入提取到公共函数或公共脚本；
- 用测试锁定三种版本策略的输出。
