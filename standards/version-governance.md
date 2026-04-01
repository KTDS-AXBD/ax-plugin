# 버전 관리 표준

> 범용 표준 — 모든 프로젝트에 공통 적용

## 1. 버전 체계: SemVer

### 포맷: `Major.Minor.Patch`

| 변경 수준 | 버전 증가 | 예시 |
|-----------|-----------|------|
| 호환성 깨지는 변경, 아키텍처 전환 | Major | `1.0.0` → `2.0.0` |
| 기능 추가, 의미 있는 개선 | Minor | `1.0.0` → `1.1.0` |
| 버그 수정, 사소한 수정 | Patch | `1.0.0` → `1.0.1` |

### 프로토타입 규칙 (0.x)

- `0.x.y`는 프로토타입/실험 단계. 언제든 Breaking Change 가능
- 정식 런칭 또는 안정화 시 `1.0.0`으로 전환
- `0.x` 단계에서는 Minor = 마일스톤, Patch = 버그/소규모 개선

## 2. 버전 동기화 포인트

### 단일 진실 원천 (Single Source of Truth)

```
package.json version  ←  SSOT (프로젝트 루트)
       ↕ 동기화
    Git tag (v{version})
       ↕ 참조
    문서 system-version
```

### 동기화 규칙

| 항목 | 규칙 |
|------|------|
| `package.json` | 항상 현재 버전 반영. `npm version` 또는 수동 편집 |
| Git 태그 | 마일스톤 완료 시 `v{version}` 태그. package.json과 일치 |
| 문서 `system-version` | 해당 문서가 유효한 시스템 버전 범위 |
| SPEC.md | 시스템 버전을 명시 (기능별 버전 마커 사용 금지) |
| MEMORY.md | 현재 버전 기록 |

## 3. 마일스톤 기반 태깅

### 태그 생성 시점

- 의미 있는 기능 묶음이 완성되고 프로덕션 배포된 후
- 매 배포마다 태그하지 않음 — 마일스톤 단위만
- 핫픽스는 Patch 버전으로 즉시 태그 가능

### 태그 절차

```bash
# 1. package.json 버전 업데이트
# 2. 커밋
git commit -am "chore: bump version to X.Y.Z"
# 3. 태그 생성
git tag -a vX.Y.Z -m "vX.Y.Z: [마일스톤 설명]"
# 4. 푸시
git push origin master --tags
```

## 4. 버전 일관성 검증

### 검증 항목

| # | 검증 | 조건 |
|---|------|------|
| 1 | package.json version 존재 | 필수 |
| 2 | 최신 git tag와 package.json 일치 | 태그 존재 시 |
| 3 | SPEC.md에 레거시 버전 마커 없음 | v숫자.숫자 패턴 검출 금지 |
| 4 | 문서 system-version이 현재 버전 범위 내 | SPEC/GUID/OPS |
| 5 | MEMORY.md 버전이 package.json과 일치 | 있으면 |

## 5. 금지 사항

- 기능 추가마다 버전 올리기 (세션 단위 버전 증가 금지)
- SPEC.md 본문에 `(v1.4)`, `(v6.2→v6.14)` 같은 인라인 버전 마커
- package.json과 git tag의 불일치 상태 방치
- CalVer, 내부 추적 번호 등 SemVer 외 체계 혼용

---

## 관련 표준

| 표준 | 관계 |
|------|------|
| GOV-014 의존성 | §5 버전 범위 — caret/tilde/exact와 SemVer 의미 연동 |
