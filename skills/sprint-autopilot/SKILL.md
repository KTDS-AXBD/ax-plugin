---
name: sprint-autopilot
description: "Sprint WT 전체 자동화 — Plan→Design→Implement→Analyze→Report→Session-End. Use when: autopilot, 자동화, Sprint WT 전체 자동화"
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

Design 문서를 읽고 구현한다. **TDD 규칙이 존재하면 Red→Green 순서를 강제한다.**

#### Step 4a: TDD 적용 여부 판단

1. `.claude/rules/tdd-workflow.md` 존재 여부 확인
2. **있으면 TDD 모드**: Design에서 "테스트 계약 (TDD Red Target)" 섹션 또는 API 엔드포인트/서비스 목록을 추출
3. **없으면 기존 모드**: 아래 Step 4c로 직행

#### Step 4b: 구현 (TDD 모드 — tdd-workflow.md 존재 시)

적용 등급에 따라 분기 (tdd-workflow.md 참조):
- **필수 (새 API 서비스 로직)**: Red→Green 풀 사이클
- **권장 (E2E, UI 컴포넌트)**: 가능하면 Red 먼저
- **면제 (shared, D1 migration, meta)**: 직접 구현

TDD 풀 사이클 순서:
1. **Red Phase**: 테스트만 작성 (구현 코드 zero, stub만 허용)
   - `vitest run <파일> --reporter=verbose`로 FAIL 확인
   - Red 커밋: `test(scope): F### red — ...`
2. **Green Phase**: 테스트를 통과시키는 최소 구현 (테스트 파일 수정 금지)
   - `vitest run`으로 PASS 확인
   - Green 커밋: `feat(scope): F### green — ...`
3. **Refactor Phase (선택)**: 코드 정리, 테스트 여전히 PASS
   - 커밋: `refactor(scope): F### — ...`

#### Step 4c: 구현 (기존 모드 — tdd-workflow.md 없음)

1. Design §5 "Worker 파일 매핑" 확인
2. **Worker 매핑 있으면**: Design에서 Worker별 파일 목록과 작업 내용을 추출하여 Agent 도구로 병렬 구현
   - 각 Agent에 `isolation: "worktree"` 적용 (충돌 방지)
   - Agent 완료 후 결과 merge
3. **Worker 매핑 없으면**: 단일 구현 (Claude가 직접 모든 파일 생성)

#### Step 4d: 검증

```bash
# 프로젝트 검증 명령 탐색 (순서대로 시도)
turbo typecheck 2>/dev/null || pnpm typecheck 2>/dev/null || npx tsc --noEmit 2>/dev/null
turbo test 2>/dev/null || pnpm test 2>/dev/null
```

`.sprint-context`에 `CHECKPOINT=implement` 기록

**Signal 갱신** (implement 시작 시):
```bash
SIGNAL_DIR="/tmp/sprint-signals"
SIGNAL_FILE="${SIGNAL_DIR}/${PROJECT}-${SPRINT_NUM}.signal"
if [ -f "$SIGNAL_FILE" ]; then
  sed -i "s/^STATUS=.*/STATUS=IN_PROGRESS/" "$SIGNAL_FILE"
  sed -i "s/^CHECKPOINT=.*/CHECKPOINT=implement/" "$SIGNAL_FILE"
fi
```

#### Step 4e: Scope Drift Check (C81)

> Gap Analysis 직전에 SPEC F-item 범위 vs 실제 변경 파일 대조.
> **Non-blocking** — 경고만 출력, autopilot 진행을 중단하지 않음.
> Sprint 311 F560 scope drift 재발 방지 (aligner가 Match Rate를 왜곡하는 경우 조기 감지).

