---
name: sprint
description: "Sprint worktree Full Auto 오케스트레이션 — start 한 번으로 WT 생성→autopilot→모니터링→merge까지. worktree를 Windows Terminal 독립 탭으로 열고, SPEC.md F-items와 연동. Use when: sprint, 스프린트, worktree, 워크트리, sprint start"
argument-hint: "<start|merge|pr|review|done|list|monitor|clean> [N] [--manual|--team|--single]"
user-invocable: true
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
---

# Sprint — Full Auto Worktree 오케스트레이션

Master 세션에서 Sprint worktree를 **한 명령으로** 생성→autopilot→모니터링→merge까지 자동화한다.
각 Sprint는 독립 tmux 세션 + 독립 git 브랜치에서 작업한다.

## 아키텍처

```
/ax:sprint start 102 F273
         │
         ▼
┌─ Master 세션 ─────────────────────────────────────────────┐
│ Phase 1: SPEC F-item 📋→🔧 + 커밋 + push                 │
│ Phase 2: bash -i -c "sprint 102" → WT 탭 생성             │
│ Phase 3: tmux send-keys → ccs → /ax:sprint-autopilot      │
│ Phase 4: sprint-status-monitor.sh (background)             │
│ Phase 5: sprint-merge-monitor.sh (background)              │
│          ↓ (Master는 다른 작업 가능)                       │
│                                                            │
│ Sprint WT (독립 tmux)                                      │
│ ┌────────────────────────────────────────┐                 │
│ │ Plan → Design → Implement → Analyze    │                 │
│ │ → Report → Session-End → push          │                 │
│ │ → signal 파일 생성 (/tmp/sprint-signals)│                │
│ └────────────────────────────────────────┘                 │
│          ↓ (signal DONE 감지)                              │
│ merge-monitor: review → PR merge → D1 → deploy → cleanup  │
│ Master: SPEC 🔧→✅ + MEMORY 갱신                          │
└────────────────────────────────────────────────────────────┘
```

## Subcommands

`$ARGUMENTS`에서 서브커맨드와 인자를 파싱한다.

### `start <N> [F항목들...] [--manual]`

Sprint worktree를 생성하고 **기본적으로 autopilot + 모니터링까지 자동 실행**한다.

> **자동 위임**: `/ax:session-start /sprint N` 으로 세션을 시작하면, session-start가 Sprint 패턴을 감지하여 이 `start` 프로세스를 자동으로 실행한다 (AskUserQuestion 없이). `--manual` 플래그로 수동 모드 전환 가능.

**Phase 1: SPEC 연동 + 커밋 + push** (F항목이 SPEC에 존재하는 경우):
1. SPEC.md에서 해당 F항목 상태를 📋 → 🔧 전환
2. MEMORY.md "다음 작업"에 Sprint N 작업 표시
3. `git add SPEC.md && git commit && git push origin master`
   - ⚠️ **WT 생성 전에 반드시 push 완료** (S149 교훈: 미커밋 SPEC으로 WT 생성 시 drift)

**Phase 2: WT 생성** (3단계 — bashrc sprint() 실패 시 수동 fallback 포함):

> Claude Code Bash tool은 non-TTY라 `bash -i -c "sprint N"`이 실패할 수 있다 (S271 교훈).
> 실패 시 Phase 2a→2b→2c 수동 fallback 경로를 사용한다.

**Phase 2 시도**: bashrc sprint() 함수 호출
```bash
bash -i -c "sprint $N"
```

**Phase 2 실패 시 → Phase 2a~2c 수동 fallback**:

**Phase 2a: Worktree 생성** (git worktree 직접 사용):
```bash
export CLAUDE_WT_BASE=/home/sinclair/work/worktrees
PROJECT=$(basename "$(git rev-parse --show-toplevel)")
BRANCH="sprint/${N}"
WT_DIR="$CLAUDE_WT_BASE/$PROJECT/sprint-${N}"

mkdir -p "$CLAUDE_WT_BASE/$PROJECT"
if git rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
  git worktree add "$WT_DIR" "$BRANCH"
else
  git worktree add -b "$BRANCH" "$WT_DIR" HEAD
fi
```

