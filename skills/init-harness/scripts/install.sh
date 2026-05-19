#!/usr/bin/env bash
# ax-harness-kit install — F666 M2 + M3 + M4
# Tier 1 설치: 4-package pnpm monorepo 골격 생성
set -euo pipefail

PROJECT_NAME="${1:?PROJECT_NAME required}"
GITHUB_ORG="${2:?GITHUB_ORG required}"
GITHUB_REPO="${3:?GITHUB_REPO required}"
DESCRIPTION="${4:?DESCRIPTION required}"

CF_ACCOUNT=""
WORKER_SUBDOMAIN=""
OUTPUT_DIR=""

# 추가 옵션 파싱
shift 4
while [[ $# -gt 0 ]]; do
  case "$1" in
    --cf-account) CF_ACCOUNT="$2"; shift 2 ;;
    --worker-subdomain) WORKER_SUBDOMAIN="$2"; shift 2 ;;
    --output|-o) OUTPUT_DIR="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

TARGET_DIR="${OUTPUT_DIR:-$(pwd)/$PROJECT_NAME}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 ax-harness-kit Install — Tier 1"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Project:     $PROJECT_NAME"
echo "  GitHub:      $GITHUB_ORG/$GITHUB_REPO"
echo "  Description: $DESCRIPTION"
echo "  CF Account:  ${CF_ACCOUNT:-<not set>}"
echo "  Output:      $TARGET_DIR"
echo ""

# 기존 디렉토리 확인
if [ -d "$TARGET_DIR" ]; then
  echo "⚠️  $TARGET_DIR 이미 존재 — 덮어쓰기 모드 (멱등성 보장)"
fi

# harness CLI 경로 탐색
HARNESS_BIN=""
# 1. 글로벌 설치 확인
if command -v harness &>/dev/null; then
  HARNESS_BIN="harness"
# 2. Foundry-X 모노리포 내 확인
elif [ -f "$HOME/work/axbd/Foundry-X/packages/harness-kit/dist/cli/index.js" ]; then
  HARNESS_BIN="node $HOME/work/axbd/Foundry-X/packages/harness-kit/dist/cli/index.js"
else
  echo "❌ harness CLI를 찾을 수 없어요."
  echo "   Foundry-X 모노리포에서 먼저 빌드하세요:"
  echo "   cd ~/work/axbd/Foundry-X && pnpm --filter @foundry-x/harness-kit build"
  exit 1
fi

# CLI 인수 구성
ARGS=("init-monorepo" "$PROJECT_NAME" "$GITHUB_ORG" "$GITHUB_REPO" "$DESCRIPTION")
[ -n "$CF_ACCOUNT" ] && ARGS+=("--cf-account" "$CF_ACCOUNT")
[ -n "$WORKER_SUBDOMAIN" ] && ARGS+=("--worker-subdomain" "$WORKER_SUBDOMAIN")
[ -n "$OUTPUT_DIR" ] && ARGS+=("--output" "$OUTPUT_DIR")

echo "🔧 4-package monorepo 생성 중..."
$HARNESS_BIN "${ARGS[@]}"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Install 완료 — $TARGET_DIR"
echo ""
echo "다음 단계:"
echo "  1. cd $TARGET_DIR && pnpm install"
echo "  2. F667에서 Cloudflare 배포 설정 추가"
echo "  3. /ax:sprint 1 — 첫 Sprint 시동"
