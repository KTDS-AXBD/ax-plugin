---
name: session-end
description: "세션 종료 시 코드 커밋 + 문서 갱신 + git push + CI/CD 배포. 프로젝트에 맞게 동작: SPEC.md/CHANGELOG.md가 있으면 갱신, 없으면 건너뜀. Use when: 세션 종료, 마무리, session end, 끝, wrap up"
argument-hint: "[추가 메모]"
user-invocable: true
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
---

# Session End — 커밋 + 문서 갱신 + Push + 배포

## 아키텍처

```
0c-2. 프로젝트 수치 동기화 (SPEC.md "마지막 실측" 자동 갱신)
0c-3. 콘텐츠 동기화 (README + 랜딩 페이지 수치 전파)
1. Git 커밋 (코드 변경)
2. 프로젝트 문서 갱신 (있으면)
3. F항목 완료 처리 (SPEC.md + 앱 DB 동기화)
3b. REQ/TD 상태 일괄 갱신
3c. GitHub Issues 동기화 (SPEC.md ↔ Issues 상태 일치)
4. Auto Memory 갱신 (MEMORY.md)
5. 문서 커밋
5b. Skill Infra 점검 (sf-scan + sf-lint + drift, 스킬 변경 시만)
6. Git push (CI/CD 자동 트리거)
```

## 워크트리 분기 (자동 감지)

세션 종료 시 현재 디렉토리가 worktree인지 자동 감지하여 동작을 분기한다.

```bash
if [ -f .git ]; then
  IS_WORKTREE=true
  CURRENT_BRANCH=$(git branch --show-current)
  SPRINT_CONTEXT=".sprint-context"
  [ -f "$SPRINT_CONTEXT" ] && SPRINT_NUM=$(grep SPRINT_NUM "$SPRINT_CONTEXT" | cut -d= -f2)
else
  IS_WORKTREE=false
fi
```

**워크트리(Sprint) 세션인 경우 — 간소화된 종료:**

1. **Phase 1만 실행**: 코드 커밋 + typecheck/lint/test 검증
2. **Sprint 브랜치에 push** (master가 아님):
   ```bash
   git push -u origin "$CURRENT_BRANCH"
   ```
3. **건너뛰는 Phase들**:
   - Phase 0 (CLAUDE.md currency) — master에서 관리
   - Phase 0c (열거형 검증) — master에서 관리
   - Phase 0c-2 (수치 동기화) — master에서 관리
   - Phase 0c-3 (콘텐츠 동기화) — master에서 관리
   - Phase 0d (Migration drift) — master에서 배포 시 확인
   - Phase 2 (SPEC.md/CHANGELOG 갱신) — master의 `/ax-sprint merge`에서 처리
   - Phase 3 (F항목 완료) — master의 `/ax-sprint merge`에서 처리
   - Phase 3b/3c (REQ/GitHub Issues) — master에서 관리
   - Phase 6 (CI/CD 배포 점검) — master에서 merge 후 실행
4. **Phase 4 (MEMORY.md)**: 간략 업데이트만 (세션 요약 1줄)
5. **안내 출력**:
   ```
   ## Sprint $SPRINT_NUM 세션 종료

   - ✅ 코드 커밋: `abc1234`
   - ✅ Push: origin/$CURRENT_BRANCH
   - ⏭️ SPEC/CHANGELOG/배포: Master에서 `/ax-sprint merge $SPRINT_NUM` 으로 진행

   ### Master에서 할 일
   /ax-sprint review $SPRINT_NUM
   /ax-sprint pr $SPRINT_NUM  (또는 merge)
   ```

**Master 세션인 경우 — 기존 동작 그대로:**

아래 모든 Phase를 순서대로 실행한다.

## Steps

### Phase 0: CLAUDE.md Currency Check (자동)

프로젝트 root에 CLAUDE.md가 있으면 아래 항목을 자동 검증한다.
불일치 발견 시 수정을 포함하여 Phase 1 커밋에 함께 반영한다.

**검증 항목:**
1. **브랜치명**: CLAUDE.md에 기재된 브랜치명 vs `git branch --show-current`
2. **Phase 상태**: CLAUDE.md Status/Development Phases vs SPEC.md의 Current Phase (SPEC.md가 있을 때)
3. **PRD 버전**: CLAUDE.md에 참조된 PRD 파일이 실제 `docs/` 에 존재하는지, 더 최신 버전이 있는지
4. **패키지 버전**: CLAUDE.md의 프로젝트 버전 vs `package.json` version

**동작:**
- 불일치 항목이 있으면 CLAUDE.md를 수정하고, 변경사항을 Phase 1 커밋에 포함
- 모든 항목이 일치하면 "CLAUDE.md currency: OK" 출력 후 건너뜀
- 검증 불가 항목(비교 기준 파일 부재)은 건너뜀

### Phase 0c: CLAUDE.md 열거형 목록 검증 (자동)

CLAUDE.md에 열거된 코드 구조 정보가 실제 파일시스템과 일치하는지 검증한다.
검증 대상 디렉토리/파일이 없는 프로젝트에서는 해당 항목을 건너뜀.

**검증 항목:**

5. **BC 수 + 목록** (디렉토리 구조 섹션):
   ```bash
   # 실제 BC 목록 (app/features/ 디렉토리 존재 시)
   ls -d app/features/*/ 2>/dev/null | xargs -I{} basename {} | sort | tr '\n' ', '
   ```
   - CLAUDE.md "디렉토리 구조" 섹션의 BC 수, 이름 목록과 비교
   - 수 또는 목록이 다르면 해당 라인 수정

6. **스키마 머지 목록** (스키마 머지 섹션):
   ```bash
   # 실제 import 목록 (app/db/index.ts 존재 시)
   grep '^import \* as' app/db/index.ts | sed 's/import \* as \([^ ]*\).*/\1/'
   ```
   - CLAUDE.md "스키마 머지" 섹션의 스키마 이름 목록과 비교
   - 목록이 다르면 해당 라인 수정 (수도 함께 갱신)

7. **프로젝트 스킬 테이블** (프로젝트 스킬 섹션):
   ```bash
   # 실제 스킬 목록 (.claude/skills/ 존재 시)
   ls .claude/skills/ 2>/dev/null
   ```
   - CLAUDE.md "프로젝트 스킬" 테이블에 누락된 스킬이 있으면 추가
   - description은 해당 스킬의 SKILL.md frontmatter `description:` 에서 추출
   - 삭제된 스킬은 테이블에서 제거

8. **프로젝트 에이전트 테이블** (프로젝트 에이전트 섹션):
   ```bash
   # 실제 에이전트 목록 (.claude/agents/ 존재 시)
   ls .claude/agents/*.md 2>/dev/null | xargs -I{} basename {} .md
   ```
   - CLAUDE.md "프로젝트 에이전트" 테이블에 누락된 에이전트가 있으면 추가
   - description은 해당 에이전트 `.md` frontmatter `description:` 에서 추출
   - 삭제된 에이전트는 테이블에서 제거

