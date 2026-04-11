#!/bin/bash
# ax-h05: Quality Gate — 미검증 코드 경고
# Stop 훅에서 실행

# git diff로 코드 변경 확인
CHANGED_CODE=$(git diff --name-only HEAD 2>/dev/null | grep -E '\.(ts|tsx|js|jsx)$' | head -5)

if [[ -z "$CHANGED_CODE" ]]; then
  exit 0
fi

echo "QUALITY-WARN: 코드 변경이 감지되었어요. 커밋 전에 typecheck + lint를 실행하세요."
echo "변경 파일: $(echo "$CHANGED_CODE" | tr '\n' ', ')"

# === Risk Check (기존 Stop 훅 통합) ===
MEMORY_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects"
PWD_ENCODED=$(echo "$PWD" | sed 's|/|-|g')
MEMORY_FILE="$MEMORY_DIR/$PWD_ENCODED/memory/MEMORY.md"

if [[ -f "$MEMORY_FILE" ]]; then
  URGENT_COUNT=$(grep -c '\[긴급\]' "$MEMORY_FILE" 2>/dev/null || true)
  BLOCKER_COUNT=$(grep -c '\[블로커\]' "$MEMORY_FILE" 2>/dev/null || true)
  DEBT_COUNT=$(grep -c '\[부채\]' "$MEMORY_FILE" 2>/dev/null || true)

  if [[ $URGENT_COUNT -gt 0 || $BLOCKER_COUNT -gt 0 ]]; then
    echo "RISK-ALERT: 미해결 리스크 — 긴급: ${URGENT_COUNT}건, 블로커: ${BLOCKER_COUNT}건, 부채: ${DEBT_COUNT}건. /ax-11-risk list로 확인하세요."
  fi
fi

exit 0
