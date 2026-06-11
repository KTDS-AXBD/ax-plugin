---
name: session-start
description: "세션 시작 시 프로젝트 컨텍스트를 복원한다. Auto Memory(MEMORY.md)에서 즉시 맥락 파악 후, SPEC.md 핵심 섹션만 보충 읽기. Use when: 세션 시작, 컨텍스트 복원, session start, 시작"
argument-hint: "[오늘 작업 또는 F항목]"
user-invocable: true
allowed-tools:
  - Read
  - Edit
  - Glob
  - Grep
  - Bash
---

# Session Start — 프로젝트 컨텍스트 복원

## Steps

### 1. Auto Memory + 워크트리 감지

MEMORY.md(자동 로딩)에서 현재 상태 파악. `.git`이 파일이면 worktree → SPEC/MEMORY는 main repo에서 읽기, REQ/TD 점검 건너뜀.

### 2. SPEC.md 부분 읽기 (토큰 최적화)

**SPEC.md 전체를 읽지 않는다.** §6 Execution Plan(~28K tokens)과 §9 변경이력(~6K)은 건너뛴다.

```bash
# SPEC.md에서 §1~§5 + §7~§8 + §10만 읽기 (§6, §9 제외)
if [ -f SPEC.md ]; then
  # §6 시작~§7 시작 사이, §9 시작~§10 시작 사이를 제외
  awk '/^## §6 /{skip=1} /^## §7 /{skip=0} /^## §9 /{skip=1} /^## §10 /{skip=0} !skip' SPEC.md
fi
```

Read 도구 사용 시에도 동일 원칙 적용:
- §1~§5 (개요, 현재 상태, 마일스톤, 성공지표, F-items): **읽기**
- §6 Execution Plan: **건너뛰기** (필요 시 개별 Sprint만 Grep)
- §7 기술 스택: **읽기**
- §8 Tech Debt: **읽기**
- §9 변경 이력: **건너뛰기**
- §10 버전 정책: **읽기**

### 2b. REQ/TD 정합성 점검 (Master 세션만)

SPEC.md §7 REQ Backlog의 DONE/REJECTED와 §6 체크박스 불일치 감지. §8 TD 해소 추적 점검.
불일치 시 알림만 (자동 보정 안 함).

### 3. Git 상태

`git status --short` + `git log --oneline -3`

### 4. F항목 감지 + 상태 전환

`$ARGUMENTS`에서 F항목 참조 감지 (예: `F35`).

감지 시:
1. SPEC.md에서 상태 확인, 📋→🔧 전환
2. D1 DB 동기화 (wrangler.toml 존재 시): `UPDATE feature_requests SET status='IN_PROGRESS' WHERE spec_item_id='F{N}'`
3. GitHub Issue 동기화 (gh CLI 존재 시): CLOSED→reopen + Project Status→"In Progress"
4. StatusLine 기록: `echo "F{N} {제목}" > "/tmp/claude-req-pane${TMUX_PANE#%}"`

미감지 시: MEMORY.md "활성 작업" 기반 제안.

### 5. Sprint Full Auto (sprint N 패턴 감지 시)

Sprint 번호 감지 시 자동 실행:
1. SPEC 커밋+push → `bash -i -c "sprint $N"` → Autopilot 주입 (`ccs --model sonnet` → `/ax:sprint-autopilot`)
2. `--manual` 플래그: autopilot 건너뛰고 WT 생성만

Sprint 미감지 시: `$ARGUMENTS` 기반 작업 범위 파악 또는 MEMORY.md "활성 작업" 제안.

### 5b. Pane Baseline 스냅샷

```bash
PANE_ID="${TMUX_PANE#%}"
git rev-parse HEAD > "/tmp/claude-session-commit-pane${PANE_ID}"
git status --porcelain | sort > "/tmp/claude-session-baseline-pane${PANE_ID}"
```

### 5c. Stale Monitor 감지 + 정리 (Master 세션만)

> **목적**: 이전 세션에서 완료된 Sprint의 Monitor task가 살아있으면 zombie로 남아 다른 Sprint 이벤트를 감지하는 노이즈 발생 (S272 교훈).
> worktree 세션에서는 실행하지 않는다 (`.git`이 파일인 경우 건너뜀).

