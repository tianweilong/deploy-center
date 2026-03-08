#!/usr/bin/env bash

set -euo pipefail

: "${DEPLOY_ENV:?DEPLOY_ENV is required}"
: "${SERVICE_NAME:?SERVICE_NAME is required}"
: "${SOURCE_REF:?SOURCE_REF is required}"
: "${SOURCE_SHA:?SOURCE_SHA is required}"
: "${IMAGE_REPOSITORY:?IMAGE_REPOSITORY is required}"
: "${IMAGE_TAG:?IMAGE_TAG is required}"

file="environments/${DEPLOY_ENV}/${SERVICE_NAME}/deployment.yaml"
[ -f "$file" ] || { echo "Missing deployment descriptor: $file" >&2; exit 1; }

ruby <<'RUBY'
require 'yaml'
file = ENV.fetch('TARGET_FILE')
data = YAML.load_file(file)
data['source']['ref'] = ENV.fetch('SOURCE_REF')
data['source']['sha'] = ENV.fetch('SOURCE_SHA')
data['image']['repository'] = ENV.fetch('IMAGE_REPOSITORY')
data['image']['tag'] = ENV.fetch('IMAGE_TAG')
File.write(file, YAML.dump(data))
RUBY
