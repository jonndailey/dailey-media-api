#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="${ROOT_DIR}/bin"
BIN_PATH="${BIN_DIR}/minio"
DOWNLOAD_URL="${MINIO_DOWNLOAD_URL:-https://dl.min.io/server/minio/release/linux-amd64/minio}"

mkdir -p "${BIN_DIR}"

echo "Downloading MinIO from ${DOWNLOAD_URL}"
curl -L "${DOWNLOAD_URL}" -o "${BIN_PATH}"
chmod +x "${BIN_PATH}"

echo "MinIO installed to ${BIN_PATH}"
