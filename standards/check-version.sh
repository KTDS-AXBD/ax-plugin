#!/bin/bash
# 버전 일관성 검증 스크립트
# 사용법: check-version.sh [project_root]
# SessionStart 훅 또는 /version check에서 사용

ROOT="${1:-.}"
cd "$ROOT" 2>/dev/null || exit 0

# Git repo가 아니면 스킵
if ! git rev-parse --is-inside-work-tree &>/dev/null; then
  exit 0
fi

# package.json이 없으면 스킵
if [[ ! -f "package.json" ]]; then
  exit 0
fi

ISSUES=0

# 1. package.json 버전 읽기
PKG_VERSION=$(grep -oP '"version"\s*:\s*"\K[^"]+' package.json)
if [[ -z "$PKG_VERSION" ]]; then
  echo "VER-WARN: package.json에 version 필드가 없어요."
  ISSUES=$((ISSUES + 1))
fi

# 2. 최신 git tag vs package.json
LATEST_TAG=$(git tag -l 'v*' --sort=-version:refname | head -1)
if [[ -n "$LATEST_TAG" ]]; then
  TAG_VERSION="${LATEST_TAG#v}"
  if [[ "$TAG_VERSION" != "$PKG_VERSION" ]]; then
    echo "VER-INFO: 최신 태그($LATEST_TAG) ≠ package.json($PKG_VERSION). 마일스톤 완료 시 태그를 생성하세요."
  fi
fi

# 3. SPEC.md 레거시 버전 마커 검출
#
# 검출 대상: 기능명 (v1.4) 등 본문 인라인 마커 (단독 닫힌 괄호 형식)
# 화이트리스트 (검출 제외):
#   - Heading: ### Sprint N (v1.4) 등
#   - Sprint 이력 행
#   - 체크리스트 항목 (- [ ] / - [x])
#   - 외부 산출물 식별자: `path/file.md` (v1.4) 형태 (백틱 + 확장자 직후)
#   - 설명 동반 식별자: (v1.0 PlumbBridge ...) 처럼 괄호 안에 추가 텍스트가 있는 경우
#
# 핵심 패턴: `\(v\d+\.\d+\)` (괄호 안에 버전만, 닫는 괄호 포함)
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
    echo "VER-WARN: SPEC.md에 인라인 버전 마커 ${COUNT}개 발견. SemVer로 전환 필요."
    echo "  예시: $(echo "$LEGACY" | head -1)"
  fi
fi

# 4. MEMORY.md 버전 일치
MEMORY_FILES=$(find . -path "*/memory/MEMORY.md" -o -path "./.claude/*/MEMORY.md" 2>/dev/null | head -1)
if [[ -z "$MEMORY_FILES" ]]; then
  # Auto memory 경로 체크
  PROJECT_PATH=$(pwd | sed 's|/|-|g; s|^-||')
  MEMORY_FILE="$HOME/.claude/projects/${PROJECT_PATH}/memory/MEMORY.md"
  if [[ -f "$MEMORY_FILE" ]]; then
    MEMORY_FILES="$MEMORY_FILE"
  fi
fi

# 5. 문서 system-version 범위 검증 (GOV-002 §4 item 4)
if [[ -n "$PKG_VERSION" && -d "docs" ]]; then
  PKG_MINOR=$(echo "$PKG_VERSION" | grep -oP '^\d+\.\K\d+')
  if [[ -n "$PKG_MINOR" ]]; then
    STALE_DOCS=()
    while IFS= read -r docfile; do
      # YAML frontmatter에서 system-version 추출 (예: v0.4, v0.6.0)
      SYS_VER=$(sed -n '/^---$/,/^---$/{ s/^system-version:\s*["'\'']\?\(v\?[0-9][0-9.]*\)["'\'']\?\s*$/\1/p }' "$docfile")
      if [[ -n "$SYS_VER" ]]; then
        # v 접두사 제거 후 minor 버전 추출
        SYS_VER_NUM="${SYS_VER#v}"
        DOC_MINOR=$(echo "$SYS_VER_NUM" | grep -oP '^\d+\.\K\d+')
        if [[ -n "$DOC_MINOR" ]]; then
          DIFF=$((PKG_MINOR - DOC_MINOR))
          if [[ $DIFF -gt 2 ]]; then
            STALE_DOCS+=("$docfile (system-version: $SYS_VER, current: v$PKG_VERSION)")
          fi
        fi
      fi
    done < <(find docs/ -name '*.md' -type f -not -path '*/archive/*' 2>/dev/null)

    if [[ ${#STALE_DOCS[@]} -gt 0 ]]; then
      echo "VER-WARN: system-version이 현재 버전보다 2+ minor 뒤처진 문서 ${#STALE_DOCS[@]}건:"
      for doc in "${STALE_DOCS[@]}"; do
        echo "  - $doc"
      done
      ISSUES=$((ISSUES + ${#STALE_DOCS[@]}))
    fi
  fi
fi

if [[ $ISSUES -gt 0 ]]; then
  echo "VER-CHECK: ${ISSUES}개 이슈 발견"
fi

exit 0