```bash
SIGNAL_DIR="/tmp/sprint-signals"
if [ -d "$SIGNAL_DIR" ]; then
  for SIGNAL in "$SIGNAL_DIR"/*.signal; do
    [ -f "$SIGNAL" ] || continue

    SIG_STATUS=$(grep "^STATUS=" "$SIGNAL" | cut -d= -f2)
    SIG_NUM=$(grep "^SPRINT_NUM=" "$SIGNAL" | cut -d= -f2)
    MONITOR_TASK_ID=$(grep "^MONITOR_TASK_ID=" "$SIGNAL" | cut -d= -f2)

    # 완료된 Sprint (DONE/MERGED/FAILED)이면서 Monitor task ID가 있는 경우
    if [ "$SIG_STATUS" = "DONE" ] || [ "$SIG_STATUS" = "MERGED" ] || [ "$SIG_STATUS" = "FAILED" ]; then
      if [ -n "$MONITOR_TASK_ID" ]; then
        echo "⚠️ Stale Monitor 감지: Sprint $SIG_NUM (status=$SIG_STATUS, monitor=$MONITOR_TASK_ID)"
        # TaskStop 도구로 Monitor task 종료
        # TaskStop({ task_id: "$MONITOR_TASK_ID" })
        echo "  → Monitor task $MONITOR_TASK_ID 종료"
        # signal에서 MONITOR_TASK_ID 제거 (중복 stop 방지)
        sed -i "s/^MONITOR_TASK_ID=.*/MONITOR_TASK_ID=/" "$SIGNAL"
      fi
    fi
  done
fi
```

> **TaskList 활용 옵션**: 모든 활성 task를 조회하여 description이 "Sprint * signal"인 Monitor를 찾아서 signal 파일이 없거나 완료된 Sprint에 해당하면 TaskStop.
> 단, TaskList 호출 비용이 있으므로 signal 파일 기반 스캔을 우선한다.

### 5d. 신규 Sprint Monitor 자동 시작 (Master 세션만)

> **목적**: bashrc `sprint()` 함수 직접 호출 또는 다른 pane의 Sprint 시동 결과로 생성된 signal 중 **Monitor가 미부착된 활성 Sprint**를 감지하여 Master 세션에서 Monitor 도구를 자동 시작한다.
> sprint-ops Rule #1 ("반드시 Monitor 도구를 시작한다") 위반을 4회+ 누적(S256/266/268/263)한 결과 도입 (S263 2026-05-04).
> worktree 세션에서는 실행하지 않는다 (`.git`이 파일인 경우 건너뜀).
> Monitor가 이미 부착된 Sprint(MONITOR_TASK_ID 있음) 또는 종료된 Sprint(STATUS=DONE/MERGED/FAILED)는 건너뛴다 (5c에서 정리됨).

**감지 로직** (bash 스캔):

```bash
SIGNAL_DIR="/tmp/sprint-signals"
ORPHAN_ACTIVE=()
if [ -d "$SIGNAL_DIR" ]; then
  for SIGNAL in "$SIGNAL_DIR"/*.signal; do
    [ -f "$SIGNAL" ] || continue
    SIG_STATUS=$(grep "^STATUS=" "$SIGNAL" | cut -d= -f2)
    SIG_NUM=$(grep "^SPRINT_NUM=" "$SIGNAL" | cut -d= -f2)
    SIG_PROJECT=$(grep "^PROJECT=" "$SIGNAL" | cut -d= -f2)
    MONITOR_TASK_ID=$(grep "^MONITOR_TASK_ID=" "$SIGNAL" | cut -d= -f2)

    # 활성(CREATED/IN_PROGRESS) + Monitor 미부착 + 현 프로젝트 일치
    if [ "$SIG_STATUS" = "CREATED" ] || [ "$SIG_STATUS" = "IN_PROGRESS" ]; then
      if [ -z "$MONITOR_TASK_ID" ]; then
        CURRENT_PROJECT=$(basename "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null)
        if [ "$SIG_PROJECT" = "$CURRENT_PROJECT" ]; then
          ORPHAN_ACTIVE+=("$SIG_NUM")
          echo "🔔 Monitor 미부착 활성 Sprint 감지: $SIG_PROJECT-$SIG_NUM (status=$SIG_STATUS)"
        fi
      fi
    fi
  done
fi
```

**Monitor 도구 자동 시작** (감지된 각 Sprint마다, sprint skill Phase 5b와 동일 패턴):