```bash
if [ -f "scripts/preflight/check-scope-drift.sh" ]; then
  DRIFT_EXIT=0
  bash scripts/preflight/check-scope-drift.sh "$SPRINT_NUM" "origin/master...HEAD" || DRIFT_EXIT=$?
  if [ "$DRIFT_EXIT" -ne 0 ]; then
    echo ""
    echo "🔶 SCOPE DRIFT 감지 — Gap Analysis 결과를 주의 깊게 확인하세요"
    echo "   SPEC F-item 범위 외 변경 파일 존재. Match Rate 왜곡 가능성."
    echo "   권장: Gap Analysis 완료 후 범위 외 변경 의도 재확인"
  fi
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
6. **PDCA 산출물 명명 표준화 (C101 a)** — analyze 단계에서 생성된 `sprint-{N}.analysis.md` 등 deviation 파일을 GOV-001 표준명(`FX-ANLS-{NNN}_*`)으로 자동 변환:
   ```bash
   RENAME_SCRIPT="$(git rev-parse --show-toplevel)/scripts/sprint/rename-pdca-output.sh"
   [ -x "$RENAME_SCRIPT" ] && bash "$RENAME_SCRIPT" --quiet || true
   ```
   - 스크립트 미존재 시 silent skip (프로젝트별 적용 여부 다름)
   - INDEX.md 행 자동 등재 + 헤더 갱신 포함

### Step 5b: E2E Verify — 자동 생성 + 실행 + Composite Score (F526)

> **F526 통합**: Gap 분석(Step 5) 결과에 E2E 실행 결과를 합산하여 Composite Score를 산출한다.
> Design 문서 §4+§5에서 E2E 시나리오를 자동 추출하고, Playwright로 실행하여
> `Gap×0.6 + E2E×0.4` 가중 평균으로 최종 품질 점수를 결정한다.

```bash
# Playwright 설정 탐지
PW_DIR=""
for dir in "packages/web" "apps/app-web"; do
  if [ -f "$dir/playwright.config.ts" ] || [ -f "$dir/playwright.config.js" ]; then
    PW_DIR="$dir"
    break
  fi
done
```

**Playwright 설정이 있으면** — `foundry-x e2e-verify` 실행:
```bash
# Step 5에서 얻은 MATCH_RATE 사용
MATCH_RATE=$(grep "^MATCH_RATE=" .sprint-context 2>/dev/null | cut -d= -f2 || echo "95")
VERIFY_OUT=$(npx foundry-x e2e-verify "${SPRINT_NUM}" --gap-rate "${MATCH_RATE}" --json 2>&1)
COMPOSITE=$(echo "$VERIFY_OUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['compositeScore']['compositeRate'])" 2>/dev/null || echo "")
E2E_STATUS=$(echo "$VERIFY_OUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['compositeScore']['status'])" 2>/dev/null || echo "")

# .sprint-context 갱신
if [ -n "$COMPOSITE" ]; then
  sed -i "s/^MATCH_RATE=.*/MATCH_RATE=${COMPOSITE}/" .sprint-context 2>/dev/null || \
    echo "MATCH_RATE=${COMPOSITE}" >> .sprint-context
fi
echo "E2E_STATUS=${E2E_STATUS}" >> .sprint-context
```

판정 규칙:
- `E2E_STATUS=PASS` → Step 5 PASS로 간주, Step 6으로 진행
- `E2E_STATUS=FAIL` → pdca-iterator 재시도 없이 Report에 갭 목록 기록 후 Step 6 진행
  (E2E 실패는 구현 회귀가 아닌 E2E 품질 개선 과제로 남김)
- `foundry-x` 미설치 / Playwright 없음 → SKIP ("E2E-verify 불가 — Gap Score만 사용")

**Playwright 설정이 없으면**: SKIP

`.sprint-context`에 `CHECKPOINT=e2e-audit` 기록

### Step 5c: Codex Cross-Review (Dual-AI Verification, F554)

> **F554 배선**: Codex CLI가 독립 AI로 PR diff를 검토. Claude Gap Score와 상호 보완.
> E2E Verify(5b) 직후, Report(6) 직전에 실행.

```bash
SPRINT_NUM=$(grep "^SPRINT_NUM=" .sprint-context 2>/dev/null | cut -d= -f2 || echo "")
REVIEW_JSON=".claude/reviews/sprint-${SPRINT_NUM}/codex-review.json"

# Codex 리뷰 실행
bash scripts/autopilot/codex-review.sh --sprint "$SPRINT_NUM"

# verdict 판정
VERDICT=$(python3 -c "import json; print(json.load(open('$REVIEW_JSON')).get('verdict','unknown'))" 2>/dev/null || echo "unknown")
DEGRADED=$(python3 -c "import json; print(json.load(open('$REVIEW_JSON')).get('degraded',True))" 2>/dev/null || echo "True")

