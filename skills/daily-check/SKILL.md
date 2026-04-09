---
name: daily-check
description: |
  Daily Task 시작 전 환경 점검 + 자동 보정.
  Node/pnpm 버전, 의존성, Git 동기화, 빌드 상태, D1 마이그레이션 drift, Hook 상태, SPEC.md 수치 정합성을 점검한다.
  문제 발견 시 자동 보정을 시도하고, 보정 불가 항목은 보고한다.
  Use when: 환경 점검, daily check, 시작 전 점검, health check
argument-hint: "[full|quick]"
user-invocable: true
allowed-tools:
  - Bash
  - Read
  - Edit
  - Glob
  - Grep
---

# Daily Check — 환경 점검 + 자동 보정

`$ARGUMENTS`에 따라 점검 범위를 결정한다. 인수 없으면 `full`.

| 서브커맨드 | 동작 |
|-----------|------|
| `full` (기본) | 전체 8항목 점검 + 자동 보정 (SPEC.md 수치 포함) |
| `quick` | 핵심 3항목만 (Git 동기화 + 의존성 + 타입체크) |

## Steps

### 1. 런타임 환경 점검

```bash
echo "=== Runtime ==="
node -v          # 20.x 권장
pnpm -v          # 9.x+ 권장
git --version
echo "Turbo: $(npx turbo --version 2>/dev/null || echo 'not found')"
```

**자동 보정:**
- `node` 미설치 → 보정 불가, 안내
- `pnpm` 미설치 → `npm install -g pnpm` 제안

### 2. Git 동기화 상태

```bash
echo "=== Git Sync ==="
BRANCH=$(git branch --show-current)
echo "Branch: $BRANCH"

# remote와 비교
git fetch origin --quiet 2>/dev/null
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/$BRANCH 2>/dev/null || echo "no-remote")

if [ "$LOCAL" = "$REMOTE" ]; then
  echo "Sync: OK (up to date)"
elif [ "$REMOTE" = "no-remote" ]; then
  echo "Sync: no remote tracking"
else
  AHEAD=$(git rev-list $REMOTE..$LOCAL --count 2>/dev/null || echo 0)
  BEHIND=$(git rev-list $LOCAL..$REMOTE --count 2>/dev/null || echo 0)
  echo "Sync: ahead=$AHEAD behind=$BEHIND"
fi

# uncommitted changes
DIRTY=$(git status --porcelain | wc -l)
echo "Dirty files: $DIRTY"
```

**자동 보정:**
- behind > 0, dirty = 0 → `git pull --rebase origin $BRANCH` 실행
- behind > 0, dirty > 0 → 보정 불가, "stash 후 pull 권장" 안내
- ahead > 0 → "push 필요" 알림 (자동 push 안 함)

### 3. 의존성 상태

```bash
echo "=== Dependencies ==="
# pnpm-lock.yaml vs node_modules 일치 여부
if [ -f "pnpm-lock.yaml" ]; then
  # lockfile 수정 시각 vs node_modules 수정 시각 비교
  LOCK_TIME=$(stat -c %Y pnpm-lock.yaml 2>/dev/null || echo 0)
  NM_TIME=$(stat -c %Y node_modules/.pnpm/lock.yaml 2>/dev/null || echo 0)
  if [ "$LOCK_TIME" -gt "$NM_TIME" ]; then
    echo "Status: STALE (lockfile newer than node_modules)"
  else
    echo "Status: OK"
  fi
fi
```

**자동 보정:**
- STALE → `pnpm install --frozen-lockfile` 실행
- 실패 시 `pnpm install` (lockfile 갱신 허용)

### 4. 빌드 상태 (TypeScript)

```bash
echo "=== TypeScript ==="
# 모노리포: turbo typecheck (캐시 활용으로 빠름)
if [ -f "turbo.json" ]; then
  npx turbo typecheck --output-logs=errors-only 2>&1
else
  pnpm typecheck 2>&1
fi
```

**자동 보정:**
- 타입 에러 → 보정 안 함 (코드 수정 필요), 에러 수 + 파일 목록 보고

### 5. Hook 상태 점검

```bash
echo "=== Hooks ==="
# .claude/hooks/ 디렉토리 존재 + 스크립트 실행 권한
if [ -d ".claude/hooks" ]; then
  for f in .claude/hooks/*.sh; do
    if [ -f "$f" ]; then
      if [ -x "$f" ]; then
        echo "OK: $f"
      else
        echo "NO-EXEC: $f"
      fi
    fi
  done
else
  echo "No hooks directory"
fi

# settings.json hook 설정 확인
if [ -f ".claude/settings.json" ]; then
  HOOK_COUNT=$(grep -c '"hooks"' .claude/settings.json 2>/dev/null || echo 0)
  echo "settings.json hooks: configured=$HOOK_COUNT"
fi
```