9. **SSR 외부화 목록** (SSR 외부화 섹션):
   ```bash
   # 실제 external 목록 (vite.config.ts 존재 시)
   grep -A20 'external:' vite.config.ts | grep '"[^"]*"' | sed 's/.*"\([^"]*\)".*/\1/'
   # 실제 noExternal 목록
   grep -A20 'noExternal:' vite.config.ts | grep '"[^"]*"' | sed 's/.*"\([^"]*\)".*/\1/'
   ```
   - CLAUDE.md "SSR 외부화" 섹션의 `ssr.external`, `ssr.noExternal` 목록과 비교
   - 목록이 다르면 해당 라인 수정

10. **환경 변수 목록** (환경 변수 섹션):
    ```bash
    # 실제 환경 변수 키 목록 (.dev.vars 존재 시)
    grep -oP '^[A-Z_]+' .dev.vars | sort
    ```
    - CLAUDE.md "환경 변수" 섹션의 변수명 목록과 비교
    - 누락된 변수가 있으면 추가, 삭제된 변수가 있으면 제거

11. **API routes 수 + 목록** (Repository Structure 섹션):
    ```bash
    # 실제 routes 목록 (packages/api/src/routes/ 또는 src/routes/ 존재 시)
    ROUTES_DIR=$(find . -path "*/api/src/routes" -type d 2>/dev/null | head -1)
    if [ -n "$ROUTES_DIR" ]; then
      ls "$ROUTES_DIR"/*.ts 2>/dev/null | xargs -I{} basename {} .ts | sort
    fi
    ```
    - CLAUDE.md Repository Structure의 routes 수, 이름 목록과 비교
    - 수 또는 목록이 다르면 해당 라인 수정

12. **API services 수 + 목록** (Repository Structure 섹션):
    ```bash
    # 실제 services 목록 (packages/api/src/services/ 또는 src/services/ 존재 시)
    SERVICES_DIR=$(find . -path "*/api/src/services" -type d 2>/dev/null | head -1)
    if [ -n "$SERVICES_DIR" ]; then
      ls "$SERVICES_DIR"/*.ts 2>/dev/null | xargs -I{} basename {} .ts | sort
    fi
    ```
    - CLAUDE.md Repository Structure의 services 수, 이름 목록과 비교
    - 수 또는 목록이 다르면 해당 라인 수정

13. **API schemas 수 + 목록** (Repository Structure 섹션):
    ```bash
    # 실제 schemas 목록 (packages/api/src/schemas/ 또는 src/schemas/ 존재 시)
    SCHEMAS_DIR=$(find . -path "*/api/src/schemas" -type d 2>/dev/null | head -1)
    if [ -n "$SCHEMAS_DIR" ]; then
      ls "$SCHEMAS_DIR"/*.ts 2>/dev/null | xargs -I{} basename {} .ts | sort
    fi
    ```
    - CLAUDE.md Repository Structure의 schemas 수, 이름 목록과 비교
    - 수 또는 목록이 다르면 해당 라인 수정

**동작:**
- 불일치 항목이 있으면 CLAUDE.md를 수정하고, Phase 1 커밋에 포함
- 모든 항목이 일치하면 "CLAUDE.md sync: OK" 출력 후 건너뜀
- 최종 요약에 수정된 항목 수를 포함 (예: "CLAUDE.md sync: 2건 수정")

### Phase 0c-2: 프로젝트 수치 동기화 (자동)

