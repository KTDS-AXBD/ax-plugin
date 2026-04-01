# 프로젝트 관리 표준

> 범용 표준 — 모든 프로젝트에 공통 적용

## 1. 작업 주기

### 세션 단위 운영

Claude Code 세션 1회 = 작업 1단위. 별도 스프린트 체계를 두지 않는다.

| 구분 | 내용 |
|------|------|
| 시작 | `/ax-session-start` — MEMORY.md 로딩 + SPEC.md 보충 읽기 + REQ/TD 정합성 점검 |
| 종료 | `/ax-session-end` — 커밋 + push + CI/CD + SPEC/MEMORY/CHANGELOG 동기화 + REQ 일괄 갱신 |
| 기록 | CHANGELOG.md — 세션별 변경 이력 |

### 세션 내 작업 흐름

```
작업 선택 → 구현 → 검증(DoD) → 커밋 → 문서 갱신
```

- 1세션에 1~3개 요구사항 처리 목표
- 세션 시작 시 MEMORY.md "다음 작업"에서 우선순위 확인

## 2. 마일스톤

### SemVer Minor = 마일스톤

- `v0.5.0` → `v0.6.0`: 마일스톤 1개 완료
- 마일스톤 완료 시 `git tag -a v{version}` 생성
- Patch 버전(`v0.5.1`)은 마일스톤 내 소규모 수정

### 마일스톤 구성

| 요소 | 설명 |
|------|------|
| 목표 | 마일스톤이 달성해야 할 것 (1~2문장) |
| 포함 요구사항 | PLANNED 상태인 F항목 목록 |
| 완료 기준 | 모든 포함 요구사항이 DONE + DoD 충족 |

## 3. 완료 기준 (Definition of Done)

### 전체 파이프라인

모든 요구사항은 DONE 전에 다음을 충족해야 한다:

| 단계 | 명령 | 기준 |
|------|------|------|
| 1. 타입 체크 | `pnpm typecheck` | 에러 0개 |
| 2. 린트 | `pnpm lint` | 에러 0개 |
| 3. 빌드 | `pnpm build` | 성공 (build/client/assets/ + build/server/index.js) |
| 4. 테스트 | `pnpm test` | 관련 테스트 전체 통과 |
| 5. 배포 확인 | CI/CD 또는 `/deploy --preview` | 프리뷰/프로덕션 정상 동작 |
| 6. 문서 반영 | SPEC.md + CHANGELOG.md | 변경사항 기록 완료 |

### 유형별 완화

| 유형 | 완화 가능 항목 |
|------|---------------|
| Bug (P0) | 5번(배포 확인) 후 6번(문서) 사후 반영 허용 |
| Chore | 4번(테스트) 해당 없으면 스킵 가능 |
| docs: | 1~5번 스킵, 6번만 필수 |

## 4. 의사결정 기록

### 저장 위치

| 위치 | 용도 |
|------|------|
| MEMORY.md | 활성 결정사항 — 세션 간 유지 필요한 핵심 결정 |
| CHANGELOG.md | 세션 이력 — 언제 무엇을 했는지 |
| SPEC.md "활성 결정사항" | 프로젝트 수준 결정 — 기술 스택, 운영 정책 |

### 기록 원칙

- 결정 시 **맥락 + 선택지 + 선택 이유**를 간결히 기록
- 번복 시 이전 결정을 삭제하지 않고 "변경됨" 표기 후 새 결정 추가
- MEMORY.md는 200줄 이내 유지 — 오래된 결정은 SPEC.md로 이관

## 5. 회고

### 마일스톤 회고

SemVer Minor 태그 시점에 회고를 수행한다.

#### 회고 항목

| 항목 | 질문 |
|------|------|
| 잘된 점 | 이번 마일스톤에서 효과적이었던 것은? |
| 개선점 | 비효율적이거나 반복된 문제는? |
| 지표 변화 | 코드/테스트/라우트 수 변화 |
| 결정 검증 | 이전 결정이 유효한지, 번복할 것은? |
| 다음 목표 | 다음 마일스톤 방향 |

#### 기록 위치

- CHANGELOG.md에 `## 마일스톤 회고: v{version}` 섹션 추가
- 핵심 교훈은 MEMORY.md에 반영

### 세션 종료 시

`/ax-session-end`의 기존 동작(커밋 + CHANGELOG 기록)이 일상적 회고를 대체한다.
별도 회고 절차 없이 CHANGELOG 세션 기록이 회고 역할.

## 6. SPEC↔MEMORY 동기화

### 역할 정의

| 파일 | 역할 | 갱신 주체 |
|------|------|-----------|
| **SPEC.md** | 상태 전환의 권위 소스 (SSOT). 요구사항, Tech Debt, 실행 계획, 지표의 공식 기록 | `/ax-session-end` Phase 2 + 수동 보정 |
| **MEMORY.md** | 빠른 컨텍스트 복원용 캐시. 세션 간 핵심 정보만 슬라이딩 윈도우로 유지 (200줄 이내) | `/ax-session-end` Phase 4 + 수동 보정 |

**원칙: SPEC.md가 정(正), MEMORY.md가 부(副)**
- 불일치 시 SPEC.md를 기준으로 MEMORY.md를 갱신한다
- 단, MEMORY.md에만 반영된 해소/완료 정보가 있으면 SPEC.md로 역전파한다

### 동기화 시점

| 시점 | 방법 | 커버리지 |
|------|------|----------|
| **세션 종료** (자동) | `/ax-session-end` Phase 2 + 4 | 코드 변경을 동반한 작업 ✅ |
| **수동 운영 후** (수동) | SPEC.md §5 직접 갱신 | 코드 변경 없는 데이터 운영 ⚠️ |
| **주기적 점검** (권장) | 세션 시작 시 `/ax-session-start` step 2b | 누적 drift 감지 ✅ |

### 수동 운영 drift 패턴 (주의)

코드 변경 없이 데이터만 바뀌는 운영 작업은 `/ax-session-end`의 자동 갱신에 잡히지 않는다.
아래 패턴에서 SPEC.md §5 수동 갱신이 필요하다:

| 패턴 | 예시 | 영향 |
|------|------|------|
| **Production 벌크 작업** | `batch-approve.sh`로 정책 N건 승인 | policies/skills 수치 변경 |
| **DB 직접 조작** | `wrangler d1 execute --command "UPDATE ..."` | 상태 전환 미반영 |
| **Neo4j backfill** | 외부 스크립트로 그래프 동기화 | ontology 수치 변경 |
| **KV/R2 직접 조작** | `wrangler kv:key put`, `r2 object put` | 캐시/스토리지 상태 변경 |
| **시크릿 변경** | `wrangler secret put` | 환경 구성 변경 |

### 주기적 점검 규칙

**빈도**: 5세션마다 1회, 또는 수동 운영 작업 후 즉시

**점검 항목:**
1. **수치 일치**: SPEC.md §5 지표 vs MEMORY.md "주요 지표" — policies, skills, tests, documents 수
2. **상태 일치**: SPEC.md §5 항목별 상태 (✅/🔧/📋) vs MEMORY.md "다음 작업" (✅/🔧/미표기)
3. **리스크 일치**: SPEC.md §8 활성 TD vs MEMORY.md "활성 리스크" — 해소된 항목의 양쪽 반영 여부
4. **Phase 명칭**: SPEC.md §1/§5, MEMORY.md, CLAUDE.md 간 Current Phase 표기 통일
5. **REQ 완전성**: SPEC.md §7 TRIAGED 이상 항목이 모두 MEMORY.md "다음 작업"에 존재하는지
