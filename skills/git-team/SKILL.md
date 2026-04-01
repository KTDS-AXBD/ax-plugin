---
name: git-team
description: |
  Agent Teams를 tmux in-window split에서 병렬 수행한다.
  리더 pane 옆에 worker pane이 직접 보이며, 인터랙티브 모드로 실시간 도구 사용 현황이 표시된다.
  완료 후 DONE 마커 자동 기록 + 원래 레이아웃으로 자동 복원.
  Use when: agent team, 병렬 작업, worker, tmux, 팀 작업, parallel agents
argument-hint: "<작업 설명>"
user-invocable: true
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
  - Edit
---

# Team — tmux In-Window Split Agent Teams

`$ARGUMENTS`로 전달된 작업을 분석하여, **호출하는 리더 pane의 넓이를 분할**하여 병렬 `claude` 인스턴스를 실행한다.
완료 후 원래 레이아웃으로 자동 복원된다.

**리더 pane은 크기/위치/프로세스 모두 변경하지 않는다.**

### Multi-Leader 지원

동일 tmux window에 복수의 Leader가 존재할 수 있다. 각 Leader는 자기 pane만 분할한다.
`$TMUX_PANE` 환경변수로 호출하는 Leader를 식별한다 (active pane과 무관).

```
[Before] 2 Leaders             [After] Leader B가 /team 실행
┌──────────────┬──────────────┐  ┌──────────────┬───────┬──────┐
│  Leader A    │  Leader B    │  │  Leader A    │ Ldr B │ W1   │
│  (claude)    │  (claude)    │  │  (그대로)    │       ├──────┤
│              │              │  │              │       │ W2   │
└──────────────┴──────────────┘  └──────────────┴───────┴──────┘
```

## Steps

### 1. 작업 분석 및 팀 구성

`$ARGUMENTS`의 작업 설명을 분석하여 다음을 결정한다:

- **팀 이름**: 작업 키워드 기반 kebab-case
- **worker 수**: 2~3명 (같은 column 내 분할이므로 **최대 3명**)
- **역할 분배**: worker끼리 **같은 파일을 동시 수정하지 않도록** 분할
- **허용 파일 목록**: 각 worker가 **수정할 수 있는 파일**을 명시적으로 결정 (Positive Constraint)
- **태스크 요약**: 각 worker의 작업을 **10자 내외 한줄**로 요약
- **allowedTools**: 읽기만 `Read,Glob,Grep` / 수정 포함 `Read,Edit,Write,Glob,Grep,Bash`

작업 분석 시 코드베이스를 탐색하여 실제 대상 파일과 범위를 파악한다.
**허용 파일 목록은 runner의 File Guard에서도 사용되므로 정확히 결정해야 한다.**

### 2. Worker 프롬프트 작성

각 worker에게 전달할 프롬프트를 작성한다. 프롬프트에 반드시 포함:

- **Positive File Constraint** (가장 중요 — 반드시 프롬프트 최상단에 배치):
  ```
  [수정 허용 파일] 아래 파일만 수정할 수 있다. 이 외 파일을 수정하면 작업 실패로 간주한다:
  - path/to/file1.tsx
  - path/to/file2.ts
  다른 파일은 읽기만 가능하다. CLAUDE.md, SPEC.md, INDEX.md 등 프로젝트 메타 파일 수정 금지.
  ```
- **구체적인 수정 내용과 완료 기준**
- **DONE 마커 생성 지시** (프롬프트 맨 끝):
  ```
  [IMPORTANT] 모든 작업이 완료되면, 마지막으로 Bash 도구를 사용하여 다음 명령을 실행해라:
  echo '=== WORKER-{N} DONE ===' > "{TEAM_DIR}/team-{팀이름}-worker-{N}.log"
  ```

> **Positive vs Negative Constraint**: "이 파일 수정 금지" (negative)보다 "이 파일만 수정 허용" (positive)이
> 범위 이탈 방지에 효과적. Worker는 CLAUDE.md를 읽고 "도움이 될 것 같은" 추가 작업을 시도하는 경향이 있으므로,
> 허용 파일을 명시적으로 한정해야 한다.

