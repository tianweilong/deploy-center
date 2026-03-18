# Windows npm 空包修复设计

## 背景

`deploy-center/.github/workflows/release-service.yml` 负责构建多平台 npm Release 资产。当前 Linux 与 macOS 平台正常，只有 Windows 平台产出的 zip 为空，同时 GitHub Release 里还会额外出现一个未压缩的裸文件（如 `myte`）。

## 现象拆解

### 裸文件泄漏

`scripts/release-npm-package.sh` 在 `BUILD_ONLY=true` 时会先把 `manifest.json` 与 `manifest.files` 声明的文件复制到 `artifact_dir/stage/`，再从这个目录生成压缩包。

但 workflow 的 `release-npm-assets` job 当前上传的是整个 `npm-artifacts/<target>` 目录。后续 `release-github-release` job 用 `find release-artifacts -type f` 递归上传全部文件，于是 `stage/` 中的原始二进制也被当成 Release 资产一并上传，导致出现裸露文件。

### Windows zip 为空

Windows 平台走的是 `create_platform_archive()` 中的 PowerShell 分支：

- `Compress-Archive -Path '$source_dir_windows\\*'`

这条命令与 Linux/macOS 的 `tar -C "${source_dir}" .` 不同，依赖 Windows 路径转换和 PowerShell 通配展开。现象上只有 Windows 出问题，说明空 zip 的根因高度集中在这一分支。

## 目标

- GitHub Release 只上传每个平台的压缩包与 `checksums.txt`
- Windows zip 必须包含 `manifest.json` 与平台文件，不能再为空
- 不改动现有 tag、资产命名、checksum 协议

## 方案

### 方案 A：最小修复，收窄上传范围并重写 Windows 压缩逻辑

- workflow 的 artifact 上传改为仅包含：
  - `${artifact_dir}/*.zip` 或 `*.tar.gz`
  - `${artifact_dir}/*-checksums.txt`
- 打包脚本在生成压缩包后删除 `stage/`
- Windows 压缩改成进入 `stage` 目录后，用 `Get-ChildItem -LiteralPath .` 生成输入列表，再交给 `Compress-Archive`，避免直接传 `C:\path\*`

优点：

- 改动最小，风险集中
- 可以直接对应当前两个症状

缺点：

- 仍保留 PowerShell 特殊分支，平台实现不完全统一

### 方案 B：统一改成单一跨平台压缩实现

- 引入额外压缩工具，或依赖另一套跨平台打包命令，彻底移除 PowerShell 分支

优点：

- 长期更统一

缺点：

- 需要额外验证 Windows runner 上工具可用性
- 超出本次最小修复范围

## 结论

采用方案 A。

原因：

- 根因已经明确落在两个局部点上，不需要扩大修改面
- 当前问题是生产发布回归，优先恢复正确产物与正确上传边界

## 测试策略

- 为 `tests/npm-release-workflow.sh` 增加断言，锁定 workflow 不能继续上传整个目录
- 为 `tests/release-npm-package-artifact-path.sh` 增加断言，锁定 `BUILD_ONLY` 产物目录里不再保留 `stage/`
- 保留现有 Linux 构建回归测试，确保资产命名与路径不变
- 用脚本 grep 约束 Windows 分支不再包含 `Compress-Archive -Path '...\\*'` 这类实现
