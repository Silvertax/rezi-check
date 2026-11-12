#!/usr/bin/env bash
# Prints the description for a GitHub release: the section of its version in CHANGELOG.md,
# or the commit subjects since the previous tag when the changelog has no such section,
# followed by the install note. The Release workflow adds the checksums below it.
#
# Usage: .github/release-notes.sh v1.6
set -euo pipefail

tag="$1"
version="${tag#v}"
repo="${GITHUB_REPOSITORY:-Silvertax/rezi-check}"
changelog="${CHANGELOG:-CHANGELOG.md}"
prev="$(git describe --tags --abbrev=0 "$tag^" 2>/dev/null || true)"

# The lines below "## <version>" up to the next "## " heading, without blank lines around them.
# Sub-headings move up one level, as release pages use "## What's new".
notes="$(awk -v v="$version" '
  /^## / { if (found) exit; if ($2 == v) { found = 1; next } }
  found { lines[++n] = $0 }
  END {
    first = 1; while (first <= n && lines[first] ~ /^[[:space:]]*$/) first++
    last = n;  while (last >= first && lines[last] ~ /^[[:space:]]*$/) last--
    for (i = first; i <= last; i++) print lines[i]
  }
' "$changelog" 2>/dev/null | sed 's/^### /## /' || true)"

if [ -z "$notes" ]; then
  # Only commits that change the app itself, not the workflows or the docs.
  changes="$(git log --no-merges --format='- %s' "${prev:+$prev..}$tag" -- . \
    ':(exclude).github' ':(exclude)docs' ':(exclude)*.md' ':(exclude)LICENSE' || true)"
  notes="## Changes"$'\n\n'"${changes:-- Maintenance.}"
fi

apk="Rezi-Check-$version.apk"
printf '%s\n\n' "$notes"
if [ -n "$prev" ]; then
  printf '## Install\n\nDownload `%s` below and open it. It installs over older versions; your history is kept.\n' "$apk"
  printf '\n**Full changelog:** https://github.com/%s/compare/%s...%s\n' "$repo" "$prev" "$tag"
else
  printf '## Install\n\nDownload `%s` below, open it and allow the installation. Works on Android 8 and later.\n' "$apk"
fi