임시 디렉토리를 생성하고 프롬프트를 파일에 저장한다:

```bash
TEAM_DIR="$PWD/.team-tmp"
mkdir -p "$TEAM_DIR"
cat > "$TEAM_DIR/team-{팀이름}-worker-{N}.txt" << 'PROMPT'
[worker 프롬프트 내용]
PROMPT
```

### 3. Worker 생성 (tmux in-window split)

> **CRITICAL**: 리더 pane을 **가로 분할(`-h`)**하여 오른쪽에 worker 컬럼을 생성한다.
> **break-pane, swap-pane, select-window 사용 금지**

**3a. Leader pane 식별 및 최소 넓이 확인**:

```bash
LEADER_PANE="${TMUX_PANE}"
LEADER_WIDTH=$(tmux display-message -t "$LEADER_PANE" -p '#{pane_width}')
echo "Leader: $LEADER_PANE (width=$LEADER_WIDTH)"
if [ "$LEADER_WIDTH" -lt 80 ]; then
  echo "ERROR: Leader pane too narrow ($LEADER_WIDTH cols). Minimum 80 required."
  exit 1
fi
```

**3b. worker runner 스크립트** 생성 (각 worker마다 1개):

```bash
PROJECT_DIR="$PWD"
TEAM_DIR="$PWD/.team-tmp"
CLAUDE_CFG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"

cat > "$TEAM_DIR/team-{팀이름}-run-{N}.sh" << RUNNER
#!/usr/bin/env bash
export PATH="\$HOME/.local/bin:\$PATH"
export CLAUDE_CONFIG_DIR="$CLAUDE_CFG"
cd $PROJECT_DIR
TASK_SUMMARY="{태스크요약}"
tmux select-pane -t "\$TMUX_PANE" -T "W{N}: \$TASK_SUMMARY ⏳" 2>/dev/null

# ── Pre-flight: 작업 전 dirty 파일 스냅샷 ──
git status --porcelain | sort > "$TEAM_DIR/team-{팀이름}-baseline-{N}.txt"

PROMPT_FILE="$TEAM_DIR/team-{팀이름}-worker-{N}.txt"
command claude "\$(cat \$PROMPT_FILE)" \\
  --allowedTools 'Read,Edit,Write,Glob,Grep,Bash' \\
  --dangerously-skip-permissions

# ── File Guard: 허용 파일 외 변경 자동 revert ──
ALLOWED_FILES="$TEAM_DIR/team-{팀이름}-allowed-{N}.txt"
if [ -f "\$ALLOWED_FILES" ]; then
  git diff --name-only | while read -r changed; do
    if ! grep -qxF "\$changed" "\$ALLOWED_FILES"; then
      git checkout -- "\$changed" 2>/dev/null && \\
        echo "[FILE-GUARD] reverted: \$changed" >> "$TEAM_DIR/team-{팀이름}-guard-{N}.log"
    fi
  done
  # 새로 생성된 파일 중 허용 목록에 없는 것도 삭제
  git status --porcelain | grep '^??' | awk '{print \$2}' | while read -r newfile; do
    if ! grep -qxF "\$newfile" "\$ALLOWED_FILES"; then
      rm -f "\$newfile" 2>/dev/null && \\
        echo "[FILE-GUARD] removed: \$newfile" >> "$TEAM_DIR/team-{팀이름}-guard-{N}.log"
    fi
  done
fi

tmux select-pane -t "\$TMUX_PANE" -T "W{N}: \$TASK_SUMMARY ✅" 2>/dev/null
RUNNER
chmod +x "$TEAM_DIR/team-{팀이름}-run-{N}.sh"

# ── 허용 파일 목록 생성 (리더가 Step 1에서 결정한 파일 목록) ──
cat > "$TEAM_DIR/team-{팀이름}-allowed-{N}.txt" << 'ALLOWED'
{허용파일1}
{허용파일2}
ALLOWED
```

**3c. launcher 스크립트** 생성:

```bash
cat > "$TEAM_DIR/team-{팀이름}-launcher.sh" << LAUNCHER
#!/usr/bin/env bash
set -e
TEAM="{팀이름}"
TEAM_DIR="$TEAM_DIR"
LEADER_PANE="$LEADER_PANE"
PROJECT_DIR="$PROJECT_DIR"
WORKER_COUNT={N}

# 기존 worker pane 정리 (재실행 시)
if [ -f "\$TEAM_DIR/team-\${TEAM}-worker-panes.txt" ]; then
  while read -r old_pane; do
    tmux kill-pane -t "\$old_pane" 2>/dev/null || true
  done < "\$TEAM_DIR/team-\${TEAM}-worker-panes.txt"
  rm -f "\$TEAM_DIR/team-\${TEAM}-worker-panes.txt"
fi

# Worker 컬럼 생성 — Leader pane 가로 분할 50%
PANES=()
PANES[1]=\$(tmux split-window -h -d -t "\$LEADER_PANE" -l 50% -c "\$PROJECT_DIR" -P -F '#{pane_id}')
echo "\${PANES[1]}" > "\$TEAM_DIR/team-\${TEAM}-worker-panes.txt"
sleep 2

# Worker 수에 따라 세로 분할 (분할 비율: 2명=50%, 3명=67%+50%)
if [ "\$WORKER_COUNT" -ge 2 ]; then
  SPLIT_PCT=\$([ "\$WORKER_COUNT" -eq 3 ] && echo 67 || echo 50)
  PANES[2]=\$(tmux split-window -v -d -t "\${PANES[1]}" -l \${SPLIT_PCT}% -c "\$PROJECT_DIR" -P -F '#{pane_id}')
  echo "\${PANES[2]}" >> "\$TEAM_DIR/team-\${TEAM}-worker-panes.txt"
  sleep 2
fi
if [ "\$WORKER_COUNT" -eq 3 ]; then
  PANES[3]=\$(tmux split-window -v -d -t "\${PANES[2]}" -l 50% -c "\$PROJECT_DIR" -P -F '#{pane_id}')
  echo "\${PANES[3]}" >> "\$TEAM_DIR/team-\${TEAM}-worker-panes.txt"
  sleep 2
fi

# 전체 worker 실행
for i in \$(seq 1 \$WORKER_COUNT); do
  tmux send-keys -t "\${PANES[\$i]}" "bash \$TEAM_DIR/team-\${TEAM}-run-\${i}.sh" Enter
done

tmux set-option -w pane-border-status top 2>/dev/null
tmux select-pane -t "\$LEADER_PANE" -T "Leader: \$TEAM" 2>/dev/null
echo "Workers created: \$WORKER_COUNT"
LAUNCHER
chmod +x "$TEAM_DIR/team-{팀이름}-launcher.sh"
```

**3d. launcher 실행 후 pane 생성을 검증**:
```bash
bash "$TEAM_DIR/team-{팀이름}-launcher.sh"
```

### 4. 자동 모니터링 + File Guard + 정리 (통합)

launcher 직후 **monitor 스크립트를 생성**하고 **Bash `run_in_background`로 실행**한다.
리더는 다른 작업을 계속하다가 monitor 완료 알림을 자동으로 받는다.

**4a. monitor 스크립트 생성**:

