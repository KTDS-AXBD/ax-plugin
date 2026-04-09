---
name: req-manage
description: "요구사항 관리 — 등록/분류/상태변경/목록/SPEC 동기화. Use when: 요구사항 등록, REQ, 상태 변경, requirement, SPEC 동기화, GitHub Project"
argument-hint: "[new|triage|list|status|sync]"
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - AskUserQuestion
---

# req — 요구사항 관리

요구사항의 등록, 분류, 상태 변경, 목록 조회, SPEC 동기화를 수행한다.

## Arguments

`/ax-req-manage [new|triage|list|status|sync]`

- `new` — 새 요구사항 등록
- `triage` — 미분류(OPEN) 요구사항에 유형/도메인/우선순위 배정
- `list` — 요구사항 목록 조회 (상태/우선순위 필터)
- `status` — 요구사항 상태 변경 (SPEC.md + 앱 DB + GitHub Project 동시 갱신)
- `sync` — SPEC.md ↔ 앱 DB ↔ GitHub Project 동기화 점검

## GitHub Project 사전 조건 (공통)

모든 서브커맨드에서 GitHub Project 동기화가 필요할 때 이 헬퍼를 사용한다.

**Org Project 감지:**
```bash
GH_AVAILABLE=$(command -v gh >/dev/null 2>&1 && echo true || echo false)
GITHUB_REPO=$(git remote get-url origin 2>/dev/null | grep -oP '(?<=github.com[:/])[^.]+' || true)
GH_ORG=$(echo "$GITHUB_REPO" | cut -d'/' -f1)
if [ -f .git/.credentials ] && [ -z "$GH_TOKEN" ]; then
  export GH_TOKEN=$(sed 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/' .git/.credentials)
fi
# Org Project 번호 감지 (첫 번째 활성 프로젝트)
PROJECT_NUM=""
if [ "$GH_AVAILABLE" = "true" ] && [ -n "$GH_ORG" ]; then
  PROJECT_NUM=$(gh project list --owner "$GH_ORG" --format json \
    --jq '.projects[] | select(.closed==false) | .number' 2>/dev/null | head -1)
fi
```

- `PROJECT_NUM`이 비어있으면 Project 동기화를 건너뜀
- 필드 ID 캐시: 세션 중 한 번만 `gh project field-list`를 호출하고 결과를 재사용

**Project 필드 ID 조회 (한 번만):**
```bash
if [ -n "$PROJECT_NUM" ]; then
  FIELDS_JSON=$(gh project field-list "$PROJECT_NUM" --owner "$GH_ORG" --format json 2>/dev/null)
  # Status 필드: "Todo" / "In Progress" / "Done"
  STATUS_FIELD_ID=$(echo "$FIELDS_JSON" | jq -r '.fields[] | select(.name=="Status") | .id')
  STATUS_TODO_ID=$(echo "$FIELDS_JSON" | jq -r '.fields[] | select(.name=="Status") | .options[] | select(.name=="Todo") | .id')
  STATUS_INPROGRESS_ID=$(echo "$FIELDS_JSON" | jq -r '.fields[] | select(.name=="Status") | .options[] | select(.name=="In Progress") | .id')
  STATUS_DONE_ID=$(echo "$FIELDS_JSON" | jq -r '.fields[] | select(.name=="Status") | .options[] | select(.name=="Done") | .id')
  # Priority 필드
  PRIORITY_FIELD_ID=$(echo "$FIELDS_JSON" | jq -r '.fields[] | select(.name=="Priority") | .id')
  # REQ Code 필드 (text)
  REQCODE_FIELD_ID=$(echo "$FIELDS_JSON" | jq -r '.fields[] | select(.name=="REQ Code") | .id')
  # Work Type 필드
  WORKTYPE_FIELD_ID=$(echo "$FIELDS_JSON" | jq -r '.fields[] | select(.name=="Work Type") | .id')
fi
```

