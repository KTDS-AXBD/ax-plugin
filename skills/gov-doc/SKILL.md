---
name: gov-doc
description: |
  문서 관리 — 새 문서 생성, 인덱스 갱신, 버전 관리, 아카이브, 메타데이터 검증.
  GOV-001 문서 관리 표준 기반.
  Use when: 문서 생성, 인덱스 갱신, 아카이브, 문서 관리, doc management, INDEX.md
argument-hint: "[new|index|version|archive|check]"
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
---

# ax-09-doc — 문서 관리

GOV-001 문서 관리 표준에 따라 문서 생성, 인덱스, 버전, 아카이브, 검증을 수행한다.

## Arguments

`/ax-gov-doc [new|index|version|archive|check]`

- `new <TYPE>` — 새 문서 생성
- `index` — docs/INDEX.md 자동 갱신
- `version <코드> [major|minor]` — 문서 버전 범프
- `archive <코드>` — 문서 아카이브 처리
- `check` — frontmatter 필수 필드 검증

## Steps

### `/ax-gov-doc new <TYPE>` — 새 문서 생성

TYPE: SPEC / PLAN / DSGN / ANLS / RPRT / GUID / OPS

1. TYPE 유형별 폴더 매핑:
   | TYPE | 폴더 |
   |------|------|
   | SPEC | docs/specs/ |
   | PLAN | docs/01-plan/ |
   | DSGN | docs/02-design/ |
   | ANLS | docs/03-analysis/ |
   | RPRT | docs/04-report/ |
   | GUID | docs/guides/ |
   | OPS | docs/ops/ |

2. 프로젝트 약어를 SPEC.md 또는 CLAUDE.md에서 추출한다. 없으면 AskUserQuestion으로 확인한다.

3. 해당 TYPE 폴더에서 기존 문서코드의 마지막 번호를 Glob + Read로 확인하고, 다음 번호(NNN)를 부여한다.

4. AskUserQuestion으로 문서 제목과 kebab-case 설명을 입력받는다.

5. 파일을 생성한다:
   - 파일명: `{PROJECT}-{TYPE}-{NNN}_{설명}.md`
   - 내용:
     ```yaml
     ---
     code: {PROJECT}-{TYPE}-{NNN}
     title: {제목}
     version: 1.0
     status: Draft
     category: {TYPE}
     created: {today}
     updated: {today}
     author: $(git config user.name || echo "Unknown")
     ---

     # {제목}

     ## 변경 이력
     | 버전 | 날짜 | 변경 내용 |
     |------|------|-----------|
     | 1.0 | {today} | 초안 작성 |
     ```

6. docs/INDEX.md에 새 문서 항목을 Edit으로 추가한다.

7. 생성 결과를 출력한다.

### `/ax-gov-doc index` — INDEX.md 갱신

1. `docs/` 하위 모든 `.md` 파일을 Glob으로 수집한다 (CHANGELOG.md, INDEX.md, archive/ 제외).

2. 각 파일의 frontmatter를 Read로 읽어 code, title, version, status를 추출한다.

3. TYPE별로 그룹핑하여 docs/INDEX.md를 재생성한다:
   ```markdown
   # 문서 인덱스

   ## SPEC
   | 코드 | 제목 | 버전 | 상태 | 파일 |
   |------|------|:----:|:----:|------|
   | DX-SPEC-001 | ... | 1.0 | Active | specs/DX-SPEC-001_... |

   ## PLAN
   ...
   ```

4. 갱신된 문서 수를 출력한다.

### `/ax-gov-doc version <코드> [major|minor]` — 문서 버전 범프

1. 문서코드로 파일을 찾는다 (Grep으로 frontmatter `code:` 검색).

2. 현재 버전을 읽는다.

3. 범프 수준(기본: minor):
   - `major`: Major+1, Minor=0 (구조/범위 변경)
   - `minor`: Minor+1 (내용 보강)

4. frontmatter의 `version`과 `updated`를 Edit으로 수정한다.

5. 문서 내 "변경 이력" 테이블에 새 행을 추가한다.

6. docs/INDEX.md의 해당 항목도 갱신한다.

### `/ax-gov-doc archive <코드>` — 아카이브

1. 문서코드로 파일을 찾는다.

2. frontmatter의 `status`를 `Archived`로 변경한다.

3. 파일을 `docs/archive/` 디렉토리로 이동한다:
   ```bash
   mkdir -p docs/archive
   mv {원본 경로} docs/archive/
   ```

4. docs/INDEX.md에서 해당 항목을 Archive 섹션으로 이동한다.

5. 아카이브 결과를 출력한다.

### `/ax-gov-doc check` — frontmatter 검증

1. `docs/` 하위 모든 `.md` 파일을 Glob으로 수집한다 (CHANGELOG.md, INDEX.md 제외).

2. 각 파일의 frontmatter를 Read로 읽어 필수 필드 8개를 검증한다:
   - `code`, `title`, `version`, `status`, `category`, `created`, `updated`, `author`

3. SPEC/GUID/OPS 유형은 `system-version` 필드도 필수로 검증한다.

4. 결과를 출력한다:
   ```
   ## frontmatter 검증 결과
   | 파일 | 상태 | 누락 필드 |
   |------|:----:|-----------|
   | DX-SPEC-001_... | PASS | - |
   | DX-PLAN-002_... | FAIL | author, category |

   총: 10/12 PASS (83%)
   ```

5. FAIL 항목에 대해 자동 수정 여부를 AskUserQuestion으로 확인한다.


---

## Gotchas

- TODO: 이 스킬 사용 시 주의사항을 작성하세요
