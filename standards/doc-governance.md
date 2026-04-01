# 문서 관리 표준

> 범용 표준 — 모든 프로젝트에 공통 적용

## 1. 문서코드

### 포맷: `{PROJECT}-{TYPE}-{NNN}`

| 요소 | 규칙 | 예시 |
|------|------|------|
| `PROJECT` | 프로젝트 약어 (2~4자, 대문자) | DX, RW, AX |
| `TYPE` | 문서 유형 코드 | SPEC, PLAN, DSGN |
| `NNN` | 유형별 일련번호 (001부터) | 001, 002 |

### 문서 유형 코드

| 코드 | 의미 | 대상 |
|------|------|------|
| `SPEC` | 사양 | PRD, 기획서, 요구사항, 프레임워크 명세 |
| `PLAN` | 계획 | 피처 계획, 작업 계획, 로드맵 |
| `DSGN` | 설계 | 피처 설계, 아키텍처 결정, 기술 전략 |
| `ANLS` | 분석 | 갭 분석, 코드 분석, 진단 보고 |
| `RPRT` | 보고 | 완료 보고서, 결과 보고 |
| `GUID` | 가이드 | 사용자 매뉴얼, 운영 런북, QA 체크리스트 |
| `OPS` | 운영 | Cron 관리, 인프라 설정, 배포 가이드 |

### 부여 규칙

- 유형별 독립 채번 (SPEC-001과 PLAN-001은 별개)
- 한 번 부여된 코드는 변경/재사용하지 않음 (결번 허용)

## 2. 파일명

### 포맷: `{PROJECT}-{TYPE}-{NNN}_{설명}.md`

- 설명은 kebab-case (소문자 + 하이픈)
- 예시: `DX-DSGN-003_msa-refactoring-plan.md`
- 금지: PascalCase, UPPER_CASE, 한국어, 공백

## 3. 메타데이터 (YAML Frontmatter)

모든 문서 상단에 YAML frontmatter 기록:

```yaml
---
code: DX-GUID-001
title: 사용자 가이드
version: 2.1
status: Active
category: GUID
tags: [user, onboarding]
created: 2026-02-20
updated: 2026-03-07
author: Sinclair Seo
system-version: ">=6.27"
related: [DX-SPEC-001]
---
```

### 필수 필드

| 필드 | 설명 |
|------|------|
| `code` | 문서코드 |
| `title` | 문서 제목 |
| `version` | 문서 버전 (Major.Minor) |
| `status` | Draft / Active / Archived / Superseded |
| `category` | 유형 코드 |
| `created` | 작성일 (yyyy-mm-dd) |
| `updated` | 최종 수정일 |
| `author` | 작성자 |

### 선택 필드

| 필드 | 설명 |
|------|------|
| `system-version` | 유효한 시스템 버전 |
| `tags` | 교차 분류 태그 |
| `related` | 관련 문서코드 목록 |
| `supersedes` | 이 문서가 대체하는 구 문서 |
| `superseded-by` | 이 문서를 대체한 신 문서 |

## 4. 문서 버전 관리

### 버전 포맷: `{Major}.{Minor}`

| 변경 수준 | 버전 증가 |
|-----------|-----------|
| 구조/범위 변경, 전면 재작성 | Major +1 (`1.0` → `2.0`) |
| 내용 보강, 부분 수정, 오류 정정 | Minor +1 (`2.0` → `2.1`) |

### 대체 규칙

- Major 변경: 새 문서코드 발급, 구 문서에 `superseded-by` 기록
- Minor 변경: 같은 코드 유지, `version`과 `updated`만 갱신
- `supersedes` / `superseded-by`는 항상 쌍으로 관리

### 변경 이력

문서 내에 변경 이력 섹션 유지:

```markdown
## 변경 이력
| 버전 | 날짜 | 변경 내용 |
|------|------|-----------|
| 2.1 | 2026-03-07 | 온톨로지 섹션 추가 |
| 2.0 | 2026-03-01 | 전면 개정 |
```

## 5. 시스템 버전 연동

문서 버전(Major.Minor)과 시스템 버전(SemVer)은 별도 체계. `system-version` 필드로 연동.

### 연동 수준 (유형별)

| 유형 | `system-version` | 이유 |
|------|:-----------------:|------|
| SPEC, GUID, OPS | 필수 | 시스템과 일치해야 유효 |
| DSGN | 선택 | 미래 피처는 불필요할 수 있음 |
| PLAN, ANLS, RPRT | 불필요 | 시점 산출물 — `created`로 충분 |

### 표기 방식

| 표기 | 의미 |
|------|------|
| `"6.29"` | 특정 버전 |
| `">=6.27"` | 이 버전 이상에서 유효 |
| `"6.20~6.29"` | 범위 지정 |

### 점검

시스템 Major 업데이트 시 `grep -r 'system-version:' docs/`로 연동 문서 일괄 점검.

## 6. 문서 간 참조 (Wikilink)

본문에서 `[[문서코드]]` 형식으로 상호 참조:

```markdown
이 설계는 [[DX-SPEC-004]]를 기반으로 한다.
```

- `grep -r '\[\[DX-SPEC-004\]\]' docs/` → 역참조 추적

## 7. 상태 & 수명주기

| 상태 | 의미 | 위치 |
|------|------|------|
| Draft | 작성 중 | 해당 폴더 |
| Active | 확정·유효 | 해당 폴더 |
| Archived | 완료/폐기 | archive/ |
| Superseded | 대체됨 | archive/superseded/ |

### 아카이브 기준

- PDCA 완료 → `archive/{yyyy-mm}/{feature}/`
- 버전 대체 → 구 버전 `archive/superseded/`
- 6개월 이상 미갱신 Draft → 검토 후 archive 또는 삭제

## 8. 폴더 구조

```
docs/
├── specs/         # SPEC
├── 01-plan/       # PLAN
├── 02-design/     # DSGN
├── 03-analysis/   # ANLS
├── 04-report/     # RPRT
├── guides/        # GUID
├── ops/           # OPS
├── archive/       # 보관
├── assets/        # 비-Markdown 원본
├── CHANGELOG.md   # 변경 이력
└── INDEX.md       # 문서 인덱스
```

### 폴더 규칙

1. **폴더 = 유형**: TYPE과 폴더가 1:1 대응
2. **플랫 구조**: 폴더 내 서브디렉토리 금지 (archive/ 제외)
3. **루트 제한**: `docs/` 루트에는 CHANGELOG.md, INDEX.md만 허용

## 9. INDEX.md

전체 문서 목록을 유형별로 관리. 문서 추가/이동/삭제 시 함께 갱신.
