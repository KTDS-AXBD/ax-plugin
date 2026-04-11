---
name: sprint-pipeline
description: Master에서 복수 Sprint를 의존성 분석→배치 병렬 실행→자동 merge 파이프라인 오케스트레이션
user-invocable: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, Skill, AskUserQuestion
argument-hint: "<N,N,...> [--resume] [--dry-run]"
---

# Sprint Pipeline — Master 오케스트레이터

복수 Sprint를 의존성 분석하여 병렬 배치로 자동 실행한다.

## Arguments

- `61 62 65 66 67` — Sprint 번호 목록
- `next` — SPEC.md에서 📋 상태인 Sprint 자동 수집
- `--resume` — pipeline-state.json에서 이어서 실행
- `--dry-run` — 배치 계획만 출력, 실행 안 함

## 사전 조건

1. Master 브랜치에서 실행 (worktree에서 실행 금지)
2. `wt.exe` 사용 가능 (Windows Terminal)
3. `tmux` 사용 가능

## 실행 흐름

### Phase 1: Sprint 수집

**번호 직접 지정 시**: 해당 Sprint의 SPEC.md F-item 정보 수집
**`next` 지정 시**: SPEC.md에서 📋 상태인 Sprint 번호를 자동 수집

각 Sprint에 대해:
- F-items (F번호 + 제목)
- 의존성 (비고 컬럼에서 "선행", "의존" 키워드 파싱)
- Plan/Design 존재 여부 확인

### Phase 2: 의존성 분석 + 배치 계획

**의존성 그래프 생성**:
```
SPEC.md F-item 비고 컬럼에서 의존성 추출:
- "F197 선행" → Sprint(F197)에 의존
- "62 선행" → Sprint 62에 의존
- "61→62 순차" → Sprint 62는 61에 의존
- "병렬 가능" → 독립
```

**배치 생성 알고리즘** (위상 정렬):
```
1. 의존성 없는 Sprint = Batch 1
2. Batch 1 완료 후 의존 해소된 Sprint = Batch 2
3. 반복
```

**배치 계획 출력**:
```
## Sprint Pipeline 계획

### 의존성 그래프
Sprint 61 (독립) ─→ Sprint 62 ─→ Sprint 65
Sprint 66 (독립)
Sprint 67 (독립)

### 배치 계획
| Batch | Sprint | F-items | 병렬 | Plan | Design |
|-------|--------|---------|:----:|:----:|:------:|
| 1 | 61, 66, 67 | F197~F198, F203~F204+F208, F209~F210 | 3 병렬 | ✅/📋 | ✅/📋 |
| 2 | 62 | F199+F200 | 1 | ✅ | ✅ |
| 3 | 65 | F201+F202+F207 | 1 | 📋 | 📋 |

예상 총 시간: ~90분 (30분/Sprint × 3 배치)
```

AskUserQuestion으로 확인: "이 계획으로 실행할까요?"

### Phase 3: Pipeline State 초기화

```bash
STATE_FILE="/tmp/sprint-pipeline-state.json"
```

Pipeline state JSON 생성 (Python 사용):
```python
{
  "project": "{프로젝트명}",
  "created": "{timestamp}",
  "status": "running",
  "batches": [
    {
      "id": 1,
      "sprints": [61, 66, 67],
      "status": "pending",
      "sprint_status": {}
    },
    ...
  ],
  "phase6": {"status": "pending", "average_match_rate": null, "gap_sprints": [], "results": {}},
  "phase7": {"status": "pending", "gap_sprints_processed": 0, "results": {}},
  "phase8": {"status": "pending", "spec_corrections": 0, "commit_sha": null, "push_result": null, "ci_status": null},
  "completed_at": null,
  "total_duration_minutes": null,
  "summary": null
}
```

### Phase 4: 배치별 실행 루프

각 배치에 대해:

**4a. Worktree 생성 + WT 탭 열기**:
```bash
for SPRINT_NUM in ${BATCH_SPRINTS[@]}; do
  WT_DIR="$HOME/work/worktrees/${PROJECT}/sprint-${SPRINT_NUM}"
  BRANCH="sprint/${SPRINT_NUM}"

  # Worktree 생성 (없으면)
  if [ ! -d "$WT_DIR" ]; then
    git worktree add -b "$BRANCH" "$WT_DIR" HEAD
  fi

  # .sprint-context 생성
  cat > "$WT_DIR/.sprint-context" <<CTX
SPRINT_NUM=${SPRINT_NUM}
PROJECT=${PROJECT}
F_ITEMS=${F_ITEMS}
CREATED=$(date -Iseconds)
MASTER_COMMIT=$(git rev-parse HEAD)
CHECKPOINT=
CTX

  # Signal 파일 생성 (CREATED 상태)
  mkdir -p /tmp/sprint-signals
  cat > "/tmp/sprint-signals/${PROJECT}-${SPRINT_NUM}.signal" <<SIG
STATUS=CREATED
SPRINT_NUM=${SPRINT_NUM}
PROJECT=${PROJECT}
F_ITEMS=${F_ITEMS}
BRANCH=${BRANCH}
PR_NUM=
GITHUB_REPO=$(git remote get-url origin | grep -oP '(?<=github.com[:/])[^.]+')
PROJECT_ROOT=$(pwd)
CHECKPOINT=
ERROR_STEP=
ERROR_MSG=
MATCH_RATE=
TEST_RESULT=
ITERATE_STATUS=
ITERATE_COUNT=0
ITERATE_FINAL_RATE=
TIMESTAMP=$(date -Iseconds)
SIG

  # WT 탭 열기 (tmux 세션 포함, ccw-auto 모드)
  # 탭 제목: "프로젝트: Sprint N"
  wt.exe -w 0 new-tab --title "${PROJECT}: Sprint ${SPRINT_NUM}" --suppressApplicationTitle \
    wsl.exe -d Ubuntu-24.04 -- bash -lic \
      "~/scripts/wt-claude-worktree.sh '${PROJECT}' '${SPRINT_NUM}' '${WT_DIR}' '${BRANCH}'"

  sleep 2  # WT 탭 초기화 대기
done
```

**4b. Sprint WT에서 ccw-auto 자동 시작**:
각 Sprint tmux 세션에 ccw-auto 명령 전송:
```bash
for SPRINT_NUM in ${BATCH_SPRINTS[@]}; do
  TMUX_SESSION="sprint-${PROJECT}-${SPRINT_NUM}"
  tmux send-keys -t "$TMUX_SESSION" "ccw-auto" Enter
done
```

**4c. Merge Monitor 시작 (background)**:
```bash
bash ~/scripts/sprint-merge-monitor.sh
```
`Bash run_in_background: true`로 실행. Master Claude는 다른 작업 가능.

**4d. Monitor 완료 알림 수신**:
Monitor가 배치 내 모든 Sprint의 signal을 처리하면 자동 알림.

**4e. SPEC.md 갱신**:
Merge 완료된 Sprint의 F-item을 📋→✅로 전환.
수치 갱신 (endpoints, services, tests 등).

**4f. Pipeline State 갱신**:
배치 상태를 `done` / `partial` / `failed`로 업데이트.

**4g. 다음 배치로** (Phase 4a부터 반복)

### Phase 5: Pipeline 완료 보고

```
## Sprint Pipeline 완료

| Batch | Sprint | 상태 | Match Rate | PR |
|-------|--------|:----:|:----------:|:--:|
| 1 | 61 | ✅ | 93% | #183 |
| 1 | 66 | ✅ | 91% | #188 |
| 1 | 67 | ✅ | 95% | #189 |
| 2 | 62 | ✅ | 97% | #190 |
| 3 | 65 | ✅ | 92% | #191 |

총 소요 시간: 85분
D1 migrations: 0047→0055 (+8)
Workers: {Version ID}
```

### Phase 6: Gap Analysis (bkit PDCA 통합)

Phase 5 완료 후, Master에서 `gap-detector` 에이전트를 호출하여 전체 Sprint의 Design↔Implementation 정합성을 분석한다.

> **v2 변경 (S228)**: Signal 기반 수동 수집 → `bkit:gap-detector` 에이전트 직접 호출. Master에서 merge된 코드를 직접 분석하므로 WT 재진입 불필요.

**6a. 통합 Gap Analysis 실행:**

`/pdca analyze` 스킬 또는 `gap-detector` 에이전트를 호출한다. 전체 Sprint를 한 번에 분석:

```
Agent(subagent_type="bkit:gap-detector") 호출:
- Design 문서: docs/02-design/features/sprint-{N}.design.md (각 Sprint별)
- PRD: 해당 Phase의 PRD 문서
- 구현 코드: merge된 master의 실제 코드
- 분석 기준: 각 F-item의 API/Web/D1/Test 존재 여부
```

**6b. 분석 결과 수집:**

gap-detector가 반환한 결과에서 Sprint별 Match Rate를 추출:

| Match Rate | 판정 | Phase 7 동작 |
|:----------:|:----:|-------------|
| >= 90% | ✅ Pass | 건너뜀 |
| 80~89% | ⚠️ Gap | iterate 대상 |
| < 80% | ❌ Fail | iterate 대상 + WARN |

