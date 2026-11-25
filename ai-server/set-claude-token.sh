#!/usr/bin/env bash
# Replaces the Claude subscription token used by the cookbook AI server (and
# WhatBrendonThinks, if installed) without echoing it, then restarts them.
#   1. claude setup-token        # sign in; copy the printed token
#   2. ~/apps/cookbook-ai/set-claude-token.sh
set -euo pipefail
read -rsp "Paste the new token (input hidden): " token; echo
case "$token" in sk-ant-oat*) ;; *) echo "That doesn't look like a Claude Code token (sk-ant-oat…)."; exit 1;; esac
for f in "$HOME/apps/cookbook-ai/.env" "$HOME/apps/WhatBrendonThinks/deploy/.env"; do
  [ -f "$f" ] || continue
  tmp=$(mktemp); chmod 600 "$tmp"
  grep -v '^CLAUDE_CODE_OAUTH_TOKEN=' "$f" > "$tmp" || true
  printf 'CLAUDE_CODE_OAUTH_TOKEN=%s\n' "$token" >> "$tmp"
  mv "$tmp" "$f"; chmod 600 "$f"
  echo "updated $f"
done
for svc in cookbook-ai brandon-api; do
  systemctl --user is-enabled "$svc" >/dev/null 2>&1 && systemctl --user restart "$svc" && echo "restarted $svc"
done
