#!/usr/bin/env ruby
require 'yaml'
require 'tmpdir'
require 'open3'

def check(condition, message)
  raise message unless condition
end

root = File.expand_path('../..', __dir__)
Dir.chdir(root)
runtime = %w[DB_PASSWORD JWT_SECRET ADMIN_USERNAME ADMIN_PASSWORD JUNGOL_USERNAME JUNGOL_PASSWORD]
ssh = %w[DEPLOY_HOST DEPLOY_USER DEPLOY_PORT DEPLOY_KEY]
optional = %w[VITE_KAKAO_MAP_API_KEY WEBHOOK_URL]
example = File.read('.env.example')
check(example.scan(/^([A-Z_]+)=/).flatten.sort == (runtime + optional).sort, 'Unexpected .env.example assignments')
inventory = example.lines.grep(/^#/).join.scan(/\b[A-Z][A-Z_]+\b/)
(runtime + ssh + optional).each { |key| check(inventory.include?(key), "Missing secret inventory: #{key}") }

workflow = YAML.load_file('.github/workflows/deploy.yaml')
steps = workflow.fetch('jobs').fetch('deploy').fetch('steps')
check(steps.first['name'] == 'Validate required GitHub secrets', 'Validation must be first')
check(steps[1]['uses'] == 'actions/checkout@v4', 'Checkout must follow validation')
validate = steps.first.fetch('run')
deploy = steps.find { |step| step['name'] == 'Render root environment and deploy' }.fetch('run')
check(!deploy.match?(/runtime-secrets|\.secrets|\bsource\b|JUNGOL_DB_PASSWORD/), 'Obsolete secret provisioning')
%w[StrictHostKeyChecking=accept-new BatchMode=yes].each { |text| check(deploy.include?(text), "Missing SSH safety: #{text}") }
['git status --porcelain --untracked-files=all', 'git merge --ff-only "$2"', 'test "$(git rev-parse HEAD)" = "$2"', 'test "$(git rev-parse origin/main)" = "$1"', 'install -m 0600 "$1/.env" .env.next', 'mv -f .env.next .env', 'docker compose --env-file .env -f docker-compose.prod.yaml config --quiet', '--wait --wait-timeout 180'].each do |text|
  check(deploy.include?(text), "Missing deployment gate: #{text}")
end

expected = {
  'anabada-frontend' => ['VITE_KAKAO_MAP_API_KEY'], 'anabada-mysql' => ['DB_PASSWORD'],
  'anabada-backend' => %w[DB_PASSWORD JWT_SECRET WEBHOOK_URL],
  'anabada-middleware' => %w[JWT_SECRET ADMIN_USERNAME ADMIN_PASSWORD],
  'jungol-collector' => %w[DB_PASSWORD JUNGOL_USERNAME JUNGOL_PASSWORD WEBHOOK_URL], 'bada-nginx' => []
}
%w[dev stage prod].each do |mode|
  config = YAML.load_file("docker-compose.#{mode}.yaml")
  check(!config.key?('secrets'), 'Top-level secrets forbidden')
  config.fetch('services').each do |name, service|
    check(!service.key?('env_file') && !service.key?('secrets'), "Secret injection forbidden: #{name}")
    keys = service.to_yaml.scan(/\$\{([A-Z_]+)/).flatten.uniq.sort
    check(keys == expected.fetch(name).sort, "Wrong secret distribution: #{mode}/#{name}")
  end
  collector = config.fetch('services').fetch('jungol-collector')
  check(collector.fetch('environment').keys.sort == %w[DB_PASSWORD JUNGOL_PASSWORD JUNGOL_USERNAME WEBHOOK_URL], 'Collector settings must be static')
end

Dir.mktmpdir('workflow-contract-') do |dir|
  mock = File.join(dir, 'ssh')
  File.write(mock, <<~'SH')
    #!/usr/bin/env bash
    set -euo pipefail
    printf 'ssh-preflight\n' >> "$MOCK_LOG"
    [[ "$1" == '-i' ]]
    env_file="${2%/key}/.env"
    test -f "$env_file"
    printf '%s' "${2%/key}" > "$MOCK_TEMP"
    docker compose --env-file "$env_file" -f docker-compose.prod.yaml config --quiet
    cat > /dev/null
    exit 73
  SH
  File.chmod(0700, mock)
  env = (runtime + ssh).to_h { |key| [key, 'fake-workflow-value'] }
  env.merge!('DEPLOY_PORT' => '22', 'DEPLOY_SHA' => 'a' * 40, 'VITE_KAKAO_MAP_API_KEY' => nil, 'WEBHOOK_URL' => nil,
             'PATH' => "#{dir}:#{ENV.fetch('PATH')}", 'MOCK_LOG' => "#{dir}/calls", 'MOCK_TEMP' => "#{dir}/transit")
  combined = validate + "\n" + deploy
  _, errors, status = Open3.capture3('bash', '-n', stdin_data: combined)
  check(status.success?, "Invalid deployment shell: #{errors}")
  (runtime + ssh).each do |key|
    output, errors, status = Open3.capture3(env.merge(key => ''), 'bash', '-c', combined)
    check(!status.success? && output.empty? && errors == "Missing required GitHub secret: #{key}\n", "Missing-secret failure: #{key}")
    check(!File.exist?(env['MOCK_LOG']), 'SSH ran before validation')
  end
  _, _, status = Open3.capture3(env.merge('DB_PASSWORD' => "bad\nvalue"), 'bash', '-c', combined)
  check(!status.success? && !File.exist?(env['MOCK_LOG']), 'Malformed runtime secret reached SSH')
  [nil, 'fake-kakao'].each do |kakao|
    output, errors, status = Open3.capture3(env.merge('VITE_KAKAO_MAP_API_KEY' => kakao, 'WEBHOOK_URL' => kakao, 'JUNGOL_PASSWORD' => '$(touch /tmp/forbidden-workflow-command); `id` # literal'), 'bash', '-c', combined)
    check(status.exitstatus == 73 && output.empty? && errors.empty?, 'Valid fake secrets did not stop at mock preflight')
    check(!Dir.exist?(File.read(env['MOCK_TEMP'])), 'Runner transit directory leaked')
  end
  check(File.readlines(env['MOCK_LOG']).length == 2, 'Unexpected SSH calls beyond preflight')
end
puts 'Workflow contract passed: 10 missing secrets, malformed input, optional Kakao, literal secret values, mock preflight/config, cleanup, and static topology.'
