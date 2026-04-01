---
name: req-integrity
description: |
  요구사항 정합성 검증 — SPEC ↔ GitHub Issues ↔ Execution Plan 3-way 비교.
  드리프트 감지, 불일치 보정, 수치 검증을 한 번에 수행한다.
  요구사항 관리 표준(~/.claude/standards/requirements-governance.md) 기반.
  Use when: 정합성, integrity, drift, SPEC 불일치, 3-way 비교, 요구사항 검증
argument-hint: "[check|fix|report]"
user-invocable: true
allowed-tools:
  - Bash
  - Read
  - Edit
  - Glob
  - Grep
  - AskUserQuestion
---

# ax-req-integrity — 요구사항 정합성 검증

`/ax-req-integrity [check|fix|report]`

## 개요

SPEC.md(SSOT) ↔ GitHub Issues ↔ Execution Plan ↔ MEMORY.md 간 정합성을 검증한다.
5가지 검증 항목을 순차 실행하고, 불일치를 리포트한다.

---

## 서브커맨드

### `/ax-req-integrity check` (기본) — 읽기 전용 검증

5가지 검증을 수행하고 결과를 표로 출력한다. **파일을 수정하지 않는다.**

**Step 1: F-item ↔ GitHub Issue 매칭**

```bash
# 1. SPEC.md에서 F-item 목록 추출 (F번호, 제목, 상태)
grep -oP 'F\d+' SPEC.md | sort -u > /tmp/spec-fitems.txt

# 2. GitHub Issues에서 [F{N}] 패턴 목록 조회
GITHUB_REPO=$(git remote get-url origin 2>/dev/null | grep -oP '(?<=github.com[:/])[^.]+' || true)
if [ -n "$GITHUB_REPO" ]; then
  gh issue list --repo "$GITHUB_REPO" --state all --limit 200 \
    --json number,title,state \
    --jq '.[] | select(.title | test("^\\[F\\d+\\]"))' > /tmp/gh-issues.json
fi

# 3. 비교: SPEC에 있지만 GitHub Issue 없는 F-item 찾기
# 4. 비교: GitHub Issue 상태(OPEN/CLOSED) ↔ SPEC 상태(📋/🔧/✅) 불일치 찾기
```

**판정 기준:**
- SPEC ✅ + GitHub CLOSED = OK
- SPEC 📋/🔧 + GitHub OPEN = OK
- SPEC ✅ + GitHub OPEN = ⚠️ Issue 미닫힘
- SPEC 📋 + GitHub CLOSED = ⚠️ Issue 선닫힘
- SPEC 존재 + GitHub 미등록 = ❌ Issue 미생성

**Step 2: Execution Plan ↔ REQ 상태 검증**

```bash
# SPEC.md §6 Execution Plan에서 체크박스 파싱
# - [x] ... (FX-REQ-NNN DONE) → 상태 일치 확인
# - [ ] ... (FX-REQ-NNN) → PLANNED/IN_PROGRESS와 일치 확인
# - 주석 누락된 미완료 항목 → 경고
```

**판정 기준:**
- `[x]` + `(REQ-NNN DONE)` = OK
- `[ ]` + REQ 없음/PLANNED = OK
- `[x]` + 주석 없음 = ⚠️ REQ 주석 누락
- `[ ]` + `(REQ-NNN DONE)` = ❌ 체크박스 미갱신

**Step 3: SPEC 수치 ↔ 코드 실제값 비교**

```bash
# 코드에서 실제 수치 추출
ENDPOINTS=$(grep -r 'app\.\(get\|post\|put\|delete\|patch\)(' packages/api/src/routes/ 2>/dev/null | wc -l)
SERVICES=$(ls packages/api/src/services/*.ts 2>/dev/null | wc -l)
TABLES=$(grep -c 'CREATE TABLE' packages/api/src/db/migrations/*.sql 2>/dev/null)
TESTS=$(cd packages/api && npx vitest run --reporter=json 2>/dev/null | jq '.numTotalTests' || echo "?")

# SPEC.md §2에서 기록된 수치와 비교
# MEMORY.md 수치와도 비교
```

**판정 기준:**
- 코드 = SPEC = MEMORY → OK
- 코드 = MEMORY ≠ SPEC → ⚠️ SPEC 갱신 필요
- 코드 ≠ MEMORY ≠ SPEC → ❌ 전면 갱신 필요