**Issue를 Project에 추가 + 필드 설정 (헬퍼 함수):**
```bash
# add_issue_to_project ISSUE_URL
# → Project에 추가하고 ITEM_ID를 반환
add_issue_to_project() {
  local ISSUE_URL="$1"
  gh project item-add "$PROJECT_NUM" --owner "$GH_ORG" --url "$ISSUE_URL" --format json \
    --jq '.id' 2>/dev/null
}

# set_project_field ITEM_ID FIELD_ID VALUE
set_project_field() {
  local ITEM_ID="$1" FIELD_ID="$2" VALUE="$3"
  gh project item-edit --project-id "$PROJECT_ID_GLOBAL" --id "$ITEM_ID" \
    --field-id "$FIELD_ID" --text "$VALUE" 2>/dev/null
}

# set_project_select_field ITEM_ID FIELD_ID OPTION_ID
set_project_select_field() {
  local ITEM_ID="$1" FIELD_ID="$2" OPTION_ID="$3"
  gh project item-edit --project-id "$PROJECT_ID_GLOBAL" --id "$ITEM_ID" \
    --field-id "$FIELD_ID" --single-select-option-id "$OPTION_ID" 2>/dev/null
}
```

> `PROJECT_ID_GLOBAL`은 `gh project list`의 `id` 필드 (예: `PVT_kwDO...`).

**SPEC 상태 → Project Status 매핑:**

| SPEC 상태 | Project Status | Option |
|----------|---------------|--------|
| 📋 PLANNED | Todo | `STATUS_TODO_ID` |
| 🔧 IN_PROGRESS | In Progress | `STATUS_INPROGRESS_ID` |
| ✅ DONE | Done | `STATUS_DONE_ID` |

**Priority 매핑:**

| P-level | Project Priority Option Name |
|---------|------------------------------|
| P0 | 🔴 P0 |
| P1 | 🟠 P1 |
| P2 | 🟡 P2 |
| P3 | ⚪ P3 |

**Work Type 매핑:**

| 유형 | Project Work Type Option Name |
|------|-------------------------------|
| Feature | Feature |
| Bug | Bug |
| Improvement | Improvement |
| Chore | Chore |

## Steps

### `/ax-req-manage new` — 새 요구사항 등록

> **β 스마트 기본값**: GitHub Issue를 자동 생성합니다.
> - gh CLI + remote 존재 시 → 자동 Issue 생성
> - gh 없거나 remote 없음 → `/tmp/req-issue-skip.log` 경고 기록
> - 생성 건너뛰려면 → `--no-issue` 플래그 사용

**`--no-issue` 플래그 감지 (Step 0):**
```bash
ARGS="${ARGUMENTS:-}"
NO_ISSUE=false
if echo "$ARGS" | grep -q -- "--no-issue"; then
  NO_ISSUE=true
fi
```

1. AskUserQuestion으로 다음 정보를 수집한다:
   - 제목 (자유 입력)
   - 유형: Feature / Bug / Improvement / Chore
   - 도메인: 프로젝트의 도메인 목록에서 선택 (SPEC.md 참조)
   - 우선순위: P0(즉시) / P1(이번 마일스톤) / P2(다음) / P3(백로그)
   - 설명 (선택, 자유 입력)
   - ℹ️ GitHub Issue가 자동 생성됩니다. 건너뛰려면 `--no-issue` 옵션을 사용하세요.

2. SPEC.md의 "미래 작업" 섹션에서 마지막 F번호를 확인하고 다음 번호를 부여한다.

3. SPEC.md "미래 작업" 테이블에 새 항목을 추가한다:
   ```
   | F{N} | {제목} (DX-REQ-{NNN}, {P-level}) | v{next} | 📋 | — |
   ```

4. P0/P1이면 MEMORY.md "다음 작업"에도 추가한다:
   - P0: `- **[긴급]** F{N}: {제목}`
   - P1: `- F{N}: {제목}`

5. **앱 DB 동기화** (wrangler.toml + d1_databases 존재 시):
   ```bash
   npx wrangler d1 execute {db-name} --remote --command \
     "INSERT INTO feature_requests (id, title, description, priority, status, submitter_id, req_code, type, domain, impact_level, urgency_level, spec_item_id, milestone_version) \
      VALUES (lower(hex(randomblob(16))), '{제목}', '{설명}', '{priority}', 'PLANNED', '{owner-user-id}', 'DX-REQ-{NNN}', '{type}', '{domain}', '{impact}', '{urgency}', 'F{N}', 'v{next}');"
   ```
   - db-name: wrangler.toml의 database_name
   - owner-user-id: 프로덕션 DB에서 admin 사용자 ID 조회