**6c. 분석 문서 저장:**

`docs/03-analysis/features/phase-{N}-pipeline.analysis.md`에 통합 분석 결과를 저장한다.

**6d. Pipeline State 갱신:**

gap-detector 결과를 pipeline-state.json에 기록:
- `phase6.status = "done"`
- `phase6.average_match_rate = {평균}`
- `phase6.gap_sprints = [{Match < 90% Sprint 목록}]`
- `phase6.results = {Sprint별 Match Rate}`

Gap Sprint가 0건이면 "✅ Gap 없음 — Phase 7 건너뜀" 출력 후 Phase 8로 직행.

### Phase 7: Auto Iterator (bkit PDCA 통합)

Phase 6에서 식별된 Gap Sprint에 대해 `pdca-iterator` 에이전트를 호출하여 자동 개선한다.
Gap Sprint가 없으면 이 Phase는 건너뛴다.

> **v2 변경 (S228)**: WT 재진입 + tmux 명령 주입 → Master에서 `bkit:pdca-iterator` 에이전트 직접 호출. 에이전트가 코드를 수정하고 재분석까지 자동 수행.

**7a. Iterator 실행:**

각 Gap Sprint에 대해 `pdca-iterator` 에이전트를 호출:

```
Agent(subagent_type="bkit:pdca-iterator") 호출:
- feature: sprint-{N}
- Design 문서: docs/02-design/features/sprint-{N}.design.md
- Gap 목록: Phase 6에서 식별된 gap items
- 최대 iteration: 5회
- 목표: Match Rate >= 90%
```

**7b. 결과 수집:**

Iterator 완료 후:
- 수정된 파일을 커밋 (파일 개별 지정)
- 재분석 결과의 Match Rate를 Pipeline State에 기록

**7c. Pipeline State 갱신:**

```json
{
  "phase7": {
    "status": "done",
    "gap_sprints_processed": N,
    "results": {
      "sprint_N": {
        "initial_match_rate": 85,
        "final_match_rate": 93,
        "iterations": 2,
        "verdict": "improved"
      }
    }
  }
}
```

**7d. iterate 실패 처리:**
- 5회 iterate 후에도 < 90%: `⚠️ Sprint {N}: {count}회 iterate 후 {rate}% — 수동 보완 권장` 출력
- Pipeline은 **중단하지 않고** Phase 8로 계속 진행

### Phase 8: Session-End

모든 Phase가 완료된 후 `/ax:session-end` 스킬을 호출하여 SPEC/MEMORY 동기화 + 커밋 + push + 배포를 수행한다.

> **v2 변경 (S228)**: Pipeline 전용 종료 로직 삭제 → `/ax:session-end` 스킬 위임. 중복 코드 제거 + session-end의 SPEC↔MEMORY 동기화/CI 확인 로직을 재활용.

**8a. SPEC.md F-item 상태 보정 (session-end 호출 전):**

merge 과정에서 🔧→✅ 전환이 누락된 F-item을 보정:
```bash
ALL_F_ITEMS=($(python3 -c "
import json
with open('$STATE_FILE') as f:
    state = json.load(f)
for b in state.get('batches', []):
    for s, info in b.get('sprint_status', {}).items():
        for f in info.get('f_items', '').split(','):
            if f.strip(): print(f.strip())
"))

for F in "${ALL_F_ITEMS[@]}"; do
  STATUS=$(grep "| ${F} |" SPEC.md | grep -oP '✅|🔧|📋' | head -1)
  if [ "$STATUS" = "🔧" ]; then
    sed -i "s/\(| ${F} |.*|\) 🔧 \(|.*\)/\1 ✅ \2/" SPEC.md
    echo "보정: ${F} 🔧→✅"
  fi
done
```

**8b. Session-End 호출:**

`/ax:session-end`를 호출한다. session-end가 다음을 자동 수행:
- SPEC↔MEMORY 수치 동기화
- 변경 파일 커밋 (파일 개별 지정)
- git push origin master
- CI/CD 배포 확인
- CLAUDE.md 헤더 동기화 (sync-claude-md.sh)

**8c. Pipeline State 최종 갱신:**

session-end 완료 후 pipeline-state.json을 최종 갱신:
```json
{
  "phase8": { "status": "done", "commit_sha": "...", "push_result": "success" },
  "status": "completed",
  "completed_at": "...",
  "total_duration_minutes": N,
  "summary": {
    "sprints": N,
    "average_match_rate": N,
    "gap_sprints_iterated": N,
    "prs_merged": N
  }
}
```

