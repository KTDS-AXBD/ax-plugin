---
name: daily-check
description: |
  Daily Task 시작 전 환경 점검 + 자동 보정.
  Node/pnpm 버전, 의존성, Git 동기화, 빌드 상태, D1 마이그레이션 drift, Hook 상태, CLAUDE.md 수치 정합성을 점검한다.
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
| `full` (기본) | 전체 8항목 점검 + 자동 보정 (CLAUDE.md 수치 포함) |
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

### 6b. CLAUDE.md 수치 정합성 점검 + 자동 보정 (full 모드만)

> `/claude-md-management:claude-md-improver`의 수치 점검 로직을 내장.
> 전체 품질 리포트가 아닌 **정량 데이터 drift만** 감지하고 자동 보정한다.

CLAUDE.md가 존재하면, 코드베이스의 실제 수치와 CLAUDE.md에 기술된 수치를 비교한다.

**점검 항목 (모노리포 기준):**

| 항목 | 실제 값 출처 | CLAUDE.md 매칭 패턴 |
|------|-------------|-------------------|
| API routes 수 | `ls packages/api/src/routes/ \| wc -l` | `routes/` 뒤 숫자 |
| API services 수 | `ls packages/api/src/services/ \| wc -l` | `services/` 뒤 숫자 |
| API schemas 수 | `ls packages/api/src/schemas/ \| wc -l` | `schemas/` 뒤 숫자 |
| D1 마이그레이션 범위 | `ls packages/api/src/db/migrations/*.sql \| sort \| tail -1` | `0001~NNNN` 패턴 |
| API 테스트 수 | `cd packages/api && pnpm test --reporter=json 2>/dev/null \| jq '.numPassedTests'` | `API` 또는 `api` 뒤 테스트 수 |
| CLI 테스트 수 | `cd packages/cli && pnpm test --reporter=json 2>/dev/null \| jq '.numPassedTests'` | `CLI` 또는 `cli` 뒤 테스트 수 |
| Web 테스트 수 | `cd packages/web && pnpm test --reporter=json 2>/dev/null \| jq '.numPassedTests'` | `Web` 또는 `web` 뒤 테스트 수 |

**실행 절차:**

1. CLAUDE.md를 Read로 읽는다.
2. 위 항목별 실제 값을 Bash/Glob으로 수집한다.
   - 테스트 수는 **실행하지 않고** 기존 Step 4 (TypeScript) 결과가 있으면 참조, 없으면 파일 수만 확인.
   - 빠른 수치 확인이 목적이므로 `ls | wc -l` 수준만 사용한다.
3. CLAUDE.md에서 해당 수치를 Grep으로 추출한다.
4. 불일치 항목을 목록화한다.

**자동 보정:**
- routes/services/schemas 수 drift → CLAUDE.md의 해당 행을 Edit으로 수정
- D1 마이그레이션 범위 drift → `0001~NNNN` 패턴을 실제 latest로 수정
- 테스트 수 drift → **보정 안 함** (테스트 수는 세션 중 변동이 잦아 session-end에서 갱신)
- MEMORY.md의 주요 지표도 동일하게 비교하여 drift 발견 시 보정

**결과 테이블 행 추가:**
```
| CLAUDE.md | OK/WARN | N drift(s) found, M auto-fixed |
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