6. **GitHub Issue 생성** (스마트 기본값 β — `--no-issue`로 opt-out 가능):
   ```bash
   ISSUE_URL=""
   ISSUE_STATUS_MSG=""
   if [ "${NO_ISSUE:-false}" = "true" ]; then
     # --no-issue opt-out
     ISSUE_STATUS_MSG="ℹ️ --no-issue 옵션: Issue 생성 건너뜀"
   elif [ "$GH_AVAILABLE" = "true" ] && [ -n "$GITHUB_REPO" ]; then
     # gh CLI + remote 존재 → 자동 Issue 생성
     ISSUE_URL=$(gh issue create --repo "$GITHUB_REPO" \
       --title "[F{N}] {제목}" \
       --label "{type_label},{priority_label}" \
       --body "**REQ**: {REQ코드} | **Priority**: {P-level} | **Sprint**: v{next}\n\n{설명}" \
       2>/dev/null)
     if [ -n "$ISSUE_URL" ]; then
       ISSUE_NUM=$(echo "$ISSUE_URL" | grep -oP '\d+$')
       ISSUE_STATUS_MSG="✅ #${ISSUE_NUM}"
     else
       ISSUE_STATUS_MSG="⚠️ Issue 생성 실패 (gh 오류)"
     fi
   else
     # gh 없거나 remote 없음 → skip.log 기록
     mkdir -p /tmp
     echo "[$(date -Iseconds)] SKIP Issue 생성 — gh CLI 없음 또는 GITHUB_REPO 미설정. F{N}: {제목}" >> /tmp/req-issue-skip.log
     ISSUE_STATUS_MSG="⚠️ Issue 생성 건너뜀 (gh CLI 없음 또는 remote 미설정). /tmp/req-issue-skip.log 참조"
   fi
   ```
   - label 매핑: Feature→feature, Bug→bug, Improvement→enhancement, Chore→chore, P0→P0-critical, P1→P1-high

7. **GitHub Project 동기화** (Issue 생성 성공 + PROJECT_NUM 존재 시):
   ```bash
   if [ -n "$ISSUE_URL" ] && [ -n "$PROJECT_NUM" ]; then
     # 1) Project에 아이템 추가
     ITEM_ID=$(add_issue_to_project "$ISSUE_URL")

     if [ -n "$ITEM_ID" ]; then
       # 2) Status → Todo
       set_project_select_field "$ITEM_ID" "$STATUS_FIELD_ID" "$STATUS_TODO_ID"

       # 3) Priority 설정
       PRIORITY_OPTION_ID=$(echo "$FIELDS_JSON" | jq -r \
         ".fields[] | select(.name==\"Priority\") | .options[] | select(.name | test(\"${P_LEVEL}\")) | .id")
       [ -n "$PRIORITY_OPTION_ID" ] && set_project_select_field "$ITEM_ID" "$PRIORITY_FIELD_ID" "$PRIORITY_OPTION_ID"

       # 4) REQ Code 설정
       set_project_field "$ITEM_ID" "$REQCODE_FIELD_ID" "{REQ코드}"

       # 5) Work Type 설정
       WORKTYPE_OPTION_ID=$(echo "$FIELDS_JSON" | jq -r \
         ".fields[] | select(.name==\"Work Type\") | .options[] | select(.name==\"{type}\") | .id")
       [ -n "$WORKTYPE_OPTION_ID" ] && set_project_select_field "$ITEM_ID" "$WORKTYPE_FIELD_ID" "$WORKTYPE_OPTION_ID"
     fi
   fi
   ```

8. 등록 결과를 요약해서 출력한다:
   ```
   F{N} ({REQ코드}) 등록 완료:
   - SPEC.md: ✅ 추가
   - MEMORY.md: ✅ (P0/P1) / ⏭️ (P2/P3)
   - 앱 DB: ✅ / ⏭️
   - GitHub Issue: {ISSUE_STATUS_MSG}
   - GitHub Project: ✅ Status=Todo, Priority={P-level}, WorkType={type} / ⏭️ (Issue 없음)
   ```
   > `{ISSUE_STATUS_MSG}` 값: `✅ #NNN` | `⚠️ 건너뜀 (/tmp/req-issue-skip.log)` | `ℹ️ --no-issue`

### `/ax-req-manage triage` — 미분류 요구사항 분류

1. SPEC.md "미래 작업"에서 상태가 비어있거나 OPEN인 항목을 찾는다.

2. 각 항목에 대해 AskUserQuestion으로 유형/도메인/우선순위를 배정한다.

3. 상태를 TRIAGED로 변경하고 SPEC.md를 갱신한다.

### `/ax-req-manage list` — 목록 조회

1. AskUserQuestion으로 필터 선택:
   - 전체 / 활성(📋/🔧) / 완료(✅) / 우선순위별(P0~P3)