**Phase 2b: tmux 세션 생성** (배너 + exec bash 대기):
```bash
# F-item 정보 추출
F_ITEMS=$(awk -F'|' -v s="Sprint ${N}" '$4 ~ s {match($2,/F[0-9]+/); print substr($2,RSTART,RLENGTH)}' SPEC.md 2>/dev/null | paste -sd, -)
F_TITLE=$(grep "| ${F_ITEMS%%,*} |" SPEC.md 2>/dev/null | head -1 | \
  awk -F'|' '{print $3}' | sed 's/^ *//' | sed 's/ —.*//' | sed 's/ (FX-REQ.*//' | head -c 25)
SAFE_TITLE=$(echo "$F_TITLE" | tr ':/' '__')
SESSION_NAME="sprint-${N} ${F_ITEMS} ${SAFE_TITLE}"
BANNER_TITLE="${PROJECT} · Sprint ${N} — ${F_TITLE}"

tmux new-session -d -s "$SESSION_NAME" -c "$WT_DIR" -e HOME=/home/sinclair \
  "bash -i -l -c 'printf \"\n\033[1;36m🌳 ${BANNER_TITLE}\033[0m\n──────────────────────────\n  \033[33mBranch\033[0m   ${BRANCH}\n  \033[33mF-items\033[0m  ${F_ITEMS:-없음}\n──────────────────────────\n  \033[33mccs\033[0m   ccs --model sonnet\n──────────────────────────\n\"; exec bash'"
```

**Phase 2c: Windows Terminal 탭 열기** (tmux attach):
```bash
WTE="/mnt/c/Users/sincl/AppData/Local/Microsoft/WindowsApps/wt.exe"
TAB_TITLE="${PROJECT}: Sprint ${N} — ${F_ITEMS} ${F_TITLE}"
"$WTE" -w 0 new-tab --title "$TAB_TITLE" --suppressApplicationTitle \
  -- wsl.exe -d Ubuntu-24.04 bash -lic "tmux attach -t \"$SESSION_NAME\""
```
> ⚠️ **Phase 2c는 반드시 실행한다** — 생략하면 WT 탭이 안 열려 사용자가 Sprint 진행을 볼 수 없다.
> Phase 2 성공(bashrc sprint())이면 wt.exe가 sprint() 내부에서 호출되므로 2c 불필요.

**Phase 2d: task-daemon 시작** (bashrc sprint() 실패 시 누락되는 _sprint_ensure_monitor 대체):
```bash
# bashrc sprint()는 마지막에 _sprint_ensure_monitor()를 호출하여 task-daemon을 시작한다.
# 수동 fallback 경로에서는 이 호출이 누락되므로 직접 실행해야 한다.
DAEMON_SCRIPT="$(git rev-parse --show-toplevel)/scripts/task/task-daemon.sh"
if [ -f "$DAEMON_SCRIPT" ]; then
  bash "$DAEMON_SCRIPT" --bg
fi
```
> ⚠️ **Phase 2d도 반드시 실행한다** — 생략하면 signal 감지/merge 자동화가 동작하지 않는다 (S271 교훈).

**Phase 3: Autopilot 주입** (`--manual` 미지정 시 자동):
```bash
TMUX_SESSION="sprint-${PROJECT}-${N}"
# Claude 시작 (WT는 Sonnet 모델 사용 — 비용 효율 + Master Opus와 역할 분리)
tmux send-keys -t "$TMUX_SESSION" "bash -ic 'ccs --model sonnet'" Enter
# Claude 기동 대기 (TUI 렌더링까지)
sleep 10
# Autopilot 명령 전송
tmux send-keys -t "$TMUX_SESSION" "/ax:sprint-autopilot" Enter
```
**주의**: `claude -p` 또는 `echo | claude` 파이프 모드는 TUI가 보이지 않으므로 금지.
**모델**: WT는 `--model sonnet` (Sonnet 4.6), Master는 기본 Opus. `--model opus`로 오버라이드 가능.

