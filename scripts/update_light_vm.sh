#!/usr/bin/env bash
set -euo pipefail

RELEASE_URL="https://github.com/piyushKumar-1/light-vm/releases/download/dev/light_vm-linux-amd64.tar.gz"
BINARY_NAME="light_vm-linux-amd64"
INSTALL_PATH="/usr/local/bin/light_vm"
OWNER="lightvm"
WORKING_DIR="/var/lib/light_vm"
TEMP_DIR=$(mktemp -d)

echo "Downloading light_vm from ${RELEASE_URL}..."
curl -fSL "$RELEASE_URL" | tar xz -C "$TEMP_DIR"

echo "Installing binary to ${INSTALL_PATH}..."
rm -f "$INSTALL_PATH"
mv "${TEMP_DIR}/${BINARY_NAME}" "$INSTALL_PATH"
chmod +x "$INSTALL_PATH"
chown "${OWNER}:" "$WORKING_DIR"

rm -rf "$TEMP_DIR"
echo "Update complete."
