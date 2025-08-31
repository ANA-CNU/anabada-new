#!/bin/sh
set -e

# SSH 터널 실행 (예: 로컬 15432 → 원격 5432)
# 필요에 맞게 host/port/user 수정하세요

mkdir -p /root/.ssh
chmod 700 /root/.ssh

echo "$SSH_KEY" > /root/.ssh/id_ed25519

cat /root/.ssh/id_ed25519

chmod 600 /root/.ssh/id_ed25519

ssh -f -N -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
    -p "${SSH_PORT}" \
    -L "${SSH_LOCAL_PORT}:localhost:${SSH_REMOTE_PORT}" \
    "$SSH_USER"@"$SSH_HOST" \
    -i /root/.ssh/id_ed25519 &


sleep 10

exec python main.py