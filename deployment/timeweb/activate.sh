#!/usr/bin/env bash
# Runs remotely with two strictly validated positional arguments. Never deletes releases.
set -euo pipefail
root=${1:?deployment root required}
revision=${2:?revision required}
[[ "$root" =~ ^/[A-Za-z0-9_/-]+$ && "$root" != / && "$root" != *..* ]] || exit 64
[[ "$revision" =~ ^[a-f0-9]{40}$ ]] || exit 64
[[ -d "$root/releases/$revision" && -f "$root/releases/$revision/index.html" ]] || exit 65
if [[ -e "$root/current" && ! -L "$root/current" ]]; then
  echo 'Refusing to replace a real directory. Configure the document root first.' >&2
  exit 66
fi
[[ ! -e "$root/current.new" && ! -L "$root/current.new" ]] || exit 67
ln -s "releases/$revision" "$root/current.new"
mv -Tf "$root/current.new" "$root/current"
printf 'Activated %s\n' "$revision"
