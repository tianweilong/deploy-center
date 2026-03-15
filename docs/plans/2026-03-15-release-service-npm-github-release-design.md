# release-service npm 改为 GitHub Release 平台分发设计

## 背景

当前 `deploy-center` 中刚实现的 npm 多平台发布方案，是把多个平台产物在工作流中汇总后重新打成一个 npm 包发布。这个方案虽然能让 Linux 与 Windows 构建都跑起来，但仍有明显问题：

- 用户安装 npm 包时，下载的是一个统一 tarball，而不是只下载自己平台所需的资产。
- 若包中同时包含多个平台的二进制或运行时资源，安装体积会被所有平台叠加放大。
- 这与 `vibe-kanban` 当前公开 npm 包“按平台下载远端资产”的分发思路不一致。

本次新的目标是参考 `https://www.npmjs.com/package/vibe-kanban` 的模式，但把远端资产存储从 R2 切换到 GitHub Releases。

用户还补充了两个关键约束：

- 平台目标至少要包含 `darwin-arm64`。
- 一个公开 GitHub 仓库需要承载多个 npm 包的 release 资产，因此 release tag 不能直接使用裸 `vX.Y.Z`，必须能够按包区分，例如 `A-v1.2.3`、`B-v1.2.3`。

## 目标

- npm 包安装时只下载当前平台所需的一个 GitHub Release 资产，而不是把所有平台文件都塞进 npm 包。
- `deploy-center` 的 workflow 输入显式传入 release 前缀标识 `package-key`，避免自动探测带来的不稳定。
- GitHub Release tag 与资产命名规则支持“一个公开仓库存多个 npm 包”。
- 平台首版至少支持：
  - `linux-x64`
  - `win32-x64`
  - `darwin-arm64`
- 继续保持 npm 对外版本号为 `vX.Y.Z` 语义，不改变现有 npm 版本策略字段含义。

## 方案对比

### 方案一：轻量 npm 包 + 安装时下载 GitHub Release 资产

- npm 包只保留入口脚本、平台识别、下载器、校验和缓存逻辑。
- `deploy-center` 先构建各平台资产并上传到 GitHub Release。
- npm 安装阶段只下载当前平台对应资产。

优点：

- 用户不会下载无关平台的二进制。
- 与 `vibe-kanban` 现有分发思路一致，只是后端从 R2 换成了 GitHub Releases。
- 一个 release 仓库可承载多个 npm 包，只要 tag 与 asset 规则稳定即可。

缺点：

- 安装过程依赖网络与 GitHub Releases 可用性。
- 需要在 npm 包中维护下载、校验与缓存逻辑。

### 方案二：轻量 npm 包 + 首次执行时下载 GitHub Release 资产

优点：

- `npm install` 本身更轻。
- 安装阶段对网络依赖更低。

缺点：

- 用户第一次执行命令时才会遇到下载与失败问题，体验更差。
- CLI 的首启动路径会更复杂。

### 方案三：主包 + 多个平台 npm 子包

优点：

- 完全走 npm 分发语义。
- 每个平台天然只下载自己的包。

缺点：

- 与“把资产存到 GitHub Releases”目标不一致。
- 需要维护多个 npm 包名与发布关系，复杂度更高。

## 选型

采用 **方案一**。

理由：

- 这是最贴近 `vibe-kanban` 当前模式的方案。
- 用户已经明确希望把平台资产存到 GitHub Releases，而不是继续走 npm 或 R2。
- 安装时下载比首次执行时下载更符合 CLI 工具的用户预期：安装完成后即可使用，而不是第一次运行时再进行一次隐式安装。

## 设计细节

### 显式 workflow 输入

`deploy-center/.github/workflows/release-service.yml` 需要新增显式输入，至少包括：

- `npm_release_package_key`
- `npm_release_repository`

其中：

- `npm_release_package_key` 用于构造 release tag 与资产文件名前缀。
- `npm_release_repository` 表示承载多个 npm 包 release 资产的公开 GitHub 仓库，格式建议为 `owner/repo`。

