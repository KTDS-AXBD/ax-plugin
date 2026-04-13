---
name: code-verify
description: "코드 검증 — lint + typecheck + test를 한 번에 실행한다. 프레임워크 자동 감지 (vitest/jest/pytest/go test). 변경 파일 관련 테스트만 실행, 실패 시 자동 수정 시도. 서브커맨드: lint, typecheck, test, coverage, watch, all(기본). Use when: 코드 검증, lint, typecheck, test, verify"
argument-hint: "[all|lint|typecheck|test|coverage|watch]"
user-invocable: true
allowed-tools:
  - Bash
  - Read
  - Edit
  - Glob
  - Grep
---

# Verify — 코드 검증 (lint + typecheck + test)

`$ARGUMENTS`에 따라 검증 범위를 결정한다. 인수 없으면 `all` (lint → typecheck → test).

| 서브커맨드 | 동작 |
|-----------|------|
| `all` (기본) | lint → typecheck → test 순차 실행 |
| `lint` | ESLint/Biome만 |
| `typecheck` | TypeScript/mypy만 |
| `test` | 관련 테스트만 (변경 파일 기반) |
| `test all` | 전체 테스트 |
| `coverage` | 전체 테스트 + 커버리지 리포트 |
| `watch` | 변경 파일 관련 테스트 watch 모드 |

## Steps

### 1. 환경 감지

```bash
# 패키지 매니저
if [ -f "pnpm-lock.yaml" ]; then PM="pnpm"
elif [ -f "yarn.lock" ]; then PM="yarn"
elif [ -f "bun.lockb" ]; then PM="bun"
elif [ -f "package-lock.json" ]; then PM="npm"
elif [ -f "requirements.txt" ] || [ -f "pyproject.toml" ]; then PM="python"
elif [ -f "go.mod" ]; then PM="go"
else PM="npm"
fi

# 테스트 프레임워크 감지
FRAMEWORK="unknown"
if [ -f "vitest.config.ts" ] || [ -f "vitest.config.js" ]; then FRAMEWORK="vitest"
elif grep -q '"jest"' package.json 2>/dev/null; then FRAMEWORK="jest"
elif [ -f "pytest.ini" ] || [ -f "pyproject.toml" ]; then FRAMEWORK="pytest"
elif [ -f "go.mod" ]; then FRAMEWORK="go-test"
fi

echo "PM: $PM | Framework: $FRAMEWORK"
```

### 2. 변경 파일 수집

```bash
# staged + unstaged + untracked
CHANGED=$(git diff --name-only HEAD 2>/dev/null; git diff --name-only --staged 2>/dev/null; git ls-files --others --exclude-standard 2>/dev/null)
CHANGED=$(echo "$CHANGED" | sort -u)
echo "변경 파일 $(echo "$CHANGED" | wc -l)개"
```

### 2b. Migration Drift Check (D1 프로젝트)

`wrangler.toml`에 `d1_databases` 설정이 있으면 프로덕션 마이그레이션 동기화 상태를 확인한다.

```bash
DB_NAME=$(grep 'database_name' wrangler.toml 2>/dev/null | head -1 | awk -F'"' '{print $2}')
if [ -n "$DB_NAME" ]; then
  PENDING_OUTPUT=$(npx wrangler d1 migrations list "$DB_NAME" --remote 2>&1)
  if echo "$PENDING_OUTPUT" | grep -q "Migrations to be applied"; then
    PENDING_LIST=$(echo "$PENDING_OUTPUT" | grep '│' | grep -v 'Name' | sed 's/│//g; s/^ *//; s/ *$//' | grep -v '^$' | grep '.sql')
    PENDING_COUNT=$(echo "$PENDING_LIST" | wc -l)
    echo "⚠️ Migration Drift: 프로덕션 미적용 ${PENDING_COUNT}건"
    echo "$PENDING_LIST"
  else
    echo "✅ Migration: 프로덕션 동기화 OK"
  fi
fi
```

결과 테이블의 Migration 행에 반영한다. D1 미사용 프로젝트면 건너뜀.

### 3. Lint (서브커맨드가 `all` 또는 `lint`)

package.json `scripts` 에서 lint 명령을 확인한다.

```bash
$PM lint 2>&1
```

에러가 있으면:
1. 자동 수정 가능한 것 → `$PM lint --fix` 또는 직접 Edit
2. 수정 후 재실행
3. 0 errors까지 반복 (최대 2회)

### 4. TypeScript 타입 체크 (서브커맨드가 `all` 또는 `typecheck`)

```bash
$PM typecheck 2>&1 || $PM tsc --noEmit 2>&1
```

에러가 있으면:
1. 에러 파일/위치 파악
2. 타입 에러 직접 수정
3. 재실행 확인

### 5. 테스트 (서브커맨드가 `all`, `test`, `coverage`, `watch`)