**Step 4: MEMORY ↔ SPEC 일관성 검증**

```bash
# MEMORY.md "프로젝트 상태"와 SPEC.md §1/§2 비교
# - Version 일치 여부
# - Phase 명칭 일치 여부
# - 최근 Sprint 상태 일치 여부
```

**판정 기준:**
- 모든 항목 일치 → OK
- MEMORY가 SPEC보다 최신 → ⚠️ SPEC 갱신 필요 (SSOT 역전)
- SPEC가 MEMORY보다 최신 → ⚠️ MEMORY 갱신 필요

**Step 5: TD 해소 추적 형식 검증**

```bash
# SPEC.md §8 Tech Debt에서:
# - ~~TD-NN~~ 취소선이 있으면 → 영향 컬럼에 `(세션 NNN)` 존재 여부 확인
# - 활성 TD가 있으면 → MEMORY.md "활성 리스크"에 반영 여부 확인
```

**출력 형식:**

```
## 요구사항 정합성 검증 결과

| # | 검증 항목 | 상태 | 불일치 |
|---|----------|:----:|--------|
| 1 | F-item ↔ GitHub Issue | ✅/⚠️/❌ | N건 |
| 2 | Execution Plan ↔ REQ | ✅/⚠️/❌ | N건 |
| 3 | SPEC 수치 ↔ 코드 실제 | ✅/⚠️/❌ | N건 |
| 4 | MEMORY ↔ SPEC 일관성 | ✅/⚠️/❌ | N건 |
| 5 | TD 해소 추적 | ✅/⚠️/❌ | N건 |

### 불일치 상세
(항목별 상세 테이블)
```

---

### `/ax-req-integrity fix` — 불일치 자동 보정

1. 먼저 `check`를 실행하여 불일치를 파악한다.
2. **SPEC.md 기준**으로 다른 소스를 보정한다 (SSOT 원칙).
3. 보정 전 AskUserQuestion으로 확인을 받는다.

**보정 가능 항목:**
- GitHub Issue 미생성 → `gh issue create` 자동 실행
- GitHub Issue 상태 불일치 → `gh issue close/reopen` 실행
- Execution Plan 체크박스 미갱신 → SPEC.md 편집
- REQ 주석 누락 → SPEC.md §6에 `(FX-REQ-NNN DONE)` 추가
- MEMORY.md 갱신 → SPEC 기준으로 수치/상태 보정

**보정 불가 항목 (수동 안내):**
- SPEC 수치 갱신 (코드 스캔 결과를 제안만)
- TD 신규 등록 (사용자 판단 필요)

---

### `/ax-req-integrity report` — 드리프트 통계

최근 5세션의 불일치 이력과 드리프트 추이를 출력한다.

```
## 드리프트 리포트

| 세션 | 날짜 | 불일치 총건 | F-item | ExPlan | 수치 | MEMORY | TD |
|------|------|:---------:|:------:|:------:|:----:|:------:|:--:|
| #53 | 03-19 | 2 | 0 | 0 | 0 | 2 | 0 |
| #52 | 03-19 | 0 | 0 | 0 | 0 | 0 | 0 |
| ... | ... | ... | ... | ... | ... | ... | ... |

추세: [개선 ↓ / 악화 ↑ / 안정 →]
```

---

## ax-session-start / ax-session-end 연동

- **세션 시작 시** (`/ax-session-start`): Step 1~5 자동 실행 (check 모드)
  - 불일치 발견 시 세션 시작 안내에 "⚠️ 정합성 불일치 N건 — `/ax-req-integrity fix` 권장" 포함
- **세션 종료 시** (`/ax-session-end`): Step 1~2만 실행
  - 완료 F-item의 GitHub Issue/Execution Plan 상태를 자동 보정

---

## 관련 스킬

| 스킬 | 관계 |
|------|------|
| `/ax-req-manage` | 개별 REQ 등록/조회/상태변경 → integrity가 일괄 검증 |
| `/ax-req-interview` | PRD 작성 → 작성 후 integrity check 권장 |
| `/ax-session-start` | 세션 시작 시 자동 check 호출 |
| `/ax-session-end` | 세션 종료 시 자동 fix 호출 |
| `/ax-gov-risk` | TD 추적 검증 (Step 5) 연동 |


---

## Gotchas

- TODO: 이 스킬 사용 시 주의사항을 작성하세요
