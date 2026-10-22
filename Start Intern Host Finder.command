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
if /usr/bin/curl -fsS http://127.0.0.1:4317/api/data >/dev/null 2>&1; then
  /usr/bin/open http://127.0.0.1:4317
else
  "$NODE" server.mjs &
  TRACKER_PID=$!
  for attempt in {1..30}; do
    if /usr/bin/curl -fsS http://127.0.0.1:4317/api/data >/dev/null 2>&1; then
      /usr/bin/open http://127.0.0.1:4317
      break
    fi
    sleep 0.2
  done
  echo "Intern Host Finder is running. Keep this window open; press Control-C to stop."
  trap 'kill "$TRACKER_PID" 2>/dev/null' INT TERM EXIT
  wait "$TRACKER_PID"
fi
