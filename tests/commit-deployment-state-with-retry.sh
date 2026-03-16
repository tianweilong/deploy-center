#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

repo_root=$(pwd)
tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

remote_repo="$tmpdir/remote.git"
seed_repo="$tmpdir/seed"
runner_repo="$tmpdir/runner"
conflict_repo="$tmpdir/conflict"

create_deployment_file() {
  local target_file=$1
  local source_ref=$2
  local source_sha=$3
  local image_repository=$4
  local image_tag=$5

  mkdir -p "$(dirname "$target_file")"
  cat > "$target_file" <<YAML
service: vibe-kanban-remote
project: vibe-kanban
repository: tianweilong/vibe-kanban
deploy_mode: compose
source:
  ref: ${source_ref}
  sha: ${source_sha}
image:
  repository: ${image_repository}
  tag: ${image_tag}
YAML
}

git init --bare "$remote_repo" >/dev/null

git clone "$remote_repo" "$seed_repo" >/dev/null
(
  cd "$seed_repo"
  git config user.email 'seed@example.com'
  git config user.name 'Seed User'
  mkdir -p scripts
  cp "$repo_root/scripts/update-deployment-state.sh" scripts/update-deployment-state.sh
  chmod +x scripts/update-deployment-state.sh
  create_deployment_file \
    "environments/vibe-kanban-remote/deployment.yaml" \
    'refs/heads/main' \
    'oldsha' \
    'old.repo/example' \
    'oldtag'
  git add .
  git commit -m 'seed' >/dev/null
  git branch -M main
  git push origin HEAD:main >/dev/null
)

git clone "$remote_repo" "$runner_repo" >/dev/null
git clone "$remote_repo" "$conflict_repo" >/dev/null

(
  cd "$conflict_repo"
  git checkout main >/dev/null
  git config user.email 'conflict@example.com'
  git config user.name 'Conflict User'
)

(
  cd "$runner_repo"
  git checkout main >/dev/null
  mkdir -p scripts .git/hooks
  cp "$repo_root/scripts/update-deployment-state.sh" scripts/update-deployment-state.sh
  chmod +x scripts/update-deployment-state.sh
  if [ -f "$repo_root/scripts/commit-deployment-state-with-retry.sh" ]; then
    cp "$repo_root/scripts/commit-deployment-state-with-retry.sh" scripts/commit-deployment-state-with-retry.sh
    chmod +x scripts/commit-deployment-state-with-retry.sh
  fi

  cat > .git/hooks/pre-push <<HOOK
#!/usr/bin/env bash
set -euo pipefail
marker_file="$tmpdir/pre-push-ran"
if [ -f "\$marker_file" ]; then
  exit 0
fi

touch "\$marker_file"
cd "$conflict_repo"
cat > environments/vibe-kanban-remote/deployment.yaml <<'YAML'
service: vibe-kanban-remote
project: vibe-kanban
repository: tianweilong/vibe-kanban
deploy_mode: compose
source:
  ref: refs/heads/main
  sha: conflictsha
image:
  repository: ghcr.io/tianweilong/vibe-kanban-remote
  tag: conflict-tag
YAML
git add environments/vibe-kanban-remote/deployment.yaml
git commit -m 'conflict update' >/dev/null
git push origin HEAD:main >/dev/null
HOOK
  chmod +x .git/hooks/pre-push

  RELEASE_MATRIX='{"include":[{"service":"vibe-kanban-remote","image_repository":"ghcr.io/tianweilong/vibe-kanban-remote","tag":"v1.2.3"}]}' \
  SOURCE_REF='refs/tags/v1.2.3' \
  SOURCE_SHA='newsha123' \
  SOURCE_TAG='v1.2.3' \
  ./scripts/commit-deployment-state-with-retry.sh
)

validation_repo="$tmpdir/validation"
git clone "$remote_repo" "$validation_repo" >/dev/null
(
  cd "$validation_repo"
  git checkout main >/dev/null
  ruby -ryaml -e '
    data = YAML.load_file(ARGV.fetch(0))
    raise "source.ref 更新错误" unless data.dig("source", "ref") == "refs/tags/v1.2.3"
    raise "source.sha 更新错误" unless data.dig("source", "sha") == "newsha123"
    raise "镜像仓库更新错误" unless data.dig("image", "repository") == "ghcr.io/tianweilong/vibe-kanban-remote"
    raise "镜像标签更新错误" unless data.dig("image", "tag") == "v1.2.3"
  ' environments/vibe-kanban-remote/deployment.yaml

  git log --format='%s' main > "$tmpdir/history.txt"
)

grep -q '^conflict update$' "$tmpdir/history.txt"
grep -q '^chore: 更新部署状态 (v1.2.3)$' "$tmpdir/history.txt"
