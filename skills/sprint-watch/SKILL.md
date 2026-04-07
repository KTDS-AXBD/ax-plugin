---
name: sprint-watch
description: |
  Sprint WT 완료까지 자동 모니터링 + 완료 시 merge pipeline 실행.
  GitHub Gist에 상태를 주기적으로 업데이트하여 모바일에서 확인 가능.
  Use when: sprint watch, 모니터링, monitor sprint, 원격 모니터링, gist
argument-hint: "[start|stop|status|once]"
user-invocable: true
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
---

# Sprint Watch — 원격 모니터링 + Gist 자동 갱신

활성 Sprint WT의 상태를 수집하여 GitHub Gist에 업데이트한다.
모바일 브라우저에서 Gist URL을 북마크하면 실시간 진행 현황을 확인할 수 있다.

## Gist 설정

| 항목 | 값 |
|------|-----|
| Gist ID | `.sprint-watch-config` 파일에 저장 |
| 갱신 주기 | `/loop` 연동 시 5분 기본 |
| 인증 | `gh` CLI (이미 로그인된 계정) |

**설정 파일**: `{PROJECT_ROOT}/.sprint-watch-config`
```
GIST_ID=ab61c355c29307b88921f0e463d99d08
GIST_FILE=sprint-monitor.md
INTERVAL=300
```

## Subcommands

### `start` (기본)

Sprint Watch를 시작한다. `/loop 5m /ax:sprint-watch once` 를 내부적으로 호출.

1. `.sprint-watch-config`에서 GIST_ID 로드 (없으면 새 Gist 생성)
2. 즉시 1회 상태 수집 + Gist 갱신
3. `/loop 5m /ax:sprint-watch once` 로 주기적 갱신 시작
4. Gist URL 출력

```
## Sprint Watch 시작

📱 모바일 모니터링 URL:
https://gist.github.com/{user}/{GIST_ID}

갱신 주기: 5분
중단: `/ax:sprint-watch stop` 또는 `/loop stop`
```

### `once`

1회 상태 수집 + Gist 갱신만 수행한다. `/loop`에서 반복 호출하는 단위.

**수집 항목:**

```bash
PROJECT=$(basename "$(git rev-parse --show-toplevel)")
SIGNAL_DIR="/tmp/sprint-signals"
NOW=$(date "+%Y-%m-%d %H:%M:%S")

# 1. 활성 Sprint signal 수집
for sig in "$SIGNAL_DIR"/*.signal; do
  [ -f "$sig" ] || continue
  source "$sig"
  # STATUS, SPRINT_NUM, F_ITEMS, MATCH_RATE, CHECKPOINT, TIMESTAMP
done

# 2. tmux 세션에서 TUI 상태 캡처
for sess in $(tmux list-sessions -F '#{session_name}' 2>/dev/null | grep "^sprint-"); do
  SPRINT_NUM=$(echo "$sess" | sed "s/sprint-${PROJECT}-//")
  TUI=$(tmux capture-pane -t "$sess" -p -S -5 2>/dev/null | strings)
  PROGRESS=$(echo "$TUI" | grep -oP '\d+%' | tail -1)
  ACTIVITY=$(echo "$TUI" | grep -oP '(thinking|Bash|Read|Write|Edit|Skill|Agent)[^\n]*' | tail -1 | head -c 50)
done

# 3. 최근 master 커밋 (merge 감지)
RECENT_MERGES=$(git log --oneline -5 --grep="Sprint" 2>/dev/null)

# 4. merge-monitor 생존 여부
MONITOR_COUNT=$(ps aux | grep sprint-merge-monitor | grep -v grep | wc -l)
```

**Gist 출력 포맷:**

```markdown
# 🏗️ Foundry-X Sprint Monitor

> 최종 갱신: {NOW} (KST)
> Merge Monitor: {MONITOR_COUNT}개 가동

## 활성 Sprint

| Sprint | F-items | Status | Progress | Activity |
|--------|---------|--------|----------|----------|
| 200 | F418,F419 | IN_PROGRESS | 47% | thinking |
| 194 | F410 | CREATED | — | — |

## 최근 완료 (master merge)

| 시각 | Sprint | 내용 |
|------|--------|------|
| 16:32 | 199 | feat: Sprint 199 — F416,F417 |
| 16:20 | 198 | feat: Sprint 198 — F414,F415 |

## Phase 22 진행률

```
M1 ████████████ 100% (F414~F417 ✅)
M2 ▓▓▓▓░░░░░░░░  33% (F418~F419 🔧)
M3 ░░░░░░░░░░░░   0% (F420~F422 📋)
```

---
_🤖 Auto-updated by sprint-watch_
```