**Phase 4: Signal 초기화**:
```bash
# Signal 디렉토리 준비
SIGNAL_DIR="/tmp/sprint-signals"
mkdir -p "$SIGNAL_DIR"
SIGNAL_FILE="${SIGNAL_DIR}/${PROJECT}-${N}.signal"

# 초기 signal 생성 — 모든 필드를 포함해야 merge-monitor가 crash하지 않음
cat > "$SIGNAL_FILE" <<SIGNAL
STATUS=CREATED
SPRINT_NUM=$N
PROJECT=$PROJECT
F_ITEMS=$F_ITEMS
BRANCH=sprint/$N
PR_NUM=
GITHUB_REPO=$(git remote get-url origin 2>/dev/null | grep -oP '(?<=github.com[:/])[^.]+' || true)
PROJECT_ROOT=$(git rev-parse --show-toplevel)
CHECKPOINT=
ERROR_STEP=
ERROR_MSG=
MATCH_RATE=
TEST_RESULT=
TIMESTAMP=$(date -Iseconds)
SIGNAL
```

**Phase 5: Merge Monitor 시작** (background, **별도 Bash tool 호출 필수**):

> ⚠️ **중요: merge-monitor와 status-monitor는 반드시 별도의 `run_in_background` Bash 호출로 실행한다.**
> 하나의 Bash 호출에 `&`로 묶으면 부모 프로세스 종료 시 자식도 함께 종료될 수 있다.
> `nohup` + `disown`으로 프로세스를 완전 분리한다.

**merge-monitor** (Bash tool, `run_in_background: true`):
```bash
nohup bash ~/scripts/sprint-merge-monitor.sh > /tmp/sprint-signals/merge-monitor-${N}.log 2>&1 &
disown
echo "✅ merge-monitor PID: $!"
```

**status-monitor** (Bash tool, `run_in_background: true`):
```bash
nohup bash ~/scripts/sprint-status-monitor.sh 45 60 > /tmp/sprint-signals/status-monitor-${N}.log 2>&1 &
disown
echo "✅ status-monitor PID: $!"
```

**Phase 5b: Monitor 생존 확인** (Phase 5 직후):
```bash
sleep 2
ps aux | grep -E "sprint-merge-monitor|sprint-status-monitor" | grep -v grep | wc -l
# 2 이상이면 정상. 0이면 재시작 필요
```
> merge-monitor는 signal 파일에서 STATUS=DONE을 감지하면:
> review → PR merge → D1 migration → Workers deploy → health check → WT cleanup 자동 수행

**Phase 6: 안내 출력**:
```
## Sprint $N Full Auto 시작

| 항목 | 값 |
|------|-----|
| Branch | sprint/$N |
| Directory | ~/work/worktrees/$PROJECT/sprint-$N |
| F-items | F273 |
| Autopilot | ✅ 주입 완료 |
| Status Monitor | ✅ background (45s 간격) |
| Merge Monitor | ✅ background (15s 간격) |

### 자동 프로세스
WT: Plan → Design → Implement → Analyze → Report → push → signal
Master: signal 감지 → review → PR merge → D1 → deploy → SPEC ✅ → cleanup

Master 세션은 다른 작업을 진행할 수 있어요.
진행 확인: `/ax:sprint monitor $N`
```

**`--team` 모드**: Phase 3에서 autopilot 대신 `/pdca team {feature}`를 주입. Agent Team 3인(developer+frontend+qa)이 병렬 구현.
> **자동 판정**: `--team`/`--single` 미지정 시, F-item의 변경 영역을 분석하여 자동 권장:
> - **Team 권장**: api/ + web/ 동시 수정 (서로 다른 패키지 병렬 가능)
> - **단일 권장**: 신규 모듈 생성(Foundation), 단일 패키지 집중, shared/ 동시 수정 위험
> - 판정 기준: Design 문서의 구현 순서(§9/§11)에서 변경 대상 패키지를 추출하여 교차 여부 확인
>
> | Sprint 유형 | 판정 | 이유 |
> |-------------|------|------|
> | Foundation (신규 모듈) | 단일 | 설계 일관성 중요, 파일 생성만 |
> | API + UI 통합 (다른 패키지) | **Team** | developer(api/) + frontend(web/) 병렬 ~40% 절감 |
> | 단일 패키지 집중 | 단일 | 같은 파일 충돌 위험 |
> | 테스트 + 리팩토링 | **Team** | qa 테스트 + developer 수정 병렬 |

