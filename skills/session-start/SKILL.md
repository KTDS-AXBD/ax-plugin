---
name: session-start
description: |
  세션 시작 시 프로젝트 컨텍스트를 복원한다.
  Auto Memory(MEMORY.md)에서 즉시 맥락 파악 후, SPEC.md 등 프로젝트 사양 파일을 보충 읽기.
  Use when: 세션 시작, 컨텍스트 복원, session start, 시작, 맥락 파악
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

### 1. Auto Memory 확인

MEMORY.md는 자동 로딩되므로, 내용을 기반으로 현재 상태를 파악한다:
- 최근 세션 요약
- 주요 지표
- 다음 작업

### 1b. 워크트리 감지 (자동)

현재 디렉토리가 git worktree인지 감지한다.

```bash
# .git이 파일이면 worktree (디렉토리면 main repo)
if [ -f .git ]; then
  IS_WORKTREE=true
  MAIN_REPO=$(git rev-parse --git-common-dir 2>/dev/null | sed 's|/\.git$||')
  SPRINT_CONTEXT=".sprint-context"
  if [ -f "$SPRINT_CONTEXT" ]; then
    SPRINT_NUM=$(grep SPRINT_NUM "$SPRINT_CONTEXT" | cut -d= -f2)
    SPRINT_F_ITEMS=$(grep F_ITEMS "$SPRINT_CONTEXT" | cut -d= -f2)
  fi
  CURRENT_BRANCH=$(git branch --show-current)
else
  IS_WORKTREE=false
fi
```

**워크트리인 경우 동작 변경:**
- 세션 안내에 `🌳 Sprint Worktree` 표시
- SPEC.md/MEMORY.md는 **main repo 경로**에서 읽기 (worktree에는 없을 수 있음)
- `.sprint-context` 파일에서 Sprint 번호, F-items 자동 로드 → Step 4 F항목 감지에 활용
- Step 2b (REQ/TD 정합성)은 **건너뜀** (master 세션에서 관리)
- Step 5b Pane Baseline은 **worktree 내 git 상태** 기준으로 저장

**워크트리가 아닌 경우:**
- 기존 동작과 동일 (Master 세션)

### 2. 프로젝트 사양 파일 읽기

프로젝트에 다음 파일이 있으면 읽어 컨텍스트를 보충한다:

```bash
# 프로젝트 사양 파일 탐색
for f in SPEC.md docs/SPEC.md spec.md PROJECT.md; do
  [ -f "$f" ] && echo "Found: $f"
done
```

SPEC.md (또는 유사 파일)가 있으면 읽어 현재 상태 섹션을 파악한다.

### 2b. REQ/TD 정합성 점검 (자동)

SPEC.md를 읽은 직후, 요구사항 관리 표준(`~/.claude/standards/requirements-governance.md`)과
리스크 관리 표준(`~/.claude/standards/risk-governance.md`)에 따라 정합성을 점검한다.

**REQ ↔ Execution Plan 동기화 점검:**
1. SPEC.md §7 Requirements Backlog에서 DONE/REJECTED 상태인 REQ를 수집
2. SPEC.md §6 Execution Plan에서 대응하는 체크박스가 `[ ]`(미완료)인 항목을 찾는다
3. 불일치 발견 시:
   - DONE REQ → 체크박스를 `[x]`로 동기화 + `(REQ-ID DONE)` 주석
   - REJECTED REQ → `[x] ~~취소선~~` + `(REQ-ID REJECTED: 사유)`
4. Execution Plan에 `(REQ-ID)` 주석이 없는 미완료 항목은 알림

**TD 해소 추적 점검:**
1. SPEC.md §8 Tech Debt에서 `~~취소선~~`으로 해소 표기된 TD를 수집
2. 영향 컬럼에 `(세션 NNN)` 형식의 해소 세션 번호가 있는지 확인
3. 누락 시 CHANGELOG.md에서 해당 TD 해소 세션을 탐색하여 보충

**결과:**
- 불일치가 없으면 "REQ/TD 정합성: OK" 출력
- 불일치가 있으면 세션 시작 안내에 "⚠️ 불일치 N건 감지 — 보정 권장" 포함
- 자동 보정은 하지 않고 알림만 (보정은 사용자 확인 후)

