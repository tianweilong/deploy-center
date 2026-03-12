#!/usr/bin/env bash

set -euo pipefail

: "${DEPLOY_ENV:?DEPLOY_ENV 为必填环境变量}"
: "${SERVICE_NAME:?SERVICE_NAME 为必填环境变量}"
: "${SOURCE_REF:?SOURCE_REF 为必填环境变量}"
: "${SOURCE_SHA:?SOURCE_SHA 为必填环境变量}"
: "${IMAGE_REPOSITORY:?IMAGE_REPOSITORY 为必填环境变量}"
: "${IMAGE_TAG:?IMAGE_TAG 为必填环境变量}"

file="environments/${DEPLOY_ENV}/${SERVICE_NAME}/deployment.yaml"
[ -f "$file" ] || { echo "缺少部署描述文件：$file" >&2; exit 1; }

TARGET_FILE="$file" ruby <<'RUBY'
require 'yaml'
file = ENV.fetch('TARGET_FILE')
data = YAML.load_file(file)
data['source']['ref'] = ENV.fetch('SOURCE_REF')
data['source']['sha'] = ENV.fetch('SOURCE_SHA')
data['image']['repository'] = ENV.fetch('IMAGE_REPOSITORY')
data['image']['tag'] = ENV.fetch('IMAGE_TAG')
File.write(file, YAML.dump(data))
RUBY