不从源仓库自动探测 `package-key`，避免因为包名重命名、monorepo 结构变化或脚本约定不一致导致协议漂移。

### Tag 与资产命名规则

GitHub Release tag 固定为：

- `<package-key>-vX.Y.Z`

GitHub Release 资产固定为：

- `<package-key>-vX.Y.Z-linux-x64.tar.gz`
- `<package-key>-vX.Y.Z-win32-x64.zip`
- `<package-key>-vX.Y.Z-darwin-arm64.tar.gz`
- `<package-key>-vX.Y.Z-checksums.txt`

这样即使一个仓库承载多个 npm 包，也不会出现 tag 或资产冲突。

### 发布流程拆分

workflow 需要从“构建多平台资产并汇总进一个 npm 包”改成三段：

1. `release-npm-assets`
   - 按矩阵构建平台资产：
     - `linux-x64`
     - `win32-x64`
     - `darwin-arm64`
   - 每个平台输出单独压缩包与校验值。

2. `release-github-release`
   - 用 `npm_release_package_key` 和 npm 版本生成 release tag。
   - 在 `npm_release_repository` 中创建或更新对应 GitHub Release。
   - 上传平台压缩包与 `checksums.txt`。

3. `release-npm`
   - 发布一个轻量 npm 包。
   - npm 包内部只携带下载器、平台识别、Release URL 拼装规则、校验与缓存逻辑。

### 安装时下载

用户执行 `npm install -g <pkg>` 时：

1. npm 安装轻量包。
2. 安装脚本识别当前平台。
3. 根据以下信息拼接目标资产：
   - `npm_release_repository`
   - `npm_release_package_key`
   - npm 版本
   - 当前平台
4. 下载对应 GitHub Release 资产。
5. 下载并校验 `checksums.txt`。
6. 解压到本地缓存或目标目录。

这个模型保证用户只会下载自己的平台资产，而不是一次性拉下所有平台内容。

### 平台映射

内部平台标识建议固定为：

- `linux-x64`
- `win32-x64`
- `darwin-arm64`

并由 npm 安装脚本负责把 Node.js 的 `process.platform` / `process.arch` 映射到这三个字符串。

### 失败处理

- 任一平台资产构建失败，不创建 GitHub Release，也不发布 npm 包。
- GitHub Release 上传失败，不发布 npm 包。
- npm 包安装时若下载失败，必须输出清晰错误，至少包含：
  - release 仓库
  - release tag
  - 目标资产文件名
- 校验失败时必须直接终止安装。
- 若 release tag 已存在，默认应失败，避免静默覆盖同名资产；是否允许显式覆盖可作为后续扩展，不在首版引入。

### 测试策略

#### deploy-center 侧

- 更新 `tests/release-workflow.sh`
  - 断言 workflow 新增 `npm_release_package_key`
  - 断言 workflow 新增 `npm_release_repository`
  - 断言平台矩阵包含 `darwin-arm64`
  - 断言先上传 GitHub Release 资产，再发布 npm 包
  - 断言 tag 规则包含 `<package-key>-vX.Y.Z`

- 更新 `tests/npm-release-workflow.sh`
  - 断言不再把多平台产物重新合并进一个统一 npm tarball
  - 断言脚本中存在 GitHub Release tag / asset 命名逻辑，或等价的调用入口

#### 源 npm 包侧

- 测试平台识别
- 测试 GitHub Release URL 拼装
- 测试 Linux / Windows / macOS 各自只下载自己的资产
- 测试下载失败与校验失败提示

## 影响范围

- 工作流：`.github/workflows/release-service.yml`
- 脚本：`scripts/release-npm-package.sh`
- 测试：`tests/release-workflow.sh`、`tests/npm-release-workflow.sh`
- 文档：`docs/developer-guide.md`

## 不做事项

- 不在首版引入安装失败后自动回退到首次运行下载。
- 不继续使用“把所有平台产物重新打进一个 npm 包”的方案。
- 不从源仓库自动探测 `package-key`。
- 不在首版支持更多平台组合，例如 `darwin-x64`、`linux-arm64`、`win32-arm64`。
