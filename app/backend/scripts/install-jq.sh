#!/bin/bash
set -e

# Skip on non-Linux systems (for local development on macOS)
if [ "$(uname)" != "Linux" ]; then
    echo "Skipping jq installation on $(uname)"
    exit 0
fi

BIN_DIR="$HOME/.bin"
JQ_VERSION="1.7.1"

mkdir -p "$BIN_DIR"

if [ ! -f "$BIN_DIR/jq" ]; then
    echo "Installing jq..."
    curl -sSL "https://github.com/jqlang/jq/releases/download/jq-${JQ_VERSION}/jq-linux-amd64" -o "$BIN_DIR/jq"
    chmod +x "$BIN_DIR/jq"
    echo "jq installed to $BIN_DIR/jq"
else
    echo "jq already installed"
fi
