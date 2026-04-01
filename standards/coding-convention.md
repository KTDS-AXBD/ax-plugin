# 코딩 컨벤션 표준

> 범용 표준 — 모든 프로젝트에 공통 적용

## 1. 네이밍

### 파일/디렉토리 명명

| 역할 | 케이스 | 예시 |
|------|--------|------|
| 컴포넌트 (UI) | PascalCase | `Button.tsx`, `StatusBadge.tsx` |
| 유틸/훅 | camelCase | `useAuth.ts`, `formatDate.ts` |
| 라우트/설정 | kebab-case | `discovery.$id.tsx`, `vite.config.ts` |
| 상수 | kebab-case 또는 역할명 | `constants.ts`, `status.ts` |
| 타입/인터페이스 | 역할명 | `types.ts` |
| 스키마 (DB) | 역할명 | `schema.ts` |
| 테스트 | 원본 + `.test` | `formatDate.test.ts` |

### 디렉토리 역할

- `components/` — 재사용 UI 컴포넌트
- `lib/` — 공유 유틸리티, 헬퍼, 외부 서비스 래퍼
- `routes/` — 라우팅 (프레임워크 규칙 따름)
- `features/` — 도메인별 모듈 (스키마, 타입, 서비스, UI 포함)
- `db/` — 데이터베이스 스키마, 연결, 마이그레이션

### 변수/함수 명명

| 대상 | 규칙 | 예시 |
|------|------|------|
| boolean | `is`/`has`/`can`/`should` 접두사 | `isActive`, `hasPermission` |
| 이벤트 핸들러 | `handle` + 동사 (내부), `on` + 동사 (props) | `handleClick`, `onSubmit` |
| 상수 | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| 타입/인터페이스 | PascalCase | `DiscoveryRow`, `UserSession` |
| 제네릭 | 의미 있는 이름 또는 `T` 접두사 | `TResult`, `TInput` |

### 도메인 용어

- 코드에서는 **영어 단일 용어** 사용
- 한국어 매핑은 프로젝트별 용어집(glossary)에서 관리
- 용어 변경 시 코드 전체 일괄 반영 (부분 혼용 금지)

## 2. 파일 구조

### import 정렬 (3그룹)

```
// 1) 외부 패키지
import { json } from "@remix-run/cloudflare";

// 2) 내부 모듈 (경로 별칭)
import { getDb } from "~/db";

// 3) 상대 경로
import { StatusBadge } from "./StatusBadge";
```

- 그룹 사이 빈 줄 1개
- 그룹 내 알파벳순 정렬
- `type` import는 같은 그룹 내 하단 배치

### 모듈 경계

- feature 모듈 간 직접 import 금지 → 공유 인터페이스(lib/) 경유
- barrel export(`index.ts`)는 feature 모듈 루트에만 허용
- 순환 참조(circular dependency) 금지

## 3. 코드 품질

### 함수 크기

- **50줄 권장**: 초과 시 분리 검토
- **100줄 경고**: 초과 시 반드시 분리
- React 컴포넌트도 동일 기준 적용 (JSX 포함)

### 에러 처리

- **표준 패턴**: try-catch + 커스텀 Error 클래스
- **계층화**: `AppError` (base) → `DomainError`, `ValidationError` 등 확장
- **바운더리 구분**:
  - API/외부 경계: try-catch로 잡아서 적절한 응답 반환
  - 내부 로직: 예외 전파 (불필요한 catch 금지)
  - UI: ErrorBoundary로 최상위 처리
- **에러 메시지**: 사용자용(한국어)과 개발자용(영어 로그) 분리

### 코멘트/JSDoc

- **최소주의**: "왜"만 설명. 코드로 자명한 것은 코멘트 금지
- **쓰는 경우**:
  - 비직관적인 비즈니스 로직의 이유
  - 해킹/워커라운드의 배경
  - public API 함수의 JSDoc (`@param`, `@returns`)
- **쓰지 않는 경우**:
  - 변수명/함수명으로 충분한 코드
  - 변경하지 않은 코드에 새 코멘트 추가
  - TODO → 이슈/요구사항으로 관리

## 4. AI 협업 규칙

### 기존 코드 존중

- 요청 범위 밖의 코드를 수정하지 않음
- 기존 프로젝트의 패턴/컨벤션을 우선 따름
- 리팩토링은 명시적 요청이 있을 때만

### 과도한 추상화 금지

- 1회성 로직에 헬퍼/유틸리티 생성 금지
- 미래 요구사항을 위한 설계 금지
- 유사한 코드 3줄이 조기 추상화보다 나음

### 변경 범위 제한

- 요청된 작업에 필요한 최소한의 변경만
- 주변 코드 정리, 타입 추가, 코멘트 추가 등 부수적 변경 금지
- 사용하지 않는 코드는 주석 처리 대신 완전 삭제

### 테스트 동반 작성

- 새 기능 구현 시 관련 테스트도 함께 작성
- 버그 수정 시 재발 방지 테스트 추가
- 테스트 없이 구현만 하는 경우 사유 명시

## 5. 자동화

### 권장 도구

| 도구 | 역할 |
|------|------|
| ESLint | 코드 품질 + import 정렬 규칙 |
| Prettier | 코드 포맷팅 (일관된 스타일) |
| TypeScript strict mode | 타입 안전성 |

### 공통 룰셋

- 프로젝트 간 공유 가능한 ESLint shared config 권장
- 최소 규칙: `no-unused-vars`, `no-explicit-any`, `import/order`
- 프로젝트별 추가 규칙은 각 프로젝트 설정에서 확장

### 검증 시점

- 코드 작성 후: `lint` + `typecheck`
- 커밋 전: pre-commit hook (선택)
- CI: 빌드 파이프라인에 lint/typecheck 포함

---

## 관련 표준

| 표준 | 관계 |
|------|------|
| GOV-011 테스트/QA | §6 AI 협업 — 테스트 동반 작성 규칙의 상세 기준 |
| GOV-012 성능 | §3 금지 패턴 — N+1 쿼리, 동기 블로킹 등 성능 안티패턴 |
