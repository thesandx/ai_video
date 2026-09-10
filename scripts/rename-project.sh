#!/usr/bin/env bash
#
# Rename this template to a real project.
#
# Replaces the template name everywhere it appears — package.json,
# docker-compose.yml, documentation, issue templates — and optionally resets
# git history so the new project starts from a single clean commit.
#
# Usage:
#   ./scripts/rename-project.sh my-app
#   ./scripts/rename-project.sh my-app --owner acme --reset-git
#
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

OLD_NAME="nextjs-cloudrun-template"
OLD_OWNER="thesandx"

NEW_NAME=""
NEW_OWNER=""
RESET_GIT="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --owner)     NEW_OWNER="${2:-}"; shift 2 ;;
    --reset-git) RESET_GIT="true"; shift ;;
    -h|--help)
      echo "Usage: $0 <new-name> [--owner <github-owner>] [--reset-git]"
      exit 0 ;;
    -*)          echo "Unknown option: $1" >&2; exit 1 ;;
    *)           NEW_NAME="$1"; shift ;;
  esac
done

if [[ -z "$NEW_NAME" ]]; then
  echo "Usage: $0 <new-name> [--owner <github-owner>] [--reset-git]" >&2
  exit 1
fi

# npm package names: lowercase, alphanumeric, hyphens. Also a valid Cloud Run
# service name, which has the same constraints plus a 49-character limit.
if ! [[ "$NEW_NAME" =~ ^[a-z][a-z0-9-]{0,48}$ ]]; then
  echo "Invalid name: '${NEW_NAME}'" >&2
  echo "Must start with a letter and contain only lowercase letters, digits" >&2
  echo "and hyphens (max 49 chars) to be valid for both npm and Cloud Run." >&2
  exit 1
fi

echo "Renaming '${OLD_NAME}' to '${NEW_NAME}'"
[[ -n "$NEW_OWNER" ]] && echo "Renaming owner '${OLD_OWNER}' to '${NEW_OWNER}'"
echo

# Everything tracked by git, excluding this script (which contains the literals
# it is searching for) and the lockfile.
mapfile -t FILES < <(git ls-files | grep -v '^scripts/rename-project.sh$' | grep -v '^pnpm-lock.yaml$')

replace_in_files() {
  local from="$1" to="$2" count=0
  for file in "${FILES[@]}"; do
    [[ -f "$file" ]] || continue
    if grep -q "$from" "$file" 2>/dev/null; then
      # macOS sed needs an explicit empty suffix for -i; GNU sed does not.
      if sed --version >/dev/null 2>&1; then
        sed -i "s|${from}|${to}|g" "$file"
      else
        sed -i '' "s|${from}|${to}|g" "$file"
      fi
      echo "  ${file}"
      count=$((count + 1))
    fi
  done
  echo "  → ${count} file(s) updated"
}

echo "Replacing project name:"
replace_in_files "$OLD_NAME" "$NEW_NAME"

if [[ -n "$NEW_OWNER" ]]; then
  echo
  echo "Replacing owner:"
  replace_in_files "$OLD_OWNER" "$NEW_OWNER"
fi

if [[ "$RESET_GIT" == "true" ]]; then
  echo
  read -r -p "Delete all git history and start fresh? [y/N] " reply
  if [[ "$reply" =~ ^[Yy]$ ]]; then
    rm -rf .git
    git init --quiet
    git add -A
    git commit --quiet -m "Initial commit from nextjs-cloudrun-template"
    echo "  → history reset to a single commit"
  else
    echo "  → skipped"
  fi
fi

cat <<EOF

Done. Next steps:

  1. pnpm install
  2. Update the description in package.json
  3. Update the title and overview in README.md
  4. Set the real team handle in .github/CODEOWNERS
  5. ./scripts/gcp-bootstrap.sh --project <gcp-project> --repo <owner>/${NEW_NAME} --service ${NEW_NAME}

EOF
