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
runtime = %w[DB_PASSWORD JWT_SECRET ADMIN_USERNAME ADMIN_PASSWORD]
optional = %w[VITE_KAKAO_MAP_API_KEY WEBHOOK_URL SOLVED_AC_CLIENT_ID SOLVED_AC_CLIENT_SECRET]
example = File.read('.env.example')
check(example.scan(/^([A-Z_]+)=/).flatten.sort == (runtime + optional).sort, 'Unexpected .env.example assignments')
inventory = example.lines.grep(/^#/).join.scan(/\b[A-Z][A-Z_]+\b/)
(runtime + optional).each { |key| check(inventory.include?(key), "Missing secret inventory: #{key}") }

workflow = YAML.load_file('.github/workflows/deploy.yaml')
deploy_job = workflow.fetch('jobs').fetch('deploy')
check(deploy_job.fetch('runs-on') == %w[self-hosted Linux X64 deploy], 'Production must use the self-hosted deploy runner labels')
deploy_environment = deploy_job.fetch('env')
check(deploy_environment.fetch('WEBHOOK_URL') == '${{ secrets.WEBHOOK_URL }}', 'Optional webhook must reach renderer environment')
check(deploy_environment.keys.sort == (runtime + optional).sort, 'Unexpected deployment secrets')
check(!deploy_environment.key?('COLLECTOR_RUN_ONCE'), 'Local collector one-shot setting must not reach deployment')
steps = deploy_job.fetch('steps')
check(steps.first['name'] == 'Verify production runner and required secrets', 'Validation must be first')
check(steps[1]['uses'] == 'actions/checkout@v4', 'Checkout must follow validation')
validate = steps.first.fetch('run')
deploy = steps.find { |step| step['name'] == 'Render root environment and deploy' }.fetch('run')
check(validate.include?('[[ "$RUNNER_NAME" != bada_deploy ]]'), 'Deployment must verify the runner name')
check(optional.none? { |key| validate.include?(key) }, 'Optional secrets must stay optional')
check(!deploy.match?(/runtime-secrets|\.secrets|\bsource\b|\bssh\b|JUNGOL_DB_PASSWORD/), 'Obsolete secret provisioning or remote deployment')
['repository="$HOME/anabada-new"', 'git clone --depth 1 --branch main --single-branch https://github.com/ANA-CNU/anabada-new.git "$repository"', 'git fetch --depth 1 origin main', 'git reset --hard origin/main', 'bash "$GITHUB_WORKSPACE/scripts/deploy/render-production-env.sh" "$repository/.env"'].each do |text|
  check(deploy.include?(text), "Missing deployment gate: #{text}")
end
check(deploy.scan(/docker compose --env-file \.env -f docker-compose\.prod\.yaml up /).length == 1, 'Deployment must have one canonical Compose-up path')
check(!deploy.match?(/run-migrations|--no-deps|--profile|--scale/), 'Deployment must not bypass Compose migration dependencies')
check(!deploy.match?(/DEPLOY_SHA|git status --porcelain|git merge --ff-only|git pull --ff-only/), 'Deployment must not require an exact SHA or clean checkout')
check(!File.read('scripts/deploy/render-production-env.sh').include?('COLLECTOR_RUN_ONCE'), 'Local collector one-shot setting must not enter generated production env')

expected = {
  'anabada-frontend' => ['VITE_KAKAO_MAP_API_KEY'], 'anabada-mysql' => ['DB_PASSWORD'],
  'anabada-backend' => %w[DB_PASSWORD JWT_SECRET WEBHOOK_URL SOLVED_AC_CLIENT_ID SOLVED_AC_CLIENT_SECRET],
  'anabada-middleware' => %w[JWT_SECRET ADMIN_USERNAME ADMIN_PASSWORD],
  'database-migrator' => ['DB_PASSWORD'],
  'bada-nginx' => []
}

ci = YAML.load_file('.github/workflows/ci.yaml')
verify_job = ci.fetch('jobs').fetch('verify')
check(verify_job.fetch('runs-on') == 'ubuntu-latest', 'CI verification must use the GitHub-hosted runner')
verify_environment = verify_job.fetch('env')
check(verify_environment.fetch('COMPOSE_BAKE') == 'false', 'CI must disable Compose Bake delegation')
backend_step = verify_job.fetch('steps').find do |step|
  step['name'] == 'Backend unit, type, build, and migrated MySQL contracts'
end
check(!backend_step.nil?, 'CI backend migrated-MySQL gate is missing')
backend_commands = backend_step.fetch('run')
%w[bun\ run\ test:unit bun\ run\ typecheck bun\ run\ lint bun\ run\ build sh\ backend/test/run-mysql.sh].each do |command|
  check(backend_commands.include?(command), "CI backend gate is missing: #{command}")
end
check(!backend_commands.match?(/backend_qa|TEST_DATABASE_URL|CREATE DATABASE/), 'CI backend gate must not use the legacy shared MySQL flow')

compose_config = 'sudo -n docker compose --env-file .env -f docker-compose.prod.yaml config --quiet'
compose_build = 'timeout 1200 sudo -n COMPOSE_BAKE=false docker compose --env-file .env -f docker-compose.prod.yaml build'
compose_migrate = 'timeout 1200 sudo -n docker compose --env-file .env -f docker-compose.prod.yaml run --rm database-migrator'
compose_stop = 'timeout 60 sudo -n docker compose --env-file .env -f docker-compose.prod.yaml stop anabada-backend'
compose_up = 'timeout 1200 sudo -n docker compose --env-file .env -f docker-compose.prod.yaml up -d --no-build --remove-orphans --wait --wait-timeout 180'
compose_restart = 'timeout 60 sudo -n docker compose --env-file .env -f docker-compose.prod.yaml restart bada-nginx'
compose_ps = 'sudo -n docker compose --env-file .env -f docker-compose.prod.yaml ps'
check(deploy.scan(Regexp.new(Regexp.escape(compose_restart))).length == 1, 'Deployment must restart nginx exactly once')
check(deploy.index(compose_config) < deploy.index(compose_build) && deploy.index(compose_build) < deploy.index(compose_migrate) && deploy.index(compose_migrate) < deploy.index(compose_stop) && deploy.index(compose_stop) < deploy.index(compose_up) && deploy.index(compose_up) < deploy.index(compose_restart) && deploy.index(compose_restart) < deploy.index(compose_ps), 'Deployment Compose sequence must build before stopping apps, then migrate/start, restart nginx, and report state')
check(deploy.include?('git -C "$repository" rev-parse --is-inside-work-tree'), 'Existing deployment path must be a Git working tree')
check(deploy.include?('Deployment repository path is not a Git working tree'), 'Non-Git deployment path must fail safely')

%w[dev stage prod].each do |mode|
  config = YAML.load_file("docker-compose.#{mode}.yaml")
  check(!config.key?('secrets'), 'Top-level secrets forbidden')
  config.fetch('services').each do |name, service|
    check(!service.key?('env_file') && !service.key?('secrets'), "Secret injection forbidden: #{name}")
    keys = service.to_yaml.scan(/\$\{([A-Z_]+)/).flatten.uniq.reject { |key| key == 'COLLECTOR_REVISION' }.sort
    check(keys == expected.fetch(name).sort, "Wrong secret distribution: #{mode}/#{name}")
  end
  services = config.fetch('services')
  check(!services.key?('jungol-collector'), "#{mode} must only run the Baekjoon backend worker")
  check(services.fetch('anabada-backend').fetch('environment').fetch('DB_NAME') == 'boj_bada', "#{mode} must read the BOJ database")
  migrator = services.fetch('database-migrator')
  check(!migrator.key?('profiles'), "#{mode} migrator must be included in normal Compose up")
  if mode == 'prod'
    check(migrator.fetch('command').last == '--require-boj-import', 'Production migration must require the legacy import')
    check(!config.key?('networks') && services.values.none? { |service| service.key?('networks') || service.key?('network_mode') }, 'Production must use the implicit Compose network')
    published_ports = services.select { |_, service| service.key?('ports') }.transform_values { |service| service.fetch('ports') }
    check(published_ports == { 'bada-nginx' => ['80:80'] }, 'Production must publish only Nginx on port 80')
    %w[anabada-backend anabada-middleware].each do |service|
      check(services.fetch(service).fetch('environment').fetch('ALLOWED_ORIGIN') == 'https://bada.anacnu.com', "Wrong production origin: #{service}")
    end
  end
  %w[anabada-frontend anabada-middleware anabada-backend].each do |service|
    check(services.fetch(service).fetch('depends_on').fetch('database-migrator').fetch('condition') == 'service_completed_successfully', "#{mode}/#{service} must wait for migrator success")
  end

end

Dir.mktmpdir('deployment-git-contract-') do |dir|
  origin = File.join(dir, 'origin.git')
  seed = File.join(dir, 'seed')
  repository = File.join(dir, 'checkout', 'anabada-new')
  docker = File.join(dir, 'docker')
  sudo = File.join(dir, 'sudo')
  timeout = File.join(dir, 'timeout')
  compose_log = File.join(dir, 'compose-calls')
  check(system('git', 'init', '--bare', origin), 'Cannot create disposable bare repository')
  check(system('git', 'init', '-b', 'main', seed), 'Cannot create disposable source repository')
  File.write(File.join(seed, 'README.md'), "first\n")
  check(system('git', '-C', seed, 'add', 'README.md'), 'Cannot stage disposable source repository')
  check(system('git', '-C', seed, '-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'first'), 'Cannot commit disposable source repository')
  check(system('git', '-C', seed, 'remote', 'add', 'origin', origin), 'Cannot add disposable source remote')
  check(system('git', '-C', seed, 'push', 'origin', 'main'), 'Cannot push disposable source repository')
  File.write(docker, <<~'SH')
    #!/usr/bin/env bash
    set -euo pipefail
    printf '%s\n' "$*" >> "$COMPOSE_LOG"
    case "${MOCK_COMPOSE_FAILURE:-}" in
      build) if [[ "$*" == *' build' ]]; then exit 70; fi ;;
      migrate) if [[ "$*" == *' run --rm database-migrator' ]]; then exit 74; fi ;;
      up) if [[ "$*" == *' up '* ]]; then exit 71; fi ;;
      restart) if [[ "$*" == *' restart bada-nginx' ]]; then exit 72; fi ;;
    esac
  SH
  File.chmod(0700, docker)
  File.write(sudo, <<~'SH')
    #!/usr/bin/env bash
    set -euo pipefail
    [[ "$1" == '-n' ]]
    shift
    if [[ "$1" == 'COMPOSE_BAKE=false' ]]; then
      export COMPOSE_BAKE=false
      shift
    fi
    if [[ "$*" == *' build' ]]; then
      [[ "${COMPOSE_BAKE:-}" == 'false' ]]
    fi
    exec "$@"
  SH
  File.chmod(0700, sudo)
  File.write(timeout, "#!/usr/bin/env bash\nshift\nexec \"$@\"\n")
  File.chmod(0700, timeout)
  fixture = (validate + "\n" + deploy).sub('https://github.com/ANA-CNU/anabada-new.git', "file://#{origin}")
  command_env = runtime.to_h { |key| [key, 'fake-workflow-value'] }
  command_env.merge!(
    'HOME' => File.join(dir, 'checkout'), 'GITHUB_WORKSPACE' => root,
    'RUNNER_NAME' => 'bada_deploy', 'PATH' => "#{dir}:#{ENV.fetch('PATH')}",
    'COMPOSE_LOG' => compose_log, 'VITE_KAKAO_MAP_API_KEY' => nil, 'WEBHOOK_URL' => nil,
    'SOLVED_AC_CLIENT_ID' => nil, 'SOLVED_AC_CLIENT_SECRET' => nil
  )
  _, errors, status = Open3.capture3('bash', '-n', stdin_data: fixture)
  check(status.success?, "Invalid deployment shell: #{errors}")
  runtime.each do |key|
    output, errors, status = Open3.capture3(command_env.merge(key => ''), 'bash', '-se', stdin_data: fixture)
    check(!status.success? && output.empty? && errors == "Missing required GitHub secret: #{key}\n", "Missing-secret failure: #{key}")
  end
  _, errors, status = Open3.capture3(command_env.merge('RUNNER_NAME' => 'other_runner'), 'bash', '-se', stdin_data: fixture)
  check(!status.success? && errors.include?('requires the bada_deploy runner'), 'Wrong runner must fail safely')
  check(!File.exist?(repository) && !File.exist?(compose_log), 'Runner or secret validation reached deployment')
  compose_sequence = [
    'compose --env-file .env -f docker-compose.prod.yaml config --quiet',
    'compose --env-file .env -f docker-compose.prod.yaml build',
    'compose --env-file .env -f docker-compose.prod.yaml run --rm database-migrator',
    'compose --env-file .env -f docker-compose.prod.yaml stop anabada-backend',
    'compose --env-file .env -f docker-compose.prod.yaml up -d --no-build --remove-orphans --wait --wait-timeout 180',
    'compose --env-file .env -f docker-compose.prod.yaml restart bada-nginx',
    'compose --env-file .env -f docker-compose.prod.yaml ps'
  ]

  _, errors, status = Open3.capture3(command_env, 'bash', '-se', stdin_data: fixture)
  check(status.success?, "Fresh clone deployment fixture failed: #{errors}")
  check(File.exist?(File.join(repository, '.git')), 'Fresh deployment did not clone main')
  env_path = File.join(repository, '.env')
  check((File.stat(env_path).mode & 0o777) == 0o600, 'Deployment .env must be private')
  check(File.readlines(env_path).include?("WEBHOOK_URL=\"\"\n"), 'Optional webhook must render as empty')
  calls_before_bad_secret = File.readlines(compose_log).length
  _, _, status = Open3.capture3(command_env.merge('DB_PASSWORD' => "bad\nvalue"), 'bash', '-se', stdin_data: fixture)
  check(!status.success?, 'Malformed runtime secret must stop deployment')
  check(File.readlines(compose_log).length == calls_before_bad_secret, 'Malformed runtime secret reached Compose')
  history, _, history_status = Open3.capture3('git', '-C', repository, 'rev-list', '--count', 'HEAD')
  check(history_status.success? && history.strip == '1', 'Fresh deployment is not shallow')
  check(File.readlines(compose_log).map(&:strip) == compose_sequence, 'Fresh clone Compose sequence must restart nginx after up')

  File.write(File.join(repository, 'local-untracked'), "preserve\n")
  FileUtils.mkdir_p(File.join(repository, 'database', 'mysql_data'))
  File.write(File.join(repository, 'database', 'mysql_data', 'sentinel'), "preserve\n")
  File.write(File.join(repository, 'README.md'), "local change\n")
  File.write(File.join(seed, 'README.md'), "second\n")
  check(system('git', '-C', seed, 'add', 'README.md'), 'Cannot stage disposable update')
  check(system('git', '-C', seed, '-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'second'), 'Cannot commit disposable update')
  check(system('git', '-C', seed, 'push', 'origin', 'main'), 'Cannot push disposable update')
  webhook = 'https://discord.com/api/webhooks/000000000000000000/placeholder-not-live'
  _, errors, status = Open3.capture3(command_env.merge('WEBHOOK_URL' => webhook), 'bash', '-se', stdin_data: fixture)
  check(status.success?, 'Existing checkout reset fixture failed')
  check(File.readlines(env_path).include?(%Q(WEBHOOK_URL="#{webhook}"\n)), 'Optional webhook did not reach the deployment environment')
  check(File.read(File.join(repository, 'README.md')) == "second\n", 'Existing checkout did not reset tracked code to main')
  history, _, history_status = Open3.capture3('git', '-C', repository, 'rev-list', '--count', 'HEAD')
  check(history_status.success? && history.strip == '1', 'Existing deployment is not shallow after reset')
  check(File.read(File.join(repository, 'local-untracked')) == "preserve\n", 'Existing checkout lost an untracked file')
  check(File.read(File.join(repository, 'database', 'mysql_data', 'sentinel')) == "preserve\n", 'Existing checkout lost untracked database data')
  check(File.readlines(compose_log).last(compose_sequence.length).map(&:strip) == compose_sequence, 'Existing checkout Compose sequence must build before app downtime')

  calls_before_build_failure = File.readlines(compose_log).length
  _, _, status = Open3.capture3(command_env.merge('MOCK_COMPOSE_FAILURE' => 'build'), 'bash', '-se', stdin_data: fixture)
  check(!status.success?, 'Compose build failure must stop deployment')
  failed_build_calls = File.readlines(compose_log).drop(calls_before_build_failure).map(&:strip)
  check(failed_build_calls.any? { |call| call.end_with?(' build') } && failed_build_calls.none? { |call| call.include?(' stop anabada-backend') || call.include?(' up ') || call.include?(' restart bada-nginx') }, 'Build failure must occur before app downtime')

  calls_before_migration_failure = File.readlines(compose_log).length
  _, _, status = Open3.capture3(command_env.merge('MOCK_COMPOSE_FAILURE' => 'migrate'), 'bash', '-se', stdin_data: fixture)
  check(!status.success?, 'Failed BOJ import must stop the deployment')
  failed_migration_calls = File.readlines(compose_log).drop(calls_before_migration_failure).map(&:strip)
  check(failed_migration_calls == compose_sequence.take(3), 'Failed BOJ import must leave the running backend online')

  calls_before_up_failure = File.readlines(compose_log).length
  _, _, status = Open3.capture3(command_env.merge('MOCK_COMPOSE_FAILURE' => 'up'), 'bash', '-se', stdin_data: fixture)
  check(!status.success?, 'Compose up failure must stop deployment')
  failed_up_calls = File.readlines(compose_log).drop(calls_before_up_failure).map(&:strip)
  check(failed_up_calls.any? { |call| call.include?(' stop anabada-backend') } && failed_up_calls.any? { |call| call.include?(' up ') } && failed_up_calls.none? { |call| call.include?(' restart bada-nginx') || call.end_with?(' ps') }, 'Compose up failure must prevent nginx restart and ps')

  calls_before_restart_failure = File.readlines(compose_log).length
  _, _, status = Open3.capture3(command_env.merge('MOCK_COMPOSE_FAILURE' => 'restart'), 'bash', '-se', stdin_data: fixture)
  check(!status.success?, 'Nginx restart failure must propagate nonzero')
  failed_restart_calls = File.readlines(compose_log).drop(calls_before_restart_failure).map(&:strip)
  check(failed_restart_calls.any? { |call| call.include?(' restart bada-nginx') } && failed_restart_calls.none? { |call| call.end_with?(' ps') }, 'Nginx restart failure must prevent ps')

  non_git = File.join(dir, 'non-git')
  Dir.mkdir(non_git)
  File.write(File.join(non_git, 'sentinel'), "preserve\n")
  non_git_fixture = fixture.sub('repository="$HOME/anabada-new"', "repository=\"#{non_git}\"")
  calls_before = File.readlines(compose_log).length
  _, errors, status = Open3.capture3(command_env, 'bash', '-se', stdin_data: non_git_fixture)
  check(!status.success? && errors.include?('Deployment repository path is not a Git working tree'), 'Non-Git path must fail before deployment')
  check(File.read(File.join(non_git, 'sentinel')) == "preserve\n", 'Non-Git path was modified')
  check(File.readlines(compose_log).length == calls_before, 'Non-Git path reached Compose')
end
puts 'Workflow contract passed: runner, required/optional secrets, shallow checkout, data preservation, deployment order, failure gates, and Compose topology.'