> ⚠️ **신규 Sprint마다 1개씩** Monitor 도구 호출. ToolSearch로 Monitor 스키마 로드 → `Monitor(persistent: true, command: ...)` 호출. 반환 task_id를 signal에 기록.

```
# 각 ORPHAN_ACTIVE 항목에 대해:
Monitor(
  description: "Sprint $N signal/pane/idle 감시",
  persistent: true,
  timeout_ms: 3600000,
  command: "bash <sprint 스킬 디렉터리>/scripts/sprint-monitor-watch.sh ${SIG_PROJECT} ${SIG_NUM}"
)
# sprint-monitor-watch.sh = signal 변화 diff + 종결/pane 감지 + idle stall WARN(기본 15분 미진행+pane idle 2회 확인, rate limit 사각 검출)
# 반환된 task_id를 signal에 기록 (sprint skill Phase 5b 동일):
sed -i "s/^MONITOR_TASK_ID=.*/MONITOR_TASK_ID=${TASK_ID}/" "$SIGNAL"
```

> **Skip 조건**: 사용자가 명시적으로 "Monitor 안 켜도 됨" 또는 quick 모드 옵션 사용 시. 또는 `~/.claude/.no-auto-monitor` flag 파일 존재 시.

### 5e. MERGED Sprint 잔재 fallback 정리 (Master 세션만)

> **목적**: L1(task-daemon.sh `phase_sprint_signals` 10단계 grace cleanup)이 누락한 MERGED Sprint 잔재를 fallback 정리한다. 정상 경로는 L1이 60s grace 후 자동 정리하므로 본 phase는 누락 사례만 처리.
> worktree 세션에서는 실행하지 않는다 (`.git`이 파일인 경우 건너뜀).
> 5c (Stale Monitor task 종료)와 분리 — 5c는 Monitor task만 stop, 5e는 signal/flag/log/tmux session 잔재 정리.

**정리 대상**:
1. `/tmp/sprint-signals/<PROJECT>-<N>.signal` — STATUS=MERGED 인 signal 파일
2. `/tmp/sprint-signals/rename-fired-<N>.flag` — tmux 탭 rename trigger flag
3. `/tmp/sprint-signals/tmux-rename-<N>.log` + `tmux-rename-<N>-created.log` — rename 로그
4. tmux 세션 `sprint-<PROJECT>-<N>` — Sprint WT 탭

**감지 + 정리 로직**:

```bash
SIGNAL_DIR="/tmp/sprint-signals"
if [ -d "$SIGNAL_DIR" ]; then
  for SIGNAL in "$SIGNAL_DIR"/*.signal; do
    [ -f "$SIGNAL" ] || continue
    SIG_STATUS=$(grep '^STATUS=' "$SIGNAL" | cut -d= -f2)
    [ "$SIG_STATUS" = "MERGED" ] || continue

    SIG_NUM=$(grep '^SPRINT_NUM=' "$SIGNAL" | cut -d= -f2)
    SIG_PROJECT=$(grep '^PROJECT=' "$SIGNAL" | cut -d= -f2)
    CURRENT_PROJECT=$(basename "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null)
    [ "$SIG_PROJECT" = "$CURRENT_PROJECT" ] || continue

    echo "🧹 MERGED 잔재 정리: $SIG_PROJECT-$SIG_NUM"
    rm -f "$SIGNAL" \
          "$SIGNAL_DIR/rename-fired-${SIG_NUM}.flag" \
          "$SIGNAL_DIR/tmux-rename-${SIG_NUM}.log" \
          "$SIGNAL_DIR/tmux-rename-${SIG_NUM}-created.log"
    tmux kill-session -t "sprint-${SIG_PROJECT}-${SIG_NUM}" 2>/dev/null || true
  done
fi
```

> **정책 근거**: 사용자 명시 결정(S312, 2026-05-20) — "작업 완료된 sprint wt는 자동 정리". L1(task-daemon.sh)과 L2(session-start) 2-layer 구조. L1 누락 시 1세션 지연으로 자연 회복. 정착 사례: S311 Sprint 382/383 잔재 cleanup 후 L1+L2 2-layer 도입.

### 6. 세션 시작 안내

Master: 프로젝트 상태 + 오늘 작업 + 관련 파일 + 활성 WT 목록 + (5d 발견 시) **신규 Monitor 자동 시작 보고**.
Worktree: Sprint 컨텍스트 + 브랜치/경로 + 작업 범위 + push 주의사항.
