---
name: gov-standards
description: |
  거버넌스 표준 관리 — 표준 목록 조회, 갭 분석, 적용 상태 확인.
  15개 표준(GOV-001~015)의 현재 적용 상태를 점검하고 관리한다.
  Use when: 거버넌스, 표준 점검, GOV, standards, governance, 갭 분석
argument-hint: "[list|check|apply]"
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
---

# ax-07-gov — 거버넌스 표준 관리

10개 거버넌스 표준(GOV-001~010)의 목록 조회, 적용 상태 점검, 프로젝트 적용을 수행한다.

## Arguments

`/ax-gov-standards [list|check|apply]`

- `list` — 표준 목록 조회
- `check` — 적용 상태 점검
- `apply <GOV-NNN>` — 지정 표준을 프로젝트에 적용

## Steps

### `/ax-gov-standards list` — 표준 목록 조회

1. `~/.claude/standards/INDEX.md`를 Read로 읽는다.

2. 표준 목록 테이블을 출력한다:
   ```
   | 코드 | 제목 | 버전 | 상태 | 범위 |
   |------|------|:----:|:----:|:----:|
   | GOV-001 | 문서 관리 | 1.1 | Active | universal |
   | ... | ... | ... | ... | ... |
   ```

3. 총 표준 수와 Active/Draft 비율을 요약한다.

### `/ax-gov-standards check` — 적용 상태 점검

1. `~/.claude/standards/INDEX.md`를 읽어 10개 표준 목록을 파악한다.

2. 각 표준별로 프로젝트 적용 여부를 점검한다:

   **GOV-001 문서 관리**:
   - `docs/INDEX.md` 존재 여부
   - `docs/` 하위 폴더 구조 (specs/, 01-plan/, 02-design/ 등)
   - 문서 frontmatter 필수 필드 존재 (Glob `docs/**/*.md` → 샘플 3개 Read)

   **GOV-002 버전 관리**:
   - `package.json`에 version 필드 존재
   - 최신 git tag와 package.json 버전 비교 (`git describe --tags --abbrev=0`)
   - MEMORY.md에 버전 기록 존재

   **GOV-003 요구사항 관리**:
   - SPEC.md에 "미래 작업" 또는 요구사항 섹션 존재
   - 요구사항 ID 패턴 (`{PROJECT}-REQ-{NNN}` 또는 `F{N}`) 사용 여부

   **GOV-004 프로젝트 관리**:
   - SPEC.md 존재
   - MEMORY.md 존재
   - docs/CHANGELOG.md 존재
   - 세션 시작/종료 워크플로우 설정 (CLAUDE.md에서 `/ax-session-start`, `/ax-session-end` 참조)

   **GOV-005 리스크 관리**:
   - MEMORY.md에 `[긴급]`, `[블로커]`, `[부채]` 태그 사용 여부
   - SPEC.md에 제약사항 섹션 존재

   **GOV-006 코드 품질**:
   - ESLint 설정 파일 존재 (`eslint.config.*` 또는 `.eslintrc.*`)
   - TypeScript 설정 (`tsconfig.json`) 존재
   - 테스트 파일 존재 (`tests/` 또는 `**/*.test.*`)

   **GOV-007 보안**:
   - `.env.example` 존재 (시크릿 템플릿)
   - `.gitignore`에 `.env`, `.dev.vars` 포함
   - CLAUDE.md에 인증 가드 패턴 문서화

   **GOV-008 데이터/스키마 관리**:
   - DB 스키마 파일 존재 (`app/db/` 또는 `drizzle.config.*`)
   - 마이그레이션 디렉토리 존재

   **GOV-009 인프라/운영**:
   - 빌드 스크립트 존재 (`package.json` scripts)
   - 배포 설정 존재 (`wrangler.toml`, `wrangler.jsonc` 등)

   **GOV-010 온보딩/지식 공유**:
   - 필수 파일 5개 확인: CLAUDE.md, SPEC.md, MEMORY.md, .gitignore, .env.example
   - 3-Tier 구조 검증

   ---

   **보충 표준 (GOV-011~015)** — 미적용 시 ⚠️ 경고 (❌ 아닌 소프트 판정):

   **GOV-011 테스트**:
   - 테스트 파일 존재 여부 (Glob `**/*.test.*` 또는 `**/*.spec.*`)
   - `package.json`에 test 스크립트 존재 (`scripts.test`)
   - 판정: 둘 다 있으면 `적합`, 하나만 있으면 `부분`, 없으면 ⚠️

   **GOV-012 성능** (선택):
   - 성능 예산 또는 메트릭 문서 존재 (Grep: `performance`, `budget`, `latency` in `docs/**/*.md`)
   - 판정: 관련 문서 있으면 `적합`, 없으면 ⚠️ (선택 사항이므로 경고만)

   **GOV-013 모니터링**:
   - `/health` 엔드포인트 존재 (Grep: `'/health'` 또는 `"/health"` in `services/**/*.ts`)
   - 구조화된 로깅 패턴 존재 (Grep: `console.log\|console.error\|logger` in `services/**/*.ts`)
   - 판정: 둘 다 있으면 `적합`, 하나만 있으면 `부분`, 없으면 ⚠️

   **GOV-014 의존성**:
   - 락 파일 커밋 여부 (`bun.lockb`, `package-lock.json`, `yarn.lock` 중 하나 존재)
   - floating 버전 없음 (`package.json`에서 `"*"` 또는 `"latest"` 의존성 Grep)
   - 판정: 락 파일 존재 + floating 없으면 `적합`, 락 파일만 있으면 `부분`, 없으면 ⚠️

   **GOV-015 ADR**:
   - `docs/designs/` 또는 `docs/02-design/` 디렉토리 존재
   - 또는 DSGN 유형 문서 존재 (Glob `docs/**/*DSGN*`)
   - 판정: 하나라도 있으면 `적합`, 없으면 ⚠️

3. 결과를 테이블로 출력한다:
   ```
   | 코드 | 제목 | 적용 상태 | 비고 |
   |------|------|:---------:|------|
   | GOV-001 | 문서 관리 | 적합 | docs/INDEX.md 존재 |
   | GOV-002 | 버전 관리 | 부분 | 태그-버전 불일치 |
   | ... | ... | ... | ... |
   ```

   적용 상태: `적합` / `부분` / `미적용`

4. 전체 적합률(%)과 우선 개선 항목을 요약한다.

### `/ax-gov-standards apply <GOV-NNN>` — 표준 적용

1. `~/.claude/standards/INDEX.md`를 Read로 읽어, 지정한 GOV-NNN 코드에 대응하는 파일명을 찾는다.
   해당 파일(`~/.claude/standards/{파일명}`)을 Read로 읽는다.

2. 표준의 요구사항을 분석하고 프로젝트에 필요한 변경을 식별한다.

3. AskUserQuestion으로 적용할 항목을 확인한다:
   - 프로젝트 CLAUDE.md에 규칙 추가
   - 필요한 파일/디렉토리 생성
   - 설정 파일 수정

4. 승인된 항목을 적용한다.

5. 적용 결과를 요약 출력한다.


---

## Gotchas

- TODO: 이 스킬 사용 시 주의사항을 작성하세요