코드베이스에서 계산 가능한 수치를 수집하여 SPEC.md "마지막 실측" 행을 자동 갱신한다.
CLAUDE.md / MEMORY.md에는 수치를 하드코딩하지 않으므로 (drift 방지 원칙, 세션 #189), 이 Phase에서 SPEC.md만 갱신하면 된다.

**수집 대상 (ls 수준, 테스트 실행 안 함):**

```bash
ROUTES=$(ls packages/api/src/routes/ 2>/dev/null | wc -l)
SERVICES=$(ls packages/api/src/services/ 2>/dev/null | wc -l)
SCHEMAS=$(ls packages/api/src/schemas/ 2>/dev/null | wc -l)
D1_LATEST=$(ls packages/api/src/db/migrations/*.sql 2>/dev/null | sort | tail -1 | xargs basename | sed 's/_.*//')
# Sprint: SPEC §5 테이블에서 최고 번호 (SSOT). frontmatter system-version은 stale될 수 있으므로 사용하지 않음
SPRINT=$(grep -oP 'Sprint \K\d+' SPEC.md | sort -n | tail -1)
TODAY=$(date +%Y-%m-%d)
```

**갱신 대상:**

1. **SPEC.md "마지막 실측" 행** — §2 하단 blockquote 내 `마지막 실측` 줄:
   ```
   > **마지막 실측** (Sprint NNN, YYYY-MM-DD): ~NN routes, ~NN services, ~NN schemas, D1 NNNN, tests ~NNNN
   ```
   - routes/services/schemas/D1은 항상 갱신
   - tests 수는 이 Phase에서 갱신하지 않음 (실행해야 아는 값 — Phase 1에서 테스트 통과 후 출력된 수치가 있으면 반영)

2. **SPEC.md frontmatter** — `system-version`과 `updated` 날짜

**동작:**
- 수치가 이전과 동일하면 수정 안 함 ("metrics sync: OK")
- 수치가 변경되면 Edit으로 갱신 + Phase 5(문서 커밋)에 포함
- SPEC.md가 없으면 건너뜀

### Phase 0c-3: 콘텐츠 동기화 — README + 랜딩 페이지 (자동)

Phase 0c-2에서 갱신한 SPEC.md "마지막 실측" 수치를 README.md와 랜딩 페이지 콘텐츠에 전파한다.
이 Phase는 Master 세션에서만 실행한다 (WT에서는 건너뜀).

**동기화 대상 4개 파일:**

| 파일 | 동기화 항목 | 패턴 |
|------|------------|------|
| `README.md` | Phase, Sprints, Routes, Services, Schemas, Tests, D1 | `<!-- README_SYNC_START -->` ~ `<!-- README_SYNC_END -->` |
| `packages/web/content/landing/hero.md` | phase, phaseTitle, stats | YAML frontmatter |
| `packages/web/src/routes/landing.tsx` | SITE_META_FALLBACK, STATS_FALLBACK | 상수 객체/배열 |
| `packages/web/src/components/landing/footer.tsx` | Sprint N · Phase N | 문자열 패턴 |

**실행 절차:**

0. **drift 감지 (필수)** — 스크립트로 drift 유무를 먼저 확인한다:
   ```bash
   bash scripts/content-sync-check.sh
   ```
   - exit 0 → "content sync: OK" 출력 후 이 Phase 건너뜀
   - exit 1 → drift 목록 출력 → 아래 1~4 단계 진행
   - exit 2 → SPEC.md 파싱 실패, 수동 확인 필요
1. Phase 0c-2에서 수집한 ROUTES, SERVICES, SCHEMAS, D1_LATEST, SPRINT 값을 사용
2. 4개 파일 각각에서 현재 수치를 Grep으로 추출
3. 불일치 항목만 Edit으로 수정
4. 랜딩 3파일(hero.md, landing.tsx, footer.tsx) 변경은 `packages/web/` 코드이므로 **별도 PR 경로**로 커밋. README.md 변경은 Phase 5 (문서 커밋)에 포함

**보정 범위:**
- README.md: `README_SYNC_START` ~ `README_SYNC_END` 마커 블록 내부만
- hero.md: YAML frontmatter stats 값 + phase/phaseTitle
- landing.tsx: `SITE_META_FALLBACK` 객체 + `STATS_FALLBACK` 배열의 value 필드만 (다른 하드코딩 수치는 WARN 출력)
- footer.tsx: `Sprint \d+ .* Phase \d+` 패턴

**건너뛰기 조건:**
- 해당 파일이 없으면 건너뜀
- README.md에 마커 블록이 없으면 건너뜀
- 모든 수치가 이전과 동일하면 "content sync: OK"

### Phase 0d: Migration Drift Check (자동)

프로덕션 D1에 미적용 마이그레이션이 있는지 확인한다. `wrangler.toml`에 `d1_databases` 설정이 없으면 건너뜀.

```bash
DB_NAME=$(grep 'database_name' wrangler.toml 2>/dev/null | head -1 | awk -F'"' '{print $2}')
if [ -n "$DB_NAME" ]; then
  PENDING_OUTPUT=$(npx wrangler d1 migrations list "$DB_NAME" --remote 2>&1)
  if echo "$PENDING_OUTPUT" | grep -q "Migrations to be applied"; then
    # 테이블 행에서 마이그레이션 이름 추출
    PENDING_LIST=$(echo "$PENDING_OUTPUT" | grep '│' | grep -v 'Name' | sed 's/│//g; s/^ *//; s/ *$//' | grep -v '^$' | grep '.sql')
    PENDING_COUNT=$(echo "$PENDING_LIST" | wc -l)
    echo "⚠️ 프로덕션 미적용 마이그레이션 ${PENDING_COUNT}건 감지:"
    echo "$PENDING_LIST"
  else
    echo "Migration drift: OK"
  fi
fi
```

**동작:**
- 미적용 마이그레이션이 있으면:
  1. ⚠️ 경고 + 목록 출력
  2. 사용자에게 `wrangler d1 migrations apply $DB_NAME --remote` 실행 여부 확인 (AskUserQuestion)
  3. 사용자가 승인하면 적용 후 계속 진행
  4. 사용자가 건너뛰면 최종 요약에 ⚠️ 미적용 경고 포함
- 미적용이 없으면: "Migration drift: OK" 출력 후 건너뜀
- wrangler.toml 없거나 D1 설정 없으면 건너뜀

### Phase 0e: Session Cleanup (자동)

세션 중 생성된 임시 파일/디렉토리를 커밋 전에 자동 정리한다.

```bash
# 1. Zone.Identifier 삭제 (WSL 아티팩트)
ZI_COUNT=$(find . -name "*Zone.Identifier" -not -path "*/node_modules/*" -not -path "*/.git/*" -delete -print 2>/dev/null | wc -l)

# 2. .team-tmp/ 정리 (Agent Team 임시 파일)
if [ -d .team-tmp ]; then
  rm -rf .team-tmp
  TEAM_TMP_CLEANED=true
fi
```

**동작:**
- `ZI_COUNT > 0` 또는 `TEAM_TMP_CLEANED`이면 최종 요약에 포함 (예: "🧹 Zone.Identifier 3건 + .team-tmp 정리")
- 정리 대상이 없으면 건너뜀 (출력 없음)
- 사용자 확인 불필요 — 항상 불필요한 대상만 정리

### Phase 0b: Pane Scope 감지 (멀티 pane 지원)

이 pane의 변경 파일만 식별한다.

```bash
PANE_ID="${TMUX_PANE#%}"
BASELINE="/tmp/claude-session-baseline-pane${PANE_ID}"
START_COMMIT_FILE="/tmp/claude-session-commit-pane${PANE_ID}"
```

**1) 이 세션의 변경 파일 식별:**

```bash
# 현재 dirty 파일 목록
git status --porcelain | sort > /tmp/claude-session-current-pane${PANE_ID}

if [ -f "$BASELINE" ]; then
  # baseline에 없는 새 변경 = 이 세션의 변경
  # comm -13: baseline에만 있는 것 제외 → 이 세션에서 새로 생긴 것만
  SESSION_FILES=$(comm -13 "$BASELINE" "/tmp/claude-session-current-pane${PANE_ID}" | awk '{print $NF}')
  # 세션 중 커밋된 파일도 포함 (start commit 이후 커밋)
  if [ -f "$START_COMMIT_FILE" ]; then
    START_COMMIT=$(cat "$START_COMMIT_FILE")
    COMMITTED_FILES=$(git diff --name-only "$START_COMMIT" HEAD 2>/dev/null)
  fi
else
  # baseline 없음 (ax-session-start 없이 시작) — 전체 변경을 이 세션의 것으로 간주
  SESSION_FILES=$(git status --porcelain | awk '{print $NF}')
fi
```

**2) 결과 활용:**
- `SESSION_FILES`: 이 pane이 스테이징/커밋할 대상
- baseline에 있던 파일(다른 pane의 미커밋 변경)은 **건드리지 않음**

> baseline이 없으면 (예: `/ax-session-start` 없이 세션 시작) 기존 동작과 동일하게 전체 변경을 처리한다.

### Phase 1: Git 커밋 (Pane-Scoped)

1. Phase 0b에서 식별한 `SESSION_FILES`를 기준으로 변경사항을 확인한다.
   - 다른 pane의 미커밋 변경이 섞여 있으면 **해당 파일은 스테이징하지 않는다**.
   - `git diff <해당 파일들만>`으로 이 세션의 변경 내용을 확인한다.