2. SPEC.md F-items 섹션에서 항목을 수집한다.

3. **앱 DB와 대조** (wrangler.toml 존재 시):
   ```bash
   npx wrangler d1 execute {db-name} --remote --command \
     "SELECT req_code, title, status, spec_item_id FROM feature_requests WHERE status NOT IN ('REJECTED') ORDER BY req_code;"
   ```

4. **GitHub Project와 대조** (PROJECT_NUM 존재 시):
   ```bash
   gh project item-list "$PROJECT_NUM" --owner "$GH_ORG" --format json 2>/dev/null
   ```

5. SPEC.md / DB / Project 상태를 병합하여 테이블 형태로 출력한다:
   ```
   | # | REQ코드 | F# | 제목 | P | SPEC | DB | Project | 불일치 |
   ```
   - 불일치가 있으면 ⚠️ 표시

### `/ax-req-manage status` — 상태 변경

1. AskUserQuestion으로 변경 대상과 새 상태를 선택한다:
   - 대상: F번호 입력 (예: F35)
   - 새 상태: PLANNED(📋) / IN_PROGRESS(🔧) / DONE(✅) / REJECTED

2. 상태 전환 규칙을 검증한다:
   - PLANNED → IN_PROGRESS / REJECTED
   - IN_PROGRESS → DONE / PLANNED
   - → REJECTED: 사유 입력 필수

3. **SPEC.md 갱신**:
   - IN_PROGRESS: 상태를 🔧로 변경
   - DONE: 상태를 ✅로 변경
   - REJECTED: 행 삭제 또는 취소선 처리

4. **앱 DB 동기화** (wrangler.toml + d1_databases 존재 시):
   ```bash
   npx wrangler d1 execute {db-name} --remote --command \
     "UPDATE feature_requests SET status='{new_status}' WHERE spec_item_id='F{N}';"
   ```

5. MEMORY.md "다음 작업" 갱신:
   - IN_PROGRESS: 추가 `- 🔧 F{N}: {제목}`
   - DONE: 제거
   - P0/P1 PLANNED: 추가

6. **GitHub Issues 동기화** (gh CLI + GitHub remote 존재 시):
   ```bash
   if [ "$GH_AVAILABLE" = "true" ] && [ -n "$GITHUB_REPO" ]; then
     ISSUE_NUM=$(gh issue list --repo "$GITHUB_REPO" --state all --json number,title \
       --jq '.[] | select(.title | test("^\\[F{N}\\]")) | .number' 2>/dev/null)
     if [ -n "$ISSUE_NUM" ]; then
       case "{new_status}" in
         DONE) gh issue close "$ISSUE_NUM" --repo "$GITHUB_REPO" --comment "✅ DONE — SPEC.md 동기화" ;;
         REJECTED) gh issue close "$ISSUE_NUM" --repo "$GITHUB_REPO" --reason "not planned" --comment "❌ REJECTED — {사유}" ;;
         IN_PROGRESS|PLANNED)
           ISSUE_STATE=$(gh issue view "$ISSUE_NUM" --repo "$GITHUB_REPO" --json state --jq '.state')
           [ "$ISSUE_STATE" = "CLOSED" ] && gh issue reopen "$ISSUE_NUM" --repo "$GITHUB_REPO" --comment "🔄 상태 변경 — {new_status}" ;;
       esac
     fi
   fi
   ```

7. **GitHub Project Status 갱신** (PROJECT_NUM 존재 시):
   ```bash
   if [ -n "$PROJECT_NUM" ] && [ -n "$ISSUE_NUM" ]; then
     ISSUE_URL="https://github.com/${GITHUB_REPO}/issues/${ISSUE_NUM}"
     # Project에서 해당 아이템 ID 찾기
     ITEM_ID=$(gh project item-list "$PROJECT_NUM" --owner "$GH_ORG" --format json \
       --jq ".items[] | select(.content.url==\"${ISSUE_URL}\") | .id" 2>/dev/null)

     # 아이템이 Project에 없으면 먼저 추가
     if [ -z "$ITEM_ID" ]; then
       ITEM_ID=$(add_issue_to_project "$ISSUE_URL")
     fi

     if [ -n "$ITEM_ID" ]; then
       case "{new_status}" in
         PLANNED)       set_project_select_field "$ITEM_ID" "$STATUS_FIELD_ID" "$STATUS_TODO_ID" ;;
         IN_PROGRESS)   set_project_select_field "$ITEM_ID" "$STATUS_FIELD_ID" "$STATUS_INPROGRESS_ID" ;;
         DONE)          set_project_select_field "$ITEM_ID" "$STATUS_FIELD_ID" "$STATUS_DONE_ID" ;;
       esac
     fi
   fi
   ```

