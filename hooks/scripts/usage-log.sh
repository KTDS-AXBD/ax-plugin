#!/bin/bash
# ax-h06: Usage Log — 스킬 호출을 로컬 JSONL에 기록
# PostToolUse(Skill) 훅에서 실행
# sf-usage가 읽는 usage.jsonl에 이벤트를 추가하여 추적 데이터 수집

LOG_DIR="${HOME}/.claude/plugin-data/skill-framework"
LOG_FILE="${LOG_DIR}/usage.jsonl"

# Skill 도구 호출인지 확인
TOOL_NAME=$(echo "$CLAUDE_TOOL_INPUT" 2>/dev/null | grep -oP '"skill"\s*:\s*"\K[^"]+' || true)

if [ -z "$TOOL_NAME" ]; then
  exit 0
fi

# 로그 디렉토리 생성
mkdir -p "$LOG_DIR"

# JSONL 이벤트 추가
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
PROJECT=$(basename "$(git rev-parse --show-toplevel 2>/dev/null || echo unknown)")
echo "{\"skill\":\"${TOOL_NAME}\",\"timestamp\":\"${TIMESTAMP}\",\"project\":\"${PROJECT}\"}" >> "$LOG_FILE"

exit 0