2. 이 세션의 코드 변경사항만 커밋 (문서 파일 제외):
   - `git add <SESSION_FILES의 각 파일>` — 이 세션의 파일만 개별 지정하여 스테이징
   - 논리적 단위로 분리 가능하면 여러 커밋으로 나누기
   - 컨벤션: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`
   - `.env`, 자격 증명 파일 커밋 금지
   - **절대 `git add .` 또는 `git add -A` 사용 금지** — 다른 pane의 변경이 포함될 수 있음
3. 프로젝트의 검증 명령 실행 — **이 세션의 변경 파일 관련 테스트만**:
   - typecheck: 전체 실행 (파일 단위 분리 불가)
   - lint: 변경 파일만 (`pnpm lint -- <변경 파일>` 또는 전체)
   - test: 변경 파일과 관련된 테스트만 실행
     ```bash
     # 변경된 소스 파일에서 관련 테스트 파일 탐색
     for f in $SESSION_FILES; do
       # app/features/cost/service/foo.ts → tests/**/cost/*foo* 또는 tests/**/*foo*
       basename=$(basename "$f" .ts)
       find tests -name "*${basename}*" -name "*.test.ts" 2>/dev/null
     done | sort -u
     # 관련 테스트가 있으면 해당 파일만 실행, 없으면 전체 실행
     ```

### Phase 2: 프로젝트 문서 갱신 (선택)

프로젝트에 다음 파일이 있으면 갱신한다. 없으면 건너뜀.

**SPEC.md** (또는 유사 상태 파일):
- 숫자/지표만 업데이트 (테스트 수, 빌드 상태 등)
- 세션 히스토리는 추가하지 않음

**SPEC.md §2 수치 자동 갱신** (Phase 0c 실측값 재활용):

Phase 0c 항목 11~13에서 실측한 routes/services/schemas 수를 SPEC.md §2 테이블에도 반영한다.
SPEC.md에 `| tests |`, `| API endpoints |`, `| API services |`, `| API schemas |`, `| D1 migrations |` 행이 있을 때만 동작.

```bash
# 1) API tests 수 실측 (vitest dry-run으로 총 수만 추출)
API_TEST_DIR=$(find . -path "*/api/src" -type d 2>/dev/null | head -1)
if [ -n "$API_TEST_DIR" ]; then
  API_PKG_DIR=$(dirname "$API_TEST_DIR")
  API_TESTS=$(cd "$API_PKG_DIR" && npx vitest run --reporter=verbose 2>&1 | grep -oP 'Tests\s+.*\((\d+)\)' | grep -oP '\d+(?=\))' | tail -1)
fi

# 2) CLI tests 수 실측
CLI_TEST_DIR=$(find . -path "*/cli/src" -type d 2>/dev/null | head -1)
if [ -n "$CLI_TEST_DIR" ]; then
  CLI_PKG_DIR=$(dirname "$CLI_TEST_DIR")
  CLI_TESTS=$(cd "$CLI_PKG_DIR" && npx vitest run --reporter=verbose 2>&1 | grep -oP 'Tests\s+.*\((\d+)\)' | grep -oP '\d+(?=\))' | tail -1)
fi

# 3) Web tests 수 실측
WEB_TEST_DIR=$(find . -path "*/web/src" -type d 2>/dev/null | head -1)
if [ -n "$WEB_TEST_DIR" ]; then
  WEB_PKG_DIR=$(dirname "$WEB_TEST_DIR")
  WEB_TESTS=$(cd "$WEB_PKG_DIR" && npx vitest run --reporter=verbose 2>&1 | grep -oP 'Tests\s+.*\((\d+)\)' | grep -oP '\d+(?=\))' | tail -1)
fi

