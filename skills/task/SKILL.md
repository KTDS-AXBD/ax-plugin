---
name: task
description: "Task Orchestrator — Master pane 기반 F/B/C/X 4트랙 task 실행 + Agent 오케스트레이션. /ax:task start task 생성, plan 분류, manage 대시보드, test 검증, loop 연속실행. Use when: task start, task 등록, task list, 작업 시작, 대시보드"
argument-hint: "start|list|plan|manage|test|loop|doctor"
user-invocable: true
allowed-tools:
  - Read
  - Bash
  - Grep
  - Glob
---

# task — Task Orchestrator (S-α MVP)

> **PRD**: `docs/specs/fx-task-orchestrator/prd-draft.md` (v0.4, Foundry-X 기준)
> **Phase**: S-α MFS (Foundry-X F497, FX-REQ-489)
>
> 이 스킬은 `wtsplit` 의 한계(타이틀 매핑 / 식별 불가 / 충돌 미해결)를 해소하기 위한 *Master pane 기반* task 실행 진입점이에요. S-α는 `start` + `list` 만 제공합니다. `merge` / `doctor` / `quick` / `adopt` / `park` 는 S-β 이후.

## 트리거
- "task start", "/ax:task start", "task 등록", "작업 시작"
- "task list", "task 목록", "현재 task", "작업 현황"
- "task plan", "작업 계획", "이 작업 분류해줘"
- "task manage", "대시보드", "건강 점검", "작업 점검"
- "task test", "테스트 실행", "검증"
- "task loop", "연속 실행", "큐 등록", "자동 실행"
- "task doctor", "자가 점검", "진단"

## 의존성 (실행 프로젝트 기준)
- Repo 루트에 `scripts/task/lib.sh`, `scripts/task/task-start.sh`, `scripts/task/task-list.sh` (Foundry-X 참조 — 다른 프로젝트는 복사 후 사용)
- `~/.foundry-x/` (없으면 `lib.sh` 가 자동 생성)
- `flock`, `jq`, `gh` (Issue 생성 — 없으면 degraded)
- `git worktree` 사용 가능
- master 브랜치 + clean working tree

## Subcommands

### `/ax:task start <track> "<title>" ["<prompt>"]`

**track**: `F` (Feature) | `B` (Bug) | `C` (Chore) | `X` (eXperiment/Spike)
**prompt** (선택): WT pane Claude 세션에 주입할 작업 지시. 미지정 시 track + title 기반 자동 생성.

실행 흐름 (PRD §4.1.1):

1. **사전 조건**: `.sprint-context` 부재 + master 브랜치 + clean working tree + WIP cap (3) 미초과
2. **flock id-allocator** → 다음 ID 할당 (SPEC.md + cache 스캔, 트랙별 max+1)
3. **SPEC.md 등록**: `<!-- fx-task-orchestrator-backlog -->` 마커 블록에 한 줄 추가 → commit
4. **flock master-push** → `git push origin master` 직렬화 + `pushed_sha` 고정
5. **`git worktree add -b task/<ID>-<slug> <wt> <pushed_sha>`** (HEAD 아닌 SHA 기준 — race 방지)
6. **첫 commit body**에 ` ```fx-task-meta\n{...json...}\n``` ` 블록 작성 — `.task-context` 유실 시 권위 소스
7. **tmux split-window -h -c <wt>** + pane title + `@fx-task-id` user-data 주입
7b. **auto-inject (background)**: `ccs` 기동 → 8초 대기 → `/ax:session-start <prompt>` 자동 주입. `.task-prompt` 파일도 WT에 작성됨
8. **GitHub Issue 생성** + label 4종 (`fx:track:<T>`, `fx:status:in_progress`, `fx:wip:active`, `fx:risk:medium`) — 실패 시 degraded
9. **`~/.foundry-x/tasks-cache.json`** + `task-log.ndjson` 갱신

**Abort 매핑** (PRD §4.1.1):

| 단계 | 정리 | 상태 |
|------|------|------|
| Step 3 SPEC commit 실패 | `git checkout -- SPEC.md` | FAILED_SETUP |
| Step 4 push 실패 | `git reset --hard HEAD^` | FAILED_SETUP |
| Step 5 WT 생성 실패 | master 등록 commit revert + push | FAILED_SETUP |
| Step 8 Issue 생성 실패 | cache `pending_issue=true` | IN_PROGRESS (degraded) |

