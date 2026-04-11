#!/bin/bash
# ax-h04: Secret Scan — 시크릿 커밋 방지
# PreToolUse(Bash) 훅에서 실행
# $CLAUDE_TOOL_INPUT 환경변수에서 command를 추출하여 검증

COMMAND=$(echo "$CLAUDE_TOOL_INPUT" | grep -oP '"command"\s*:\s*"\K[^"]+')

if [[ -z "$COMMAND" ]]; then
  exit 0
fi

# git add/commit 명령에서 시크릿 파일 포함 여부 검사
if echo "$COMMAND" | grep -qE 'git\s+(add|commit)'; then
  DANGEROUS=(
    '\.env$'
    '\.env\.'
    '\.dev\.vars'
    'credentials'
    'secret'
    '\.pem$'
    '\.key$'
  )

  for PATTERN in "${DANGEROUS[@]}"; do
    if echo "$COMMAND" | grep -qE "$PATTERN"; then
      echo "BLOCKED: 시크릿 파일($PATTERN)이 git 명령에 포함되어 있어요. .gitignore를 확인하세요."
      exit 2
    fi
  done
fi

exit 0
