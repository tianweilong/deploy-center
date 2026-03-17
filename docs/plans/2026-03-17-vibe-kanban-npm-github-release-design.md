# vibe-kanban npm 改为 GitHub Release 平台分发设计

## 背景

`vibe-kanban` 现已接入 `deploy-center/.github/workflows/release-service.yml` 的 npm 发布链路，但当前发布出的 npm 包仍然包含 `dist` 目录中的平台产物。结果是：

- npm tarball 体积被平台二进制放大；
- 当前最新包只包含单个平台产物，安装体验与“按当前机器下载对应平台包”的目标不一致；
- `npx-cli` 仍然默认从 R2 获取二进制，与新的 GitHub Release 托管方向不一致。

用户要求改为：

- 平台二进制全部由 GitHub Release 托管；
- npm 只发布轻量壳包；
- 用户安装或首次运行时，只下载当前机器平台对应的包；
- 必须支持 `linux-arm64`。

## 目标

- npm 包内不再携带 `dist` 平台产物。
- `release-service` 为 `linux-x64`、`linux-arm64`、`win32-x64`、`darwin-arm64` 生成独立 release 资产。
- `npx-cli` 运行时从 GitHub Release 下载当前平台对应资产，并校验完整性。
- 保留本地开发模式：如果本地存在 `npx-cli/dist`，仍优先读取本地产物。
- npm 版本策略继续沿用现有 `SOURCE_TAG` / `npm_version_strategy` 逻辑，不引入新的版本语义。

## 非目标

- 本次不补齐 `darwin-x64`、`win32-arm64` 等更多平台。
- 本次不改为多 npm 子包 + `optionalDependencies` 分发。
- 本次不改变本地 `./local-build.sh` 的基本开发方式。
- 本次不重新设计 release tag 规则，继续沿用当前 `<package-key>-<SOURCE_TAG>` 约定。

## 方案对比

### 方案一：轻量 npm 包 + 运行时下载 GitHub Release 资产

- npm 包只保留 `bin/cli.js`、平台识别、下载、校验和缓存逻辑。
- 多平台压缩包由 `release-service` 上传到 GitHub Release。
- CLI 在启动时识别当前平台，只拉取对应压缩包。

优点：

- 与用户目标完全一致；
- 最大程度复用现有三段式 workflow；
- 不需要维护多个 npm 包。

缺点：

- 首次启动需要联网；
- 需要把现有 R2 下载逻辑切换到 GitHub Release。

### 方案二：轻量 npm 包 + 安装阶段下载 GitHub Release 资产

优点：

- 命令首次执行更快；
- 安装完成后即可离线运行。

缺点：

- 需要引入 `postinstall` 行为，跨平台安装失败处理更复杂；
- `npx` 临时执行场景下收益有限。

### 方案三：主包 + 平台子包

优点：

- 由 npm 原生选择平台包。

缺点：

- 不符合“dist 由 GitHub Release 托管”的目标；
- 发布和维护复杂度显著更高。

## 选型

采用方案一：**轻量 npm 包 + 运行时下载 GitHub Release 资产**。

原因：

- 当前 `npx-cli` 已有成熟的“按平台下载、缓存、解压”路径，改下载源比重做安装模型更小；
- `release-service.yml` 已经具备“多平台构建 -> 上传 GitHub Release -> 发布 npm”的三段式结构；
- 用户明确希望由 GitHub Release 托管 `dist` 包。

## 设计细节

### 1. 发布工作流

`deploy-center/.github/workflows/release-service.yml` 保持三段：

1. `release-npm-assets`
   - 按矩阵构建四个平台资产：
     - `linux-x64`
     - `linux-arm64`
     - `win32-x64`
     - `darwin-arm64`
   - 每个平台生成单独压缩包和 checksum 文件片段。

2. `release-github-release`
   - 下载全部平台产物；
   - 合并 checksum；
   - 创建 release tag：`<package-key>-<SOURCE_TAG>`；
   - 上传平台压缩包和 checksum 文件。

3. `release-npm`
   - 发布轻量 npm 包；
   - 不再重新打包 `dist` 到 npm tarball。

### 2. npm 包内容

需要同步修改：

- `vibe-kanban/package.json`
- `vibe-kanban/npx-cli/package.json`

