#!/usr/bin/env bash
# ax-harness-kit preflight — F666 M2
# 환경 8항 사전 점검 (필수 4 + 선택 4)
set -euo pipefail

PASS="✅"
FAIL="❌"
WARN="⚠️"

failed=0

check_required() {
  local name="$1"
  local cmd="$2"
  local version_flag="${3:---version}"
  if command -v "$cmd" &>/dev/null; then
    local ver
    ver=$("$cmd" "$version_flag" 2>&1 | head -1 || echo "ok")
    echo "$PASS $name: $ver"
  else
    echo "$FAIL $name: not found — install $cmd first"
    failed=$((failed + 1))
  fi
}

check_optional() {
  local name="$1"
  local cmd="$2"
  local check_cmd="${3:-}"
  if command -v "$cmd" &>/dev/null; then
    if [ -n "$check_cmd" ]; then
      if eval "$check_cmd" &>/dev/null; then
        echo "$PASS $name: authenticated"
      else
        echo "$WARN $name: not authenticated (run: $cmd auth login)"
      fi
    else
      echo "$PASS $name: installed"
    fi
  else
    echo "$WARN $name: not found (optional)"
  fi
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 ax-harness-kit Preflight Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "[ 필수 항목 ]"

check_required "git" "git" "--version"
check_required "pnpm" "pnpm" "--version"
check_required "bash" "bash" "--version"

# Node 22+ 확인
if command -v node &>/dev/null; then
  node_ver=$(node --version 2>&1 | head -1)
  node_major=$(node --version 2>&1 | grep -oP '(?<=v)\d+' | head -1 || echo "0")
  if [ "$node_major" -ge 22 ]; then
    echo "$PASS node: $node_ver"
  else
    echo "$FAIL node: $node_ver (22+ required)"
    failed=$((failed + 1))
  fi
else
  echo "$FAIL node: not found — install Node.js 22+"
  failed=$((failed + 1))
fi

echo ""
echo "[ 선택 항목 ]"

check_optional "gh CLI" "gh" ""
check_optional "wrangler" "wrangler" ""
check_optional "GitHub auth" "gh" "gh auth status"
check_optional "Cloudflare auth" "wrangler" "wrangler whoami"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$failed" -gt 0 ]; then
  echo "$FAIL Preflight FAILED — $failed 필수 항목 미충족"
  echo "   위 항목을 설치 후 다시 실행하세요."
  exit 1
fi

echo "$PASS Preflight PASS — 필수 환경 확인 완료"
