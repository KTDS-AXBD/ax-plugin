---
name: daily-check
description: "Daily Task 시작 전 환경 점검 + 자동 보정. Node/pnpm 버전, 의존성, Git 동기화, Worktree/Branch 위생, 빌드 상태, D1 마이그레이션 drift, Hook 상태, SPEC.md 수치 정합성을 점검한다. 문제 발견 시 자동 보정을 시도하고, 보정 불가 항목은 보고한다. Use when: 환경 점검, daily check, 시작 전 점검, health check"
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
| `full` (기본) | 전체 9항목 점검 + 자동 보정 (SPEC.md 수치 포함) |
| `quick` | 핵심 4항목만 (Git 동기화 + Worktree/Branch 위생 + 의존성 + 타입체크) |

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

### 1b. tmux 서버 바이너리 점검

> tmux는 클라이언트-서버 구조. `~/.local/bin/tmux`에 3.5a를 설치해도 기존 서버 프로세스는
> 구 바이너리(/usr/bin/tmux 3.4)로 계속 실행된다. 바이너리 교체 후 `tmux kill-server`를
> 하지 않으면 segfault 위험이 남아 있다. (feedback_tmux34_bug.md 참조)

```bash
echo "=== tmux Server Binary ==="
CLIENT_BIN_RAW=$(which tmux 2>/dev/null)
# readlink -f로 심링크 해석된 실경로 추출 (server는 /proc/PID/exe에서 이미 실경로 반환)
CLIENT_BIN=$(readlink -f "$CLIENT_BIN_RAW" 2>/dev/null || echo "$CLIENT_BIN_RAW")
CLIENT_VER=$(tmux -V 2>/dev/null || echo "not found")
echo "Client: $CLIENT_BIN_RAW → $CLIENT_BIN → $CLIENT_VER"

# 서버 프로세스의 실제 바이너리 확인 (readlink /proc/PID/exe = 심링크 해석된 실경로)
SERVER_PID=$(pgrep -a tmux 2>/dev/null | grep -E 'new-session|server' | head -1 | awk '{print $1}')
if [ -n "$SERVER_PID" ]; then
  SERVER_BIN=$(readlink /proc/$SERVER_PID/exe 2>/dev/null || echo "unknown")
  echo "Server PID: $SERVER_PID → $SERVER_BIN"
  # 실경로끼리 비교 (심링크 false positive 방지 — S299 교훈)
  if [ "$CLIENT_BIN" != "$SERVER_BIN" ] && [ "$SERVER_BIN" != "unknown" ]; then
    echo "MISMATCH: client=$CLIENT_BIN server=$SERVER_BIN"
  else
    echo "Match: OK"
  fi
else
  echo "No tmux server running (skip)"
fi
```

**자동 보정:**
- 불일치 시 → **보정 안 함** (kill-server는 활성 세션을 모두 종료하므로 위험), WARN + `tmux kill-server` 후 재기동 안내
- 서버 바이너리가 `/usr/bin/tmux` (3.4) → "segfault 위험, 세션 정리 후 kill-server 필수" 경고

**결과 테이블 행:**
```
| tmux Server | OK/WARN | client=X server=Y (match/mismatch) |
```

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

### 2b. Worktree / Branch 위생 점검

> Master pane에서 오케스트레이션하고, 실제 작업은 worktree에서 진행하는 구조의 위생을 검증한다.
> 고아 worktree, stale branch, 미완료 sprint 잔여물을 감지하여 알리고, 자동 보정 가능 항목은 처리한다.

**Phase 1: Worktree 점검**

```bash
echo "=== Worktree Hygiene ==="
# 1a. git worktree list — 활성 worktree 전수 조회
git worktree list

# 1b. 고아 worktree 감지 (디렉토리가 사라졌지만 git이 추적 중인 WT)
ORPHAN_WT=$(git worktree list --porcelain | awk '/^worktree / {path=$2} /^HEAD / {if (path != "") system("test -d " path " || echo ORPHAN:" path)}')

# 1c. 활성 WT에 미커밋 변경이 있는지 확인
for wt in $(git worktree list --porcelain | awk '/^worktree / {print $2}'); do
  if [ "$wt" != "$(git rev-parse --show-toplevel)" ]; then
    DIRTY=$(git -C "$wt" status --porcelain 2>/dev/null | wc -l)
    if [ "$DIRTY" -gt 0 ]; then
      echo "DIRTY-WT: $wt ($DIRTY files)"
    fi
  fi
done
```

**Phase 2: Branch 점검**

```bash
# 2a. 로컬 브랜치 중 remote가 삭제된 것 (gone 브랜치)
git branch -vv | grep ': gone]' | awk '{print $1}'

# 2b. 로컬 브랜치 중 master에 이미 merge된 것 (stale)
git branch --merged master | grep -v '^\*\|master'

# 2c. remote에만 남은 stale 브랜치 (PR closed/merged이지만 auto-delete 누락)
git remote prune origin --dry-run 2>/dev/null

# 2d. sprint/* 브랜치 중 대응 worktree가 없는 것
for branch in $(git branch --list 'sprint/*' 2>/dev/null | sed 's/^[* ]*//' ); do
  WT_EXISTS=$(git worktree list --porcelain | grep -c "branch refs/heads/$branch" || true)
  if [ "$WT_EXISTS" -eq 0 ]; then
    echo "ORPHAN-BRANCH: $branch (no worktree)"
  fi
done
```

**Phase 3: Sprint Signal 잔여물 점검**