**`--manual` 모드**: Phase 3~5를 건너뜀. WT 생성 + SPEC 연동만 수행.
```
### Sprint 탭에서 수동 진행
1. `ccs --model sonnet` 실행 (또는 `ccs --model opus`로 오버라이드)
2. `/ax:sprint-autopilot` 또는 직접 작업
3. 완료 후 Master에서 `/ax:sprint review $N` → `/ax:sprint merge $N`
```

### `monitor [N]`

활성 Sprint의 현재 진행 상황을 확인한다.

**N 지정 시**: 해당 Sprint의 tmux pane 캡처 + signal 파일 상태를 한 번 출력.
```bash
TMUX_SESSION="sprint-${PROJECT}-${N}"
# tmux pane에서 최근 30줄 캡처
tmux capture-pane -t "$TMUX_SESSION" -p -S -30

# signal 파일 상태 출력
SIGNAL_FILE="/tmp/sprint-signals/${PROJECT}-${N}.signal"
[ -f "$SIGNAL_FILE" ] && cat "$SIGNAL_FILE"
```

**N 미지정 시**: 전체 활성 Sprint 현황 요약.
```bash
# 활성 worktree 기반
git worktree list | grep sprint
# signal 파일 기반
ls /tmp/sprint-signals/*.signal 2>/dev/null
```

출력 예시:
```
## Sprint 현황

| Sprint | Status | Checkpoint | Match Rate | Progress |
|--------|--------|------------|------------|----------|
| 102 | IN_PROGRESS | implement | — | 47% |
| 103 | CREATED | — | — | 6% |
```

### `list`

활성 Sprint worktree 목록을 표시한다.

```bash
git worktree list
```

각 worktree에 `.sprint-context` 파일이 있으면 Sprint 정보도 함께 표시:

```
## 활성 Sprints

| Sprint | Branch | F-items | 생성일 | 상태 |
|--------|--------|---------|--------|------|
| 53 | sprint/53 | F183, F184 | 2026-03-24 | 🔧 작업 중 |
| 54 | sprint/54 | F186 | 2026-03-24 | 🔧 작업 중 |
```

### `review <N>`

Sprint 브랜치의 변경사항을 Master에서 리뷰한다.

1. **커밋 목록**:
   ```bash
   git log --oneline master..sprint/$N
   ```

2. **변경 파일 통계**:
   ```bash
   git diff --stat master...sprint/$N
   ```

3. **테스트 결과** (worktree에서 실행):
   ```bash
   WT_DIR="$WT_BASE/$PROJECT/sprint-$N"
   cd "$WT_DIR" && pnpm test 2>&1 | tail -5
   ```

4. **.sprint-context에서 F-item 정보 읽기**

5. **리뷰 출력**:
   ```
   ## Sprint $N Review

   ### Commits (N건)
   - abc1234 feat: ...
   - def5678 fix: ...

   ### Changed Files (N files)
   - packages/api/src/services/foo.ts (+50, -10)
   - packages/web/src/components/Bar.tsx (+30)

   ### Tests
   - API: 1132/1132 ✅
   - 신규 테스트: 28개

   ### 다음
   - `/ax:sprint pr $N` → PR 생성
   - `/ax:sprint merge $N` → 직접 merge (PR 없이)
   ```

### `pr <N>`

Sprint 브랜치를 Push하고 PR을 생성한다.

1. **Push**:
   ```bash
   git push -u origin sprint/$N
   ```

2. **PR 생성**:
   ```bash
   COMMIT_SUMMARY=$(git log --oneline master..sprint/$N | head -10)
   F_ITEMS=$(cat "$WT_DIR/.sprint-context" 2>/dev/null | grep F_ITEMS | cut -d= -f2)

   gh pr create --base master --head "sprint/$N" \
     --title "feat: Sprint $N — $F_ITEMS" \
     --body "## Sprint $N
   ### F-items
   $F_ITEMS

   ### Commits
   $COMMIT_SUMMARY

   ### Tests
   (build-validator 결과 또는 CI에서 확인)

   ---
   🤖 Generated from worktree session"
   ```