**자동 보정:**
- NO-EXEC → `chmod +x` 실행

### 6. D1 마이그레이션 Drift (D1 프로젝트만)

> WSL 환경에서는 wrangler 실행이 메모리를 과다 소비하므로, 이 단계는 **파일 기반 점검만** 수행한다.
> 실제 remote 마이그레이션 상태 확인은 Windows PowerShell에서 수동으로 하거나, `quick` 모드에서는 건너뛴다.

```bash
echo "=== D1 Migrations ==="
if [ -f "packages/api/wrangler.toml" ]; then
  # 로컬 마이그레이션 파일 수 확인
  MIG_DIR="packages/api/src/db/migrations"
  if [ -d "$MIG_DIR" ]; then
    MIG_COUNT=$(ls "$MIG_DIR"/*.sql 2>/dev/null | wc -l)
    LATEST=$(ls "$MIG_DIR"/*.sql 2>/dev/null | sort | tail -1 | xargs basename)
    echo "Local migrations: $MIG_COUNT (latest: $LATEST)"
  fi
else
  echo "No D1 config (skip)"
fi
```

**자동 보정:**
- WSL 제약으로 remote 확인 불가 → "Windows에서 `npx wrangler d1 migrations list --remote` 확인 권장" 안내

### 6b. 프로젝트 수치 정합성 점검 + 자동 보정 (full 모드만)

> 세션 #189 리팩토링: **수치 하드코딩은 SPEC.md "마지막 실측" 1곳에만** 허용.
> CLAUDE.md, MEMORY.md에는 수치를 두지 않음 (drift 방지 원칙).
> 이 단계에서는 SPEC.md "마지막 실측" 행만 점검하고 보정한다.

**수집 항목 (ls 수준, 테스트 미실행):**

| 항목 | 실제 값 출처 |
|------|-------------|
| API routes 수 | `ls packages/api/src/routes/ \| wc -l` |
| API services 수 | `ls packages/api/src/services/ \| wc -l` |
| API schemas 수 | `ls packages/api/src/schemas/ \| wc -l` |
| D1 마이그레이션 최신 | `ls packages/api/src/db/migrations/*.sql \| sort \| tail -1` |

**실행 절차:**

1. 위 항목별 실제 값을 Bash/Glob으로 수집한다.
2. SPEC.md §2의 `마지막 실측` 줄에서 기존 수치를 Grep으로 추출한다.
3. 불일치 항목을 목록화한다.

**자동 보정:**
- routes/services/schemas 수 drift → SPEC.md "마지막 실측" 행을 Edit으로 수정
- D1 번호 drift → `D1 NNNN` 패턴을 실제 latest로 수정
- SPEC.md frontmatter `system-version` / `updated` drift → 보정
- 테스트 수 drift → **보정 안 함** (실행해야 아는 값 — session-end Phase 0c-2에서 갱신)

**CLAUDE.md / MEMORY.md 검증:**
- 수치가 하드코딩되어 있는지 Grep으로 확인 (금지 패턴)
- 발견 시 WARN 출력 + 삭제 권장 안내 (자동 삭제는 안 함)

**결과 테이블 행 추가:**
```
| SPEC.md 수치 | OK/WARN | N drift(s) found, M auto-fixed |
| 수치 하드코딩 | OK/WARN | CLAUDE.md N건 / MEMORY.md N건 발견 |
```

### 6c. 콘텐츠 동기화 — README + 랜딩 페이지 (full 모드만)

> SPEC.md "마지막 실측" + CLAUDE.md "현재 상태"를 SSOT(Single Source of Truth)로 삼아
> README.md, hero.md, landing.tsx fallback, footer.tsx 4개 파일의 수치를 점검하고 자동 보정한다.

**동기화 대상 4개 파일:**

| 파일 | 동기화 항목 | 마커/패턴 |
|------|------------|----------|
| `README.md` | Phase, Sprints, Routes, Services, Schemas, Tests, D1 | `<!-- README_SYNC_START -->` ~ `<!-- README_SYNC_END -->` 블록 |
| `packages/web/content/landing/hero.md` | phase, phaseTitle, stats(5개) | YAML frontmatter `phase:`, `stats:` |
| `packages/web/src/routes/landing.tsx` | SITE_META_FALLBACK, STATS_FALLBACK | `sprint:`, `phase:` 문자열 + `STATS_FALLBACK` 배열 |
| `packages/web/src/components/landing/footer.tsx` | Sprint N · Phase N | `Sprint \d+ .* Phase \d+` 패턴 |

**데이터 소스:**

