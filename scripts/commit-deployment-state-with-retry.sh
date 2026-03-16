#!/usr/bin/env bash

set -euo pipefail

: "${RELEASE_MATRIX:?RELEASE_MATRIX 为必填环境变量}"
: "${SOURCE_REF:?SOURCE_REF 为必填环境变量}"
: "${SOURCE_SHA:?SOURCE_SHA 为必填环境变量}"
: "${SOURCE_TAG:?SOURCE_TAG 为必填环境变量}"

remote_name="${DEPLOYMENT_STATE_REMOTE:-origin}"
branch_name="${DEPLOYMENT_STATE_BRANCH:-main}"
max_attempts="${DEPLOYMENT_STATE_PUSH_MAX_ATTEMPTS:-3}"

git config user.email 'action@github.com'
git config user.name 'GitHub Action'

update_deployment_state() {
  ruby <<'RUBY'
  require 'json'

  matrix = JSON.parse(ENV.fetch('RELEASE_MATRIX')).fetch('include')
  matrix.each do |service|
    ok = system(
      {
        'SERVICE_NAME' => service.fetch('service'),
        'SOURCE_REF' => ENV.fetch('SOURCE_REF'),
        'SOURCE_SHA' => ENV.fetch('SOURCE_SHA'),
        'IMAGE_REPOSITORY' => service.fetch('image_repository'),
        'IMAGE_TAG' => service.fetch('tag')
      },
      './scripts/update-deployment-state.sh'
    )
    abort("更新 #{service.fetch('service')} 失败") unless ok
  end
RUBY
}

attempt=1
while [ "$attempt" -le "$max_attempts" ]; do
  echo "开始第 ${attempt}/${max_attempts} 次部署状态提交尝试。"

  git fetch "$remote_name" "$branch_name"
  git reset --hard "$remote_name/$branch_name"

  update_deployment_state

  if git diff --quiet; then
    echo '没有可提交的部署状态变更。'
    exit 0
  fi

  git add environments
  git commit -m "chore: 更新部署状态 (${SOURCE_TAG})"

  if git push "$remote_name" HEAD:"$branch_name"; then
    echo '部署状态推送成功。'
    exit 0
  fi

  if [ "$attempt" -eq "$max_attempts" ]; then
    echo "部署状态推送在 ${max_attempts} 次尝试后仍失败。" >&2
    exit 1
  fi

  echo '部署状态推送失败，准备基于最新远端状态重试。' >&2
  attempt=$((attempt + 1))
done
