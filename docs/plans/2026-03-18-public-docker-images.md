# 公共 Docker 镜像仓库接入 deploy-center Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让一个使用 `images/<目录名>/Dockerfile` 结构的公共 Docker 镜像仓库能够在 `main` 分支代码变更后，只针对发生变化的目录触发 `deploy-center` 构建，并统一推送到 `ghcr.io`。

**Architecture:** 源仓库负责识别本次提交中哪些 `images/<目录名>` 发生变化，并把目录名列表作为 `release_targets` 传给 `deploy-center`。`deploy-center` 继续通过 `config/services.<repo>.json` 生成构建矩阵，但把 `release_targets` 的解释方式从固定枚举收敛为“`npm` + 任意 service 名”。如需固定 `latest` 标签，再将标签策略显式下沉到矩阵或配置层。

**Tech Stack:** GitHub Actions、Bash、Ruby、JSON、Docker Buildx、GHCR、现有 shell 测试

---

### Task 1: 为新仓库形态补充 deploy-center 配置样例

**Files:**
- Create: `config/services.docker-images.json`
- Test: `tests/prepare-release-matrix.sh`

**Step 1: Write the failing test**

在 `tests/prepare-release-matrix.sh` 中新增一段用例，执行：

```bash
TARGET_SERVICES='redis6,redis7' \
SOURCE_TAG='latest' \
ruby scripts/prepare-release-matrix.rb config/services.docker-images.json
```

断言输出矩阵中包含：

```ruby
item.fetch("service") == "redis6"
item.fetch("context") == "source/images/redis6"
item.fetch("dockerfile") == "Dockerfile"
item.fetch("image_repository") == "ghcr.io/tianweilong/redis6"
```

以及 `redis7` 的对应项。

**Step 2: Run test to verify it fails**

Run: `bash tests/prepare-release-matrix.sh`
Expected: FAIL，因为配置文件还不存在。

**Step 3: Write minimal implementation**

创建 `config/services.docker-images.json`：

```json
{
  "project": "docker-images",
  "services": [
    {
      "service": "redis6",
      "image_repository": "ghcr.io/tianweilong/redis6",
      "context": "source/images/redis6",
      "dockerfile": "Dockerfile",
      "build_args": []
    },
    {
      "service": "redis7",
      "image_repository": "ghcr.io/tianweilong/redis7",
      "context": "source/images/redis7",
      "dockerfile": "Dockerfile",
      "build_args": []
    }
  ]
}
```

**Step 4: Run test to verify it passes**

Run: `bash tests/prepare-release-matrix.sh`
Expected: PASS，新样例配置可被矩阵脚本正确解析。

### Task 2: 放宽 release_targets 解析逻辑

**Files:**
- Modify: `.github/workflows/release-service.yml`
- Modify: `tests/release-workflow.sh`
- Test: `tests/release-workflow.sh`

**Step 1: Write the failing test**

更新 `tests/release-workflow.sh`，要求 workflow 满足：

```bash
grep -q 'npm)' "$file"
grep -q 'target_services="${target_services},${target}"' "$file"
```

并删除或改写“未知目标必须直接报不支持”的旧断言，使其允许普通 service 名透传。

**Step 2: Run test to verify it fails**

Run: `bash tests/release-workflow.sh`
Expected: FAIL，因为 workflow 仍使用固定枚举。

**Step 3: Write minimal implementation**

修改 `.github/workflows/release-service.yml` 的“解析发布目标”步骤：

- 保留 `npm` 的特殊语义
- 删除 `remote`、`relay`、`new-api` 这种硬编码映射
- 对其他非空目标统一执行：

```bash
target_services="${target_services},${target}"
```

仍然保留去重逻辑。

**Step 4: Run test to verify it passes**

Run: `bash tests/release-workflow.sh`
Expected: PASS，workflow 已支持任意 service 名。

### Task 3: 评估并落地固定 latest 标签策略

**Files:**
- Modify: `scripts/prepare-release-matrix.rb`
- Modify: `.github/workflows/release-service.yml`
- Modify: `config/services.docker-images.json`
- Test: `tests/prepare-release-matrix.sh`
- Test: `tests/release-workflow.sh`

**Step 1: Write the failing test**