```bash
cat > "$TEAM_DIR/team-{팀이름}-monitor.sh" << 'MONITOR'
#!/usr/bin/env bash
TEAM="{팀이름}"
TEAM_DIR="{TEAM_DIR절대경로}"
WORKER_COUNT={N}
POLL_INTERVAL=15  # seconds

echo "🔍 Monitoring $WORKER_COUNT workers (poll: ${POLL_INTERVAL}s)..."
echo ""

# ── Phase 1: DONE 마커 폴링 ──
ELAPSED=0
while true; do
  ALL_DONE=true
  STATUS=""
  for i in $(seq 1 $WORKER_COUNT); do
    if grep -q "WORKER-${i} DONE" "$TEAM_DIR/team-${TEAM}-worker-${i}.log" 2>/dev/null; then
      STATUS="${STATUS}W${i}:✅ "
    else
      STATUS="${STATUS}W${i}:⏳ "
      ALL_DONE=false
    fi
  done

  MINS=$((ELAPSED / 60))
  SECS=$((ELAPSED % 60))
  printf "\r[%02d:%02d] %s" "$MINS" "$SECS" "$STATUS"

  if [ "$ALL_DONE" = true ]; then
    echo ""
    echo ""
    echo "✅ All $WORKER_COUNT workers DONE (${MINS}m ${SECS}s)"
    break
  fi

  sleep $POLL_INTERVAL
  ELAPSED=$((ELAPSED + POLL_INTERVAL))

  # 30분 타임아웃
  if [ $ELAPSED -ge 1800 ]; then
    echo ""
    echo "⚠️ Timeout (30m). Some workers may still be running."
    break
  fi
done

# ── Phase 2: File Guard 결과 ──
echo ""
echo "═══════════════════════════════════════"
echo "📋 File Guard Report"
echo "═══════════════════════════════════════"
GUARD_TOTAL=0
for i in $(seq 1 $WORKER_COUNT); do
  GUARD_LOG="$TEAM_DIR/team-${TEAM}-guard-${i}.log"
  if [ -f "$GUARD_LOG" ]; then
    REVERTED=$(wc -l < "$GUARD_LOG")
    GUARD_TOTAL=$((GUARD_TOTAL + REVERTED))
    echo "Worker ${i}: ⚠️ ${REVERTED}건 범위 이탈 → 자동 revert"
    cat "$GUARD_LOG" | sed 's/^/  /'
  else
    echo "Worker ${i}: ✅ 범위 이탈 없음"
  fi
done

# ── Phase 3: Worker pane 정리 ──
echo ""
echo "═══════════════════════════════════════"
echo "🧹 Cleanup"
echo "═══════════════════════════════════════"
while read -r pane_id; do
  tmux kill-pane -t "$pane_id" 2>/dev/null || true
done < "$TEAM_DIR/team-${TEAM}-worker-panes.txt"

REMAINING=$(ls "$TEAM_DIR"/team-*-worker-panes.txt 2>/dev/null | grep -v "team-${TEAM}-" | wc -l)
[ "$REMAINING" -eq 0 ] && tmux set-option -w pane-border-status off 2>/dev/null
echo "Worker panes removed."

# ── Phase 4: 최종 요약 ──
echo ""
echo "═══════════════════════════════════════"
echo "📊 Team '$TEAM' Summary"
echo "═══════════════════════════════════════"
echo "Workers:    $WORKER_COUNT/$WORKER_COUNT DONE"
echo "Duration:   ${MINS}m ${SECS}s"
echo "Guard:      ${GUARD_TOTAL}건 revert"
echo "═══════════════════════════════════════"
MONITOR
chmod +x "$TEAM_DIR/team-{팀이름}-monitor.sh"
```

**4b. monitor 실행** — `run_in_background: true`로 실행하면 리더가 다른 작업을 계속할 수 있다:

```bash
bash "$TEAM_DIR/team-{팀이름}-monitor.sh"
```

> **`run_in_background` Bash 옵션 사용**: monitor 명령은 Bash 도구의 `run_in_background: true`로 실행한다.
> 리더는 완료 알림을 자동으로 받으며, 그 사이에 다른 작업(문서 작성, 코드 리뷰 등)을 할 수 있다.
> 완료 시점에 monitor가 File Guard + pane 정리 + 요약까지 자동으로 처리한다.

### 5. 검증

monitor 완료 알림을 받은 후, 리더가 프로젝트의 검증 명령(lint, typecheck, test 등)을 실행한다.
File Guard 보고에 범위 이탈이 있었다면 `git diff --stat`으로 최종 확인한다.

## Worktree Isolation 모드 (선택)

Worker가 **겹치는 영역을 수정해야 하거나**, 실험적 변경을 안전하게 시도하고 싶을 때 사용한다.
각 worker가 독립된 git worktree 복사본에서 작업하므로 파일 충돌이 원천 차단된다.

### 언제 사용하는가

