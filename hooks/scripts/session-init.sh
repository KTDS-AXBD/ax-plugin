#!/bin/bash
# ax-h01: Session Init — cleanup + version check + risk check
# SessionStart 훅에서 실행
# 사용법: session-init.sh [project_root]

ROOT="${1:-$PWD}"

# === Phase 1: Cleanup ===

PATTERNS=(
  "*.tmp"
  "*.bak"
  "*Zone.Identifier"
)

ROOT_SCREENSHOTS=$(find "$ROOT" -maxdepth 1 -name "*.png" -o -name "*.jpg" -o -name "*.jpeg" 2>/dev/null)
PLAYWRIGHT_CACHE="$ROOT/.playwright-mcp"
CLEANED=0

for PATTERN in "${PATTERNS[@]}"; do
  FILES=$(find "$ROOT" -maxdepth 3 -name "$PATTERN" -not -path "*/node_modules/*" -not -path "*/.wrangler/*" -not -path "*/build/*" 2>/dev/null)
  if [[ -n "$FILES" ]]; then
    COUNT=$(echo "$FILES" | wc -l)
    echo "$FILES" | xargs rm -f
    CLEANED=$((CLEANED + COUNT))
  fi
done

if [[ -n "$ROOT_SCREENSHOTS" ]]; then
  COUNT=$(echo "$ROOT_SCREENSHOTS" | wc -l)
  echo "$ROOT_SCREENSHOTS" | xargs rm -f
  CLEANED=$((CLEANED + COUNT))
fi

if [[ -d "$PLAYWRIGHT_CACHE" ]]; then
  CACHE_COUNT=$(find "$PLAYWRIGHT_CACHE" -type f 2>/dev/null | wc -l)
  rm -rf "$PLAYWRIGHT_CACHE"
  CLEANED=$((CLEANED + CACHE_COUNT))
fi

if [[ $CLEANED -gt 0 ]]; then
  echo "CLEANUP: ${CLEANED}개 불필요 파일 정리 완료"
fi

# === Phase 2: Version Check ===

cd "$ROOT" 2>/dev/null || exit 0

if git rev-parse --is-inside-work-tree &>/dev/null && [[ -f "package.json" ]]; then
  ISSUES=0

  PKG_VERSION=$(grep -oP '"version"\s*:\s*"\K[^"]+' package.json)
  if [[ -z "$PKG_VERSION" ]]; then
    echo "VER-WARN: package.json에 version 필드가 없어요."
    ISSUES=$((ISSUES + 1))
  fi

  LATEST_TAG=$(git tag -l 'v*' --sort=-version:refname | head -1)
  if [[ -n "$LATEST_TAG" ]]; then
    TAG_VERSION="${LATEST_TAG#v}"
    if [[ "$TAG_VERSION" != "$PKG_VERSION" ]]; then
      echo "VER-INFO: 최신 태그($LATEST_TAG) ≠ package.json($PKG_VERSION). 마일스톤 완료 시 태그를 생성하세요."
    fi
  fi

  # SPEC.md 레거시 인라인 마커 검출 — check-version.sh와 동일 필터
  # (단독 닫힘 괄호 + 백틱 파일명 화이트리스트, 외부 산출물 식별자 제외)
  if [[ -f "SPEC.md" ]]; then
    LEGACY=$(grep -nP '\(v\d+(\.\d+)+\)' SPEC.md \
      | grep -vP '^\d+:###?\s' \
      | grep -vP 'Sprint\s+\d+' \
      | grep -vP '^\d+:-\s*\[' \
      | grep -vP '`[^`]+\.(md|docx|json|yaml|yml|html|sh|ts|js|py|sql|toml)`\s*\(v\d+(\.\d+)+\)' \
      | head -5)
    if [[ -n "$LEGACY" ]]; then
      COUNT=$(grep -P '\(v\d+(\.\d+)+\)' SPEC.md \
        | grep -vP '^###?\s' \
        | grep -vP 'Sprint\s+\d+' \
        | grep -vP '^-\s*\[' \
        | grep -vP '`[^`]+\.(md|docx|json|yaml|yml|html|sh|ts|js|py|sql|toml)`\s*\(v\d+(\.\d+)+\)' \
        | wc -l)
      echo "VER-WARN: SPEC.md에 레거시 버전 마커 ${COUNT}개 발견. SemVer로 전환 필요."
    fi
  fi

  if [[ $ISSUES -gt 0 ]]; then
    echo "VER-CHECK: ${ISSUES}개 이슈 발견"
  fi
fi

# === Phase 3: Risk Check ===

MEMORY_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects"
PWD_ENCODED=$(echo "$ROOT" | sed 's|/|-|g')
MEMORY_FILE="$MEMORY_DIR/$PWD_ENCODED/memory/MEMORY.md"

if [[ -f "$MEMORY_FILE" ]]; then
  URGENT_COUNT=$(grep -c '\[긴급\]' "$MEMORY_FILE" 2>/dev/null || true)
  BLOCKER_COUNT=$(grep -c '\[블로커\]' "$MEMORY_FILE" 2>/dev/null || true)
  DEBT_COUNT=$(grep -c '\[부채\]' "$MEMORY_FILE" 2>/dev/null || true)

  if [[ $URGENT_COUNT -gt 0 || $BLOCKER_COUNT -gt 0 ]]; then
    echo "RISK-ALERT: 미해결 리스크 — 긴급: ${URGENT_COUNT}건, 블로커: ${BLOCKER_COUNT}건, 부채: ${DEBT_COUNT}건. /risk list로 확인하세요."
  fi
fi

exit 0