### 3. Git 상태 확인

```bash
git status --short
git log --oneline -3
```

### 4. F항목 자동 감지 + 상태 전환

`$ARGUMENTS`에서 F항목 참조를 감지한다 (예: `F35`, `F31 대시보드 기간필터`).

**F항목이 감지된 경우:**

1. SPEC.md에서 해당 F항목의 현재 상태를 확인한다.

2. 상태가 📋(PLANNED)이면 🔧(IN_PROGRESS)로 자동 전환:
   - SPEC.md의 해당 행 상태를 `📋` → `🔧`로 변경한다.

3. **앱 DB 동기화** (wrangler.toml + d1_databases 존재 시):
   ```bash
   DB_NAME=$(grep 'database_name' wrangler.toml 2>/dev/null | head -1 | awk -F'"' '{print $2}')
   if [ -n "$DB_NAME" ]; then
     npx wrangler d1 execute "$DB_NAME" --remote --command \
       "UPDATE feature_requests SET status='IN_PROGRESS' WHERE spec_item_id='F{N}' AND status='PLANNED';"
   fi
   ```

4. **GitHub Issues 동기화** (gh CLI + GitHub remote 존재 시):
   ```bash
   GH_AVAILABLE=$(command -v gh >/dev/null 2>&1 && echo true || echo false)
   GITHUB_REPO=$(git remote get-url origin 2>/dev/null | grep -oP '(?<=github.com[:/])[^.]+' || true)
   if [ -f .git/.credentials ] && [ -z "$GH_TOKEN" ]; then
     export GH_TOKEN=$(sed 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/' .git/.credentials)
   fi
   if [ "$GH_AVAILABLE" = "true" ] && [ -n "$GITHUB_REPO" ]; then
     # [F{N}] 패턴의 Issue 번호 찾기
     ISSUE_NUM=$(gh issue list --repo "$GITHUB_REPO" --state all --json number,title \
       --jq '.[] | select(.title | test("^\\[F{N}\\]")) | .number' 2>/dev/null)
     if [ -n "$ISSUE_NUM" ]; then
       # CLOSED → reopen (작업 시작이므로)
       ISSUE_STATE=$(gh issue view "$ISSUE_NUM" --repo "$GITHUB_REPO" --json state --jq '.state' 2>/dev/null)
       if [ "$ISSUE_STATE" = "CLOSED" ]; then
         gh issue reopen "$ISSUE_NUM" --repo "$GITHUB_REPO" --comment "🔧 작업 시작 — IN_PROGRESS" 2>/dev/null
       fi
     fi
   fi
   ```

5. **GitHub Project Status 갱신** (gh CLI + Org Project 존재 시):
   ```bash
   GH_ORG=$(echo "$GITHUB_REPO" | cut -d'/' -f1)
   PROJECT_NUM=$(gh project list --owner "$GH_ORG" --format json \
     --jq '.projects[] | select(.closed==false) | .number' 2>/dev/null | head -1)
   if [ -n "$PROJECT_NUM" ] && [ -n "$ISSUE_NUM" ]; then
     ISSUE_URL="https://github.com/${GITHUB_REPO}/issues/${ISSUE_NUM}"
     ITEM_ID=$(gh project item-list "$PROJECT_NUM" --owner "$GH_ORG" --format json \
       --jq ".items[] | select(.content.url==\"${ISSUE_URL}\") | .id" 2>/dev/null)
     # 미등록이면 추가
     if [ -z "$ITEM_ID" ]; then
       ITEM_ID=$(gh project item-add "$PROJECT_NUM" --owner "$GH_ORG" \
         --url "$ISSUE_URL" --format json --jq '.id' 2>/dev/null)
     fi
     # Status → "In Progress"
     if [ -n "$ITEM_ID" ]; then
       FIELDS_JSON=$(gh project field-list "$PROJECT_NUM" --owner "$GH_ORG" --format json 2>/dev/null)
       PROJECT_ID_GLOBAL=$(gh project list --owner "$GH_ORG" --format json \
         --jq '.projects[] | select(.closed==false) | .id' 2>/dev/null | head -1)
       STATUS_FIELD_ID=$(echo "$FIELDS_JSON" | jq -r '.fields[] | select(.name=="Status") | .id')
       STATUS_INPROGRESS_ID=$(echo "$FIELDS_JSON" | jq -r '.fields[] | select(.name=="Status") | .options[] | select(.name=="In Progress") | .id')
       gh project item-edit --project-id "$PROJECT_ID_GLOBAL" --id "$ITEM_ID" \
         --field-id "$STATUS_FIELD_ID" --single-select-option-id "$STATUS_INPROGRESS_ID" 2>/dev/null
     fi
   fi
   ```

