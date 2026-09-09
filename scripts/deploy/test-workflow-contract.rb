#!/usr/bin/env ruby
require 'yaml'
require 'tmpdir'
require 'open3'
require 'fileutils'

def check(condition, message)
  raise message unless condition
end

root = File.expand_path('../..', __dir__)
Dir.chdir(root)
runtime = %w[DB_PASSWORD JWT_SECRET ADMIN_USERNAME ADMIN_PASSWORD JUNGOL_USERNAME JUNGOL_PASSWORD]
ssh = %w[DEPLOY_HOST DEPLOY_USER DEPLOY_PORT DEPLOY_KEY]
optional = %w[VITE_KAKAO_MAP_API_KEY WEBHOOK_URL]
local_debug = %w[COLLECTOR_RUN_ONCE]
example = File.read('.env.example')
check(example.scan(/^([A-Z_]+)=/).flatten.sort == (runtime + optional + local_debug).sort, 'Unexpected .env.example assignments')
inventory = example.lines.grep(/^#/).join.scan(/\b[A-Z][A-Z_]+\b/)
(runtime + ssh + optional).each { |key| check(inventory.include?(key), "Missing secret inventory: #{key}") }

workflow = YAML.load_file('.github/workflows/deploy.yaml')
deploy_environment = workflow.fetch('jobs').fetch('deploy').fetch('env')
check(deploy_environment.fetch('WEBHOOK_URL') == '${{ secrets.WEBHOOK_URL }}', 'Optional webhook must reach renderer environment')
check(!deploy_environment.key?('COLLECTOR_RUN_ONCE'), 'Local collector one-shot setting must not reach deployment')
steps = workflow.fetch('jobs').fetch('deploy').fetch('steps')
check(steps.first['name'] == 'Validate required GitHub secrets', 'Validation must be first')
check(steps[1]['uses'] == 'actions/checkout@v4', 'Checkout must follow validation')
validate = steps.first.fetch('run')
deploy = steps.find { |step| step['name'] == 'Render root environment and deploy' }.fetch('run')
check(!validate.match?(/\bWEBHOOK_URL\b/), 'Optional webhook must not become a required GitHub secret')
check(!deploy.match?(/runtime-secrets|\.secrets|\bsource\b|JUNGOL_DB_PASSWORD/), 'Obsolete secret provisioning')
%w[StrictHostKeyChecking=accept-new BatchMode=yes].each { |text| check(deploy.include?(text), "Missing SSH safety: #{text}") }
['repository=/home/ana/Desktop/ana/anabada-new', 'git clone --depth 1 --branch main --single-branch https://github.com/ANA-CNU/anabada-new.git "$repository"', 'git fetch --depth 1 origin main', 'git reset --hard origin/main', 'install -m 0600 "$1/.env" .env.next', 'mv -f .env.next .env', 'docker compose --env-file .env -f docker-compose.prod.yaml config --quiet', 'docker compose --env-file .env -f docker-compose.prod.yaml up -d --build --remove-orphans --wait --wait-timeout 180'].each do |text|
  check(deploy.include?(text), "Missing deployment gate: #{text}")
end
check(deploy.scan(/docker compose --env-file \.env -f docker-compose\.prod\.yaml up /).length == 1, 'Deployment must have one canonical Compose-up path')
check(!deploy.match?(/run-migrations|--no-deps|--profile|--scale/), 'Deployment must not bypass Compose migration dependencies')
check(!deploy.match?(/DEPLOY_SHA|git status --porcelain|git merge --ff-only|git pull --ff-only/), 'Deployment must not require an exact SHA or clean checkout')
check(!File.read('scripts/deploy/render-production-env.sh').include?('COLLECTOR_RUN_ONCE'), 'Local collector one-shot setting must not enter generated production env')

expected = {
  'anabada-frontend' => ['VITE_KAKAO_MAP_API_KEY'], 'anabada-mysql' => ['DB_PASSWORD'],
  'anabada-backend' => %w[DB_PASSWORD JWT_SECRET WEBHOOK_URL],
  'anabada-middleware' => %w[JWT_SECRET ADMIN_USERNAME ADMIN_PASSWORD],
  'jungol-migrator' => ['DB_PASSWORD'],
  'jungol-collector' => %w[DB_PASSWORD JUNGOL_USERNAME JUNGOL_PASSWORD WEBHOOK_URL], 'bada-nginx' => []
}

ci = YAML.load_file('.github/workflows/ci.yaml')
verify_environment = ci.fetch('jobs').fetch('verify').fetch('env')
check(verify_environment.fetch('COMPOSE_BAKE') == 'false', 'CI must disable Compose Bake delegation')
backend_step = ci.fetch('jobs').fetch('verify').fetch('steps').find do |step|
  step['name'] == 'Backend unit, type, build, and migrated MySQL contracts'
end
check(!backend_step.nil?, 'CI backend migrated-MySQL gate is missing')
backend_commands = backend_step.fetch('run')
%w[bun\ run\ test:unit bun\ run\ typecheck bun\ run\ lint bun\ run\ build sh\ backend/test/run-mysql.sh].each do |command|
  check(backend_commands.include?(command), "CI backend gate is missing: #{command}")
end
check(!backend_commands.match?(/backend_qa|TEST_DATABASE_URL|CREATE DATABASE/), 'CI backend gate must not use the legacy shared MySQL flow')

remote_deploy = /<<'DEPLOY'\n(?<script>.*?)\nDEPLOY\n\z/m.match(deploy)&.[](:script)
check(!remote_deploy.nil?, 'Deployment must retain the remote deployment shell')
check(remote_deploy.include?('export COMPOSE_BAKE=false'), 'Remote deployment shell must disable Compose Bake delegation')
check(remote_deploy.index('export COMPOSE_BAKE=false') < remote_deploy.index('docker compose --env-file .env -f docker-compose.prod.yaml up '), 'Remote deployment shell must disable Compose Bake before its canonical Compose up')
check(remote_deploy.include?('git -C "$repository" rev-parse --is-inside-work-tree'), 'Existing deployment path must be a Git working tree')
check(remote_deploy.include?('Deployment repository path is not a Git working tree'), 'Non-Git deployment path must fail safely')

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
  if mode == 'dev'
    check(!config.fetch('services').key?('jungol-migrator'), 'Dev must not include the automatic migrator')
  else
    migrator = config.fetch('services').fetch('jungol-migrator')
    check(!migrator.key?('profiles'), "#{mode} migrator must be included in normal Compose up")
    %w[anabada-frontend anabada-middleware anabada-backend jungol-collector].each do |service|
      check(config.fetch('services').fetch(service).fetch('depends_on').fetch('jungol-migrator').fetch('condition') == 'service_completed_successfully', "#{mode}/#{service} must wait for migrator success")
    end
  end
end

Dir.mktmpdir('workflow-contract-') do |dir|
  mock = File.join(dir, 'ssh')
  File.write(mock, <<~'SH')
    #!/usr/bin/env bash
    set -euo pipefail
    printf 'ssh-deploy\n' >> "$MOCK_LOG"
    [[ "$1" == '-i' ]]
    env_file="${2%/key}/.env"
    test -f "$env_file"
    grep -Fqx "WEBHOOK_URL=\"${EXPECTED_WEBHOOK}\"" "$env_file"
    printf '%s' "${2%/key}" > "$MOCK_TEMP"
    docker compose --env-file "$env_file" -f docker-compose.prod.yaml config --quiet
    cat > /dev/null
    exit 73
  SH
  File.chmod(0700, mock)
  env = (runtime + ssh).to_h { |key| [key, 'fake-workflow-value'] }
  env.merge!('DEPLOY_PORT' => '22', 'VITE_KAKAO_MAP_API_KEY' => nil, 'WEBHOOK_URL' => nil,
             'EXPECTED_WEBHOOK' => '', 'PATH' => "#{dir}:#{ENV.fetch('PATH')}", 'MOCK_LOG' => "#{dir}/calls", 'MOCK_TEMP' => "#{dir}/transit")
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
    output, errors, status = Open3.capture3(env.merge('VITE_KAKAO_MAP_API_KEY' => kakao, 'WEBHOOK_URL' => nil, 'EXPECTED_WEBHOOK' => '', 'JUNGOL_PASSWORD' => '$(touch /tmp/forbidden-workflow-command); `id` # literal'), 'bash', '-c', combined)
    check(status.exitstatus == 73 && output.empty? && errors.empty?, 'Valid fake secrets did not stop at mock deployment')
    check(!Dir.exist?(File.read(env['MOCK_TEMP'])), 'Runner transit directory leaked')
  end
  webhook = 'https://discord.com/api/webhooks/000000000000000000/placeholder-not-live'
  output, errors, status = Open3.capture3(env.merge('WEBHOOK_URL' => webhook, 'EXPECTED_WEBHOOK' => webhook), 'bash', '-c', combined)
  check(status.exitstatus == 73 && output.empty? && errors.empty?, 'Optional webhook did not reach mock deployment without logs')
  check(!Dir.exist?(File.read(env['MOCK_TEMP'])), 'Runner transit directory leaked after webhook render')
  check(File.readlines(env['MOCK_LOG']).length == 3, 'Unexpected SSH calls beyond mock deployment')
end

Dir.mktmpdir('deployment-git-contract-') do |dir|
  origin = File.join(dir, 'origin.git')
  seed = File.join(dir, 'seed')
  repository = File.join(dir, 'checkout', 'anabada-new')
  docker = File.join(dir, 'docker')
  timeout = File.join(dir, 'timeout')
  compose_log = File.join(dir, 'compose-calls')
  transit = File.join(dir, 'transit')
  check(system('git', 'init', '--bare', origin), 'Cannot create disposable bare repository')
  check(system('git', 'init', '-b', 'main', seed), 'Cannot create disposable source repository')
  File.write(File.join(seed, 'README.md'), "first\n")
  check(system('git', '-C', seed, 'add', 'README.md'), 'Cannot stage disposable source repository')
  check(system('git', '-C', seed, '-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'first'), 'Cannot commit disposable source repository')
  check(system('git', '-C', seed, 'remote', 'add', 'origin', origin), 'Cannot add disposable source remote')
  check(system('git', '-C', seed, 'push', 'origin', 'main'), 'Cannot push disposable source repository')
  File.write(docker, "#!/usr/bin/env bash\nprintf '%s\\n' \"$*\" >> \"$COMPOSE_LOG\"\n")
  File.chmod(0700, docker)
  File.write(timeout, "#!/usr/bin/env bash\nshift\nexec \"$@\"\n")
  File.chmod(0700, timeout)
  fixture = remote_deploy.sub('/home/ana/Desktop/ana/anabada-new', repository).sub('https://github.com/ANA-CNU/anabada-new.git', "file://#{origin}")
  write_transit = lambda do
    Dir.mkdir(transit)
    File.write(File.join(transit, '.env'), "DB_PASSWORD=fixture\n")
  end
  command_env = { 'PATH' => "#{dir}:#{ENV.fetch('PATH')}", 'COMPOSE_LOG' => compose_log }

  write_transit.call
  _, errors, status = Open3.capture3(command_env, 'bash', '-se', '--', transit, stdin_data: fixture)
  check(status.success?, "Fresh clone deployment fixture failed: #{errors}")
  check(File.exist?(File.join(repository, '.git')), 'Fresh deployment did not clone main')
  history, _, history_status = Open3.capture3('git', '-C', repository, 'rev-list', '--count', 'HEAD')
  check(history_status.success? && history.strip == '1', 'Fresh deployment is not shallow')
  check(File.readlines(compose_log).length == 3, 'Fresh clone did not reach exactly one Compose deployment sequence')

  File.write(File.join(repository, 'local-untracked'), "preserve\n")
  FileUtils.mkdir_p(File.join(repository, 'database', 'mysql_data'))
  File.write(File.join(repository, 'database', 'mysql_data', 'sentinel'), "preserve\n")
  File.write(File.join(repository, 'README.md'), "local change\n")
  File.write(File.join(seed, 'README.md'), "second\n")
  check(system('git', '-C', seed, 'add', 'README.md'), 'Cannot stage disposable update')
  check(system('git', '-C', seed, '-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'second'), 'Cannot commit disposable update')
  check(system('git', '-C', seed, 'push', 'origin', 'main'), 'Cannot push disposable update')
  write_transit.call
  _, errors, status = Open3.capture3(command_env, 'bash', '-se', '--', transit, stdin_data: fixture)
  check(status.success?, 'Existing checkout reset fixture failed')
  check(File.read(File.join(repository, 'README.md')) == "second\n", 'Existing checkout did not reset tracked code to main')
  history, _, history_status = Open3.capture3('git', '-C', repository, 'rev-list', '--count', 'HEAD')
  check(history_status.success? && history.strip == '1', 'Existing deployment is not shallow after reset')
  check(File.read(File.join(repository, 'local-untracked')) == "preserve\n", 'Existing checkout lost an untracked file')
  check(File.read(File.join(repository, 'database', 'mysql_data', 'sentinel')) == "preserve\n", 'Existing checkout lost untracked database data')

  non_git = File.join(dir, 'non-git')
  Dir.mkdir(non_git)
  File.write(File.join(non_git, 'sentinel'), "preserve\n")
  non_git_fixture = fixture.sub(repository, non_git)
  write_transit.call
  calls_before = File.readlines(compose_log).length
  _, errors, status = Open3.capture3(command_env, 'bash', '-se', '--', transit, stdin_data: non_git_fixture)
  check(!status.success? && errors.include?('Deployment repository path is not a Git working tree'), 'Non-Git path must fail before deployment')
  check(File.read(File.join(non_git, 'sentinel')) == "preserve\n", 'Non-Git path was modified')
  check(File.readlines(compose_log).length == calls_before, 'Non-Git path reached Compose')
end
puts 'Workflow contract passed: 10 missing secrets, malformed input, optional Kakao/webhook, literal secret values, mock deployment/config, cleanup, and static topology.'
