---
name: e2e-audit
description: "E2E 테스트 시나리오 점검 + 실행 + 커버리지 감사. Playwright 기반 E2E를 실행하고, 라우트 커버리지 매트릭스를 생성하고, 실패 원인을 분류하고, 품질 이슈(flaky, weak assertion, API-only)를 감지한다. 서브커맨드: run, audit, fix, coverage, report. Use when: E2E 점검, E2E 감사, playwright, e2e test"
argument-hint: "[run|audit|fix|coverage|report]"
user-invocable: true
allowed-tools:
  - Bash
  - Read
  - Edit
  - Write
  - Glob
  - Grep
---

# E2E Audit — E2E 테스트 시나리오 점검 + 실행 관리

`$ARGUMENTS`에 따라 동작을 결정한다. 인수 없으면 `run` (E2E 실행 + 결과 요약).

| 서브커맨드 | 동작 |
|-----------|------|
| `run` (기본) | E2E 전체 실행 + 결과 요약 테이블 |
| `run <spec>` | 특정 spec만 실행 (예: `run dashboard`) |
| `audit` | 종합 감사 — 커버리지 갭 + 품질 이슈 + 권장사항 |
| `fix` | 실패 테스트 자동 수정 (최대 3회 반복) |
| `coverage` | 라우트 커버리지 매트릭스 출력 |
| `report` | 감사 결과를 `docs/03-analysis/` 보고서로 저장 |

## Steps

### 1. 환경 감지

```bash
# Playwright 설치 확인
PW_DIR=""
for dir in "packages/web" "apps/app-web" "."; do
  if [ -f "$dir/playwright.config.ts" ] || [ -f "$dir/playwright.config.js" ]; then
    PW_DIR="$dir"
    break
  fi
done
if [ -z "$PW_DIR" ]; then
  echo "❌ Playwright 설정 파일을 찾을 수 없어요."
  echo "playwright.config.ts가 있는 디렉토리를 확인하세요."
  exit 1
fi

# E2E 디렉토리
E2E_DIR="$PW_DIR/e2e"
if [ ! -d "$E2E_DIR" ]; then
  E2E_DIR="$PW_DIR/tests"  # fallback
fi

# 라우터 파일 감지
ROUTER_FILE=""
for f in "$PW_DIR/src/router.tsx" "$PW_DIR/src/App.tsx" "$PW_DIR/app/routes.ts"; do
  [ -f "$f" ] && ROUTER_FILE="$f" && break
done

# 패키지 매니저
if [ -f "pnpm-lock.yaml" ]; then PM="pnpm"
elif [ -f "bun.lockb" ]; then PM="bun"
elif [ -f "yarn.lock" ]; then PM="yarn"
else PM="npm"
fi

echo "PW_DIR: $PW_DIR | E2E_DIR: $E2E_DIR | PM: $PM"
echo "Router: ${ROUTER_FILE:-없음}"
```

### 2. `run` — E2E 실행 + 결과 요약

**2a. Dev 서버 확인/시작:**

```bash
# Dev 서버가 이미 떠 있는지 확인
BASE_URL=$(grep -oP 'baseURL:\s*"[^"]*"' "$PW_DIR/playwright.config.ts" | grep -oP '"[^"]*"' | tr -d '"')
[ -z "$BASE_URL" ] && BASE_URL="http://localhost:3000"

HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "000" ]; then
  echo "⚠️ Dev 서버 미실행 — 시작 중..."
  cd "$PW_DIR" && $PM dev &>/tmp/e2e-dev-server.log &
  DEV_PID=$!
  # 최대 15초 대기
  for i in $(seq 1 15); do
    sleep 1
    HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL" 2>/dev/null || echo "000")
    [ "$HTTP_CODE" != "000" ] && break
  done
  if [ "$HTTP_CODE" = "000" ]; then
    echo "❌ Dev 서버 시작 실패. 수동으로 '$PM dev'를 실행하세요."
    exit 1
  fi
  echo "✅ Dev 서버 시작 (PID: $DEV_PID)"
fi
```

**2b. Playwright 실행:**

