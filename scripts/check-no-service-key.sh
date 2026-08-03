#!/usr/bin/env bash
# Release blocker (PRD 11): the service-role key must never reach the browser.
# Run against src/ before building and against dist/ after.
set -euo pipefail

targets=("src")
[ -d dist ] && targets+=("dist")

# service-role JWTs carry "role":"service_role" in their payload
if grep -rIlE 'service_role|SERVICE_ROLE_KEY|supabaseServiceKey' "${targets[@]}" 2>/dev/null; then
  echo "FAIL: a service-role reference was found in client code or the bundle." >&2
  exit 1
fi
echo "OK: no service-role key in ${targets[*]}"
