#!/bin/bash
# 불필요 파일 자동 정리 스크립트
# SessionStart 훅에서 프로젝트 루트 기준 실행
# 사용법: cleanup-artifacts.sh [project_root]

ROOT="${1:-.}"

# 정리 대상 패턴
PATTERNS=(
  "*.tmp"
  "*.bak"
  "*Zone.Identifier"
)

# 루트 레벨 스크린샷 (docs/assets/ 제외)
ROOT_SCREENSHOTS=$(find "$ROOT" -maxdepth 1 -name "*.png" -o -name "*.jpg" -o -name "*.jpeg" 2>/dev/null)

# .playwright-mcp/ 캐시
PLAYWRIGHT_CACHE="$ROOT/.playwright-mcp"

CLEANED=0

# 패턴별 정리
for PATTERN in "${PATTERNS[@]}"; do
  FILES=$(find "$ROOT" -maxdepth 3 -name "$PATTERN" -not -path "*/node_modules/*" -not -path "*/.wrangler/*" -not -path "*/build/*" 2>/dev/null)
  if [[ -n "$FILES" ]]; then
    COUNT=$(echo "$FILES" | wc -l)
    echo "$FILES" | xargs rm -f
    CLEANED=$((CLEANED + COUNT))
  fi
done

# 루트 스크린샷 정리
if [[ -n "$ROOT_SCREENSHOTS" ]]; then
  COUNT=$(echo "$ROOT_SCREENSHOTS" | wc -l)
  echo "$ROOT_SCREENSHOTS" | xargs rm -f
  CLEANED=$((CLEANED + COUNT))
fi

# Playwright MCP 캐시 정리
if [[ -d "$PLAYWRIGHT_CACHE" ]]; then
  CACHE_COUNT=$(find "$PLAYWRIGHT_CACHE" -type f 2>/dev/null | wc -l)
  rm -rf "$PLAYWRIGHT_CACHE"
  CLEANED=$((CLEANED + CACHE_COUNT))
fi

if [[ $CLEANED -gt 0 ]]; then
  echo "CLEANUP: ${CLEANED}개 불필요 파일 정리 완료"
fi

exit 0