# 4) Phase 0c에서 실측한 routes/services/schemas 수 재활용
ROUTES_COUNT=$(ls packages/api/src/routes/*.ts 2>/dev/null | wc -l)
SERVICES_COUNT=$(ls packages/api/src/services/*.ts 2>/dev/null | wc -l)
SCHEMAS_COUNT=$(ls packages/api/src/schemas/*.ts 2>/dev/null | wc -l)

# 5) D1 migrations 범위 실측
MIGRATIONS_DIR=$(find . -path "*/db/migrations" -type d 2>/dev/null | head -1)
if [ -n "$MIGRATIONS_DIR" ]; then
  FIRST_MIG=$(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | head -1 | xargs basename | grep -oP '^\d+')
  LAST_MIG=$(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | tail -1 | xargs basename | grep -oP '^\d+')
fi
```

SPEC.md §2 테이블에서 해당 행을 찾아 실측값으로 교체:
- `| tests |` → `API **{N}** + CLI **{N}** + Web **{N}** = **{합계}** + E2E ...`
- `| API endpoints |` → `**~{N}개** ({routes_count} routes)`
- `| API services |` → `**{N}개**`
- `| API schemas |` → `**{N}개**`
- `| D1 migrations |` → `**{first}~{last}**`
- 값이 SPEC.md 기존값과 동일하면 변경하지 않음 (불필요한 diff 방지)

**CHANGELOG.md** (또는 docs/CHANGELOG.md):

**형식 자동 감지** — 파일 상단에 `## [Unreleased]`가 있으면 Keep a Changelog 형식, 아니면 기존 "### 세션 NNN" 형식으로 동작 (F502).

**Keep a Changelog 형식 (권장)** — `## [Unreleased]` 존재 시:
```bash
# 마지막 태그 이후 커밋 중 feat:/fix:/docs: 타입만 추출
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [ -n "$LAST_TAG" ]; then
  COMMITS=$(git log --oneline "$LAST_TAG"..HEAD 2>/dev/null)
else
  COMMITS=$(git log --oneline -20 2>/dev/null)
fi

echo "$COMMITS" | while IFS= read -r line; do
  MSG=$(echo "$line" | sed 's/^[a-f0-9]\{7,\} //')
  TYPE=$(echo "$MSG" | grep -oP '^(feat|fix|docs)' || true)
  [ -z "$TYPE" ] && continue
  # 중복 방지
  grep -qF "$MSG" CHANGELOG.md && continue
  case "$TYPE" in
    feat) SECTION="Added" ;;
    fix)  SECTION="Fixed" ;;
    docs) SECTION="Changed" ;;
  esac
  # [Unreleased] 내 해당 섹션 아래에 삽입. 섹션이 없으면 [Unreleased] 직후 생성.
  if awk '/## \[Unreleased\]/,/## \[/' CHANGELOG.md | grep -q "### ${SECTION}"; then
    sed -i "0,/### ${SECTION}/{/### ${SECTION}/a\\- ${MSG}
}" CHANGELOG.md
  else
    sed -i "/## \[Unreleased\]/a\\\n### ${SECTION}\n- ${MSG}" CHANGELOG.md
  fi
done
```

**기존 "세션 NNN" 형식 (fallback)** — `## [Unreleased]`가 없을 때 파일 상단에 추가:
```markdown
### 세션 NNN (YYYY-MM-DD)
**[작업 요약 1줄]**:
- ✅ [변경 1]
- ✅ [변경 2]

**검증 결과**:
- ✅ typecheck / lint / tests / build
```

### Phase 3: F항목 완료 처리 (자동)

이번 세션에서 작업한 F항목을 감지하고 자동으로 완료 처리한다.

**감지 방법** (우선순위 순):
1. SPEC.md에서 상태가 🔧(IN_PROGRESS)인 F항목을 찾는다.
2. 세션 시작 시 `/ax-session-start F{N}`으로 지정된 항목이 있는지 확인한다.
3. 이번 세션의 커밋 메시지에서 F항목 참조를 찾는다.

**F항목이 감지된 경우:**

1. 해당 F항목의 작업이 실제 완료됐는지 확인:
   - 커밋에 관련 코드 변경이 포함되어 있는지
   - typecheck/lint/test를 통과했는지
   - 완료 판단이 애매하면 건너뜀 (과도한 자동 완료 방지)

2. **SPEC.md 갱신**: 상태를 🔧 → ✅로 변경

3. **앱 DB 동기화** (wrangler.toml + d1_databases 존재 시):
   ```bash
   DB_NAME=$(grep 'database_name' wrangler.toml 2>/dev/null | head -1 | awk -F'"' '{print $2}')
   if [ -n "$DB_NAME" ]; then
     npx wrangler d1 execute "$DB_NAME" --remote --command \
       "UPDATE feature_requests SET status='DONE' WHERE spec_item_id='F{N}' AND status='IN_PROGRESS';"
   fi
   ```

4. MEMORY.md "다음 작업"에서 해당 항목 제거

5. **StatusLine 상태 파일 정리** (tmux pane별):
   ```bash
   PANE_ID="${TMUX_PANE#%}"
   rm -f "/tmp/claude-req-pane${PANE_ID}" /tmp/claude-current-req
   ```

6. 세션 종료 요약에 F항목 완료 정보를 포함한다.

**F항목이 감지되지 않은 경우:**
- 건너뜀 (F항목 없이도 세션 종료는 정상 진행)

### Phase 3b: REQ 상태 일괄 갱신 (자동)

요구사항 관리 표준(`~/.claude/standards/requirements-governance.md`)에 따라
이번 세션에서 변경된 REQ/TD 상태를 SPEC.md에 반영한다.

**REQ 완료 처리:**
1. 이번 세션에서 DONE으로 전환된 REQ를 수집
2. SPEC.md §6 Execution Plan에서 대응 체크박스를 `[x]` + `(REQ-ID DONE)` 주석으로 동기화
3. 마일스톤/스프린트 완료 시 독립 REQ가 없으면 소급 등록 제안

**TD 해소 기록:**
1. 이번 세션에서 해소된 Tech Debt를 감지
2. SPEC.md §8 Tech Debt 테이블에서 해당 TD에:
   - ID를 `~~취소선~~` 처리
   - 영향 컬럼에 `해소 (세션 NNN)` 기록
3. MEMORY.md "활성 리스크"에서 해소 항목 제거

**동작:**
- 변경사항이 있으면 Phase 5 문서 커밋에 포함
- 변경 없으면 건너뜀
- 최종 요약에 REQ/TD 변경 건수 포함

### Phase 3c: GitHub Issues 동기화 (자동)

SPEC.md F-items 상태와 GitHub Issues 상태를 동기화한다.
`gh` CLI가 설치되어 있고, 리포에 GitHub remote가 설정된 경우에만 실행한다.

**사전 조건:**
```bash
# gh CLI 존재 + GitHub remote 감지
GH_AVAILABLE=$(command -v gh >/dev/null 2>&1 && echo true || echo false)
GITHUB_REPO=$(git remote get-url origin 2>/dev/null | grep -oP '(?<=github.com[:/])[^.]+' || true)
# PAT 기반 인증이 필요한 경우 (GH_TOKEN 미설정 시)
if [ -f .git/.credentials ] && [ -z "$GH_TOKEN" ]; then
  export GH_TOKEN=$(sed 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/' .git/.credentials)
fi
```

**실행 조건:** `GH_AVAILABLE=true` AND `GITHUB_REPO` 비어있지 않음. 아니면 건너뜀.

**동기화 로직:**

1. **SPEC.md에서 F-item 상태 수집:**
   - `✅` → DONE
   - `🔧` → IN_PROGRESS
   - `📋` → PLANNED

2. **GitHub Issues에서 `[F{N}]` 패턴 매칭:**
   ```bash
   gh issue list --repo "$GITHUB_REPO" --state all --json number,title,state \
     --jq '.[] | select(.title | test("^\\[F[0-9]+\\]"))' 2>/dev/null
   ```

3. **불일치 감지 및 수정:**

   | SPEC 상태 | Issue 상태 | 동작 |
   |----------|-----------|------|
   | ✅ DONE | OPEN | `gh issue close {N} --comment "✅ SPEC.md DONE 동기화"` |
   | 📋/🔧 | CLOSED | `gh issue reopen {N} --comment "🔄 SPEC.md와 동기화 — 미완료 항목"` |
   | ✅ DONE | CLOSED | 일치 — 건너뜀 |
   | 📋/🔧 | OPEN | 일치 — 건너뜀 |

4. **결과 보고:**
   - 변경 건수를 최종 요약에 포함 (예: "GitHub Issues: 3건 close, 0건 reopen")
   - 변경 없으면 "GitHub Issues: 동기화 완료 (불일치 0건)"
   - gh 미설치/remote 없으면 "⏭️ GitHub Issues: 건너뜀 (gh 미설치 또는 remote 없음)"

**주의:**
- SPEC.md에 없는 Issue(F번호 매칭 불가)는 건드리지 않음
- Sprint 1/2 F-items (F1~F14)은 GitHub Issues로 등록되지 않았을 수 있음 — 매칭 실패 시 건너뜀
- `GH_TOKEN`은 `.git/.credentials`에서 자동 추출하거나, 환경변수에서 사용

5. **GitHub Project Status 동기화:**

   Issue 상태 변경과 함께 Org Project의 Status 필드도 갱신한다.

   ```bash
   GH_ORG=$(echo "$GITHUB_REPO" | cut -d'/' -f1)
   PROJECT_NUM=$(gh project list --owner "$GH_ORG" --format json \
     --jq '.projects[] | select(.closed==false) | .number' 2>/dev/null | head -1)
   ```

   Project가 존재하면:

   a. **Issue가 Project에 미등록인 경우** → `gh project item-add`로 추가
   b. **Status 갱신**: SPEC 상태에 맞춰 Project Status 변경
      - ✅ DONE → "Done"
      - 🔧 IN_PROGRESS → "In Progress"
      - 📋 PLANNED → "Todo"
   c. **필드 ID 조회**: `gh project field-list`로 Status 필드의 option ID를 가져온 뒤 `gh project item-edit`로 설정

   ```bash
   # 각 Issue에 대해:
   ISSUE_URL="https://github.com/${GITHUB_REPO}/issues/${ISSUE_NUM}"
   ITEM_ID=$(gh project item-list "$PROJECT_NUM" --owner "$GH_ORG" --format json \
     --jq ".items[] | select(.content.url==\"${ISSUE_URL}\") | .id" 2>/dev/null)

   # 미등록이면 추가
   if [ -z "$ITEM_ID" ]; then
     ITEM_ID=$(gh project item-add "$PROJECT_NUM" --owner "$GH_ORG" \
       --url "$ISSUE_URL" --format json --jq '.id' 2>/dev/null)
   fi

   # Status 설정 (PROJECT_ID_GLOBAL = gh project list의 id 필드)
   if [ -n "$ITEM_ID" ]; then
     gh project item-edit --project-id "$PROJECT_ID_GLOBAL" --id "$ITEM_ID" \
       --field-id "$STATUS_FIELD_ID" --single-select-option-id "$STATUS_OPTION_ID" 2>/dev/null
   fi
   ```

   - 결과: "GitHub Project: N건 추가, N건 Status 갱신"
   - Project 없으면: "⏭️ GitHub Project: 건너뜀 (Org Project 미설정)"

### Phase 3d: Phase 32 Work Management 스크립트 연동 (F508 통합)

Foundry-X Phase 32(F501~F507) 스크립트와 session-end의 브리지. 프로젝트에 해당 스크립트가 있을 때만 동작하고, 없으면 조용히 건너뜀.

**Board 드리프트 감지 (F503)**:
```bash
# board-sync-spec.sh 리포트 모드로 드리프트만 감지 (--fix는 사용자 승인 후)
if [ -x scripts/board/board-sync-spec.sh ]; then
  DRIFT_COUNT=$(bash scripts/board/board-sync-spec.sh 2>/dev/null | grep -oP 'drift=\K\d+' || echo "0")
  if [ "${DRIFT_COUNT:-0}" -gt 0 ]; then
    echo "⚠️  Board 드리프트 ${DRIFT_COUNT}건 감지 — '/ax-req-manage sync' 또는 'bash scripts/board/board-sync-spec.sh --fix' 권장"
  fi
fi
```

**Velocity 누락 자동 backfill (F505 + F708, Master 세션 전용)**:
```bash
# Sprint WT 세션에서는 sprint-merge-monitor가 자동 호출하므로 skip.
# Master 세션: F708 — graduation/Master-주도 sprint(F700·F707 선례)는 sprint-autopilot
# Step 7b를 미경유해 velocity/sprint-N.json이 누락된다. backfill-missing.sh가 SPEC §5의
# ✅ sprint 중 velocity JSON 없는 것만 생성(idempotent) → false-trigger 위험 0이라 자동 호출 안전.
if [ "$IS_WORKTREE" != "true" ] && [ -x scripts/velocity/backfill-missing.sh ]; then
  bash scripts/velocity/backfill-missing.sh 12 --session session-end 2>&1 | tail -1 || true
  # created>0 이면 생성된 docs/metrics/velocity/sprint-N.json 을 Phase 5 문서 커밋에 포함
fi
```
> **근거 (F708, S385)**: graduation sprint(F700 sprint-432, F707 sprint-439)가 Step 7b 미경유로 velocity 누락 → 수동 backfill 2회 발생. record-sprint.sh는 견고하나 "호출 주체 부재"가 root cause. 이전 "안내만 출력 (false trigger 방지)" 방식을 idempotent reconciliation(✅ 행만 대상)으로 대체하여 근본 해소.

**SPEC ✅ flip 누락 자동 reconciliation (F709, Master 세션 전용)**:
```bash
# Master 세션: F709 — autopilot/Master sprint이 PR merge 후에도 SPEC §5 status를 📋/🔧로
# 남기는 비대칭 누락(F704·F705·F706 3연속 등 5회+)을 보정. "PR merged"를 ground truth로 삼아
# status 미완인데 PR이 MERGED면 ✅ 보정. PR 없으면 skip(진단/docs-only/미완 보존) → 오flip 위험 0.
if [ "$IS_WORKTREE" != "true" ] && [ -x scripts/spec/flip-merged.sh ]; then
  bash scripts/spec/flip-merged.sh --apply 15 2>&1 | tail -1 || true
  # flipped>0 이면 SPEC.md status 변경분을 Phase 5 문서 커밋에 포함
fi
```
> **근거 (F709, S385)**: autopilot이 PR merge + velocity(Step 7b)는 하지만 SPEC status flip만 비대칭 누락(F704·F705·F706 단일 세션 3연속). F708 velocity backfill 동계열 reconciliation — "PR merged" ground truth로 status 미완(📋/🔧)인데 merged면 ✅ 자동 보정. status 셀만 surgical sed(라인 지정 + 이모지 매칭)로 파이프 함정 회피, PR 없으면 skip.

**Phase 진행률 확인 (F506)**:
```bash
if [ -x scripts/epic/phase-progress.sh ]; then
  bash scripts/epic/phase-progress.sh 2>&1 | tail -5 | sed 's/^/  /' || true
fi
```

**동작 요약:**
- 드리프트 발견 시 경고 + 수정 가이드 출력 (자동 수정 안 함 — 보수적)
- Sprint WT 세션은 sprint-merge-monitor가 이미 `pr-body-enrich + velocity + epic`을 자동 실행하므로 중복 호출 안 함
- 스크립트 미존재 프로젝트(비-Foundry-X)는 전 단계 건너뜀

### Phase 4: Auto Memory 갱신

Auto Memory 디렉토리의 MEMORY.md를 업데이트:

1. **현재 버전 & 상태**: 최신화
2. **최근 세션 요약** (sliding window, 최대 3개):
   - 이번 세션을 맨 위에 1줄 요약으로 추가
   - 3개 초과 시 가장 오래된 것 제거
3. **주요 지표**: 변경된 숫자만 업데이트
4. **다음 작업**: `$ARGUMENTS`의 추가 메모 반영
5. **BC/스키마 구조 정합성** (MEMORY.md에 "BC 구조 현황" 섹션이 있을 때):
   - `ls -d app/features/*/` 결과와 MEMORY.md의 BC 수/이름 목록 비교
   - `grep '^import' app/db/index.ts`의 스키마 수와 MEMORY.md "db/index.ts 스키마 머지" 비교
   - `ls app/features/*/db/schema.ts` 결과와 MEMORY.md의 db/schema 수 비교
   - `ls -d app/features/*/ui/` 결과와 MEMORY.md의 ui 수 비교
   - 불일치 시 MEMORY.md 해당 섹션의 수치/목록만 수정 (구조는 유지)
5b. **API 구조 정합성** (MEMORY.md에 "주요 지표" 섹션이 있을 때):
   - Phase 0c 항목 11~13에서 실측한 routes/services/schemas 수를 MEMORY.md 지표에도 동일하게 반영 (단일 소스 원칙)
   - CLAUDE.md와 MEMORY.md 양쪽의 수치가 동일한지 교차 검증
   - 불일치 시 파일시스템 실측값을 기준으로 양쪽 모두 수정
5c. **SPEC.md §2 ↔ MEMORY.md ↔ CLAUDE.md 3-way 교차 검증**:
   - Phase 2에서 갱신한 SPEC.md §2 수치(tests/endpoints/services/schemas/D1)와 MEMORY.md "주요 지표", CLAUDE.md 수치를 비교
   - 3곳 중 불일치가 있으면 **파일시스템 실측값을 기준으로 3곳 모두 동기화**
   - 동기화 대상: tests 총수, API endpoints (routes 수), services 수, schemas 수, D1 migrations 범위
6. **[→CLAUDE] 마커 승격**:
   - MEMORY.md에서 `[→CLAUDE]` 마커가 붙은 항목을 검색한다
   - 마커 항목이 프로젝트 CLAUDE.md에 이미 반영됐는지 확인한다
   - 미반영 항목: CLAUDE.md 적절한 섹션(주로 Gotchas)에 추가
   - 반영 완료 항목: MEMORY.md에서 `[→CLAUDE]` 마커를 제거한다
   - 변경사항은 Phase 5 문서 커밋에 포함한다
   - 최종 요약에 승격 결과를 포함한다

### Phase 5: 문서 커밋

```bash
git add SPEC.md docs/CHANGELOG.md  # 존재하는 파일만
git commit -m "docs: update SPEC.md + CHANGELOG — 세션 NNN [요약]"
```

### Phase 5b: Skill Infra 점검 (자동, 조건부)

> Self-Evolving Harness 원칙 4 "측정 없이 진화 없다" 적용.
> 이 세션에서 스킬 파일(.claude/skills/, .claude/rules/, .claude/agents/)이 변경된 경우에만 실행.

**변경 감지:**
```bash
SKILL_CHANGED=$(git diff --cached --name-only -- '.claude/skills/' '.claude/rules/' '.claude/agents/' 2>/dev/null | wc -l)
# Phase 5 커밋 이전이면 unstaged도 확인
[ "$SKILL_CHANGED" -eq 0 ] && SKILL_CHANGED=$(git diff --name-only HEAD~3..HEAD -- '.claude/skills/' '.claude/rules/' '.claude/agents/' 2>/dev/null | wc -l)
```

**스킬 변경이 있을 때 (SKILL_CHANGED > 0):**

1. **sf-scan** — 카탈로그 갱신:
   ```bash
   SF_SCAN=$(find ~/.claude-work/.claude/plugins/cache -path "*/skill-framework*/scripts/scan.mjs" 2>/dev/null | head -1)
   [ -n "$SF_SCAN" ] && node "$SF_SCAN" 2>/dev/null | tail -5
   ```

2. **sf-lint** — 품질 검증 (Discriminator 역할):
   ```bash
   SF_LINT=$(find ~/.claude-work/.claude/plugins/cache -path "*/skill-framework*/scripts/lint.mjs" 2>/dev/null | head -1)
   [ -n "$SF_LINT" ] && node "$SF_LINT" 2>/dev/null | tail -10
   ```
   - Error 0건: PASS
   - Error > 0: WARN 출력 (push는 차단하지 않음 — 정보 제공)

3. **source↔cache drift** — 3 플러그인 동기화 확인:
   ```bash
   AX_SRC=~/.claude/plugins/marketplaces/ax-marketplace/skills
   AX_CACHE=~/.claude/plugins/cache/ax-marketplace/ax/*/skills
   DRIFT=$(diff -rq "$AX_SRC" $AX_CACHE 2>/dev/null | wc -l)
   ```
   - drift > 0: WARN + 파일 목록 출력

**스킬 변경이 없을 때:** "⏭️ 스킬 파일 변경 없음 — Phase 5b 건너뜀"

**결과 요약 (최종 요약에 포함):**
```
### Skill Infra
- sf-scan: N skills cataloged / ⏭️ 건너뜀
- sf-lint: 0 errors, N warnings / ⏭️ 건너뜀
- drift: 0 / N건 감지 (source↔cache)
```

### Phase 5c: Usage Log (자동, 항상 실행)

이 세션에서 호출된 `/ax:*` 스킬 목록을 usage.jsonl에 기록한다.
PostToolUse(Skill) hook은 CC가 Skill matcher를 지원하지 않으므로, session-end에서 직접 기록.

**실행 절차:**
1. 이 세션의 대화 내용에서 `/ax:` 스킬 호출을 수집 (이전 턴들에서 `Skill` 도구 호출 목록)
2. 수집한 스킬 이름을 usage-log.sh에 전달:
   ```bash
   bash ~/.claude/plugins/marketplaces/ax-marketplace/hooks/scripts/usage-log.sh \
     session-start daily-check infra-selfcheck help
   ```
3. `sf-usage report`로 확인 가능

### Phase 6: Git Push + 배포 점검 (필수)

```bash
git push origin $(git branch --show-current)
```

> **중요**: Push 후 배포 점검은 **반드시 실행**한다. 건너뛰거나 "나중에 확인" 하지 않는다.
> `gh` CLI 미설치 또는 GitHub Actions 미설정인 경우에만 SKIP 허용.

**Step 1 — CI/CD Run 감지 + 완료 대기** (최대 3분):

```bash
# gh CLI + GitHub remote 확인
GH_AVAILABLE=$(command -v gh >/dev/null 2>&1 && echo true || echo false)
GITHUB_REPO=$(git remote get-url origin 2>/dev/null | grep -oP '(?<=github.com[:/])[^.]+' || true)
if [ "$GH_AVAILABLE" != "true" ] || [ -z "$GITHUB_REPO" ]; then
  echo "⏭️ 배포 점검 건너뜀 (gh 미설치 또는 remote 없음)"
  # 여기서 Phase 6 종료
fi

# push 직후 최신 run 감지 (최대 10초 대기 — Actions 트리거 지연 허용)
sleep 5
RUN_ID=$(gh run list --repo "$GITHUB_REPO" --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null)

# 완료까지 폴링 (30초 × 6 = 최대 3분)
for i in 1 2 3 4 5 6; do
  STATUS=$(gh run view "$RUN_ID" --repo "$GITHUB_REPO" \
    --json status,conclusion \
    --jq '.status + ":" + (.conclusion // "")' 2>/dev/null)
  case "$STATUS" in
    completed:success) DEPLOY_RESULT="✅ 성공"; break ;;
    completed:failure) DEPLOY_RESULT="❌ 실패"; break ;;
    completed:*)       DEPLOY_RESULT="⚠️ $STATUS"; break ;;
    *)                 echo "⏳ 대기 중... ($i/6)"; sleep 30 ;;
  esac
done
[ -z "$DEPLOY_RESULT" ] && DEPLOY_RESULT="⏳ 타임아웃 (3분 초과)"
```

**Step 2 — Job별 상세 결과 수집** (반드시 실행):

```bash
gh run view "$RUN_ID" --repo "$GITHUB_REPO" \
  --json jobs \
  --jq '.jobs[] | "\(.name): \(.conclusion // .status)"' 2>/dev/null
```

결과를 테이블로 정리하여 최종 요약에 포함한다:
```
| Job | 상태 | 비고 |
|-----|:----:|------|
| test | ✅/❌ | ... |
| deploy-api | ✅/❌ | ... |
| deploy-web | ✅/❌ | ... |
| smoke-test | ✅/❌ | ... |
```

**Step 3 — 실패 Job 원인 분석** (실패 시 반드시 실행):

```bash
if echo "$DEPLOY_RESULT" | grep -q "실패"; then
  gh run view "$RUN_ID" --repo "$GITHUB_REPO" --log-failed 2>/dev/null | tail -40
fi
```
- 실패 로그에서 핵심 에러를 추출하여 최종 요약에 포함
- 일시적 실패(네트워크, rate limit)와 코드 실패를 구분
- 코드 실패면 원인 설명, 일시적이면 재시도 여부를 사용자에게 확인

**Step 4 — 프로덕션 헬스체크** (배포 성공 시 반드시 실행):

```bash
# MEMORY.md에서 프로덕션 URL 추출
PROD_API=$(grep -oP 'https?://[^\s)]+workers\.dev' ~/.claude/projects/*/memory/MEMORY.md 2>/dev/null | head -1 || true)
PROD_WEB=$(grep -oP 'https?://[^\s)]+\.(best|pages\.dev)' ~/.claude/projects/*/memory/MEMORY.md 2>/dev/null | head -1 || true)

# API 헬스체크 — 루트 경로(/) 응답 확인
# `/health` 고정은 해당 엔드포인트 미존재 프로젝트(다수)에서 404 오탐 발생 → 루트로 변경 (S378 fix)
# 판정: 200(공개 루트) / 401·403(JWT·RBAC 인증 보호 = 워커 정상 가동)이면 정상.
#       000(미도달) / 404(루트 부재) / 5xx(서버 오류)만 경고.
if [ -n "$PROD_API" ]; then
  API_CODE=$(curl -sL -o /dev/null -w '%{http_code}' --max-time 10 "$PROD_API/" 2>/dev/null || echo "000")
  case "$API_CODE" in
    200|401|403) API_HEALTH="✅ HTTP $API_CODE" ;;
    *)           API_HEALTH="⚠️ HTTP $API_CODE" ;;
  esac
fi

# Web 접근 확인
if [ -n "$PROD_WEB" ]; then
  WEB_CODE=$(curl -sL -o /dev/null -w '%{http_code}' --max-time 10 "$PROD_WEB" 2>/dev/null || echo "000")
  [ "$WEB_CODE" = "200" ] && WEB_HEALTH="✅" || WEB_HEALTH="⚠️ HTTP $WEB_CODE"
fi
```

**Step 5 — 배포 점검 요약** (최종 요약의 "배포" 섹션):

```
### 배포 점검
| 항목 | 결과 | 비고 |
|------|:----:|------|
| CI/CD Run | ✅/❌/⏳ | Run #{ID}, {소요시간} |
| test | ✅/❌ | |
| deploy-api | ✅/❌ | |
| deploy-web | ✅/❌ | |
| smoke-test | ✅/❌ | {실패 원인 요약} |
| API 헬스체크 | ✅/⚠️ | {URL} HTTP {code} |
| Web 접근 | ✅/⚠️ | {URL} HTTP {code} |
```

### Phase 6b: Cloudflare Pages 자동 배포 (조건부)

**조건**: `apps/app-web/` 디렉토리가 존재하고, 이번 세션 커밋 중 `apps/app-web/` 변경이 포함된 경우.

1. **변경 감지**:
   ```bash
   # 세션 시작 이후 커밋에서 app-web 변경 확인
   CHANGED=$(git log --oneline --name-only HEAD~5..HEAD -- apps/app-web/ 2>/dev/null | head -1)
   ```

2. **빌드 + 배포** (변경이 감지된 경우):
   ```bash
   bun run build  # Turborepo: app-web 포함 전체 빌드
   cd apps/app-web
   # Pages 프로젝트명 동적 감지: wrangler.toml → MEMORY.md → 기본값 fallback
   PAGES_PROJECT=$(grep -m1 'name\s*=' apps/app-web/wrangler.toml 2>/dev/null | sed 's/.*=\s*"\(.*\)"/\1/' || true)
   [ -z "$PAGES_PROJECT" ] && PAGES_PROJECT=$(grep -oP 'Pages 배포:.*?`\K[^`]+' "$(find . -path '*/memory/MEMORY.md' -print -quit 2>/dev/null)" 2>/dev/null || true)
   [ -z "$PAGES_PROJECT" ] && PAGES_PROJECT="ai-foundry-web"
   npx wrangler pages deploy dist --project-name="$PAGES_PROJECT" --commit-dirty=true
   ```

3. **배포 확인**: 배포 URL을 출력하고 최종 요약에 포함한다.

4. **변경 없음**: "app-web 변경 없음 — 배포 건너뜀" 출력.

**주의**:
- Pages 프로젝트명은 `apps/app-web/wrangler.toml` → MEMORY.md → 기본값 `ai-foundry-web` 순으로 동적 감지
- 빌드 실패 시 배포를 중단하고 에러를 보고한다
- `--commit-dirty=true`는 untracked 파일 경고를 억제한다

### 최종 요약 출력

```
## 세션 종료 완료

### Session Cleanup
- 🧹 Zone.Identifier N건 삭제 / .team-tmp 정리 / 정리 대상 없음

### Git 커밋
- `abc1234` feat: [메시지]
- `def5678` docs: update SPEC.md + CHANGELOG — 세션 NNN

### F항목 완료
- F{N} ({DX-REQ-NNN}): IN_PROGRESS → DONE ✅
  - SPEC.md: ✅ 갱신
  - 앱 DB: ✅ 동기화

### GitHub Issues 동기화
- Issues: N건 close, N건 reopen / 불일치 0건 / ⏭️ 건너뜀

### Migration
- D1 마이그레이션: ✅ 동기화 완료 / ⚠️ 미적용 N건 (목록) / ⏭️ D1 미사용

### 배포 점검 (필수)
| 항목 | 결과 | 비고 |
|------|:----:|------|
| CI/CD Run | ✅/❌/⏳ | Run #{ID} |
| test | ✅/❌ | |
| deploy-api | ✅/❌ | |
| deploy-web | ✅/❌ | |
| smoke-test | ✅/❌ | {실패 원인 요약} |
| API 헬스체크 | ✅/⚠️ | {URL} HTTP {code} |
| Web 접근 | ✅/⚠️ | {URL} HTTP {code} |
- Pages: ✅ 배포 완료 (URL) / ⏭️ 변경 없음 (apps/app-web 프로젝트 전용)

### 업데이트
- SPEC.md: [변경된 지표]
- MEMORY.md: 컨텍스트 갱신 완료
- CHANGELOG.md: 세션 NNN 추가
```

## 주의사항

- 프로젝트에 SPEC.md/CHANGELOG.md가 없으면 해당 Phase를 건너뜀
- MEMORY.md는 Git 추적 대상이 아님 (auto memory 디렉토리)
- CHANGELOG.md는 최신이 파일 상단에 오도록 prepend
- F항목 완료 처리는 **보수적**으로 판단 — 확실히 완료된 경우에만 DONE 전환

## Pane-Scoped 동작 요약

| 항목 | baseline 있음 (정상) | baseline 없음 (fallback) |
|------|---------------------|-------------------------|
| 커밋 대상 | 이 세션의 새 변경 파일만 | 전체 변경 (기존 동작) |
| 테스트 범위 | 변경 파일 관련 테스트만 | 전체 테스트 |
| `git add` | 파일 개별 지정 | 파일 개별 지정 (동일) |
| 다른 pane 변경 | 건드리지 않음 | 구분 불가 — 전체 처리 |

**Baseline 파일 위치**:
- `/tmp/claude-session-baseline-pane${PANE_ID}` — 시작 시 dirty 파일 목록
- `/tmp/claude-session-commit-pane${PANE_ID}` — 시작 시 HEAD 커밋
- `/tmp/claude-session-current-pane${PANE_ID}` — 종료 시 dirty 파일 목록

> 세션 종료 후 baseline 파일은 자동 삭제하지 않는다 (디버깅용 보존, /tmp 재부팅 시 자동 정리).
