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
  ]
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

## --resume 모드

`/tmp/sprint-pipeline-state.json`에서 상태를 읽어:
1. `done` 배치는 건너뜀
2. `partial` 배치에서 `failed` Sprint만 재실행
3. `pending` 배치는 정상 실행

## --dry-run 모드

Phase 1~2만 실행하고 배치 계획을 출력한 뒤 종료.
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
3. **Checkpoint 재개**: 각 단계 완료 시 기록, --resume로 이어서
4. **Merge Gate**: test pass + Match Rate >= 90% 필수
5. **Pipeline State**: JSON으로 배치 상태 추적, 세션 재시작 시 이어서
6. **타임아웃**: Sprint 30분, Pipeline 배치 45분
7. **부분 실패 허용**: 실패 Sprint skip, 나머지 계속 진행

## Gotchas

- Master 브랜치에서만 실행 (worktree에서 실행하면 에러)
- Pipeline 실행 중 master에 다른 변경을 push하면 충돌 위험 — Pipeline 중에는 master 변경 자제
- 병렬 배치의 Sprint 수가 3 이상이면 WT 탭이 많아질 수 있음 — 모니터 해상도 확인
- ccw-auto가 없으면 (bashrc 미적용) 자동 시작 불가 → 수동 모드로 fallback