3. **PR URL 출력**

### `merge <N>`

PR을 merge하고 배포까지 진행한다.
> **참고**: Full Auto 모드에서는 merge-monitor가 이 단계를 자동 수행한다. 수동 실행은 `--manual` 모드나 monitor 실패 시 사용.

1. **PR 상태 확인**:
   ```bash
   PR_NUM=$(gh pr list --head "sprint/$N" --json number --jq '.[0].number')
   gh pr checks $PR_NUM
   ```

2. **Merge**:
   ```bash
   gh pr merge $PR_NUM --squash --subject "feat: Sprint $N — $SUMMARY"
   ```

3. **로컬 갱신**:
   ```bash
   git pull origin master
   ```

4. **D1 마이그레이션 적용** (새 migration이 있으면):
   ```bash
   PENDING=$(npx wrangler d1 migrations list foundry-x-db --remote 2>&1)
   if echo "$PENDING" | grep -q "Migrations to be applied"; then
     npx wrangler d1 migrations apply foundry-x-db --remote
   fi
   ```

5. **Workers 재배포**:
   ```bash
   cd packages/api && npx wrangler deploy
   ```

6. **SPEC.md 갱신**: F-item 상태 🔧 → ✅

7. **MEMORY.md 갱신**: Sprint 완료 기록 + 지표 업데이트

7b. **CLAUDE.md 헤더 + 스킬 테이블 동기화**:
   ```bash
   # 1) 헤더 동기화 — SPEC.md 기반으로 "현재 상태" + Phase 상태 자동 갱신
   bash scripts/sync-claude-md.sh
   
   # 2) 스킬 테이블 동기화 (session-end Phase 0c 항목 7과 동일)
   ls .claude/skills/ 2>/dev/null
   ```
   - `sync-claude-md.sh`: SPEC.md에서 최신 Phase/Sprint/F-range 추출 → CLAUDE.md "현재 상태" 줄 + "Phase N" 줄 갱신
   - CLAUDE.md `.claude/skills/` 섹션과 실제 디렉토리 비교
   - 누락된 스킬이 있으면 CLAUDE.md에 추가 (description은 SKILL.md frontmatter에서 추출)
   - 삭제된 스킬은 CLAUDE.md에서 제거

8. **CI/CD 결과 확인 + 헬스체크** (ax-session-end Phase 6과 동일)

9. **Sprint clean (자동)**: `clean --quiet` 동일 로직 실행
   - merge 완료된 해당 Sprint의 WT/브랜치/remote ref/signal 정리
   - 추가로 과거 Sprint의 고아 리소스도 일괄 점검
   - 정리 건수 0이면 생략, 1건 이상이면 한 줄 요약 출력

### `done <N>`

Sprint worktree와 브랜치를 정리한다.
> **참고**: Full Auto 모드에서는 merge-monitor가 cleanup까지 자동 수행한다.

1. **Merge 확인**: master에 merge 안 됐으면 경고
2. **Worktree 제거**: `git worktree remove`
3. **로컬 브랜치 삭제**: merge 완료 시에만
4. **리모트 브랜치 삭제**: `git push origin --delete sprint/$N`
5. **tmux 세션 종료**: `tmux kill-session -t sprint-${PROJECT}-${N}`
6. **Signal 파일 정리**: `/tmp/sprint-signals/${PROJECT}-${N}.signal` 삭제
7. **전체 고아 점검 (자동)**: `clean --quiet` 동일 로직 실행 — 고아 WT/브랜치/ref 일괄 정리

### `clean [--dry-run]`

전체 Sprint 고아 리소스를 점검하고 정리한다.
> merge-monitor 실패, 수동 정리 누락 등으로 누적된 고아 리소스를 일괄 처리한다.

**`--dry-run`**: 실제 삭제 없이 점검 결과만 출력.

**Phase 0: 활성 Sprint 보호 목록 구축 (삭제 방어)**
> ⚠️ **핵심 방어**: 다른 pane/세션에서 사용 중인 Sprint를 절대 삭제하지 않는다.