최종 출력:
```
## Sprint Pipeline 전체 완료

| Phase | 상태 | 상세 |
|-------|:----:|------|
| 1~3 배치 계획 | ✅ | {batch_count} batches, {sprint_count} sprints |
| 4 배치 실행 | ✅ | {sprint_count}/{sprint_count} merge 완료 |
| 5 완료 보고 | ✅ | — |
| 6 Gap Analyze | ✅ | Average {avg}%, Gap {gap_count}건 |
| 7 Iterator | ✅ | {iterated}건 처리, {improved}건 개선 |
| 8 Session-End | ✅ | commit {sha}, push 완료 |

**총 소요 시간**: {duration}분
**최종 Average Match Rate**: {final_avg}%
```

## --resume 모드

`/tmp/sprint-pipeline-state.json`에서 상태를 읽어:
1. `done` 배치는 건너뜀
2. `partial` 배치에서 `failed` Sprint만 재실행
3. `pending` 배치는 정상 실행
4. `phase6.status == "done"` → Phase 6 건너뜀
5. `phase7.status == "done"` 또는 `"skipped"` → Phase 7 건너뜀
6. `phase8.status == "done"` → 전체 완료, 아무 작업 없음

## --dry-run 모드

Phase 1~2 배치 계획 + **Phase 6~8 예상 동작**을 함께 출력한 뒤 종료:
```
| Phase | 예상 동작 |
|-------|----------|
| 6 Gap Analyze | gap-detector 에이전트로 Design↔코드 분석, Gap Sprint 식별 |
| 7 Iterator | pdca-iterator 에이전트로 Gap 자동 수정 (최대 5회/Sprint) |
| 8 Session-End | /ax:session-end 호출 — SPEC/MEMORY 동기화, commit, push, CI 확인 |
```
실제 worktree 생성이나 WT 탭 열기 없음.

## Merge 충돌 대응

병렬 Sprint merge 시 충돌 가능 지점:
1. `app.ts` (라우트 등록) — 자동 해결 가능 (양쪽 import+route 병합)
2. D1 migration 번호 — 자동 renumber (`0048` 충돌 → `0049`로)
3. `shared/` 타입 파일 — 양쪽 추가분 병합

Monitor에서 충돌 감지 시:
1. 자동 rebase 시도
2. `app.ts` / `shared/` 충돌은 양쪽 병합으로 자동 해결
3. 기타 충돌은 `STATUS=FAILED`, `ERROR_MSG=merge conflict` → 사용자 알림

## 안전 장치 요약

1. **Worktree 격리**: master는 merge 전까지 불변
2. **Signal 상태 머신**: CREATED→IN_PROGRESS→DONE/FAILED/TIMEOUT
3. **Checkpoint 재개**: 각 단계 완료 시 기록, --resume로 이어서 (Phase 6~8 포함)
4. **Merge Gate**: test pass + Match Rate >= 90% 필수
5. **Pipeline State**: JSON으로 배치 + Phase 6~8 상태 추적, 세션 재시작 시 이어서
6. **타임아웃**: Sprint 30분, Pipeline 배치 45분
7. **부분 실패 허용**: 실패 Sprint skip, iterate 실패도 WARN만 출력
8. **PDCA 통합**: Phase 6~7은 gap-detector/pdca-iterator 에이전트를 Master에서 직접 호출 (WT 재진입 불필요)
9. **Session-End 위임**: Phase 8은 `/ax:session-end`에 위임하여 SPEC/MEMORY 동기화 + CI 확인 재활용

## 런타임 지원 스크립트

이 스킬은 `~/scripts/` 하위의 두 bash 스크립트와 연동해요. 스킬 본문(Phase 4)이 설명하는 "Signal 기반 자동 merge" 흐름의 signal 생산자와 배치 진행 제어가 여기에 있어요.

### `~/scripts/sprint-post-session.sh` — Sprint WT 종료 훅

**호출 시점**: `ccw()` 함수가 Sprint worktree 내부에서 Claude 프로세스 종료 직후 자동 실행 (사용자가 직접 호출하지 않음).

**전제 조건**:
- 현재 디렉터리에 `.sprint-context` 파일 존재 (없으면 exit 1)
- `.sprint-context`는 `SPRINT_NUM`, `PROJECT`, `F_ITEMS`, 선택적으로 `CHECKPOINT`, `MATCH_RATE`, `TEST_RESULT`를 포함