| 상황 | 모드 |
|------|------|
| worker끼리 파일 겹침 없음 | **기본 모드** (공유 디렉토리) |
| 같은 모듈의 다른 파일 수정 | **Worktree 모드** 권장 |
| DB 의존 작업 (마이그레이션, 시드) | **기본 모드** (D1 로컬 DB 공유 필요) |
| 실험적/탐색적 변경 | **Worktree 모드** 권장 |

### 설정 방법

**Step 3b의 runner 스크립트**를 다음과 같이 변경한다:

```bash
cat > "$TEAM_DIR/team-{팀이름}-run-{N}.sh" << RUNNER
#!/usr/bin/env bash
export PATH="\$HOME/.local/bin:\$PATH"
export CLAUDE_CONFIG_DIR="$CLAUDE_CFG"

# Worktree 생성 — 현재 HEAD 기준 임시 브랜치
WORKTREE_BRANCH="team-{팀이름}-worker-{N}"
WORKTREE_DIR="$PROJECT_DIR/.worktrees/worker-{N}"
git -C "$PROJECT_DIR" worktree add -b "\$WORKTREE_BRANCH" "\$WORKTREE_DIR" HEAD 2>/dev/null

cd "\$WORKTREE_DIR"
TASK_SUMMARY="{태스크요약}"
tmux select-pane -t "\$TMUX_PANE" -T "W{N}: \$TASK_SUMMARY ⏳" 2>/dev/null

PROMPT_FILE="$TEAM_DIR/team-{팀이름}-worker-{N}.txt"
command claude "\$(cat \$PROMPT_FILE)" \\
  --allowedTools 'Read,Edit,Write,Glob,Grep,Bash' \\
  --dangerously-skip-permissions

tmux select-pane -t "\$TMUX_PANE" -T "W{N}: \$TASK_SUMMARY ✅" 2>/dev/null
RUNNER
chmod +x "$TEAM_DIR/team-{팀이름}-run-{N}.sh"
```

### Worktree 결과 머지 (리더 실행)

모든 worker 완료 후, 리더가 각 worktree의 변경사항을 메인으로 머지한다:

```bash
TEAM="{팀이름}"
for i in $(seq 1 {WORKER_COUNT}); do
  BRANCH="team-${TEAM}-worker-${i}"
  echo "--- Merging $BRANCH ---"
  git merge --no-ff "$BRANCH" -m "chore: merge $BRANCH"
done
```

충돌 발생 시 리더가 수동 해결한다. 머지 완료 후 worktree를 정리한다:

```bash
for i in $(seq 1 {WORKER_COUNT}); do
  git worktree remove ".worktrees/worker-${i}" --force 2>/dev/null
  git branch -d "team-${TEAM}-worker-${i}" 2>/dev/null
done
rmdir .worktrees 2>/dev/null
```

### Worktree 모드 프롬프트 주의

- Worker 프롬프트에 **절대 경로 대신 상대 경로** 사용 (worktree 루트가 다르므로)
- `pnpm install`이 필요할 수 있음 (node_modules가 심볼릭 링크가 아닌 경우)
- DONE 마커 경로는 원본 `$TEAM_DIR`(공유)을 사용 — worktree 내부가 아님

## 주의사항

- **`$TMUX_PANE`으로 Leader 식별**: active pane과 무관하게 호출한 Leader를 정확히 식별
- **자기 영역만 분할**: 다른 Leader pane이나 그 worker에 영향 없음
- **기존 pane에 send-keys/kill 금지**: 새로 생성한 worker pane에만 사용
- **`command claude`**: `.bashrc` alias를 우회하여 실제 바이너리 호출. `CLAUDE_CONFIG_DIR`로 인증 컨텍스트 전파
- **`--dangerously-skip-permissions`**: worker pane은 비인터랙티브이므로 필수
- **`sleep 2`**: pane 생성 후 필수 (shell init delay)
- **git 작업은 리더만** 수행 (worker에게 commit/push 시키지 않음)
- `$ARGUMENTS`가 비어있으면 사용자에게 작업 설명을 요청한다


---

## Gotchas

- TODO: 이 스킬 사용 시 주의사항을 작성하세요
