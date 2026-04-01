# 요구사항 관리 표준

> 범용 표준 — 모든 프로젝트에 공통 적용

## 1. 범위

모든 작업 항목을 통합 관리한다:
- PRD/SPEC In-scope 항목
- 앱 내 feature_requests (팀원 등록)
- 세션 중 발견된 작업/버그
- AI Agent 자동 감지 항목

### 등록 주체

| 주체 | 채널 | 예시 |
|------|------|------|
| 팀원 | 앱 내 UI | 기능 요청, 버그 리포트 |
| 개발자 | SPEC.md / 세션 | F항목 추가, 버그 발견 |
| AI Agent | 세션/코드 분석 | 기술부채 감지, 패턴 개선 제안 |

## 2. 분류 체계

### 2축 교차 분류: 유형 x 도메인

**유형 (Type)**

| 유형 | 설명 | 커밋 접두사 |
|------|------|------------|
| Feature | 새로운 기능 | `feat:` |
| Bug | 오류/결함 수정 | `fix:` |
| Improvement | 기존 기능 개선/리팩토링 | `refactor:` |
| Chore | 인프라/설정/문서 | `chore:` / `docs:` |

**도메인 (Domain)** — 프로젝트별 정의

예시: Discovery / Ideas / Proposals / Lab / Agent / Infra

### 표기

요구사항 제목에 `[유형/도메인]` 접두사 권장:
```
[Feature/Ideas] 아이디어 멀티소스 분석 기능
[Bug/Agent] SSE 스트리밍 타임아웃 오류
```

## 3. 우선순위

### 영향도 x 긴급도 매트릭스

|  | 긴급 높음 | 긴급 낮음 |
|--|----------|----------|
| **영향 높음** | **P0** — 즉시 처리 | **P1** — 이번 마일스톤 |
| **영향 낮음** | **P2** — 다음 마일스톤 | **P3** — 백로그 |

### 판단 기준

**영향도 (Impact)**
- 높음: 핵심 워크플로우 차단, 데이터 손실 위험, 다수 사용자 영향
- 낮음: 편의 기능, 단일 사용자, 우회 방법 존재

**긴급도 (Urgency)**
- 높음: 프로덕션 장애, 데드라인 임박, 블로커 의존성
- 낮음: 개선 사항, 기한 없음, 독립 작업

## 4. 상태 흐름

```
OPEN → TRIAGED → PLANNED → DESIGNED → IN_PROGRESS → REVIEW → DONE
                                                           ↘ REJECTED
```

| 상태 | 의미 | 책임 |
|------|------|------|
| OPEN | 등록됨, 미분류 | 등록자 |
| TRIAGED | 유형/도메인/우선순위 배정 완료 | 개발자 |
| PLANNED | 마일스톤에 배치됨 | 개발자 |
| DESIGNED | 설계 문서 작성됨 (필요 시) | 개발자 |
| IN_PROGRESS | 구현 진행 중 | 개발자 |
| REVIEW | 구현 완료, 검증 중 | 개발자 |
| DONE | 검증 완료, 배포됨 | 개발자 |
| REJECTED | 범위 밖 또는 불필요 판정 | 개발자 |

### 전환 규칙

- OPEN → TRIAGED: 유형 + 도메인 + 우선순위 필수
- PLANNED → DESIGNED: P0/P1 Feature는 설계 문서 권장 (Improvement/Chore는 스킵 가능)
- IN_PROGRESS → REVIEW: DoD 기본 항목 충족 필수
- REVIEW → DONE: DoD 전체 파이프라인 충족 필수
- 어느 단계에서든 → REJECTED: 사유 기록 필수

## 5. SPEC 연동

SPEC.md가 요구사항의 상위 문서이다.

### 흐름

```
요구사항 등록 (OPEN)
  → TRIAGED + PLANNED
  → SPEC.md "미래 작업" F항목에 반영
  → 구현 완료 시 SPEC.md "완료 요약"으로 이동
```

### 규칙

- 요구사항은 SPEC으로 흐르는 **입력원**이다
- SPEC.md의 F항목 번호가 요구사항의 공식 식별자 역할
- 요구사항 DONE 시 SPEC.md 상태를 함께 갱신
- AI Agent 자동 감지 항목도 동일 흐름 적용

### Execution Plan ↔ REQ 동기화

SPEC.md의 Execution Plan(실행 계획) 체크박스는 Requirements Backlog와 1:1 대응시킨다.

**규칙:**
1. Execution Plan의 미완료 항목(`[ ]`)에 대응하는 REQ가 있으면 `(REQ-ID 상태)` 주석 추가
2. REQ가 DONE인데 체크박스가 `[ ]`이면 `[x]`로 동기화
3. REQ가 REJECTED이면 체크박스를 `[x] ~~취소선~~`으로 표기 + 사유 주석
4. 마일스톤/스프린트 완료 시 해당 성과를 독립 REQ로 소급 등록 (DONE 상태, 세션 범위 기록)

**점검 시점:**
- 세션 시작 (`/ax-session-start`) 시 불일치 자동 감지
- 세션 종료 (`/ax-session-end`) 시 완료 항목 REQ 상태 일괄 갱신

### 완료 항목 소급 등록

큰 마일스톤(Phase, Sprint)이 완료되었으나 개별 REQ가 없는 경우:
- 해당 성과를 REQ로 소급 등록한다 (상태: DONE)
- 제목에 완료 세션 범위를 `(세션 NNN~MMM)` 형식으로 기록
- 보고서 작성 시 근거 자료로 활용 가능하도록 성과 수치를 제목에 포함

## 6. 요구사항 ID 체계

### 포맷: `{PROJECT}-REQ-{NNN}`

- 프로젝트 약어 + REQ + 일련번호
- 예시: `DX-REQ-031`, `RW-REQ-001`
- SPEC.md F항목과 매핑: `DX-REQ-031 → F31`

### 앱 내 feature_requests와의 관계

- 앱 내 등록 시 DB auto-increment ID 사용
- TRIAGED 단계에서 `{PROJECT}-REQ-{NNN}` 공식 ID 부여
- REJECTED된 항목도 결번 허용 (재사용 금지)

### REQ 선행 등록 원칙

작업 착수 전에 반드시 `/ax-req-manage new`로 SPEC.md + DB + Issue를 먼저 등록한다.

**올바른 순서**: `/ax-req-manage new` (등록) → 작업 → `/ax-session-end` (DONE 전환)
**금지 패턴**: CHANGELOG에 REQ 코드 참조 후 SPEC.md 등록 누락 → 결번 drift

> **교훈 (DX S402)**: S344에서 DX-REQ-010을 CHANGELOG에 사용하고 작업도 완료했지만, SPEC.md F-item에 등록하지 않아 60세션간 결번으로 방치됨. 소급 등록으로 해소.
