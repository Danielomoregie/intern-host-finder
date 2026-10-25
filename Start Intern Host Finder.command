#!/bin/zsh
cd "${0:A:h}"
NODE="$(command -v node)"
if [[ -z "$NODE" && -x "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" ]]; then
  NODE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi
if [[ -z "$NODE" ]]; then
  echo "Install Node.js 20 or newer, then open this launcher again."
  read -k 1
  exit 1
fi
if ! "$NODE" macos-service.mjs install; then
  echo "Could not start the background service. Press any key to close."
  read -k 1
  exit 1
fi
/usr/bin/open http://127.0.0.1:4317