**호출 방법** (직접):
```bash
# 기본 (auto-inject: track 기반 기본 프롬프트)
bash scripts/task/task-start.sh F "presign Worker 프록시 hot fix"

# 커스텀 프롬프트 지정
bash scripts/task/task-start.sh C "discovery audit" "발굴 분석 실행 프로세스를 점검하고 결과를 정리해줘"
```

**S-α 비수용**: `--quick`, `--scope`, `--no-tmux`, `--no-issue` 옵션은 모두 S-β 이후.

### `/ax:task list`

`~/.foundry-x/tasks-cache.json` 을 읽어 활성 task 테이블 출력. S-α 는 cache-only — liveness probe (PID/heartbeat) + GitHub label 동기화는 S-β 에서 추가.

```bash
bash scripts/task/task-list.sh           # 표 형식
bash scripts/task/task-list.sh --json    # 원본 cache 덤프
```

### `task-complete.sh` — WT 작업 완료 처리

WT pane에서 작업 완료 시 호출. `.task-context`에서 ID/branch를 읽어 push → PR 생성 → signal 작성 → cache 갱신.

```bash
bash scripts/task/task-complete.sh          # push + PR 생성 + signal
bash scripts/task/task-complete.sh --no-pr  # PR 생략 (push + signal만)
```

**실행 흐름:**
1. `.task-context`에서 TASK_ID, BRANCH, TASK_TYPE, TITLE 읽기
2. 미커밋 변경 감지 시 자동 커밋 (`git add -u` + untracked)
3. `git push origin <branch>` + `gh pr create` (squash merge 대상)
4. `write_signal` — `/tmp/task-signals/{project}-{task_id}.signal` 작성 (STATUS=DONE)
5. `cache_upsert_task` + `log_event` — cache/log 갱신

**주의:** WT 내부에서만 실행. Master에서 실행하면 `.task-context` 없어서 reject.

### `task-monitor.sh` — Master signal 감지 + auto-merge

Master에서 background 실행. `task-complete.sh`가 작성한 signal 파일을 감지하면 자동으로 PR merge → WT 제거 → pane 종료 → cache 갱신.

```bash
bash scripts/task/task-monitor.sh                  # 30초 간격 루프
bash scripts/task/task-monitor.sh --interval 10    # 10초 간격
bash scripts/task/task-monitor.sh --once            # 1회 점검 후 종료
```

**Signal 처리 흐름:**
1. `/tmp/task-signals/{project}-*.signal` 스캔
2. STATUS=DONE인 signal → `gh pr merge --squash --delete-branch`
3. `git pull origin master --ff-only`
4. `git worktree remove` + 로컬 브랜치 삭제
5. `tmux kill-pane` (pane ID 기반)
6. cache → `merged` / signal 파일 삭제

**주의:** Master에서만 실행. `nohup ... & disown` 권장 (단순 `&` 금지).

### `task-watch.sh` — WT pane 실시간 감시 + auto-intervention

Master에서 background 실행. 활성 WT pane을 주기적으로 캡처하여 권한 프롬프트 자동 승인, idle/stuck 감지, 완료 패턴 감지 시 `task-complete.sh` 자동 주입.

```bash
bash scripts/task/task-watch.sh                  # 20초 간격 루프
bash scripts/task/task-watch.sh --interval 10    # 10초 간격
bash scripts/task/task-watch.sh --once            # 1회 점검 후 종료
```

**감시 항목:**
1. **권한 프롬프트 자동 승인** — "Do you want to..." 패턴 감지 → option 2 (allow for session) 전송
2. **에러 감지** — Error/FAILED/Permission denied 패턴 → 로그 경고
3. **완료 패턴 감지** — "Cooked for"/"Baked for" + 프롬프트 idle → `task-complete.sh` 자동 실행
4. **idle/stuck 감지** — 5분 이상 pane 변화 없음 + 프롬프트 대기 → 로그 경고

**로그:** `/tmp/task-signals/watch-{project}.log`

## Steps (Claude 가 실행할 절차)

사용자 메시지에서 트리거 감지 시, 아래 케이스를 매칭하여 실행.
**중요**: bash 명령은 Claude가 내부적으로 실행하고, 사용자에게는 결과만 보여줘요.

### ★ Step 0: 요청 추상도 게이트 (모든 케이스 진입 전 필수)

**모든 task 요청은 이 게이트를 먼저 통과해야 해요.** 추상적/대규모 요청을 즉시 구현하지 않고, 진짜 문제를 먼저 파악.

**판정 기준:**

