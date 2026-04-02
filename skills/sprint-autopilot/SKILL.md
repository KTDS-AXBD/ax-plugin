---
name: sprint-autopilot
description: Sprint WT 전체 자동화 — Plan→Design→Implement→Analyze→Report→Session-End
user-invocable: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, Skill, AskUserQuestion
argument-hint: "<N> [--resume] [--dry-run]"
---

# Sprint Autopilot — WT 작업 전체 자동화

Sprint worktree에서 PDCA 전체 사이클을 자동으로 실행한다.

## Arguments

- `Sprint N FX FY` — Sprint 번호와 F항목 (기본)
- `--resume` — 마지막 checkpoint 이후부터 재개
- `--dry-run` — 실행 계획만 출력, 실행 안 함

## 사전 조건 (필수)

1. Sprint worktree 안에서 실행 (`.sprint-context` 존재)
2. master 브랜치에서 분기된 Sprint 브랜치

## 환경 감지 (Step 0)

**Tier 결정**: 사용 가능한 도구에 따라 각 단계 실행 방식이 달라진다.

```
Tier 1: bkit + ax 스킬셋 → /pdca + /ax-session-start/end
Tier 2: bkit만 → /pdca (session-start/end 없이)
Tier 3: 둘 다 없음 → 직접 생성 (PDCA 문서 건너뜀, 구현+테스트만)
```

**감지 방법**:
1. bkit: `.pdca-status.json` 존재 또는 `/pdca status` 실행 가능 여부
2. ax: `~/.claude/commands/ax-session-start.md` 존재 여부
3. 결과를 첫 실행 시 출력:
   ```
   🔍 환경 감지: Tier 1 (bkit ✅ + ax ✅)
   ```

## 실행 흐름

### Step 1: Session Start

**Tier 1**: `/ax-session-start Sprint N FX FY` 실행
**Tier 2~3**: `.sprint-context` 읽기 + git status 확인

### Step 2: Plan

1. `docs/01-plan/features/sprint-{N}.plan.md` 존재 확인
2. **있으면**: "✅ Plan 이미 존재 — 건너뜀" → checkpoint=plan
3. **없으면**:
   - **Tier 1**: `/pdca plan sprint-{N}` 실행
   - **Tier 2**: `/pdca plan sprint-{N}` 실행
   - **Tier 3**: SPEC.md에서 F-item 정보 읽어 간단 Plan 직접 생성
4. `.sprint-context`에 `CHECKPOINT=plan` 기록

### Step 3: Design

1. `docs/02-design/features/sprint-{N}.design.md` 존재 확인
2. **있으면**: "✅ Design 이미 존재 — 건너뜀" → checkpoint=design
3. **없으면**:
   - **Tier 1/2**: `/pdca design sprint-{N}` 실행
   - **Tier 3**: Plan 기반 간단 Design 직접 생성
4. `.sprint-context`에 `CHECKPOINT=design` 기록

### Step 4: Implement

Design 문서를 읽고 구현한다.

1. Design §5 "Worker 파일 매핑" 확인
2. **Worker 매핑 있으면**: Design에서 Worker별 파일 목록과 작업 내용을 추출하여 Agent 도구로 병렬 구현
   - 각 Agent에 `isolation: "worktree"` 적용 (충돌 방지)
   - Agent 완료 후 결과 merge
3. **Worker 매핑 없으면**: 단일 구현 (Claude가 직접 모든 파일 생성)
4. **구현 완료 후 검증**:
   ```bash
   # 프로젝트 검증 명령 탐색 (순서대로 시도)
   turbo typecheck 2>/dev/null || pnpm typecheck 2>/dev/null || npx tsc --noEmit 2>/dev/null
   turbo test 2>/dev/null || pnpm test 2>/dev/null
   ```
5. `.sprint-context`에 `CHECKPOINT=implement` 기록

**Signal 갱신** (implement 시작 시):
```bash
SIGNAL_DIR="/tmp/sprint-signals"
SIGNAL_FILE="${SIGNAL_DIR}/${PROJECT}-${SPRINT_NUM}.signal"
if [ -f "$SIGNAL_FILE" ]; then
  sed -i "s/^STATUS=.*/STATUS=IN_PROGRESS/" "$SIGNAL_FILE"
  sed -i "s/^CHECKPOINT=.*/CHECKPOINT=implement/" "$SIGNAL_FILE"
fi
```

### Step 5: Analyze

1. **Tier 1/2**: `/pdca analyze sprint-{N}` 실행 (gap-detector agent)
2. **Tier 3**: Design vs 구현 코드를 직접 비교하여 Match Rate 산출
3. **Match Rate >= 90%**: → Step 6 (Report)
4. **Match Rate < 90%**:
   - **Tier 1/2**: `/pdca iterate sprint-{N}` 실행 (최대 3회)
   - **Tier 3**: Gap 목록 기반 직접 수정 후 재분석
   - 3회 iterate 후에도 < 90%면 `STATUS=FAILED`, `ERROR_STEP=analyze` 기록 후 중단
5. `.sprint-context`에 `CHECKPOINT=analyze` 기록

### Step 6: Report

1. **Tier 1/2**: `/pdca report sprint-{N}` 실행 (report-generator agent)
2. **Tier 3**: 간단 요약 작성
3. `.sprint-context`에 `CHECKPOINT=report` 기록

### Step 7: Session End + Signal 생성

