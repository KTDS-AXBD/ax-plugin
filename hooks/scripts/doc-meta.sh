#!/bin/bash
# ax-h02: Doc Meta — 문서 frontmatter 검증
# PostToolUse(Write|Edit) 훅에서 실행
# 사용법: doc-meta.sh <file_path>

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

# assets/ 내부 파일은 검증 스킵
if [[ "$FILE" =~ /docs/assets/ ]]; then
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
FRONTMATTER=$(awk '/^---$/{n++; next} n==1{print} n==2{exit}' "$FILE")

if [[ -z "$FRONTMATTER" ]]; then
  echo "DOC-WARN: $BASENAME — frontmatter가 비어있어요."
  exit 0
fi

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
