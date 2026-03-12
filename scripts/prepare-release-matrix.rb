#!/usr/bin/env ruby
require 'json'

config_path = ARGV.fetch(0)
config = JSON.parse(File.read(config_path))
requested_services = ENV.fetch('TARGET_SERVICES')
                    .split(',')
                    .map(&:strip)
                    .reject(&:empty?)
                    .uniq
source_sha = ENV.fetch('SOURCE_SHA')
service_map = config.fetch('services').each_with_object({}) do |service, memo|
  memo[service.fetch('service')] = service
end

include_items = requested_services.map do |name|
  service = service_map[name]
  abort("不支持的服务：#{name}") unless service

  build_args = service.fetch('build_args').map do |build_arg|
    env_name = build_arg.fetch('env')
    value = ENV[env_name].to_s
    if value.empty? || value.start_with?('CHANGE_ME')
      abort("缺少必填构建参数环境变量：#{env_name}")
    end

    "#{build_arg.fetch('name')}=#{value}"
  end

  {
    'service' => service.fetch('service'),
    'image_repository' => service.fetch('image_repository'),
    'context' => service.fetch('context'),
    'dockerfile' => service.fetch('dockerfile'),
    'platforms' => service.fetch('platforms'),
    'build_args' => build_args,
    'tag' => source_sha
  }
end

puts JSON.generate({ 'include' => include_items })
