#!/usr/bin/env bash
set -euo pipefail
: "${TIMEWEB_HOST:?}" "${TIMEWEB_USER:?}" "${TIMEWEB_ROOT:?}" "${TIMEWEB_PORT:?}" "${GITHUB_SHA:?}"
[[ "$TIMEWEB_HOST" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ ]] || exit 64
[[ "$TIMEWEB_USER" =~ ^[A-Za-z0-9_][A-Za-z0-9_-]*$ ]] || exit 64
[[ "$TIMEWEB_ROOT" =~ ^/[A-Za-z0-9_/-]+$ && "$TIMEWEB_ROOT" != / && "$TIMEWEB_ROOT" != *..* ]] || exit 64
[[ "$TIMEWEB_PORT" =~ ^[0-9]{1,5}$ && "$TIMEWEB_PORT" -gt 0 && "$TIMEWEB_PORT" -le 65535 ]] || exit 64
[[ "$GITHUB_SHA" =~ ^[a-f0-9]{40}$ ]] || exit 64
[[ -f site/dist/index.html ]] || exit 65
remote="$TIMEWEB_USER@$TIMEWEB_HOST"
remote_dir="$TIMEWEB_ROOT/releases/$GITHUB_SHA"
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -p "$TIMEWEB_PORT" "$remote" "mkdir -p '$TIMEWEB_ROOT/releases' && mkdir '$remote_dir'"
# Unique, immutable directory: rerunning an existing SHA refuses to overwrite it.
tar -C site/dist -czf - . | ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -p "$TIMEWEB_PORT" "$remote" "tar -xzf - -C '$remote_dir'"
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -p "$TIMEWEB_PORT" "$remote" "bash -s -- '$TIMEWEB_ROOT' '$GITHUB_SHA'" < deployment/timeweb/activate.sh
