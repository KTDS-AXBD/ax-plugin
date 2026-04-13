---
name: infra-statusline
description: "StatusLine 요구사항 표시를 관리한다. 현재 tmux pane의 REQ 표시를 설정하거나 지운다. Use when: statusline, REQ 표시, tmux pane title"
argument-hint: "[set <F항목 제목>|clear]"
user-invocable: true
allowed-tools:
  - Bash
---

# StatusLine REQ 관리

## 사용법

- `/ax-infra-statusline clear` — 현재 pane의 REQ 표시 제거
- `/ax-infra-statusline set F43 인터뷰검토` — 현재 pane에 REQ 설정
- `/ax-infra-statusline list` — 전체 pane의 REQ 현황 조회

## Steps

### 1. 인자 파싱

`$ARGUMENTS`에서 서브커맨드를 파싱한다.

### 2. 실행

**clear:**
```bash
PANE_ID="${TMUX_PANE#%}"
rm -f "/tmp/claude-req-pane${PANE_ID}"
echo "✅ pane ${PANE_ID}의 REQ 표시를 제거했습니다."
```

**set F{N} {제목}:**
```bash
PANE_ID="${TMUX_PANE#%}"
# $ARGUMENTS에서 "set " 이후 부분을 추출하여 기록
echo "{F번호} {제목}" > "/tmp/claude-req-pane${PANE_ID}"
echo "✅ pane ${PANE_ID}에 REQ를 설정했습니다: {F번호} {제목}"
```

**list:**
```bash
echo "=== StatusLine REQ 현황 ==="
for f in /tmp/claude-req-pane*; do
  [ -f "$f" ] || continue
  pane_id=$(echo "$f" | grep -oP '\d+$')
  content=$(cat "$f")
  echo "  pane ${pane_id}: ${content}"
done
# 현재 pane 강조
echo "  (현재 pane: ${TMUX_PANE#%})"
```

**인자 없음 또는 help:**
```
사용법:
  /ax-infra-statusline clear         — 현재 pane의 REQ 표시 제거
  /ax-infra-statusline set F43 제목  — 현재 pane에 REQ 설정
  /ax-infra-statusline list          — 전체 pane REQ 현황
```


---

## Gotchas

- TODO: 이 스킬 사용 시 주의사항을 작성하세요