目标是 npm tarball 中只保留：

- `npx-cli/bin/**`
- `npx-cli/package.json` 所需运行时代码

不再包含：

- `npx-cli/dist/**`

### 3. GitHub Release 资产命名

继续沿用现有约定：

- release tag：`<package-key>-<SOURCE_TAG>`
- 资产名：`<package-key>-<SOURCE_TAG>-<platform>.<ext>`
- checksum：`<package-key>-<SOURCE_TAG>-checksums.txt`

这样 `npx-cli` 只需知道：

- GitHub 仓库；
- 当前 npm 版本对应的 `SOURCE_TAG`；
- 当前平台标识；
- 资产扩展名映射。

### 4. CLI 下载逻辑

`vibe-kanban/npx-cli/src/download.ts` 需要从“R2 manifest + zip 直链”切换为“GitHub Release 资产 URL + checksum 校验”。

建议引入以下常量占位符，在发布 npm 包前由工作流或脚本替换：

- `GITHUB_RELEASE_REPOSITORY`
- `GITHUB_RELEASE_TAG_PREFIX` 或足以推导 release tag 的信息
- `BINARY_TAG`

下载流程：

1. 根据 `process.platform` / `process.arch` 解析内部平台标识；
2. 推导当前平台资产文件名；
3. 下载 checksum 文件；
4. 从 checksum 文件中找到对应资产 hash；
5. 下载平台资产；
6. 校验 hash；
7. 解压到缓存目录；
8. 启动二进制。

### 5. 平台映射

以真实发布平台为准，CLI 仅声明支持：

- `linux-x64`
- `linux-arm64`
- `win32-x64`
- `darwin-arm64`

现有代码中若仍声明：

- `windows-arm64`
- `macos-x64`

则需要同步收敛，避免“代码说支持但 release 没有资产”。

### 6. 本地开发模式

`LOCAL_DEV_MODE` 保持不变：

- 如果本地存在 `npx-cli/dist`，继续直接读取本地压缩包；
- 不依赖 GitHub Release；
- 这样不会影响 `./local-build.sh` 与本地调试。

### 7. 错误处理

需要保证错误信息可定位：

- 平台不支持：明确输出当前 `platform-arch` 与支持列表；
- GitHub Release 不存在：输出仓库、tag、资产名；
- checksum 缺项：输出 checksum 文件名与目标资产名；
- 下载失败：区分 HTTP 状态码和校验失败；
- 解压失败：提示缓存目录和资产路径。

## 测试策略

### deploy-center

- `tests/release-workflow.sh`
  - 断言 npm 矩阵包含 `linux-arm64`；
  - 断言 GitHub Release job 先于 npm 发布；
  - 断言 workflow 仍调用 `./scripts/release-npm-package.sh source`；
  - 断言创建并上传 checksum。

- `tests/npm-release-workflow.sh`
  - 断言脚本仍支持 build-only 生成平台资产；
  - 断言轻量 npm 发布路径不依赖把多平台 `dist` 合并回包内。

### vibe-kanban

- 为 `npx-cli` 新增或扩展 Node 测试，覆盖：
  - 平台映射；
  - GitHub Release URL / 资产名推导；
  - checksum 解析；
  - `dist` 不再进入 npm tarball。

如果仓库当前没有现成测试框架，可先使用最小化脚本测试或 `node` 断言脚本锁定核心行为。

## 风险与缓解

- GitHub Release 下载速率或可用性不如内网对象存储稳定
  - 通过清晰错误信息和本地缓存减轻影响。

- 平台命名不一致导致下载 404
  - 用测试固定 workflow 资产命名和 CLI 映射。

- npm 包仍意外包含 `dist`
  - 通过 `npm pack --json` 或 `tar -tf` 的测试校验 tarball 内容。

## 影响范围

- `deploy-center/.github/workflows/release-service.yml`
- `deploy-center/scripts/release-npm-package.sh`
- `deploy-center/tests/release-workflow.sh`
- `deploy-center/tests/npm-release-workflow.sh`
- `deploy-center/docs/developer-guide.md`
- `vibe-kanban/package.json`
- `vibe-kanban/npx-cli/package.json`
- `vibe-kanban/npx-cli/src/cli.ts`
- `vibe-kanban/npx-cli/src/download.ts`