新增断言，要求公共镜像仓库对应的矩阵或 workflow 最终只产出 `latest` 标签，不再依赖语义化 Git tag 比较。

最小测试思路：

- 当 `SOURCE_TAG='latest'` 且服务来自 `config/services.docker-images.json` 时
- 构建输出的 tags 应只包含 `:latest`

**Step 2: Run tests to verify they fail**

Run: `bash tests/prepare-release-matrix.sh`
Expected: FAIL

Run: `bash tests/release-workflow.sh`
Expected: FAIL

**Step 3: Choose minimal implementation**

推荐两种实现中选一种：

- 方案 A：在 `config/services.docker-images.json` 中增加 `tags: ["latest"]`，并由 `prepare-release-matrix.rb` 下沉到矩阵
- 方案 B：先约定源仓库始终传 `SOURCE_TAG=latest`，workflow 继续按 `${SOURCE_TAG}` 推送

优先实现方案 B 以降低改动面；若后续需要更清晰的语义，再演进到方案 A。

**Step 4: Run tests to verify chosen strategy passes**

Run: `bash tests/prepare-release-matrix.sh`
Expected: PASS

Run: `bash tests/release-workflow.sh`
Expected: PASS

### Task 4: 补充开发者文档

**Files:**
- Modify: `docs/developer-guide.md`
- Test: `docs/developer-guide.md`

**Step 1: Write minimal documentation**

在 `docs/developer-guide.md` 中补充：

- `release_targets` 已支持直接传 service 名
- 如何为 `images/<目录名>/Dockerfile` 结构的新仓库编写 `config/services.<repo>.json`
- 公共镜像仓库建议的触发方式：源仓库识别变更目录后触发 `deploy-center`

**Step 2: Verify documentation references**

Run: `rg -n "release_targets|images/<目录名>|config/services\\.<repo>\\.json|变更目录" docs/developer-guide.md`
Expected: 输出新增说明位置。

### Task 5: 为源仓库设计最小触发 workflow

**Files:**
- Create: `docs/plans/source-repo-public-images-workflow-example.md`

**Step 1: Write example workflow**

新增一份示例文档，包含一个最小 GitHub Actions workflow，步骤为：

1. checkout
2. 计算 `git diff --name-only` 范围
3. 提取 `images/<dir>` 目录名
4. 若为空则退出
5. 调用 `repository_dispatch` 触发 `deploy-center`

示例中明确传递：

```yaml
source_repository
source_ref
source_sha
source_tag: latest
release_targets
```

**Step 2: Review example for completeness**

Run: `sed -n '1,220p' docs/plans/source-repo-public-images-workflow-example.md`
Expected: 示例足够让后续在新仓库中直接复制改造。

### Task 6: 完整验证

**Files:**
- Test: `.github/workflows/release-service.yml`
- Test: `scripts/prepare-release-matrix.rb`
- Test: `config/services.docker-images.json`
- Test: `docs/developer-guide.md`

**Step 1: Validate YAML**

Run: `ruby -e "require 'yaml'; YAML.load_file('.github/workflows/release-service.yml'); puts 'YAML OK'"`
Expected: PASS，并输出 `YAML OK`

**Step 2: Run shell regression tests**

Run: `bash tests/prepare-release-matrix.sh`
Expected: PASS

Run: `bash tests/release-workflow.sh`
Expected: PASS

Run: `bash tests/ghcr-references.sh`
Expected: PASS，若测试已更新为包含新仓库镜像引用。

**Step 3: Inspect diff**

Run: `git diff -- .github/workflows/release-service.yml scripts/prepare-release-matrix.rb config/services.docker-images.json tests/prepare-release-matrix.sh tests/release-workflow.sh docs/developer-guide.md docs/plans/2026-03-18-public-docker-images-design.md docs/plans/2026-03-18-public-docker-images.md`
Expected: 仅包含本次公共镜像仓库接入相关变更。

**Step 4: Commit**

```bash
git add .github/workflows/release-service.yml \
  scripts/prepare-release-matrix.rb \
  config/services.docker-images.json \
  tests/prepare-release-matrix.sh \
  tests/release-workflow.sh \
  docs/developer-guide.md \
  docs/plans/2026-03-18-public-docker-images-design.md \
  docs/plans/2026-03-18-public-docker-images.md
git commit -m "feat: support public docker image repository release"
```
