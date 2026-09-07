#!/usr/bin/env bash
# Forbid committing binary files blocked by the openEuler gate check_binary_file.
set -eu

pattern='\.(pyc|jar|ko|o)$'
bad=0
for f in "$@"; do
  if printf '%s' "$f" | grep -Eq "$pattern"; then
    echo "forbid-binaries: community gate forbids committing binary file: $f" >&2
    bad=1
  fi
done
exit "$bad"