| 항목 | 출처 |
|------|------|
| Phase 번호 + 제목 | CLAUDE.md `현재 상태:` 줄 |
| Sprints 완료 수 | SPEC.md §2 마지막 `Sprint NNN \| ✅ 완료` 행 |
| API Routes/Services/Schemas | Step 6b에서 수집한 실제 값 (ls 기반) |
| Tests | SPEC.md "마지막 실측" tests 값 |
| D1 Migrations 수 + 최신 번호 | Step 6에서 수집한 MIG_COUNT + LATEST |

**실행 절차:**

1. 위 4개 파일 각각에서 현재 수치를 Grep으로 추출한다.
2. Step 6/6b에서 수집한 실제 값과 비교한다.
3. 불일치 항목을 목록화한다.
4. 파일별 자동 보정:

**README.md 보정:**
- `README_SYNC_START` ~ `README_SYNC_END` 마커 블록 내 행만 Edit으로 수정
- 마커 블록 외 콘텐츠는 수동 관리 영역 — 보정 안 함
- 마커 블록이 없으면 SKIP

**hero.md 보정:**
- YAML frontmatter의 `phase:`, `phaseTitle:`, `stats:` 항목을 Edit으로 수정
- body 텍스트는 보정 안 함

**landing.tsx 보정:**
- `SITE_META_FALLBACK` 객체의 `sprint:`, `phase:`, `phaseTitle:` 값을 Edit으로 수정
- `STATS_FALLBACK` 배열의 `value:` 값 5개를 Edit으로 수정
- 기타 하드코딩 수치 (pillars detail, architecture items) — WARN만 출력, 자동 보정 안 함 (구조 의존성 높음)

**footer.tsx 보정:**
- `Sprint N · Phase N` 패턴을 Grep으로 찾아 Edit으로 수정

**결과 테이블 행 추가:**
```
| README.md | OK/WARN | N drift(s) found, M auto-fixed |
| 랜딩 hero.md | OK/WARN | N drift(s) found, M auto-fixed |
| 랜딩 fallback | OK/WARN | N drift(s) found, M auto-fixed |
| 랜딩 footer | OK/WARN | N drift(s) found, M auto-fixed |
```

### 7. 디스크/캐시 정리 (full 모드만)

```bash
echo "=== Cleanup ==="
# Turbo 캐시 크기
TURBO_CACHE=$(du -sh node_modules/.cache/turbo 2>/dev/null | cut -f1 || echo "0")
echo "Turbo cache: $TURBO_CACHE"

# Playwright 결과 (있으면 크기)
PW_REPORT=$(du -sh packages/web/playwright-report 2>/dev/null | cut -f1 || echo "none")
PW_RESULTS=$(du -sh packages/web/test-results 2>/dev/null | cut -f1 || echo "none")
echo "Playwright report: $PW_REPORT, results: $PW_RESULTS"
```

**자동 보정:**
- 보정 안 함, 크기만 보고 (삭제는 사용자 판단)

### 8. 결과 출력

```
## Daily Check 결과

| 항목 | 결과 | 상세 |
|------|------|------|
| Runtime | OK/WARN | node X, pnpm Y |
| Git Sync | OK/WARN/ERR | ahead=N behind=M dirty=K |
| Dependencies | OK/STALE | pnpm install 필요 여부 |
| TypeScript | OK/ERR | N errors |
| Hooks | OK/WARN | N scripts, M no-exec |
| D1 Migration | OK/WARN/SKIP | local N files, latest NNNN |
| CLAUDE.md | OK/WARN | N drift(s) found, M auto-fixed |
| README.md | OK/WARN | N drift(s) found, M auto-fixed |
| 랜딩 hero.md | OK/WARN | N drift(s) found, M auto-fixed |
| 랜딩 fallback | OK/WARN | N drift(s) found, M auto-fixed |
| 랜딩 footer | OK/WARN | N drift(s) found, M auto-fixed |
| Disk/Cache | INFO | turbo XMB, playwright YMB |

### 자동 보정 수행
- [수행한 보정 목록]

### 수동 조치 필요
- [보정 불가 항목]
```

## quick 모드

`quick`일 때는 Step 2 (Git), Step 3 (Dependencies), Step 4 (TypeScript)만 실행한다.
Step 1, 5, 6, 7은 건너뛴다.

## Gotchas

- WSL 환경에서 `wrangler` 실행은 메모리 소진 위험 — D1 remote 점검은 파일 기반으로 제한
- `git fetch`는 네트워크 의존 — 오프라인 시 Git Sync 항목을 SKIP 처리
- `turbo typecheck`는 캐시 덕분에 보통 수 초 내 완료되지만, 캐시 미스 시 30초+ 소요
- Hook 스크립트의 실행 권한은 WSL↔Windows 전환 시 자주 초기화됨 (chmod 보정 필요)
