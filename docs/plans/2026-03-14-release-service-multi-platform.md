# release-service 多平台镜像构建 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让 `release-service` 工作流默认同时构建 `linux/amd64` 与 `linux/arm64` 镜像，并保留服务级平台覆盖能力，同时更新 `README.md` 与开发文档中过时的英文和平台说明。

**Architecture:** 工作流提供默认双平台值，矩阵生成脚本在服务未显式配置 `platforms` 时回退到该默认值。现有服务配置删除重复平台字段，依赖默认值驱动构建；测试先锁定默认行为，再做最小实现与文档同步。

**Tech Stack:** GitHub Actions YAML、Ruby、JSON、Bash、ripgrep

---

### Task 1: 先用测试锁定默认双平台行为

**Files:**
- Modify: `tests/prepare-release-matrix.sh`
- Test: `tests/prepare-release-matrix.sh`

**Step 1: Write the failing test**

将原本对 `platforms == "linux/arm64"` 的断言改为：

```bash
raise "remote 平台配置错误" unless remote.fetch("platforms") == "linux/amd64,linux/arm64"
raise "relay 平台配置错误" unless relay.fetch("platforms") == "linux/amd64,linux/arm64"
```

并维持现有构建参数与错误分支断言不变。

**Step 2: Run test to verify it fails**

Run: `bash tests/prepare-release-matrix.sh`
Expected: FAIL，因为当前脚本和配置仍返回 `linux/arm64`。

**Step 3: Keep implementation unchanged**

此时不修改生产代码，只确认失败来自平台断言。

**Step 4: Run test to verify it fails for the right reason**

Run: `bash tests/prepare-release-matrix.sh`
Expected: FAIL，错误来自 `platforms` 断言。

**Step 5: Commit**

```bash
git add tests/prepare-release-matrix.sh
git commit -m "test: cover default multi-platform release matrix"
```

### Task 2: 实现默认双平台与服务级覆盖

**Files:**
- Modify: `.github/workflows/release-service.yml`
- Modify: `scripts/prepare-release-matrix.rb`
- Modify: `config/services.vibe-kanban.json`
- Test: `tests/prepare-release-matrix.sh`

**Step 1: Write minimal implementation in workflow**

将：

```yaml
DEFAULT_IMAGE_PLATFORMS: linux/arm64
```

改为：

```yaml
DEFAULT_IMAGE_PLATFORMS: linux/amd64,linux/arm64
```

**Step 2: Write minimal implementation in matrix script**

把：

```ruby
'platforms' => service.fetch('platforms'),
```

改为基于默认值回退：

```ruby
default_image_platforms = ENV.fetch('DEFAULT_IMAGE_PLATFORMS')
...
'platforms' => service.fetch('platforms', default_image_platforms),
```

如默认值为空，直接报错。

**Step 3: Remove redundant service-level platforms**

从 `config/services.vibe-kanban.json` 中删除当前两个服务的 `platforms` 字段，让它们走默认值。

**Step 4: Run targeted test**

Run: `bash tests/prepare-release-matrix.sh`
Expected: PASS

**Step 5: Commit**

```bash
git add .github/workflows/release-service.yml scripts/prepare-release-matrix.rb config/services.vibe-kanban.json tests/prepare-release-matrix.sh
git commit -m "ci: default release images to amd64 and arm64"
```

### Task 3: 更新 README 与开发文档

**Files:**
- Modify: `README.md`
- Modify: `docs/developer-guide.md`
- Test: `README.md`
- Test: `docs/developer-guide.md`

**Step 1: Update README**

将英文 `Developer docs` 改成中文，并校正以下内容：
- 仓库作用描述
- 所需密钥、权限与变量说明
- 默认双平台构建与可覆盖机制

**Step 2: Update developer guide**

将“当前两个服务的 `platforms` 都固定为 `linux/arm64`”修改为：
- 默认平台为 `linux/amd64,linux/arm64`
- 服务可通过 `platforms` 字段单独覆盖

**Step 3: Run focused doc check**

Run: `rg -n "Developer docs|linux/arm64|linux/amd64,linux/arm64|platforms" README.md docs/developer-guide.md .github/workflows/release-service.yml scripts/prepare-release-matrix.rb config/services.vibe-kanban.json`
Expected: README 中不再出现英文小节标题；文档能反映默认双平台与服务可覆盖。

**Step 4: Commit**

```bash
git add README.md docs/developer-guide.md
git commit -m "docs: refresh release platform documentation"
```

### Task 4: 完整验证与交付

**Files:**
- Test: `tests/prepare-release-matrix.sh`
- Test: `.github/workflows/release-service.yml`
- Test: `README.md`
- Test: `docs/developer-guide.md`

**Step 1: Run final verification**

Run: `bash tests/prepare-release-matrix.sh`
Expected: PASS

**Step 2: Inspect final diff**

Run: `git diff -- .github/workflows/release-service.yml scripts/prepare-release-matrix.rb config/services.vibe-kanban.json tests/prepare-release-matrix.sh README.md docs/developer-guide.md`
Expected: 仅包含默认双平台、测试与文档更新。

**Step 3: Inspect working tree**

Run: `git status --short`
Expected: 仅显示本次修改文件。

**Step 4: Hand off summary**

总结默认双平台实现位置、服务覆盖规则、文档更新点与验证命令，并提醒如果未来某个服务只能发布单平台，可在 `config/services.vibe-kanban.json` 中显式恢复 `platforms` 字段。