```bash
cd "$PW_DIR"

# 특정 spec 지정 시
if [ -n "$SPEC_FILTER" ]; then
  npx playwright test "$SPEC_FILTER" --reporter=list --retries=1 2>&1
else
  npx playwright test --reporter=list --retries=1 2>&1
fi
```

**2c. 결과 파싱 + 요약:**

실행 결과에서 passed/failed/skipped/flaky 수를 추출하여 테이블로 출력한다.

```
## E2E 실행 결과

| 지표 | 값 |
|------|---|
| 총 tests | N |
| ✅ Passed | N (%) |
| ❌ Failed | N |
| ⏭️ Skipped | N |
| 🔄 Flaky | N (retry 통과) |
| ⏱️ 실행 시간 | Nm Ns |

### 실패 테스트 (있으면)
| Spec | 테스트명 | 에러 요약 |
|------|---------|----------|
| ... | ... | ... |
```

### 3. `audit` — 종합 감사

감사는 4가지 차원을 분석한다:

**3a. 라우트 커버리지 분석:**

```bash
# 1) 라우터에서 등록된 라우트 추출
grep -oP 'path:\s*"[^"]*"' "$ROUTER_FILE" | grep -oP '"[^"]*"' | tr -d '"' | sort -u

# 2) E2E에서 goto()로 접근하는 라우트 추출
grep -ohP 'page\.goto\("[^"]*"\)' "$E2E_DIR"/*.spec.ts | grep -oP '"[^"]*"' | tr -d '"' | sort -u

# 3) 차집합 = 미커버 라우트
comm -23 <(라우터 라우트) <(E2E 라우트)
```

**3b. 테스트 품질 분석:**

각 spec 파일을 읽고 다음 anti-pattern을 감지한다:

| Anti-pattern | 감지 방법 | 심각도 |
|-------------|----------|--------|
| `waitForTimeout` | `grep waitForTimeout` | ⚠️ flaky 위험 |
| API-only (UI 미테스트) | `page.goto()` 없고 `page.evaluate(fetch())` 사용 | 🔴 E2E 가치 없음 |
| 약한 assertion | `toBeTruthy()`, `toBeGreaterThan(0)` | ⚠️ false positive |
| 허용범위 assertion | `expect([200, 404]).toContain()` | ⚠️ 실패 무시 |
| fixture 중복 | 같은 상수가 여러 fixture에 정의 | 💡 정리 필요 |

**3c. Redirect 검증 분석 (라우터에 Navigate/redirect가 있으면):**

```bash
# 라우터에서 redirect 추출
grep -oP 'element:\s*<Navigate to="[^"]*"' "$ROUTER_FILE" | grep -oP 'to="[^"]*"' | tr -d '"to='

# E2E에서 redirect 검증 여부 확인
grep -l "redirect\|Navigate" "$E2E_DIR"/*.spec.ts
```

**3d. 감사 결과 출력:**

```
## E2E 종합 감사

### 커버리지
- 등록 라우트: N개
- E2E 커버: M개 (X%)
- 미커버: K개 (목록)

### 품질 이슈
| 이슈 | 건수 | 파일 |
|------|------|------|
| waitForTimeout | N | [파일 목록] |
| API-only E2E | N | [파일 목록] |
| 약한 assertion | N | [파일 목록] |

### Redirect 검증
- 등록 redirect: N건
- E2E 검증: M건

### 권장사항
1. [우선순위별 목록]
```

### 4. `fix` — 실패 테스트 자동 수정

**4a. 먼저 `run`을 실행하여 실패 테스트를 수집한다.**

**4b. 각 실패 테스트에 대해:**

1. 에러 메시지를 분석하여 실패 원인을 분류:
   - **셀렉터 불일치**: UI 컴포넌트가 변경됨 → 현재 컴포넌트 확인 후 셀렉터 수정
   - **strict mode violation**: 동일 텍스트가 2개 이상 → `.first()` 추가 또는 범위 한정
   - **timeout**: 요소가 viewport 밖 → `toBeAttached()` 또는 `scrollIntoViewIfNeeded()`
   - **mock 불일치**: API 응답 구조 변경 → 현재 API 스키마 확인 후 mock 수정
   - **의존성 누락**: import 에러 → `$PM install`