8. 변경 결과를 출력한다:
   ```
   F{N} ({DX-REQ-NNN}): {이전상태} → {새상태}
   - SPEC.md: ✅ 갱신
   - 앱 DB: ✅ / ⏭️ 동기화
   - GitHub Issue: ✅ 동기화
   - GitHub Project: ✅ Status → {new_status}
   - MEMORY.md: ✅ 갱신
   ```

### `/ax-req-manage sync` — SPEC ↔ 앱 DB ↔ GitHub Project 동기화 점검

1. SPEC.md F-items 섹션의 전체 항목을 수집한다 (F번호, REQ코드, 상태, Priority, 유형).

2. **앱 DB 조회** (wrangler.toml 존재 시):
   ```bash
   npx wrangler d1 execute {db-name} --remote --command \
     "SELECT req_code, title, status, spec_item_id FROM feature_requests WHERE status NOT IN ('REJECTED') ORDER BY req_code;"
   ```

3. **GitHub Project 조회** (PROJECT_NUM 존재 시):
   ```bash
   PROJECT_ITEMS=$(gh project item-list "$PROJECT_NUM" --owner "$GH_ORG" --format json 2>/dev/null)
   ```

4. **GitHub Issues 조회**:
   ```bash
   ALL_ISSUES=$(gh issue list --repo "$GITHUB_REPO" --state all --json number,title,state --limit 100 2>/dev/null)
   ```

5. **3방향 불일치 감지**:

   | 점검 | 불일치 유형 | 자동 수정 |
   |------|-----------|----------|
   | SPEC에 있지만 Issue 없음 | Issue 미생성 | Issue 생성 + Project 추가 |
   | Issue 있지만 Project 미등록 | Project 누락 | `item-add` + 필드 설정 |
   | SPEC 상태 ≠ Issue 상태 | 상태 불일치 | Issue close/reopen |
   | SPEC 상태 ≠ Project Status | 상태 불일치 | `item-edit` Status 갱신 |
   | Project Priority ≠ SPEC Priority | 필드 불일치 | `item-edit` Priority 갱신 |
   | SPEC에 있지만 DB 없음 | DB 누락 | INSERT (wrangler 있을 때) |
   | DB 상태 ≠ SPEC 상태 | DB 상태 불일치 | UPDATE |

6. 불일치 결과를 보고한다:
   ```
   ## 동기화 점검 결과

   ### 불일치 감지: N건

   | F# | 항목 | 불일치 | 수정 내용 |
   |----|------|--------|----------|
   | F32 | Project 미등록 | Issue#35 존재, Project 없음 | item-add 필요 |
   ```

7. AskUserQuestion으로 자동 수정 여부를 확인한다:
   - "전부 수정" / "하나씩 확인" / "보고만"

8. 승인 시 일괄 수정을 실행한다:
   ```bash
   # 패턴: Issue가 있지만 Project 미등록 → 추가 + 필드 설정
   for each missing item:
     ITEM_ID=$(add_issue_to_project "$ISSUE_URL")
     set_project_select_field "$ITEM_ID" "$STATUS_FIELD_ID" "$STATUS_OPTION_ID"
     set_project_select_field "$ITEM_ID" "$PRIORITY_FIELD_ID" "$PRIORITY_OPTION_ID"
     set_project_field "$ITEM_ID" "$REQCODE_FIELD_ID" "{REQ코드}"
     set_project_select_field "$ITEM_ID" "$WORKTYPE_FIELD_ID" "$WORKTYPE_OPTION_ID"
   ```

9. 최종 결과를 출력한다:
   ```
   동기화 완료:
   - Issue 생성: N건
   - Project 추가: N건
   - Status 수정: N건
   - Priority 수정: N건
   - DB 수정: N건
   ```

## DB 동기화 사전 조건

wrangler.toml에서 d1_databases 설정을 읽어 database_name을 결정한다:
```bash
grep 'database_name' wrangler.toml | head -1 | awk -F'"' '{print $2}'
```

wrangler.toml이 없거나 d1_databases가 없으면 DB 동기화를 건너뛴다.


---

## Gotchas

- TODO: 이 스킬 사용 시 주의사항을 작성하세요