**동작 순서**:
1. **Push 확인** — `origin/sprint/{N}` 원격 브랜치가 없으면 `git push -u origin sprint/{N}` 실행. session-end가 이미 push했으면 skip.
2. **PR 생성** — `gh pr list --head sprint/{N}`으로 기존 PR 확인 후, 없으면 `gh pr create` (title: `feat: Sprint {N} — {F_ITEMS}`, body: 최근 커밋 10개 요약). `GH_TOKEN`은 `.git/.credentials`에서 자동 추출.
3. **Signal 파일 갱신** — `/tmp/sprint-signals/{PROJECT}-{SPRINT_NUM}.signal`에 `STATUS=DONE` + `PR_NUM` + `CHECKPOINT` + `MATCH_RATE` + `TIMESTAMP` 기록. Master의 `sprint-merge-monitor.sh`가 이 파일을 polling해서 자동 merge를 시작해요.

**SKILL.md Phase 4와의 관계**: Phase 4는 WT 생성 시 `STATUS=CREATED` signal을 만들어요. post-session이 WT 종료 시 같은 파일을 `STATUS=DONE`으로 덮어써서 Master monitor에게 merge 가능 신호를 전달해요. 두 스크립트 사이에 signal 상태 머신(`CREATED→DONE`)이 완성돼요.

**수정 시 주의**: Signal 필드를 바꾸면 `sprint-merge-monitor.sh`의 파싱도 같이 갱신해야 해요 (두 스크립트는 signal 스키마를 암묵적으로 공유).

### `~/scripts/sprint-pipeline-monitor.sh` — 레거시 배치 진행 예시 (Phase 15 전용)

> ⚠️ **이 스크립트는 재사용 가능한 런타임이 아니에요.** Sprint 번호(154/155/156/157), 프로젝트 루트, F-items가 코드에 하드코딩된 **Foundry-X Phase 15 discovery-ui-v2 일회성 자동화**예요. 현재 Sprint Pipeline 스킬은 이 스크립트를 호출하지 않고, Master Claude가 스킬 본문(Phase 4~8)을 직접 실행해요.

**문서화 이유**: 레거시 배치 자동화 패턴의 참고 예시로 남겨요. "배치 의존성을 signal polling으로 관리한다"는 스킬의 핵심 설계가 이 스크립트의 초기 구현에서 검증됐어요.

**동작 요약** (참고용):
- `CHECK_INTERVAL=30`초 간격으로 `is_sprint_done()` polling (signal에 `STATUS=DONE` 또는 `MERGED`)
- 배치 전이: Batch 1(S154) → Batch 2(S155+S156 병렬) → Batch 3(S157)
- 각 배치 시작 시 `start_sprint()` 호출 → SPEC.md F-item 📋→🔧 전환 + `bash -i -c "sprint $n"` + signal `STATUS=CREATED` + tmux에 `ccs` → `/ax:sprint-autopilot` 주입
- 마지막 배치 완료 시 `PIPELINE_COMPLETE` signal 생성 + Master tmux 세션에 후속 PDCA 명령 자동 전달

**현재 스킬의 등가물**:
- 배치 전이 → SKILL.md Phase 4 배치 루프 (Master Claude가 직접)
- signal polling → `~/scripts/sprint-merge-monitor.sh` (background, `run_in_background: true`)
- 후속 PDCA 주입 → Phase 6~8 (gap-detector / pdca-iterator / session-end 에이전트/스킬 위임)

**재사용이 필요하다면**: 이 스크립트를 복사해 프로젝트/Sprint/F-items 상수를 치환하는 대신, Sprint Pipeline 스킬(`/ax:sprint-pipeline N,N,N`)을 쓰세요. 스킬 쪽이 의존성 분석 + Phase 6~8 PDCA 통합을 자동 처리해요.

## Gotchas

- Master 브랜치에서만 실행 (worktree에서 실행하면 에러)
- Pipeline 실행 중 master에 다른 변경을 push하면 충돌 위험 — Pipeline 중에는 master 변경 자제
- 병렬 배치의 Sprint 수가 3 이상이면 WT 탭이 많아질 수 있음 — 모니터 해상도 확인
- ccw-auto가 없으면 (bashrc 미적용) 자동 시작 불가 → 수동 모드로 fallback
- Phase 6 gap-detector는 Master에서 merge된 코드를 분석 — Design 문서가 없는 Sprint는 PRD 기반 분석
- Phase 7 pdca-iterator는 Master에서 직접 코드 수정 — 수정 후 커밋+push 포함
- Pipeline State JSON은 `/tmp/`에 저장 — 재부팅 시 소실. `--resume` 사용 시 주의
