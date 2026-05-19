#!/usr/bin/env bash
# ax-harness-kit verify — F666 M2
# 변수 잔존 검증 + 멱등성 확인
set -euo pipefail

PROJECT_NAME="${1:?PROJECT_NAME required}"
OUTPUT_DIR="${2:-$(pwd)/$PROJECT_NAME}"

PASS="✅"
FAIL="❌"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 ax-harness-kit Verify"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Target: $OUTPUT_DIR"
echo ""

if [ ! -d "$OUTPUT_DIR" ]; then
  echo "$FAIL 디렉토리 없음: $OUTPUT_DIR"
  exit 1
fi

failed=0

# ── 검증 1: Foundry-X 식별자 잔존 확인 ──
echo "[ 1/2 ] Foundry-X 식별자 잔존 체크..."
violations=$(grep -rl "ktds-axbd\|Foundry-X\|foundry-x" "$OUTPUT_DIR" \
  --include="*.ts" --include="*.tsx" --include="*.json" \
  --include="*.toml" --include="*.yaml" --include="*.yml" \
  --include="*.html" --include="*.md" 2>/dev/null || true)

if [ -z "$violations" ]; then
  echo "$PASS 식별자 잔존 0건"
else
  echo "$FAIL 식별자 잔존 발견:"
  echo "$violations" | while read -r f; do
    echo "   - $f"
    grep -n "ktds-axbd\|Foundry-X\|foundry-x" "$f" | head -3 | while read -r line; do
      echo "     $line"
    done
  done
  failed=$((failed + 1))
fi

echo ""

# ── 검증 2: 4-package 구조 존재 확인 ──
echo "[ 2/3 ] 4-package 구조 확인..."
for pkg in api web cli shared; do
  if [ -d "$OUTPUT_DIR/packages/$pkg" ]; then
    echo "$PASS packages/$pkg"
  else
    echo "$FAIL packages/$pkg 없음"
    failed=$((failed + 1))
  fi
done

echo ""

# ── 검증 3: .nvmrc 내용 확인 ──
echo "[ 3/3 ] .nvmrc Node 22 확인..."
nvmrc_file="$OUTPUT_DIR/.nvmrc"
if [ -f "$nvmrc_file" ]; then
  nvmrc_content=$(cat "$nvmrc_file" | tr -d '[:space:]')
  if [ "$nvmrc_content" = "22" ]; then
    echo "$PASS .nvmrc = 22"
  else
    echo "$FAIL .nvmrc = '$nvmrc_content' (expected: 22)"
    failed=$((failed + 1))
  fi
else
  echo "$FAIL .nvmrc 없음"
  failed=$((failed + 1))
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$failed" -gt 0 ]; then
  echo "$FAIL Verify FAILED — $failed 항목 미충족"
  exit 1
fi

echo "$PASS Verify PASS — 모든 항목 충족"
