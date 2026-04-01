---
name: gov-risk
description: "리스크 관리 — 블로커/의존성/기술부채/제약 등록, 목록 조회, 해소 처리. Use when: 리스크, 블로커, 기술부채, risk, blocker, tech debt"
argument-hint: "[add|list|resolve]"
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
---

# risk — 리스크 관리

블로커, 의존성, 기술부채, 제약을 추적하고 관리한다.

## Arguments

`/ax-gov-risk [add|list|resolve]`

- `add` — 새 리스크 등록
- `list` — 활성 리스크 목록 조회
- `resolve` — 리스크 해소 처리

## Steps

### `/ax-gov-risk add` — 새 리스크 등록

1. AskUserQuestion으로 다음 정보를 수집한다:
   - 유형: Blocker / Dependency / Tech Debt / Constraint
   - 제목 (자유 입력)
   - 영향 범위 (자유 입력 — 어떤 기능/작업에 영향을 주는지)
   - 긴급도: 즉시 / 세션 내 / 다음 세션 / 백로그

2. 유형별로 적절한 위치에 기록한다:

   **Blocker / Dependency** (긴급도=즉시/세션 내):
   - MEMORY.md "다음 작업" 섹션에 추가:
     ```
     - **[긴급]** {제목} — 영향: {영향 범위}
     ```
     또는
     ```
     - **[블로커]** {제목} — 영향: {영향 범위}
     ```

   **Tech Debt**:
   - SPEC.md "미래 작업" 섹션에 Improvement 유형 요구사항으로 직접 등록한다 (`/ax-req-manage new` 참조).
   - MEMORY.md에는 `- **[부채]** {제목}` 접두사로 기록한다.

   **Constraint**:
   - SPEC.md "기술 제약" 또는 "제약사항" 섹션에 추가한다.
   - MEMORY.md에는 기록하지 않는다 (SPEC.md가 원본).

3. 등록 결과를 출력한다.

### `/ax-gov-risk list` — 활성 리스크 목록

1. MEMORY.md에서 `[긴급]`, `[블로커]`, `[부채]` 태그가 붙은 항목을 수집한다.
2. SPEC.md "제약사항" 섹션에서 Constraint 항목을 수집한다.
3. 유형별로 정리하여 출력한다:

   ```
   ## 활성 리스크

   ### Blocker / Dependency
   | # | 제목 | 영향 | 출처 |
   |---|------|------|------|

   ### Tech Debt
   | # | 제목 | 영향 | 요구사항 ID |
   |---|------|------|------------|

   ### Constraint
   | # | 제목 | 대응 |
   |---|------|------|
   ```

### `/ax-gov-risk resolve` — 리스크 해소

1. `/ax-gov-risk list`로 활성 리스크를 표시한다.

2. AskUserQuestion으로 해소할 항목을 선택한다.

3. 해소 처리:
   - MEMORY.md에서 해당 항목을 제거한다.
   - Tech Debt인 경우 연결된 요구사항 상태를 DONE으로 변경한다.
   - Constraint 해소는 SPEC.md에서 직접 수정한다.

4. CHANGELOG.md 세션 기록에 해소 사실을 포함하도록 제안한다.


---

## Gotchas

- TODO: 이 스킬 사용 시 주의사항을 작성하세요