**Tier 1**: `/ax:session-end` 실행 (커밋 + push + 문서 갱신)
**Tier 2~3**: 직접 실행:
```bash
git add -A  # worktree 전용이므로 안전
git commit -m "feat: Sprint {N} — {F-items 제목}"
git push -u origin sprint/{N}
```

`.sprint-context`에 `CHECKPOINT=session-end` 기록

**Signal 생성/갱신** (Master merge-monitor가 감지할 signal):
> ccw/ccs 모드 무관하게 autopilot이 직접 signal을 생성한다. 이것이 Full Auto 프로세스의 핵심 연결 고리.

```bash
SIGNAL_DIR="/tmp/sprint-signals"
mkdir -p "$SIGNAL_DIR"
SIGNAL_FILE="${SIGNAL_DIR}/${PROJECT}-${SPRINT_NUM}.signal"

# .sprint-context에서 읽기
MATCH_RATE=$(grep "^MATCH_RATE=" .sprint-context 2>/dev/null | cut -d= -f2 || echo "")
TEST_RESULT=$(grep "^TEST_RESULT=" .sprint-context 2>/dev/null | cut -d= -f2 || echo "pass")

# GitHub 정보 수집
PROJECT_ROOT=$(git rev-parse --show-toplevel)
GITHUB_REPO=$(git remote get-url origin 2>/dev/null | grep -oP '(?<=github.com[:/])[^.]+' || true)

# PR 존재 여부 확인
if [ -f "${PROJECT_ROOT}/.git/.credentials" ] && [ -z "${GH_TOKEN:-}" ]; then
  export GH_TOKEN=$(sed 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/' "${PROJECT_ROOT}/.git/.credentials" 2>/dev/null || true)
fi
PR_NUM=$(gh pr list --repo "$GITHUB_REPO" --head "sprint/${SPRINT_NUM}" --json number --jq '.[0].number' 2>/dev/null || true)

# PR 없으면 생성
if [ -z "$PR_NUM" ] && [ -n "$GITHUB_REPO" ]; then
  COMMIT_SUMMARY=$(git log --oneline master..HEAD 2>/dev/null | head -10)
  PR_URL=$(gh pr create --repo "$GITHUB_REPO" --base master --head "sprint/${SPRINT_NUM}" \
    --title "feat: Sprint ${SPRINT_NUM} — ${F_ITEMS}" \
    --body "## Sprint ${SPRINT_NUM}
### F-items
${F_ITEMS}

### Commits
${COMMIT_SUMMARY}

### Match Rate
${MATCH_RATE:-N/A}%

---
🤖 Auto-generated from Sprint autopilot" 2>/dev/null || true)
  PR_NUM=$(echo "$PR_URL" | grep -oP '\d+$' || true)
fi

# Signal 파일 작성 (생성 또는 덮어쓰기)
cat > "$SIGNAL_FILE" <<SIGNAL
STATUS=DONE
SPRINT_NUM=${SPRINT_NUM}
PROJECT=${PROJECT}
F_ITEMS=${F_ITEMS}
BRANCH=sprint/${SPRINT_NUM}
PR_NUM=${PR_NUM:-}
GITHUB_REPO=${GITHUB_REPO:-}
PROJECT_ROOT=${PROJECT_ROOT}
CHECKPOINT=session-end
ERROR_STEP=
ERROR_MSG=
MATCH_RATE=${MATCH_RATE:-}
TEST_RESULT=${TEST_RESULT:-pass}
TIMESTAMP=$(date -Iseconds)
SIGNAL
```
> Signal이 DONE으로 작성되면, Master의 `sprint-merge-monitor.sh`가 자동으로 review→merge→deploy→cleanup을 수행한다.

## --resume 모드

`.sprint-context`의 `CHECKPOINT` 값을 읽어 해당 단계 이후부터 재개한다.

```
CHECKPOINT 값    → 재개 시작 단계
(비어있음)       → Step 1 (session-start)
plan             → Step 3 (design)
design           → Step 4 (implement)
implement        → Step 5 (analyze)
analyze          → Step 6 (report)
report           → Step 7 (session-end)
```

## --dry-run 모드

각 단계를 출력만 하고 실행하지 않는다:

```
## Autopilot Dry Run — Sprint 63

### 환경: Tier 1 (bkit ✅ + ax ✅)

| # | 단계 | 상태 | 동작 |
|---|------|------|------|
| 1 | Session Start | — | /ax-session-start Sprint 63 F201 F202 |
| 2 | Plan | ✅ 존재 | 건너뜀 |
| 3 | Design | ✅ 존재 | 건너뜀 |
| 4 | Implement | — | Design §5 Worker 2명 병렬 |
| 5 | Analyze | — | /pdca analyze sprint-63 |
| 6 | Report | — | /pdca report sprint-63 |
| 7 | Session End | — | /ax-session-end |
```

## 에러 처리

- 각 Step 실패 시: `CHECKPOINT`는 이전 성공 단계로 유지, Signal에 `STATUS=FAILED` + `ERROR_STEP` + `ERROR_MSG` 기록
- 재시도: `--resume` 플래그로 실패 지점부터 재개
- 포기: 사용자가 `sprint-done N --force`로 worktree 폐기 (master 무영향)

## Gotchas

- Sprint worktree에서만 실행 (master에서 실행하면 에러)
- `git add -A`는 Sprint worktree에서는 안전 (다른 pane 변경 없음)
- bkit `/pdca` 스킬은 `.pdca-status.json`을 갱신하므로, Tier 1/2에서 자동 추적됨
- Agent 병렬 구현 시 `isolation: "worktree"` 사용 — Worker 간 파일 충돌 방지
