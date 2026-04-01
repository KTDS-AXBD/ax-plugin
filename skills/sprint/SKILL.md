---
name: sprint
description: |
  Sprint worktree 오케스트레이션 — Master에서 Sprint 생성/리뷰/머지/정리.
  worktree를 Windows Terminal 독립 탭으로 열고, SPEC.md F-items와 연동.
  Use when: sprint, 스프린트, worktree, 워크트리, 병렬 작업, sprint start, sprint merge
argument-hint: "<subcommand> [args] — start|review|pr|merge|done|list"
user-invocable: true
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
---

# Sprint — Worktree 오케스트레이션

Master 세션에서 Sprint worktree를 생성/리뷰/머지/정리하는 명령.
각 Sprint는 독립 Windows Terminal 탭 + 독립 git 브랜치에서 작업한다.

## 아키텍처

```
Master 세션 (이 세션)           Sprint 탭 (독립 WT 탭)
┌──────────────────────┐       ┌──────────────────────┐
│ /ax-sprint start 53  │──────>│ S53 · Foundry-X      │
│   → worktree 생성    │       │ sprint/53 브랜치      │
│   → WT 탭 열기       │       │ $ claude (독립 세션)  │
│   → SPEC F-item 연동 │       │ $ /ax-session-end     │
│                      │       │   → sprint/53에 push  │
│ /ax-sprint review 53 │<──────│                      │
│   → diff/커밋 리뷰   │       └──────────────────────┘
│ /ax-sprint pr 53     │
│   → PR 생성          │
│ /ax-sprint merge 53  │
│   → PR merge + 배포  │
│ /ax-sprint done 53   │
│   → 정리             │
└──────────────────────┘
```

## Subcommands

`$ARGUMENTS`에서 서브커맨드와 인자를 파싱한다.

### `start <N> [F항목들...]`

Sprint worktree를 생성하고 Windows Terminal 새 탭을 연다.

1. **워크트리 생성 + WT 탭 열기** (bash `sprint` 함수 사용 필수):
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

2. **SPEC.md F-item 연동** (F항목이 지정된 경우):
   - SPEC.md에서 해당 F항목 상태를 📋 → 🔧 전환
   - MEMORY.md "다음 작업"에 Sprint N 작업 표시
   - GitHub Issues에서 해당 Issue 상태를 In Progress로 갱신

3. **Sprint 컨텍스트 파일 생성**:
   ```bash
   WT_DIR="$HOME/work/worktrees/$PROJECT/sprint-$N"
   cat > "$WT_DIR/.sprint-context" <<EOF
   SPRINT_NUM=$N
   PROJECT=$PROJECT
   F_ITEMS=$F_ITEMS
   CREATED=$(date -Iseconds)
   MASTER_COMMIT=$(git rev-parse HEAD)
   EOF
   ```

4. **Autopilot 자동 실행** (선택, 사용자 요청 시):
   ```bash
   # tmux send-keys로 인터랙티브 claude + autopilot 전달
   TMUX_SESSION="sprint-${PROJECT}-${N}"
   tmux send-keys -t "$TMUX_SESSION" "ccs" Enter
   sleep 5  # claude 시작 대기
   tmux send-keys -t "$TMUX_SESSION" "/ax-sprint-autopilot" Enter
   ```
   **주의**: `claude -p` 또는 `echo | claude` 파이프 모드는 TUI가 보이지 않으므로 금지.

5. **안내 출력**:
   ```
   ## Sprint $N 시작

   | 항목 | 값 |
   |------|-----|
   | Branch | sprint/$N |
   | Directory | $WT_DIR |
   | F-items | F183, F184, F185 |
   | WT Tab | "S$N · $PROJECT" |

   ### Sprint 탭에서 할 일
   1. `claude` 또는 `ccs` 실행
   2. `/ax-session-start Sprint $N F183 F184 F185` 로 시작
   3. 작업 완료 후 `/ax-session-end` → sprint/$N 브랜치에 자동 push
   4. Master 탭에서 `/ax-sprint review $N` → `/ax-sprint pr $N` → `/ax-sprint merge $N`
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
   - `/ax-sprint pr $N` → PR 생성
   - `/ax-sprint merge $N` → 직접 merge (PR 없이)
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

8. **CI/CD 결과 확인 + 헬스체크** (ax-session-end Phase 6과 동일)

### `done <N>`

Sprint worktree와 브랜치를 정리한다.

1. **Merge 확인**: master에 merge 안 됐으면 경고
2. **Worktree 제거**: `git worktree remove`
3. **로컬 브랜치 삭제**: merge 완료 시에만
4. **.sprint-context 정리**: 자동 삭제 (worktree와 함께)
5. **안내**: "WT 탭은 수동으로 닫아주세요"

## Gotchas

- `start`는 반드시 **git 프로젝트 루트(master)**에서 실행해야 한다
- worktree 내에서 `start`를 실행하면 중첩 worktree가 생길 수 있으므로 차단
- `merge` 후 `done`을 실행해야 깔끔하게 정리됨 — 순서 강제는 하지 않지만 권장
- Sprint 탭에서 `/ax-session-end`를 실행하면 **sprint 브랜치에 push** (master가 아님)
- 여러 Sprint를 동시에 열 수 있지만, 같은 파일을 수정하면 merge 시 충돌 가능