| Level | 신호 | 행동 |
|-------|------|------|
| L1 구체적 | 파일명/함수/에러 메시지 명시, 단일 파일 범위 | → 즉시 실행 (Step 0 통과) |
| L2 범위형 | 기능명/모듈은 있지만 방법 미정 ("E2E shard 병렬화") | → plan 확인 제시 후 실행 |
| L3 추상형 | "구조", "개선", "자동화", "방법론", "시스템" 등 추상 키워드 | → **인터뷰 필수** |

**L3 추상형 감지 시 인터뷰 절차 (JTBD 6-Part 기반):**

1. **AskUserQuestion**으로 3가지 질문:
   - **Desired Outcome**: 이 요청이 해결되면 어떤 상태가 되길 원하나요? (결과 상태)
   - **Current Pain**: 지금 가장 불편한 구체적 상황은? (Pain Point)
   - **Scope Preference**: 전체 설계 vs 1단계씩 검증 vs PRD만 먼저? (진행 방식)

2. 인터뷰 결과를 기반으로 **구체적 task 목록** 도출:
   - 각 task는 L1/L2 수준으로 분해
   - 의존성 순서 + 우선순위 판정

3. 사용자에게 **task 목록 + 예상 결과** 제시 → 승인 후 실행

4. 승인된 task만 `task-start` 또는 `queue --enqueue`로 진행

**L3 감지 키워드**: 구조, 개선, 자동화, 방법론, 시스템, 아키텍처, 프로세스, 체계, 근본, 전략, 리팩토링, 고도화, "~할 수 있도록", "~하는 구조", "혼자서 돌아가"

### A. `/ax:task start` — 작업 생성

1. **Step 0 게이트 통과 확인**
2. **사전 검증** — `git rev-parse --show-toplevel`, master 브랜치, clean working tree
3. **scripts/task/ 존재 확인**
4. **track / title 파싱** — 미지정 시 AskUserQuestion
5. **prompt 구성** — 사용자 작업 지시가 있으면 그대로 prompt 인자로 전달
6. **실행**: `bash scripts/task/task-start.sh <track> "<title>" ["<prompt>"]`
7. **결과 보고**: ID / branch / wt / pane / issue URL / inject 상태

### B. `/ax:task list` — 현황 조회

1. `bash scripts/task/task-list.sh` 실행
2. 출력 그대로 전달

### C. `/ax:task plan` — 작업 계획 (분류 + 제안)

사용자가 "이 작업 해줘", "이거 어떻게 나눠야 해?" 등 요청 시.

1. 사용자 요청 텍스트를 추출
2. `bash scripts/task/agent-plan.sh "<요청 텍스트>"` 실행
3. 분석 결과 (트랙/규모/영역/WIP 충돌) 전달
4. 사용자 확인 후 → 자동으로 `task start` 실행 또는 `loop --enqueue`

### D. `/ax:task manage` — 대시보드 + 건강 점검

사용자가 "현황", "대시보드", "점검", "건강" 등 요청 시.

1. `bash scripts/task/agent-manage.sh --dashboard` 실행 → 대시보드 출력
2. `bash scripts/task/agent-manage.sh --health` 실행 → 건강 점검 결과
3. 이슈 발견 시:
   - 데몬 중단 → 자동 재시작 (agent-manage --health가 처리)
   - task dead/stale → `--recover <id>` 자동 실행 여부 사용자 확인
   - ghost WT/pane → `--cleanup` 자동 실행

### E. `/ax:task test` — 테스트 검증

사용자가 "테스트", "검증" 등 요청 시.

1. 대상 판별:
   - 특정 task ID 명시 → `bash scripts/task/agent-test.sh <id>`
   - "전체" / "활성" → `bash scripts/task/agent-test.sh --all`
   - "merged" / "완료된 것" → `bash scripts/task/agent-test.sh --merged`
2. 결과 전달 (pass/fail 카운트 + 실패 상세)

### F. `/ax:task loop` — 연속 실행 (큐 기반)

사용자가 "연속 실행", "큐", "자동으로 돌려" 등 요청 시.

1. **큐 등록**: 사용자가 작업 목록을 나열하면 각각을 `bash scripts/task/agent-loop.sh --enqueue <track> "<title>" "<prompt>"` 로 등록
2. **큐 확인**: `bash scripts/task/agent-loop.sh --queue`
3. **루프 시작**: `bash scripts/task/agent-loop.sh --bg` (background daemon)
4. **루프 상태**: `bash scripts/task/agent-loop.sh --status`
5. **루프 중단**: `bash scripts/task/agent-loop.sh --stop`
6. **큐 초기화**: `bash scripts/task/agent-loop.sh --drain`