2. 수정 적용 후 해당 spec만 재실행
3. 통과하면 다음 실패로 이동
4. 3회 시도 후에도 실패하면 `test.skip` 마킹 + TODO 코멘트

**4c. 수정 결과 요약:**

```
## E2E Fix 결과

| 실패 | 원인 | 수정 | 결과 |
|------|------|------|------|
| spec:test | 셀렉터 불일치 | ✏️ 수정 | ✅ 통과 |
| spec:test | viewport 밖 | ✏️ toBeAttached | ✅ 통과 |
| spec:test | Sheet 이슈 | ⏭️ skip 마킹 | TODO |

수정 파일: N개
재실행 결과: M passed / K skipped
```

### 5. `coverage` — 라우트 커버리지 매트릭스

`audit`의 커버리지 분석을 상세 매트릭스로 출력한다.

```
## E2E 라우트 커버리지 매트릭스

| 라우트 | E2E Spec | 커버 유형 | 비고 |
|--------|----------|----------|------|
| /dashboard | dashboard.spec.ts | ✅ 직접 | sidebar + heading |
| /agents | agents.spec.ts, agent-execute.spec.ts | ✅ 직접 | 2 spec |
| /collection/sr | uncovered-pages.spec.ts | ✅ 직접 | 렌더링만 |
| /ax-bd/bmc/new | — | ❌ 미커버 | |
| /sr → /collection/sr | redirect-routes.spec.ts | ✅ redirect | F290 |

### 요약
- 직접 커버: N / M (X%)
- Redirect 커버: K / L (Y%)
- 미커버: P개
```

### 6. `report` — 감사 보고서 저장

`audit` 결과를 PDCA Analysis 문서로 저장한다.

```bash
# 보고서 경로 결정
REPORT_DIR="docs/03-analysis/features"
[ ! -d "$REPORT_DIR" ] && REPORT_DIR="docs/03-analysis"
[ ! -d "$REPORT_DIR" ] && REPORT_DIR="docs"

REPORT_FILE="$REPORT_DIR/e2e-audit-$(date +%Y%m%d).analysis.md"
```

보고서에 포함:
- YAML frontmatter (code, title, version, status, category)
- Executive Summary (테이블)
- 실행 결과 (pass/fail/skip)
- 커버리지 매트릭스
- 품질 이슈 목록
- 권장사항 + 잔여 사항
- Match Rate 계산

## 주기적 점검 가이드

이 스킬은 다음 시점에 실행을 권장한다:

| 트리거 | 서브커맨드 | 목적 |
|--------|-----------|------|
| **Phase 완료** | `audit` + `report` | 전체 E2E 종합 감사 |
| **IA/라우트 변경 후** | `run` + `fix` | 영향받은 E2E 검증 + 수정 |
| **Sprint merge 전** | `run` | 100% pass 확인 |
| **분기 정기** | `audit` | 품질 감사 (assertion 깊이, flaky) |

## 다른 스킬과의 관계

| 스킬 | 관계 |
|------|------|
| `code-verify` | unit test 담당. E2E는 이 스킬이 담당. 겹치지 않음 |
| `session-end` | Phase 6에서 CI/CD E2E gate 결과를 참조 |
| `sprint-autopilot` | Sprint 완료 시 `e2e-audit run` 자동 호출 가능 |

## 주의사항

- Dev 서버가 떠 있어야 E2E 실행 가능 — 자동 시작을 시도하되, 실패 시 안내
- `fix`는 **최대 3회** 반복 후 중단 — 무한 루프 방지
- `audit`는 코드를 **수정하지 않음** (읽기 전용) — `fix`만 수정
- Playwright `--retries=1`로 flaky 테스트 자동 재시도
- `report` 출력 시 INDEX.md 갱신은 하지 않음 (세션 종료 시 처리)
- 프로젝트에 Playwright가 없으면 에러 + 안내 출력
