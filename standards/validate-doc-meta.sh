#!/bin/bash
# 문서 frontmatter 검증 스크립트
# PostToolUse(Write|Edit) 훅에서 docs/ 파일 저장 시 실행
# 사용법: validate-doc-meta.sh <file_path>

FILE="$1"

# docs/ 디렉토리 파일만 검증 (CHANGELOG.md, INDEX.md 제외)
if [[ ! "$FILE" =~ /docs/ ]]; then
  exit 0
fi

BASENAME=$(basename "$FILE")
if [[ "$BASENAME" == "CHANGELOG.md" || "$BASENAME" == "INDEX.md" ]]; then
  exit 0
fi

# archive/ 내부 파일은 검증 스킵
if [[ "$FILE" =~ /docs/archive/ ]]; then
  exit 0
fi

# .md 파일만 검증
if [[ "$FILE" != *.md ]]; then
  exit 0
fi

# frontmatter 존재 확인
if ! head -1 "$FILE" | grep -q '^---$'; then
  echo "DOC-WARN: $BASENAME — YAML frontmatter가 없어요. /doc check로 검증해보세요."
  exit 0
fi

# frontmatter 추출 (첫 --- 와 두 번째 --- 사이)
FRONTMATTER=$(sed -n '1,/^---$/p' "$FILE" | tail -n +2 | head -n -1)

# 필수 필드 검사
MISSING=""
for FIELD in code title version status category created updated author; do
  if ! echo "$FRONTMATTER" | grep -q "^${FIELD}:"; then
    MISSING="$MISSING $FIELD"
  fi
done

if [[ -n "$MISSING" ]]; then
  echo "DOC-WARN: $BASENAME — 필수 필드 누락:$MISSING"
fi

# 파일명-코드 일치 확인
CODE=$(echo "$FRONTMATTER" | grep '^code:' | sed 's/code: *//')
if [[ -n "$CODE" ]]; then
  EXPECTED_PREFIX="${CODE}_"
  if [[ ! "$BASENAME" =~ ^${CODE}_ ]]; then
    echo "DOC-WARN: $BASENAME — 파일명이 코드($CODE)와 불일치. 예상: ${CODE}_*.md"
  fi
fi

# SPEC/GUID/OPS 유형에 system-version 필수
CATEGORY=$(echo "$FRONTMATTER" | grep '^category:' | sed 's/category: *//')
if [[ "$CATEGORY" == "SPEC" || "$CATEGORY" == "GUID" || "$CATEGORY" == "OPS" ]]; then
  if ! echo "$FRONTMATTER" | grep -q "^system-version:"; then
    echo "DOC-WARN: $BASENAME — $CATEGORY 유형은 system-version 필드가 필요해요."
  fi
fi

exit 0
