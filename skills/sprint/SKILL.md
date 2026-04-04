---
name: sprint
description: |
  Sprint worktree Full Auto 오케스트레이션 — start 한 번으로 WT 생성→autopilot→모니터링→merge까지.
  worktree를 Windows Terminal 독립 탭으로 열고, SPEC.md F-items와 연동.
  Use when: sprint, 스프린트, worktree, 워크트리, 병렬 작업, sprint start, sprint merge
argument-hint: "<start|merge|pr|review|done|list|monitor> [N] [--manual]"
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

**Phase 1: SPEC 연동 + 커밋 + push** (F항목이 SPEC에 존재하는 경우):
1. SPEC.md에서 해당 F항목 상태를 📋 → 🔧 전환
2. MEMORY.md "다음 작업"에 Sprint N 작업 표시
3. `git add SPEC.md && git commit && git push origin master`
   - ⚠️ **WT 생성 전에 반드시 push 완료** (S149 교훈: 미커밋 SPEC으로 WT 생성 시 drift)

**Phase 2: WT 생성** (bash `sprint` 함수 사용 필수):
```bash
# ⚠️ 반드시 bashrc의 sprint() 함수를 사용할 것
# 직접 git worktree add + wt.exe 호출 금지 (경로/tmux/배너 불일치)
bash -i -c "sprint $N"
```
이 명령이 자동으로 수행하는 작업:
- `~/work/worktrees/{project}/sprint-{N}` 에 worktree 생성
- `sprint/{N}` 브랜치 생성
- `wt-claude-worktree.sh` 실행 → tmux 세션 `sprint-{project}-{N}` 생성
- Windows Terminal 새 탭 열기 (tmux 기반, 배너+ccs/ccw 래퍼 포함)

**Phase 3: Autopilot 주입** (`--manual` 미지정 시 자동):
```bash
TMUX_SESSION="sprint-${PROJECT}-${N}"
# Claude 시작
tmux send-keys -t "$TMUX_SESSION" "bash -ic 'ccs'" Enter
# Claude 기동 대기 (TUI 렌더링까지)
sleep 10
# Autopilot 명령 전송
tmux send-keys -t "$TMUX_SESSION" "/ax:sprint-autopilot" Enter
```
**주의**: `claude -p` 또는 `echo | claude` 파이프 모드는 TUI가 보이지 않으므로 금지.

**Phase 4: Signal 초기화 + Status Monitor 시작**:
```bash
# Signal 디렉토리 준비
SIGNAL_DIR="/tmp/sprint-signals"
mkdir -p "$SIGNAL_DIR"
SIGNAL_FILE="${SIGNAL_DIR}/${PROJECT}-${N}.signal"

# 초기 signal 생성 (autopilot이 갱신할 기반)
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

# Status monitor background 실행 (진행 현황 폴링)
bash ~/scripts/sprint-status-monitor.sh 45 60 &
```

**Phase 5: Merge Monitor 시작** (background):
```bash
# Merge monitor background 실행 (signal DONE 감지 → 자동 merge pipeline)
bash ~/scripts/sprint-merge-monitor.sh &
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

**`--manual` 모드**: Phase 3~5를 건너뜀. WT 생성 + SPEC 연동만 수행.
```
### Sprint 탭에서 수동 진행
1. `ccs` 실행
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

7b. **CLAUDE.md 스킬 테이블 동기화** (session-end Phase 0c 항목 7과 동일):
   ```bash
   # Sprint에서 새 project skill이 추가되었을 수 있으므로 동기화
   ls .claude/skills/ 2>/dev/null
   ```
   - CLAUDE.md `.claude/skills/` 섹션과 실제 디렉토리 비교
   - 누락된 스킬이 있으면 CLAUDE.md에 추가 (description은 SKILL.md frontmatter에서 추출)
   - 삭제된 스킬은 CLAUDE.md에서 제거

8. **CI/CD 결과 확인 + 헬스체크** (ax-session-end Phase 6과 동일)

### `done <N>`

Sprint worktree와 브랜치를 정리한다.
> **참고**: Full Auto 모드에서는 merge-monitor가 cleanup까지 자동 수행한다.

1. **Merge 확인**: master에 merge 안 됐으면 경고
2. **Worktree 제거**: `git worktree remove`
3. **로컬 브랜치 삭제**: merge 완료 시에만
4. **리모트 브랜치 삭제**: `git push origin --delete sprint/$N`
5. **tmux 세션 종료**: `tmux kill-session -t sprint-${PROJECT}-${N}`
6. **Signal 파일 정리**: `/tmp/sprint-signals/${PROJECT}-${N}.signal` 삭제

## 전체 프로세스 요약

```
Full Auto (기본):
  /ax:sprint start N FX → 끝. 모든 것 자동.
  중간 확인: /ax:sprint monitor N

Manual (--manual):
  /ax:sprint start N FX --manual
  → WT에서 수동 작업
  → /ax:sprint review N → /ax:sprint pr N → /ax:sprint merge N → /ax:sprint done N
```

## Gotchas

- `start`는 반드시 **git 프로젝트 루트(master)**에서 실행해야 한다
- worktree 내에서 `start`를 실행하면 중첩 worktree가 생길 수 있으므로 차단
- **SPEC 커밋+push는 WT 생성 전에 완료** — 미커밋 SPEC으로 WT 생성 시 drift (S149 교훈)
- Sprint 탭에서 `/ax:session-end`를 실행하면 **sprint 브랜치에 push** (master가 아님)
- 여러 Sprint를 동시에 열 수 있지만, 같은 파일을 수정하면 merge 시 충돌 가능
- merge-monitor는 D1/deploy를 자동 실행하므로 **WSL에서 wrangler 금지** 설정과 충돌 가능 — 프로젝트에 wrangler.toml이 없으면 D1/deploy 단계는 자동 스킵됨
- `ccs` vs `ccw`: ccs는 skip-perms 모드. autopilot에서 signal을 직접 생성하므로 ccw의 post-session 불필요
