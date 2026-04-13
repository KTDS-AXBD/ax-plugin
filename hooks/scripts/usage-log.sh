#!/bin/bash
# ax-h06: Usage Log — 스킬 호출을 로컬 JSONL에 기록
# 호출 방식: session-end Phase 5b에서 스킬 목록을 인자로 전달
# 사용법: usage-log.sh <skill1> <skill2> ...
# sf-usage가 읽는 usage.jsonl에 이벤트를 추가하여 추적 데이터 수집
#
# PostToolUse(Skill) hook은 CC가 Skill matcher를 지원하지 않아 사용 불가.
# 대신 session-end에서 세션 중 호출된 스킬 목록을 수집하여 이 스크립트에 전달.

LOG_DIR="${HOME}/.claude/plugin-data/skill-framework"
LOG_FILE="${LOG_DIR}/usage.jsonl"

if [ $# -eq 0 ]; then
  echo "usage: usage-log.sh <skill1> [skill2] ..."
  exit 0
fi

mkdir -p "$LOG_DIR"

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
PROJECT=$(basename "$(git rev-parse --show-toplevel 2>/dev/null || echo unknown)")

for SKILL in "$@"; do
  echo "{\"skill\":\"${SKILL}\",\"ts\":\"${TIMESTAMP}\",\"project\":\"${PROJECT}\"}" >> "$LOG_FILE"
done

echo "Logged $# skill(s) to $LOG_FILE"
exit 0