echo "Codex verdict=$VERDICT degraded=$DEGRADED"
```

**판정 규칙**:
- `verdict == BLOCK` → autopilot 중단 + Signal `STATUS=BLOCKED` + `ERROR_STEP=codex-review`
- `verdict == WARN`  → 경고 로그 기록 + Step 6(Report) 진행
- `verdict == PASS`  → Step 6으로 진행
- `degraded=true`   → `PASS-degraded` 처리 (관측 로그만, 4주 관측 기간)

**BLOCK 시 Signal 갱신**:
```bash
if [ "$VERDICT" = "BLOCK" ]; then
  SIGNAL_FILE="/tmp/sprint-signals/${PROJECT}-${SPRINT_NUM}.signal"
  sed -i "s/^STATUS=.*/STATUS=BLOCKED/" "$SIGNAL_FILE" 2>/dev/null || true
  sed -i "s/^ERROR_STEP=.*/ERROR_STEP=codex-review/" "$SIGNAL_FILE" 2>/dev/null || true
  echo "❌ Codex BLOCK verdict — autopilot 중단"
  exit 1
fi
```

`.sprint-context`에 `CHECKPOINT=codex-review` 기록

### Step 6: Report

1. **Tier 1/2**: `/pdca report sprint-{N}` 실행 (report-generator agent)
2. **Tier 3**: 간단 요약 작성
3. `.sprint-context`에 `CHECKPOINT=report` 기록
4. **PDCA 산출물 명명 표준화 (C101 a)** — report 단계에서 생성된 `sprint-{N}.report.md` 등 deviation 파일을 GOV-001 표준명(`FX-RPRT-{NNN}_*`)으로 자동 변환:
   ```bash
   RENAME_SCRIPT="$(git rev-parse --show-toplevel)/scripts/sprint/rename-pdca-output.sh"
   [ -x "$RENAME_SCRIPT" ] && bash "$RENAME_SCRIPT" --quiet || true
   ```

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
> ⚠️ **이 단계는 절대 생략하지 않는다.** Signal STATUS=DONE 작성이 Full Auto 프로세스의 핵심 연결 고리.
> session-end 성공/실패와 무관하게, push 완료 후 반드시 아래 bash를 실행한다.
> Signal이 없으면 Master가 Sprint 완료를 감지할 수 없어 수동 merge가 필요해진다.

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
analyze          → Step 5b (e2e-audit)
e2e-audit        → Step 5c (codex-review)
codex-review     → Step 6 (report)
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
| 5b | E2E Audit | — | /ax:e2e-audit coverage |
| 5c | Codex Cross-Review | — | codex-review.sh --sprint 63 |
| 6 | Report | — | /pdca report sprint-63 |
| 7 | Session End | — | /ax-session-end |
```

## 에러 처리

- 각 Step 실패 시: `CHECKPOINT`는 이전 성공 단계로 유지, Signal에 `STATUS=FAILED` + `ERROR_STEP` + `ERROR_MSG` 기록
- 재시도: `--resume` 플래그로 실패 지점부터 재개
- 포기: 사용자가 `sprint-done N --force`로 worktree 폐기 (master 무영향)

## PDCA 자동 연동 (bkit:pdca 흡수)

sprint-autopilot은 PDCA 풀 사이클을 내부에서 자동 호출한다.
사용자가 `/bkit:pdca`를 별도 호출할 필요가 없다.

| PDCA 단계 | autopilot Step | 자동 호출 |
|-----------|:-------------:|----------|
| Plan | Step 2 | `/pdca plan sprint-{N}` |
| Design | Step 3 | `/pdca design sprint-{N}` |
| Do | Step 4 | TDD Red→Green (4a~4b) 또는 직접 구현 (4c) |
| Check | Step 5 | `/pdca analyze sprint-{N}` + gap-detector |
| Act | Step 5 | `/pdca iterate` (Match < 90% 시, 최대 3회) |
| Report | Step 6 | `/pdca report sprint-{N}` |

> `/bkit:pdca`는 autopilot 없이 수동 작업할 때만 직접 호출.
> Sprint 개발의 메인 진입점은 항상 `/ax:sprint N`.

## Gotchas

- Sprint worktree에서만 실행 (master에서 실행하면 에러)
- `git add -A`는 Sprint worktree에서는 안전 (다른 pane 변경 없음)
- bkit `/pdca` 스킬은 `.pdca-status.json`을 갱신하므로, Tier 1/2에서 자동 추적됨
- Agent 병렬 구현 시 `isolation: "worktree"` 사용 — Worker 간 파일 충돌 방지