```bash
# /tmp/sprint-signals/ 에 오래된 signal 파일이 남아있는지
SIGNAL_DIR="/tmp/sprint-signals"
if [ -d "$SIGNAL_DIR" ]; then
  STALE_SIGNALS=$(find "$SIGNAL_DIR" -name "*.signal" -mmin +120 2>/dev/null | wc -l)
  echo "Stale signals (>2h): $STALE_SIGNALS"
fi

# /tmp/claude-session-* 잔여 파일
SESSION_FILES=$(ls /tmp/claude-session-* /tmp/claude-req-* 2>/dev/null | wc -l)
echo "Session temp files: $SESSION_FILES"
```

**자동 보정:**
- 고아 worktree (디렉토리 없음) → `git worktree prune` 실행
- gone 브랜치 (remote 삭제됨) → `git branch -d` 실행 (force 아님 — merge 안 된 건 보존)
- master에 merge된 stale 로컬 브랜치 → `git branch -d` 실행
- remote stale ref → `git remote prune origin` 실행
- stale signal 파일 (2시간+) → 삭제
- stale session temp 파일 (24시간+, 현재 pane 것 제외) → 삭제
- 미커밋 변경이 있는 WT → **보정 안 함**, WARN만 (사용자가 직접 처리)
- orphan sprint branch (WT 없음) → **보정 안 함**, WARN만 (의도적 보존 가능)

**결과 테이블 행:**
```
| Worktree | OK/WARN | 활성 N개, 고아 M개, dirty K개 |
| Branch | OK/WARN | stale N개 정리, orphan M개 감지 |
| Sprint Signals | OK/WARN | stale N개, session temp M개 |
```

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

### 6d. Plugin Source↔Cache Drift (full 모드만)

> Self-Evolving Harness 원칙: "측정 없이 진화 없다" — 스킬 인프라 상태도 점검 대상.

ax/bkit/skill-framework 3개 플러그인의 source↔cache 동기화 확인.

```bash
echo "=== Plugin Drift ==="
TOTAL_DRIFT=0

# ax plugin
AX_SRC=~/.claude/plugins/marketplaces/ax-marketplace/skills
AX_CACHE=$(ls -d ~/.claude/plugins/cache/ax-marketplace/ax/*/skills 2>/dev/null | tail -1)
if [ -n "$AX_CACHE" ] && [ -d "$AX_SRC" ]; then
  AX_DRIFT=$(diff -rq "$AX_SRC" "$AX_CACHE" 2>/dev/null | wc -l)
  TOTAL_DRIFT=$((TOTAL_DRIFT + AX_DRIFT))
  echo "ax: drift=$AX_DRIFT"
fi

# bkit plugin
BKIT_SRC=~/.claude-work/.claude/plugins/marketplaces/bkit-marketplace/skills
BKIT_CACHE=$(ls -d ~/.claude-work/.claude/plugins/cache/bkit-marketplace/bkit/*/skills 2>/dev/null | tail -1)
if [ -n "$BKIT_CACHE" ] && [ -d "$BKIT_SRC" ]; then
  BKIT_DRIFT=$(diff -rq "$BKIT_SRC" "$BKIT_CACHE" 2>/dev/null | wc -l)
  TOTAL_DRIFT=$((TOTAL_DRIFT + BKIT_DRIFT))
  echo "bkit: drift=$BKIT_DRIFT"
fi

echo "total drift: $TOTAL_DRIFT"
```

**자동 보정:**
- drift > 0: WARN + 파일 목록 출력 + "source→cache rsync 또는 /plugin 재설치 권장"
- drift = 0: PASS

**결과 테이블 행:**
```
| Plugin Drift | OK/WARN | ax=N bkit=M total=K |
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
| tmux Server | OK/WARN | client=X server=Y (match/mismatch) |
| Git Sync | OK/WARN/ERR | ahead=N behind=M dirty=K |
| Worktree | OK/WARN | 활성 N개, 고아 M개, dirty K개 |
| Branch | OK/WARN | stale N개 정리, orphan M개 감지 |
| Sprint Signals | OK/WARN | stale N개, session temp M개 |
| Dependencies | OK/STALE | pnpm install 필요 여부 |
| TypeScript | OK/ERR | N errors |
| Hooks | OK/WARN | N scripts, M no-exec |
| D1 Migration | OK/WARN/SKIP | local N files, latest NNNN |
| SPEC.md 수치 | OK/WARN | N drift(s) found, M auto-fixed |
| 수치 하드코딩 | OK/WARN | CLAUDE.md N건 / MEMORY.md N건 |
| README.md | OK/WARN | N drift(s) found, M auto-fixed |
| 랜딩 hero.md | OK/WARN | N drift(s) found, M auto-fixed |
| 랜딩 fallback | OK/WARN | N drift(s) found, M auto-fixed |
| 랜딩 footer | OK/WARN | N drift(s) found, M auto-fixed |
| Plugin Drift | OK/WARN | ax=N bkit=M total=K |
| Disk/Cache | INFO | turbo XMB, playwright YMB |

### 자동 보정 수행
- [수행한 보정 목록]

### 수동 조치 필요
- [보정 불가 항목]
```

## quick 모드

`quick`일 때는 Step 2 (Git), Step 2b (Worktree/Branch), Step 3 (Dependencies), Step 4 (TypeScript)만 실행한다.
Step 1, 5, 6, 6b, 6c, 7은 건너뛴다.

## Gotchas

- WSL 환경에서 `wrangler` 실행은 메모리 소진 위험 — D1 remote 점검은 파일 기반으로 제한
- `git fetch`는 네트워크 의존 — 오프라인 시 Git Sync 항목을 SKIP 처리
- `turbo typecheck`는 캐시 덕분에 보통 수 초 내 완료되지만, 캐시 미스 시 30초+ 소요
- Hook 스크립트의 실행 권한은 WSL↔Windows 전환 시 자주 초기화됨 (chmod 보정 필요)