```bash
PROJECT=$(basename "$(git rev-parse --show-toplevel)")

# 방어 1: 활성 WT 목록 (git worktree list에 있으면 WT 디렉토리 존재)
PROTECTED_BRANCHES=""
while IFS= read -r line; do
  BRANCH=$(echo "$line" | awk '{print $3}' | tr -d '[]')
  if echo "$BRANCH" | grep -q "^sprint/"; then
    PROTECTED_BRANCHES="$PROTECTED_BRANCHES $BRANCH"
  fi
done < <(git worktree list)

# 방어 2: 활성 tmux 세션 확인 (WT가 없어도 tmux에 살아 있으면 보호)
TMUX_SESSIONS=$(tmux list-sessions -F '#{session_name}' 2>/dev/null | grep "^sprint-${PROJECT}-" || true)
for SESS in $TMUX_SESSIONS; do
  # sprint-Foundry-X-150 → sprint/150 추출
  SPRINT_NUM=$(echo "$SESS" | sed "s/sprint-${PROJECT}-//")
  PROTECTED_BRANCHES="$PROTECTED_BRANCHES sprint/$SPRINT_NUM"
done

# 방어 3: signal 파일에서 IN_PROGRESS 상태인 Sprint 보호
SIGNAL_DIR="/tmp/sprint-signals"
if [ -d "$SIGNAL_DIR" ]; then
  for SIGNAL in "$SIGNAL_DIR"/*.signal; do
    [ -f "$SIGNAL" ] || continue
    SIG_STATUS=$(grep "^STATUS=" "$SIGNAL" | cut -d= -f2)
    if [ "$SIG_STATUS" = "IN_PROGRESS" ] || [ "$SIG_STATUS" = "CREATED" ]; then
      SIG_NUM=$(grep "^SPRINT_NUM=" "$SIGNAL" | cut -d= -f2)
      PROTECTED_BRANCHES="$PROTECTED_BRANCHES sprint/$SIG_NUM"
    fi
  done
fi

# 중복 제거 + 정렬
PROTECTED_BRANCHES=$(echo "$PROTECTED_BRANCHES" | tr ' ' '\n' | sort -u | tr '\n' ' ')
echo "🛡️ 보호 대상: $PROTECTED_BRANCHES"
```

**is_protected() 헬퍼**: 이후 모든 Phase에서 삭제 전 호출
```bash
is_protected() {
  local TARGET="$1"
  for P in $PROTECTED_BRANCHES; do
    [ "$P" = "$TARGET" ] && return 0  # 보호됨 → 삭제 금지
  done
  return 1  # 보호 안 됨 → 삭제 가능
}
```

**Phase 1: 고아 Worktree 점검 + prune**
```bash
# 1a. git worktree prune (디렉토리가 이미 사라진 WT 참조만 정리 — 안전)
git worktree prune --dry-run  # 먼저 확인
git worktree prune            # 실행 (--dry-run이 아니면)
# ※ prune은 디렉토리가 실재하는 WT는 건드리지 않으므로 활성 WT에 안전
```

**Phase 2: 고아 로컬 브랜치 정리**
```bash
# master에 merge 완료된 sprint/* 브랜치 수집
# ※ git branch 출력에서 현재 브랜치 표시(* +)와 공백을 제거
MERGED_BRANCHES=$(git branch --merged master --list "sprint/*" | sed 's/^[* +]*//' | tr -d ' ')

for BRANCH in $MERGED_BRANCHES; do
  # sprint/로 시작하지 않으면 무시 (잔여 마커 방어)
  echo "$BRANCH" | grep -q "^sprint/" || continue
  # ⚠️ 보호 대상이면 건너뜀
  if is_protected "$BRANCH"; then
    echo "🛡️ Skip (protected): $BRANCH"
    continue
  fi
  echo "Deleting merged branch: $BRANCH"
  git branch -d "$BRANCH"  # --dry-run이면 echo만
done

# master에 merge 안 된 오래된 sprint/* 브랜치도 감지 (삭제는 않고 경고)
UNMERGED=$(git branch --no-merged master --list "sprint/*" | sed 's/^[* +]*//' | tr -d ' ')
for BRANCH in $UNMERGED; do
  echo "$BRANCH" | grep -q "^sprint/" || continue
  if is_protected "$BRANCH"; then
    continue  # 활성 Sprint는 미merge가 정상
  fi
  echo "⚠️ 미merge 고아 브랜치 (수동 확인 필요): $BRANCH"
done
```

