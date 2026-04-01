#!/bin/bash
# 리스크 체크 스크립트
# SessionStart 훅에서 MEMORY.md의 [긴급]/[블로커] 항목을 알린다
# 사용법: check-risks.sh

MEMORY_DIR="$HOME/.claude/projects"

# 현재 프로젝트의 MEMORY.md 경로 찾기
PWD_ENCODED=$(echo "$PWD" | sed 's|/|-|g')
MEMORY_FILE="$MEMORY_DIR/$PWD_ENCODED/memory/MEMORY.md"

if [[ ! -f "$MEMORY_FILE" ]]; then
  exit 0
fi

# 항목 카운트 (grep -c는 매치 없으면 exit 1이므로 || true로 보호)
URGENT_COUNT=$(grep -c '\[긴급\]' "$MEMORY_FILE" 2>/dev/null || true)
BLOCKER_COUNT=$(grep -c '\[블로커\]' "$MEMORY_FILE" 2>/dev/null || true)
DEBT_COUNT=$(grep -c '\[부채\]' "$MEMORY_FILE" 2>/dev/null || true)

# 긴급/블로커가 있을 때만 출력
if [[ $URGENT_COUNT -gt 0 || $BLOCKER_COUNT -gt 0 ]]; then
  echo "RISK-ALERT: 미해결 리스크 — 긴급: ${URGENT_COUNT}건, 블로커: ${BLOCKER_COUNT}건, 부채: ${DEBT_COUNT}건. /risk list로 확인하세요."
fi

exit 0