#### 5-1. 관련 테스트 파일 탐색

변경된 소스 파일과 관련된 테스트 파일을 찾는다:

```bash
# 변경된 소스 파일 → 관련 테스트 파일 매핑
# 패턴: foo.ts → foo.test.ts, foo.spec.ts
# 패턴: app/lib/cost/client.ts → tests/unit/cost/client.test.ts
# 패턴: app/routes/api.foo.ts → tests/integration/api-foo.test.ts
```

각 변경 파일에 대해 Glob으로 테스트 파일을 탐색한다:
- `**/{basename}.test.*`
- `**/{basename}.spec.*`
- `tests/**/*{basename}*`

#### 5-2. 테스트 실행

**서브커맨드별 분기**:

| 서브커맨드 | 실행 명령 |
|-----------|----------|
| `all` | 관련 테스트만 `$PM test -- {files}` |
| `test` | 관련 테스트만 `$PM test -- {files}` |
| `test all` | 전체 `$PM test` |
| `coverage` | `$PM test:coverage` 또는 `$PM test -- --coverage` |
| `watch` | `$PM test:watch -- {files}` 또는 `$PM test -- --watch {files}` |

프레임워크별 명령:
- **vitest**: `$PM test -- {files}`, `$PM test -- --coverage`, `$PM test -- --watch {files}`
- **jest**: `$PM test -- --testPathPattern="{pattern}"`, `$PM test -- --coverage`, `$PM test -- --watch`
- **pytest**: `python -m pytest {files}`, `python -m pytest --cov`, `python -m pytest -f`
- **go-test**: `go test ./...`, `go test -cover ./...`

`watch` 서브커맨드일 경우: watch 프로세스를 실행하고 사용자에게 안내 후 종료.

#### 5-3. 실패 분석 + 자동 수정

테스트 실패 시:
1. 실패한 테스트 파일과 에러 메시지 파싱
2. 실패 원인 분류:
   - **코드 버그**: 소스 파일 수정
   - **테스트 기대값 불일치**: 의도된 변경이면 테스트 수정, 버그면 소스 수정
   - **import/타입 에러**: 해당 파일 수정
3. 수정 후 해당 테스트만 재실행 (최대 2회 반복)
4. 여전히 실패하면 수동 수정 필요로 보고

### 6. 커버리지 분석 (서브커맨드가 `coverage`)

커버리지 리포트를 파싱하여:
1. 전체 커버리지 % 출력
2. 미커버 영역 상위 5개 파일 목록
3. 변경 파일의 개별 커버리지 %
4. 커버리지가 낮은 변경 파일에 대해 테스트 추가 제안

### 6b. Skill Lint (스킬 파일 변경 시만)

`.claude/skills/` 하위 파일이 변경 파일 목록(Step 2)에 포함된 경우에만 실행.

```bash
SKILL_FILES=$(echo "$CHANGED_FILES" | grep -c '\.claude/skills/' || true)
if [ "$SKILL_FILES" -gt 0 ]; then
  SF_LINT=$(find ~/.claude-work/.claude/plugins/cache -path "*/skill-framework*/scripts/lint.mjs" 2>/dev/null | head -1)
  [ -n "$SF_LINT" ] && node "$SF_LINT" 2>/dev/null
fi
```

- Error 0: PASS
- Error > 0: WARN + 상세 (자동 수정은 `--fix` 플래그 검토 — 현재는 정보 제공만)
- 스킬 파일 변경 없음: SKIP

### 7. 결과 출력

```
## Verify 결과

| 단계 | 결과 | 상세 |
|------|------|------|
| Migration | ✅/⚠️/⏭️ | 프로덕션 동기화 OK / 미적용 N건 / D1 미사용 |
| ESLint | ✅/❌ | N errors (M 자동 수정) |
| TypeScript | ✅/❌ | N errors |
| Test | ✅/❌ | N passed / M failed / K skipped |
| Skill Lint | ✅/⚠️/⏭️ | N errors, M warnings / 스킬 변경 없음 |
| Coverage | --% | (coverage 모드만) |

- 실행 대상: {관련 테스트 N개} / 전체 {M개}
- 수정된 파일: [목록]
- 수동 수정 필요: [목록]
```

## 주의사항

- `watch` 모드는 백그라운드 프로세스를 생성하므로, 완료 안내 후 리턴
- 테스트 자동 수정은 **최대 2회** 시도 후 중단
- 커버리지 리포트 경로: 프로젝트 CLAUDE.md 또는 package.json에서 감지
- `$ARGUMENTS`가 비어있으면 `all`로 동작
- 프레임워크를 감지할 수 없으면 `$PM test`를 직접 실행


---

## Gotchas

- TODO: 이 스킬 사용 시 주의사항을 작성하세요
