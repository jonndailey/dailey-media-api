#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_USER="${SUDO_USER:-$(whoami)}"
APP_HOME="$(eval echo "~${APP_USER}")"
NODE_BIN_DIR="$(dirname "$(command -v node)")"
COMBINED_PATH="${NODE_BIN_DIR}:${PATH}"

cd "${REPO_ROOT}"

echo 'Starting PM2 processes from ecosystem.config.cjs...'
npx pm2 start ecosystem.config.cjs

echo 'Saving current PM2 process list...'
npx pm2 save

echo ''
echo 'To register PM2 with systemd so the app restarts after a reboot, run:'
printf 'sudo env PATH=%s pm2 startup systemd -u %s --hp %s\n' "${COMBINED_PATH}" "${APP_USER}" "${APP_HOME}"