**Gist 갱신:**
```bash
# 마크다운 파일 생성
cat > /tmp/sprint-monitor.md <<EOF
{위 포맷으로 생성된 내용}
EOF

# Gist 갱신
GIST_ID=$(grep GIST_ID .sprint-watch-config | cut -d= -f2)
gh gist edit "$GIST_ID" -f sprint-monitor.md /tmp/sprint-monitor.md
```

### `stop`

Watch를 중단한다.

1. `/loop stop` 호출 (loop 스킬 중단)
2. Gist에 "⏸️ Watch 중단됨" 상태 갱신

### `status`

현재 Watch 상태를 표시한다.

1. `.sprint-watch-config` 존재 여부
2. Gist URL
3. `/loop` 활성 여부
4. 마지막 갱신 시각

## 초기 설정

첫 실행 시 자동으로 수행:

1. `gh gist create` 로 public gist 생성
2. GIST_ID를 `.sprint-watch-config`에 저장
3. `.gitignore`에 `.sprint-watch-config` 추가

```bash
GIST_URL=$(gh gist create /tmp/sprint-monitor.md --desc "Foundry-X Sprint Monitor" --public)
GIST_ID=$(echo "$GIST_URL" | grep -oP '[a-f0-9]{32}')
echo "GIST_ID=$GIST_ID" > .sprint-watch-config
echo "GIST_FILE=sprint-monitor.md" >> .sprint-watch-config
echo "INTERVAL=300" >> .sprint-watch-config
```

## Auto-Approve (권한 프롬프트 자동 승인)

Sprint WT에서 발생하는 권한 프롬프트를 Master가 자동으로 승인한다.
`start` 시 auto-approve 프로세스가 함께 시작되고, `stop` 시 함께 종료된다.

### 감지 패턴 + 자동 응답

| 패턴 | 감지 문자열 | 자동 응답 | 설명 |
|------|-----------|----------|------|
| TUI 숫자 선택 | `1. Yes` / `2. Yes, and allow` / `3. No` 패턴 | `2` + Enter | "세션 전체 허용" (v2: 정규식 `[123]\. (Yes\|Allow\|No)`) |
| Esc/Tab 힌트 | `Esc to cancel · Tab to amend` + 선택지 | `2` + Enter | TUI 프롬프트 하단 힌트로 보강 감지 |
| bypass off | `bypass permissions off` | Shift+Tab | bypass on으로 전환 |

> **v2 변경 (S218)**: `"Do you want"` 패턴 제거 — TUI 숫자 선택형에 `y`를 반복 전송하는 오탐 방지. 쿨다운 30초 추가 (같은 세션 연속 전송 방지).

### 실행 방식

`start` 시 자동으로 background에서 실행:
```bash
nohup bash ~/scripts/sprint-auto-approve.sh 10 120 \
  > /tmp/sprint-signals/auto-approve.log 2>&1 & disown
```

- **10초 간격**으로 모든 활성 Sprint tmux pane을 캡처
- 권한 프롬프트 패턴 감지 시 즉시 자동 응답 전송
- 최대 **120분** 동작 (Sprint 완료까지 충분)
- `AskUserQuestion` 프롬프트는 자동 승인 **안 함** (사용자 판단 필요)

### 수동 실행

```bash
# Master에서 수동으로 auto-approve 시작
nohup bash ~/scripts/sprint-auto-approve.sh 10 120 \
  > /tmp/sprint-signals/auto-approve.log 2>&1 & disown

# 로그 확인
tail -f /tmp/sprint-signals/auto-approve.log

# 중단
pkill -f sprint-auto-approve
```

### `start` 통합

`start` 서브커맨드 실행 시 Phase 5 이후에 자동으로 실행:

```bash
# Phase 5c: Auto-Approve 시작
nohup bash ~/scripts/sprint-auto-approve.sh 10 120 \
  > /tmp/sprint-signals/auto-approve.log 2>&1 & disown
echo "✅ auto-approve PID: $!"
```

### Gist 표시

`once` 갱신 시 auto-approve 상태도 표시:
```markdown
> Auto-Approve: {N}개 가동 | 승인 건수: {M}
```

## Gotchas

- `gh` CLI 인증 필요 — `gh auth status`로 확인
- Gist rate limit: 시간당 5000회 (5분 간격이면 시간당 12회, 문제 없음)
- tmux 캡처는 현재 WSL 호스트에서만 가능 — 원격 서버 Sprint는 signal 파일 기반으로만 수집
- `/loop` 스킬이 없으면 수동으로 `/ax:sprint-watch once`를 반복 호출
- Gist는 public — 민감 정보(API 키 등)를 포함하지 않도록 주의
- Auto-approve는 `AskUserQuestion` 프롬프트를 자동 승인하지 않음 — 의도적 설계 (사용자 판단 보호)
- `ccs` (skip-permissions) 모드에서는 대부분 프롬프트가 발생하지 않지만, settings.json 수정 등 특수 상황에서 발생 가능
