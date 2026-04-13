---
name: todo
description: "작업 계획 오케스트레이터 — 할 일 수집 → 요구사항 등록 → F-item 등록 → Sprint 그룹화 → Pipeline 구성. Marker.io 피드백/SPEC.md 미완료/GitHub Issues를 종합하여 Sprint Pipeline으로 organize한다. Use when: todo, 할 일, 오늘 작업, 작업 목록, 뭐 해야 해"
argument-hint: "[status|plan|feedback|all]"
user-invocable: true
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - Skill
  - AskUserQuestion
---

# Todo — 작업 계획 오케스트레이터

할 일을 수집하고, 요구사항으로 등록하고, Sprint 단위로 묶어서 Pipeline으로 구성한다.
목적: 해야 할 일들을 organize해서 효율적으로 작업하기 위한 계획 도구.

## Arguments

`$ARGUMENTS`에 따라 실행 범위를 결정한다. 인수 없으면 `all`.

| 서브커맨드 | 동작 |
|-----------|------|
| `all` (기본) | Step 1~6 전체 실행 |
| `status` | Step 1만 — 현재 작업 현황 조회 |
| `plan` | Step 2~6 — 피드백→REQ→F-item→Sprint→Pipeline 계획 |
| `feedback` | Step 2만 — Marker.io 피드백 처리 |

## 전체 흐름

```
Marker.io 피드백 ─┐
SPEC.md 📋/🔧 ───┤─→ ① 수집 → ② REQ 등록 → ③ F-item 등록 → ④ Sprint 그룹화 → ⑤ 병렬/순차 분류 → ⑥ Pipeline 구성
GitHub Issues ────┘
```

---

## Step 1: 작업 현황 수집

모든 작업 소스에서 미완료 항목을 수집한다.

### 1a. SPEC.md F-items

```bash
# 🔧 진행중
grep -E '^\| F[0-9]+ .+🔧' SPEC.md

# 📋 계획됨
grep -E '^\| F[0-9]+ .+📋' SPEC.md
```

각 F-item에서 파싱:
- **F번호**: `F\d{3,4}`
- **우선순위**: `P[0-3]` (설명 안 `(FX-REQ-NNN, P1)` 패턴)
- **Sprint**: Sprint NNN (있으면)
- **의존성**: 비고 컬럼에서 "선행", "의존", "병렬" 키워드

### 1b. GitHub Issues

```bash
gh issue list --state open --limit 30 --json number,title,labels,body
```

라벨 기준 분류:
- `visual-feedback` → Marker.io 피드백 (Step 2로 이동)
- `fx:status:in_progress` → 진행중 작업
- `fx:status:planned` → 계획됨
- `enhancement`, `bug` → 미분류 작업

### 1b-2. GitHub Projects Board — Sprint Ready 컬럼 (F503 통합)

Foundry-X Phase 32(F501)에서 구축한 GitHub Projects Board에서 바로 착수 가능한 항목만 수집한다.
프로젝트에 `scripts/board/board-list.sh`가 있을 때만 동작.

```bash
if [ -x scripts/board/board-list.sh ]; then
  # Sprint Ready 컬럼의 Issue 목록 (JSON)
  BOARD_READY=$(bash scripts/board/board-list.sh --column "Sprint Ready" 2>/dev/null || echo "[]")
  # Backlog 컬럼도 선택적으로 수집 (triage 대상)
  BOARD_BACKLOG=$(bash scripts/board/board-list.sh --column "Backlog" 2>/dev/null || echo "[]")
fi
```

`BOARD_READY` 항목은 SPEC.md F-items와 교차 매칭해 중복 제거한 뒤 Step 4(Sprint 그룹화)에 투입한다.

### 1c. Marker.io 피드백

```bash
gh issue list --label "visual-feedback" --state open --json number,title,body,createdAt
```

### 1d. 현황 출력

```
## 📋 작업 현황

| 구분 | 건수 | 상세 |
|------|------|------|
| 🔧 진행중 F-items | N | F493, F497, ... |
| 📋 계획됨 F-items | N | F432(P0), F433(P0), ... |
| GitHub Issues (open) | N | in_progress N, planned N, 미분류 N |
| Marker.io 피드백 | N | #383, #385, #386 |
| **총 미완료** | **N건** | |
```

> `status` 서브커맨드는 여기서 종료.

---

## Step 2: Marker.io 피드백 → 요구사항 등록

`visual-feedback` 라벨이 붙은 GitHub Issues를 검토하여 요구사항으로 전환한다.

### 2a. 피드백 분석

각 Marker.io Issue에 대해:

1. Issue 제목/본문을 읽어 **작업 유형** 분류:
   - **Bug**: 기존 기능의 오류 → `Bug` 유형 REQ
   - **Enhancement**: 기존 기능 개선 → `Improvement` 유형 REQ
   - **Feature**: 새 기능 요청 → `Feature` 유형 REQ
   - **Skip**: 이미 해결됨/중복/해당없음 → 건너뜀

2. **우선순위** 판단:
   - 프로덕션 장애 → P0
   - 사용자 워크플로우 차단 → P1
   - UX 개선 → P2
   - nice-to-have → P3

### 2b. 사용자 검토

AskUserQuestion으로 분석 결과를 제시한다:

```
각 Marker.io 피드백에 대해 요구사항 등록 여부를 확인합니다:

| # | Issue | 분석 | 유형 | 우선순위 | 등록? |
|---|-------|------|------|---------|------|
| 1 | #386 API409 에러 | step 2-1에서 API 에러 | Bug | P1 | ✅ |
| 2 | #385 사업계획서 새 창 | 카드 클릭 시 표시 오류 | Bug | P2 | ✅ |
| 3 | #383 PRD 편집 기능 | 새 기능 요청 | Feature | P2 | ✅ |

확인해주세요 — 수정할 항목이 있으면 알려주세요.
```

### 2c. 요구사항 등록 실행

승인된 항목에 대해:

1. SPEC.md §5에서 다음 REQ 번호 산출:
   ```bash
   grep -oP 'FX-REQ-\d+' SPEC.md | sort -t'-' -k3 -n | tail -1
   ```

2. 각 항목을 FX-REQ-NNN으로 등록:
   - SPEC.md §5 Feature 테이블에 행 추가 (📋 상태)
   - F번호 산출: 기존 최대 F번호 + 1
   - GitHub Issue에 REQ 번호 코멘트 추가

> `feedback` 서브커맨드는 여기서 종료 (Step 2까지만).

---

## Step 3: 요구사항 검토 → F-item 확정

Step 2에서 등록한 REQ + 기존 📋 F-items를 검토하여 작업 대상을 확정한다.

### 3a. F-item 목록 통합

모든 📋 상태 F-items를 우선순위 순으로 정렬:

| 순위 | F-item | 설명 | 우선순위 | 출처 |
|------|--------|------|---------|------|
| 1 | F432 | Sprint Pipeline 종단 자동화 | P0 | 기존 |
| 2 | F433 | Sprint Monitor 고도화 | P0 | 기존 |
| 3 | FNEW | API409 에러 수정 | P1 | Marker.io #386 |
| ... | | | | |

### 3b. 작업 대상 선정

AskUserQuestion으로 확인:
- 이번 세션/기간에 작업할 F-items 선택
- 이미 🔧인 항목은 자동 포함
- P0은 기본 포함 (opt-out 가능)

---

## Step 4: Sprint 그룹화

확정된 F-items를 Sprint 단위로 묶는다.

### 4a. 그룹화 기준

1. **기능 연관성**: 같은 도메인/모듈을 수정하는 F-items → 같은 Sprint
2. **작업 크기**: Sprint 1개 = F-item 2~4개 (적정 크기)
3. **의존성**: 선행 관계가 있는 F-items는 앞 Sprint에 배치
4. **D1 migration 충돌**: 같은 테이블 수정하는 F-items → 같은 Sprint (또는 순차)
5. **변경 영역 충돌**: 같은 파일을 수정하는 F-items → 같은 Sprint (merge 충돌 방지)

### 4b. Sprint 번호 배정

```bash
# 현재 최대 Sprint 번호
grep -oP 'Sprint \d+' SPEC.md | grep -oP '\d+' | sort -n | tail -1
```

다음 번호부터 순차 배정.

### 4c. Sprint 계획 출력

```
## Sprint 그룹화

| Sprint | F-items | 설명 | 예상 규모 |
|--------|---------|------|----------|
| Sprint 243 | F432 + F433 | Pipeline + Monitor 고도화 | 중 (P0×2) |
| Sprint 244 | FNEW(#386) + FNEW(#385) | Marker.io 버그 수정 2건 | 소 |
| Sprint 245 | FNEW(#383) | PRD 편집 기능 | 중 |
```

---

## Step 5: 병렬/순차 분류

Sprint 간 의존성을 분석하여 실행 형태를 결정한다.

### 5a. 의존성 분석

각 Sprint 쌍에 대해 충돌 검사:

| 충돌 유형 | 검사 방법 | 결과 |
|-----------|----------|------|
| **파일 충돌** | F-items의 수정 예상 파일이 겹치는가 | 겹치면 순차 |
| **D1 migration** | 두 Sprint 모두 migration 추가하는가 | 둘 다 추가하면 순차 |
| **모듈 의존** | Sprint A의 산출물을 Sprint B가 import하는가 | 의존하면 순차 |
| **독립** | 위 3가지 모두 해당 없음 | 병렬 가능 |

### 5b. 분류 판단 로직

```
Sprint 간 관계:
- 파일 충돌 없음 + D1 충돌 없음 + 모듈 의존 없음 → ✅ 병렬
- 위 중 하나라도 해당 → ⚠️ 순차

추가 규칙:
- 동시 3개 Sprint까지만 병렬 (리소스 제약)
- D1 migration이 있는 Sprint는 merge 순서 고정 (번호 오름차순)
- shared/ 패키지 수정하는 Sprint는 먼저 merge
```

### 5c. 실행 형태 출력

```
## 실행 형태

| Sprint | 의존 | 형태 | Batch | 사유 |
|--------|------|------|-------|------|
| Sprint 243 | 없음 | 병렬 | Batch 1 | 독립 모듈 |
| Sprint 244 | 없음 | 병렬 | Batch 1 | 독립 버그 수정 |
| Sprint 245 | Sprint 244 | 순차 | Batch 2 | #383이 #385 수정 영역 참조 |
```

---

## Step 6: Pipeline 구성

Sprint들을 sprint-pipeline 형태로 최종 구성한다.

### 6a. Pipeline 계획 생성

```
## 🚀 Sprint Pipeline 계획

### 의존성 그래프
Sprint 243 (독립) ──┐
Sprint 244 (독립) ──┤── Batch 1 (병렬)
                    │
Sprint 245 ─────────┘── Batch 2 (순차, Sprint 244 완료 후)

### 배치 구성
| Batch | Sprint | F-items | 실행 | Plan | Design |
|-------|--------|---------|:----:|:----:|:------:|
| 1 | 243, 244 | F432+F433, FNEW×2 | 2 병렬 | 📋 | 📋 |
| 2 | 245 | FNEW×1 | 1 순차 | 📋 | 📋 |

### 실행 명령
Batch 1: `/ax:sprint-pipeline 243 244`
Batch 2: `/ax:sprint-pipeline 245`

### 사전 준비
- [ ] Sprint 243 Plan/Design 문서 작성
- [ ] Sprint 244 Plan/Design 문서 작성
- [ ] Sprint 245 Plan/Design 문서 작성
- [ ] SPEC.md F-item 등록 + 커밋 + push (WT 생성 전 필수)
```

### 6b. SPEC.md 업데이트

AskUserQuestion으로 최종 확인 후:

1. SPEC.md §5에 신규 F-items 등록 (📋 상태)
2. SPEC.md §6에 Sprint Execution Plan 섹션 추가
3. 커밋 + push (WT 생성을 위한 사전 조건)

### 6c. 실행 연동

계획 완료 후 AskUserQuestion으로 즉시 실행 여부를 확인한다:

```
## ✅ 계획 완료

Pipeline이 구성됐어요. 바로 실행할까요?

1. 지금 바로 Batch 1 실행 (Recommended)
   → SPEC 등록 커밋 + `/ax:sprint-pipeline 243 244` 자동 실행
2. 계획만 확인 — 나중에 수동 실행
   → SPEC 등록 커밋까지만. 실행은 사용자가 직접.
3. 단일 Sprint만 먼저 실행
   → `/ax:sprint 243` 하나만 즉시 시작
```

**옵션 1 선택 시 자동 실행 흐름:**
1. SPEC.md F-item 등록 → 커밋 → push (사전 조건)
2. Skill 도구로 `/ax:sprint-pipeline {번호들}` 자동 호출
3. sprint-pipeline이 WT 생성 → autopilot 주입 → merge-monitor 감시까지 자동 진행

> 💡 단일 Sprint만 있으면 `/ax:sprint N`으로 직접 연결한다.

---

## Gotchas

- SPEC.md F-item 등록 → 커밋 → push → WT 생성 순서 필수 (SDD Triangle 원칙)
- 병렬 Sprint는 동시 3개 제한 (development-workflow 규칙)
- D1 migration 있는 Sprint는 merge 순서 = Sprint 번호 오름차순
- shared/ 수정 Sprint는 다른 Sprint보다 먼저 merge
- `WEBHOOK_SECRET` 없으면 Marker.io API 호출 건너뜀 → GitHub Issues fallback
- 이 스킬의 Step 1(status)은 읽기 전용, Step 2~6은 SPEC.md를 수정함
