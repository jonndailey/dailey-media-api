#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
CLI_MINIO_ROOT_USER="${MINIO_ROOT_USER-}"
CLI_MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD-}"
CLI_MINIO_ADDRESS="${MINIO_ADDRESS-}"
CLI_MINIO_CONSOLE_ADDRESS="${MINIO_CONSOLE_ADDRESS-}"
CLI_MINIO_DATA_DIR="${MINIO_DATA_DIR-}"
CLI_MINIO_CONFIG_DIR="${MINIO_CONFIG_DIR-}"

if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "${ENV_FILE}"
  set +a
fi

if [[ -n "${CLI_MINIO_ROOT_USER}" ]]; then
  export MINIO_ROOT_USER="${CLI_MINIO_ROOT_USER}"
fi
if [[ -n "${CLI_MINIO_ROOT_PASSWORD}" ]]; then
  export MINIO_ROOT_PASSWORD="${CLI_MINIO_ROOT_PASSWORD}"
fi
if [[ -n "${CLI_MINIO_ADDRESS}" ]]; then
  export MINIO_ADDRESS="${CLI_MINIO_ADDRESS}"
fi
if [[ -n "${CLI_MINIO_CONSOLE_ADDRESS}" ]]; then
  export MINIO_CONSOLE_ADDRESS="${CLI_MINIO_CONSOLE_ADDRESS}"
fi
if [[ -n "${CLI_MINIO_DATA_DIR}" ]]; then
  export MINIO_DATA_DIR="${CLI_MINIO_DATA_DIR}"
fi
if [[ -n "${CLI_MINIO_CONFIG_DIR}" ]]; then
  export MINIO_CONFIG_DIR="${CLI_MINIO_CONFIG_DIR}"
fi

BIN_PATH="${ROOT_DIR}/bin/minio"
DATA_DIR="${MINIO_DATA_DIR:-${ROOT_DIR}/.minio/data}"
CONFIG_DIR="${MINIO_CONFIG_DIR:-${ROOT_DIR}/.minio/config}"
ADDRESS="${MINIO_ADDRESS:-:9000}"
CONSOLE_ADDRESS="${MINIO_CONSOLE_ADDRESS:-:9001}"

if [[ ! -x "${BIN_PATH}" ]]; then
  echo "MinIO binary not found at ${BIN_PATH}. Run the setup steps in README.md."
  exit 1
fi

mkdir -p "${DATA_DIR}" "${CONFIG_DIR}"

export MINIO_ROOT_USER="${MINIO_ROOT_USER:-dailey}"
export MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-dailey-secret}"

echo "Starting MinIO server"
echo " Data dir: ${DATA_DIR}"
echo " Config dir: ${CONFIG_DIR}"
echo " Address: ${ADDRESS}"
echo " Console: ${CONSOLE_ADDRESS}"

exec "${BIN_PATH}" server \
  --config-dir "${CONFIG_DIR}" \
  --address "${ADDRESS}" \
  --console-address "${CONSOLE_ADDRESS}" \
  "${DATA_DIR}"
