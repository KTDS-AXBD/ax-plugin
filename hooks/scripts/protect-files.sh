#!/bin/bash
# ax-h03: Protect Files — 보호 파일 편집 차단
# PreToolUse(Write|Edit) 훅에서 실행
# $CLAUDE_TOOL_INPUT 환경변수에서 file_path를 추출하여 검증

PROTECTED_PATTERNS=(
  '\.dev\.vars'
  '\.env$'
  '\.env\.'
  'pnpm-lock\.yaml'
)

FILE_PATH=$(echo "$CLAUDE_TOOL_INPUT" | grep -oP '"file_path"\s*:\s*"\K[^"]+')

if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

for PATTERN in "${PROTECTED_PATTERNS[@]}"; do
  if echo "$FILE_PATH" | grep -qE "$PATTERN"; then
    echo "BLOCKED: 보호 파일($FILE_PATH) 편집이 차단되었어요. lock 파일은 pnpm install을 사용하세요."
    exit 2
  fi
done

exit 0