6. MEMORY.md "다음 작업"에 작업 중 표시:
   - `- 🔧 F{N}: {제목}` 추가 (이미 있으면 갱신)

7. **StatusLine 상태 파일 기록** (F항목 감지 시, tmux pane별 분리):
   ```bash
   PANE_ID="${TMUX_PANE#%}"
   echo "F{N} {제목}" > "/tmp/claude-req-pane${PANE_ID}"
   ```

8. 세션 시작 안내에 F항목 정보를 포함한다.

**F항목이 감지되지 않은 경우:**
- MEMORY.md의 "다음 작업" 항목을 기반으로 제안

### 5. 작업 계획 수립

`$ARGUMENTS`에 오늘 작업이 명시되어 있으면:
- 관련 파일/모듈 탐색
- 작업 범위 파악

명시되지 않았으면:
- MEMORY.md의 "다음 작업" 항목을 기반으로 제안

### 5b. Pane Baseline 스냅샷 저장 (멀티 pane 지원)

세션 종료 시 이 pane의 변경 파일만 식별하기 위해, 세션 시작 시점의 git 상태를 저장한다.

```bash
PANE_ID="${TMUX_PANE#%}"
# 1) 시작 시점 HEAD 커밋 해시 저장
git rev-parse HEAD > "/tmp/claude-session-commit-pane${PANE_ID}"
# 2) 시작 시점 dirty 파일 목록 저장 (다른 pane의 미커밋 변경 감지용)
git status --porcelain | sort > "/tmp/claude-session-baseline-pane${PANE_ID}"
```

> 이 파일들은 `/ax-session-end`에서 참조하여, 이 세션에서 새로 생긴 변경만 커밋한다.

### 6. 세션 시작 안내

**Master 세션 (IS_WORKTREE=false):**

```
## 세션 시작

### 프로젝트 상태
- 버전: [버전]
- 마지막 세션: [요약]
- Git: [브랜치, clean/dirty]

### 오늘 작업
- [F항목이 있으면] 🔧 F{N}: {제목} (DX-REQ-{NNN}, {P-level}) — PLANNED → IN_PROGRESS
- [기타 작업]

### 관련 파일
- [파일 목록]

### 활성 Sprint Worktrees
- [git worktree list 결과에서 sprint- 포함 항목만]
```

**Sprint Worktree 세션 (IS_WORKTREE=true):**

```
## 🌳 Sprint $SPRINT_NUM 세션 시작

### Sprint 컨텍스트
- Branch: $CURRENT_BRANCH
- Directory: $(pwd)
- Main repo: $MAIN_REPO
- F-items: $SPRINT_F_ITEMS

### 프로젝트 상태
- [MEMORY.md에서 읽은 요약]

### Sprint 작업 범위
- [.sprint-context의 F-items 또는 $ARGUMENTS]

### 주의
- 이 세션은 **sprint 브랜치**에서 작업해요
- `/ax-session-end` → sprint 브랜치에 push (master가 아님)
- 배포는 Master에서 `/ax-sprint merge $SPRINT_NUM` 으로 진행
```

---

## Gotchas

- 워크트리에서 SPEC.md를 직접 수정하면 master와 충돌할 수 있음 — F-item 상태 변경은 master의 `/ax-sprint` 명령에서 관리
- `.sprint-context` 파일이 없는 워크트리(수동 `cw`로 생성)는 일반 워크트리로 취급
