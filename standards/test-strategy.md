# 테스트/QA 전략 표준

> 범용 표준 — 모든 프로젝트에 공통 적용

## 1. 테스트 피라미드

### 3계층 구조

```
        /  E2E  \        ~10%  핵심 사용자 시나리오
       /----------\
      / Integration \    ~30%  API 경계, DB 연동
     /----------------\
    /      Unit        \ ~60%  비즈니스 로직, 유틸
```

| 계층 | 대상 | 속도 | 예시 |
|------|------|------|------|
| Unit | 순수 함수, 유틸, 상태 로직, 도메인 규칙 | 빠름 | `validateTransition.test.ts` |
| Integration | API 라우트, DB 쿼리, 서비스 계층 | 보통 | `api.discovery.test.ts` |
| E2E | 핵심 사용자 플로우 (생성→수정→완료) | 느림 | `discovery-flow.test.ts` |

### 비율 가이드

- 비율은 방향성이지 절대 기준이 아님
- 프로젝트 초기에는 unit 비중이 높고, 성숙기에 e2e 비중 증가

## 2. 커버리지

### 비즈니스 로직 중심

- **필수**: service, lib, 도메인 규칙, 유틸리티 — 테스트 없으면 불완전
- **권장**: API 라우트(loader/action), DB 쿼리
- **선택**: UI 컴포넌트, 라우트 렌더링, 스타일
- 숫자 목표(%)보다 핵심 비즈니스 로직의 테스트 존재 여부가 중요

## 3. 테스트 작성 시점

### TDD (테스트 먼저)

```
Red → Green → Refactor

1. 실패하는 테스트 작성 (Red)
2. 테스트를 통과하는 최소 구현 (Green)
3. 코드 정리 (Refactor)
```

- 새 기능: 테스트를 먼저 작성하고 구현으로 통과시킴
- 버그 수정: 재현 테스트를 먼저 작성하고 수정으로 통과시킴
- 리팩토링: 기존 테스트가 통과하는 상태에서 코드 변경

## 4. 파일 배치

### co-located + 계층별 분리

```
app/
  lib/
    auth.ts
    auth.test.ts              # unit (co-located)
  features/
    discovery/
      service.ts
      service.test.ts         # unit (co-located)
tests/
  integration/                # 통합 테스트
    api.discovery.test.ts
  e2e/                        # E2E 테스트
    discovery-flow.test.ts
  helpers/                    # 테스트 유틸리티
    db.ts
    fixtures.ts
```

- **Unit**: 원본 파일 옆에 `.test.ts` 배치
- **Integration**: `tests/integration/` 디렉토리
- **E2E**: `tests/e2e/` 디렉토리
- **Helpers**: `tests/helpers/` — 공유 유틸, fixture, factory

## 5. 작성 규칙

### 테스트 명명 (한국어 서술형)

```typescript
describe("상태 전환", () => {
  it("DISCOVERY에서 IDEA_CARD로 전환할 수 있다", () => {
    // ...
  });

  it("허용되지 않은 전환은 에러를 던진다", () => {
    // ...
  });
});
```

- `describe`: 테스트 대상 (기능/모듈명)
- `it`: "~할 수 있다", "~해야 한다", "~를 던진다" 등 서술형
- 도메인 용어는 코드와 동일한 영어 사용 (예: DISCOVERY, IDEA_CARD)

### 모킹/스터빙

- **원칙**: 외부 의존성만 모킹 (DB, API, 외부 서비스)
- **내부 로직**: 가능한 한 실제 코드 사용. 내부 함수 모킹 최소화
- **DB 테스트**: 테스트용 인메모리 DB 또는 테스트 전용 DB 사용
- **API 테스트**: MSW 등 네트워크 레벨 모킹 권장

### 테스트 독립성

- 각 테스트는 **독립적으로 실행** 가능해야 함
- 테스트 간 순서 의존 금지
- 테스트 간 상태 공유 금지
- `beforeEach`에서 상태 초기화, `afterEach`에서 정리

### 테스트 데이터

- **Factory 패턴**: `createTestDiscovery()` 등 팩토리 함수로 테스트 데이터 생성
- **Fixture**: 정적 테스트 데이터는 `tests/helpers/fixtures.ts`에 모아서 관리
- **DB 초기화**: 테스트 시작 시 깨끗한 상태 보장. 테스트 간 데이터 누수 방지

## 6. AI 협업

### 항상 테스트 포함

- AI에게 기능 구현 요청 시, 관련 테스트도 함께 작성하도록 기본 규칙
- 테스트 없이 구현만 전달하는 경우 사유 명시
- 코딩 컨벤션 표준의 "테스트 동반 작성" 규칙과 동일

### AI 테스트 작성 가이드

- 해피 패스 + 에러 케이스 최소 1개씩 포함
- 경계값(boundary) 테스트 포함 권장
- 기존 테스트 패턴/스타일을 따름

## 7. 검증 시점

### 커밋 전 로컬 검증

```bash
# 커밋 전 필수 검증 순서
typecheck → lint → test
```

- 모든 테스트 통과 후 커밋
- 실패하는 테스트를 커밋하지 않음 (skip/todo 처리 후 이유 명시)
- CI 통합은 프로젝트별로 선택적 적용

---

## 관련 표준

| 표준 | 관계 |
|------|------|
| GOV-006 코드 품질 | §4 테스트 동반 작성 — 새 기능/버그 수정 시 테스트 필수 |
| GOV-009 CI/CD | §1 빌드 파이프라인 — typecheck→lint→**test**→build 순서 |
| GOV-013 모니터링 | §2 에러 추적 — 테스트 실패 시 심각도 분류 기준 참조 |