**Phase 3: Remote tracking ref 정리**
```bash
# GitHub에서 삭제된 remote 브랜치의 로컬 tracking ref 정리
git remote prune origin --dry-run  # 먼저 확인
git remote prune origin            # 실행 (--dry-run이 아니면)
# ※ remote prune은 로컬 WT/브랜치를 건드리지 않으므로 안전
```

**Phase 4: Signal 파일 정리**
```bash
SIGNAL_DIR="/tmp/sprint-signals"
if [ -d "$SIGNAL_DIR" ]; then
  for SIGNAL in "$SIGNAL_DIR"/*.signal; do
    [ -f "$SIGNAL" ] || continue
    SIG_NUM=$(grep "^SPRINT_NUM=" "$SIGNAL" | cut -d= -f2)
    # ⚠️ 보호 대상이면 건너뜀
    if is_protected "sprint/$SIG_NUM"; then
      continue
    fi
    # 활성 WT에 해당 Sprint가 없으면 정리
    if ! git worktree list | grep -q "sprint-${SIG_NUM}"; then
      echo "Removing stale signal: $SIGNAL"
      rm "$SIGNAL"  # --dry-run이면 echo만
    fi
  done
fi
```

**Phase 5: 결과 리포트**
```
## Sprint Clean 결과

| 항목 | 정리 수 |
|------|---------|
| 고아 WT prune | N건 |
| merged 로컬 브랜치 삭제 | N건 |
| remote tracking ref prune | N건 |
| 고아 signal 삭제 | N건 |
| ⚠️ 미merge 브랜치 (수동) | N건 |

활성 Sprint: sprint/150 (유지)
```

**`--quiet` 모드** (done/merge에서 자동 호출 시):
- Phase 1~4 동일하게 실행하되, 정리 건수가 0이면 출력 생략
- 1건 이상 정리 시 한 줄 요약만: `🧹 Sprint clean: N건 정리 (브랜치 X, ref Y, signal Z)`

## 전체 프로세스 요약

```
Full Auto (기본):
  /ax:sprint start N FX → 끝. 모든 것 자동.
  중간 확인: /ax:sprint monitor N

Manual (--manual):
  /ax:sprint start N FX --manual
  → WT에서 수동 작업
  → /ax:sprint review N → /ax:sprint pr N → /ax:sprint merge N → /ax:sprint done N

고아 정리 (주기적 또는 수동):
  /ax:sprint clean            → 전체 고아 리소스 점검 + 정리
  /ax:sprint clean --dry-run  → 점검만 (삭제 없이)
  * done/merge 완료 시 clean --quiet 자동 실행
```

## Gotchas

- `start`는 반드시 **git 프로젝트 루트(master)**에서 실행해야 한다
- worktree 내에서 `start`를 실행하면 중첩 worktree가 생길 수 있으므로 차단
- **SPEC 커밋+push는 WT 생성 전에 완료** — 미커밋 SPEC으로 WT 생성 시 drift (S149 교훈)
- Sprint 탭에서 `/ax:session-end`를 실행하면 **sprint 브랜치에 push** (master가 아님)
- 여러 Sprint를 동시에 열 수 있지만, 같은 파일을 수정하면 merge 시 충돌 가능
- merge-monitor는 D1/deploy를 자동 실행하므로 **WSL에서 wrangler 금지** 설정과 충돌 가능 — 프로젝트에 wrangler.toml이 없으면 D1/deploy 단계는 자동 스킵됨
- `ccs` vs `ccw`: ccs는 skip-perms 모드. autopilot에서 signal을 직접 생성하므로 ccw의 post-session 불필요
- **WT 모델**: 기본 Sonnet (`ccs --model sonnet`). Master=Opus, WT=Sonnet으로 역할 분리. 복잡한 Sprint는 `--model opus`로 오버라이드 가능