루프가 돌면: WIP 빈 슬롯 감지 → 큐에서 꺼내서 task-start → watch/monitor가 감시 → 완료 시 merge/cleanup → 다음 큐 아이템 자동 시작

### G. `/ax:task doctor` — 자가 진단

사용자가 "진단", "왜 안 돼?", "자가 점검" 등 요청 시.

1. `bash scripts/task/agent-manage.sh --health` (데몬 + WT 점검)
2. `bash scripts/task/agent-doctor.sh` (실패 패턴 분석 — X2에서 구현 중)
3. inject 로그 확인: `cat /tmp/task-signals/inject.log`
4. watch 로그 확인: `tail -20 /tmp/task-signals/watch-*.log`
5. 이슈 발견 시 자동 복구 또는 사용자 안내

### H. WT 완료 전 자동 검증 가이드

WT pane의 Claude 세션이 `task-complete.sh` 호출 전에 최소 검증을 수행하도록 안내한다.
auto-inject 프롬프트에 아래 내용이 자동 포함된다:

- **코드 검증**: `turbo typecheck && turbo test` (또는 `/ax:code-verify`)
- **TDD 확인** (`.claude/rules/tdd-workflow.md` 존재 시): Red→Green 커밋 분리 여부
- **커밋 정리**: 미커밋 변경이 있으면 커밋 후 push

task-start.sh의 auto-inject가 이 가이드를 포함하도록 prompt를 구성할 때, track별 기본 프롬프트 끝에 아래를 추가한다:

```
완료 전 반드시 코드 검증을 실행해: turbo typecheck && turbo test
.claude/rules/tdd-workflow.md가 있으면 TDD Red→Green 순서를 따라.
```

### I. 세션 시작 시 자동 동작

`/ax:session-start` 시 task 데몬(monitor + watch)이 실행 중인지 자동 확인.
중단 상태면 agent-manage --health로 자동 재시작.

## Gotchas

- **Master 외 브랜치에서 실행 금지**: 현재 브랜치가 master 가 아니면 task-start.sh 가 자체 reject
- **sprint WT 내부 실행 금지**: `.sprint-context` 가 있으면 reject (중첩 방지, PRD §7.2)
- **`git add .` 절대 금지** — 멀티 pane 사고 패턴 (CLAUDE.md / git-workflow.md)
- **Issue degraded 상태**: gh 실패 시 `task` 자체는 계속 진행되며, S-β 의 `doctor` 가 후속으로 Issue 를 생성합니다 (S-α 에서는 수동)
- **PID/heartbeat**: X1 (S-β) 에서 `update_heartbeat` + `check_liveness` 추가됨. task-list.sh 가 liveness probe 사용
- **flock 타임아웃**: id-allocator 10s, master-push 30s. 초과 시 abort + 사용자 재시도 안내
- **scripts 번들링**: S-α 는 Foundry-X `scripts/task/` 를 가정. 다른 프로젝트에서 사용하려면 해당 디렉토리를 복사해야 해요. S-β 에서 플러그인 내부 번들 검토.

## S-α 산출물 점검 리스트 (Foundry-X 기준)
- [x] `~/.foundry-x/{locks,scripts}/`, `task-log.ndjson`, `tasks-cache.json`, `notifications.ndjson`, `wip-overrides.log`
- [x] `scripts/task/lib.sh` — flock allocator + cache helper + WIP cap
- [x] `scripts/task/task-start.sh` — Step 1~9 전체
- [x] `scripts/task/task-list.sh` — cache 테이블 렌더 + liveness probe
- [x] `scripts/task/task-complete.sh` — WT 완료 → push + PR + signal + cache
- [x] `scripts/task/task-monitor.sh` — Master signal 감지 → auto-merge + WT cleanup
- [x] `scripts/task/task-watch.sh` — WT pane 실시간 감시 + auto-intervention
- [x] `scripts/task/heartbeat-hook.sh` — PostToolUse heartbeat 갱신
- [x] ax-marketplace `skills/task/SKILL.md` — 본 파일
- [x] GitHub Issue label 18종 (Phase 31 준비 시 일괄 생성)
- [ ] 1주 사용 후 Go/No-Go 판정 (S-α §7.1 기준): start ≥ 5회, 만족도 ≥ 4/5, race 사고 0건
