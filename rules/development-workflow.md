# 개발 워크플로우 패턴 (Cross-Project)

## WSL 환경
- Windows 바이너리(wt.exe, explorer.exe): `command -v` → 절대경로 fallback → tmux detached 순

## 배포
- CI/CD 자동: master push → deploy.yml (D1 migration + Workers deploy + smoke test)
- WSL wrangler 실행 허용 (v4.75.0+)
- 긴급 migration: `scripts/d1-migrate-remote.sh` (curl 기반, wrangler 불필요)

## D1/SQLite
- `--file` OAuth 에러 → `--command` 인라인 권장
- migration 추가 시 테스트 헬퍼 SQL도 추가
- `--command` 수동 적용은 `d1_migrations` 테이블 미기록 → drift 위험

## 문서 거버넌스 핵심
- SPEC.md F-item 등록 선행 → 커밋+push → WT 생성 (이 순서 필수)
- 병렬 세션: SPEC.md 갱신은 한 세션에서만, 나머지는 참조만

## Sprint WT
- WT 생성: `bash -i -c "sprint N"` 필수 (직접 git worktree add 금지)
- WT 경로: `~/work/worktrees/{project}/sprint-{N}` (CLAUDE_WT_BASE)
- 프로젝트명 대소문자 일치 필수 (basename git toplevel = `Foundry-X`)
- claude 실행: `ccs` 또는 `ccw` (인터랙티브), `claude -p` 금지

## Sprint Signal/Monitor
- merge-monitor: `nohup ... & disown` (단순 `&` 금지)
- set -u 금지 (빈 signal 필드 crash), 변수 초기화 필수
- autopilot Step 7 STATUS=DONE signal 절대 생략 금지

## Autopilot session-end pr-lookup fallback (4회 재현 승격 S231)
- **현상**: autopilot session-end 단계에서 `pr-lookup` 실패 보고 (`ERROR_STEP=pr-lookup, ERROR_MSG="no PR found for sprint/N"`) — 구현/테스트/커밋/push는 완벽 완결
- **재현**: S217 / S225 / S224 / **S230 4회차** (S231 `feedback_autopilot_pr_lookup.md` → rules/ 승격)
- **근본 원인**: 미확정 (PR 생성 타이밍 / GitHub API 레이턴시 / branch protection race 후보)
- **표준 복구 경로 (정상 fallback, 예외 아님)**:
  1. GitHub에서 해당 branch PR 생존 확인 (`gh pr list --head sprint/N --state all`)
  2. 없으면 Master branch에서 `gh pr create --base main --head sprint/N --title ... --body ...` 수동 생성
  3. Conflict 있을 경우 WT에서 `git merge origin/main` + `.sprint-context` `theirs` 전략으로 해소 후 push
  4. Signal `STATUS=FAILED → IN_PROGRESS` + `PR_NUM` 갱신 + Monitor 재개
  5. CI green 확인 후 `gh pr merge N --squash --delete-branch` + remote branch 수동 확인 (`git push origin --delete sprint/N`)
- **판정**: Match ≥ 90% + CI all green 충족 시 pr-lookup 실패는 merge 신뢰도에 영향 없음. autopilot 결과물 재실행 불필요

## Autopilot Production Smoke Test (6회 재현 승격 S231, 재현 누적 S232/S238/S243/S267, 14회차 변종 S269, **16회차 변종 S341 — dependency upgrade autopilot codemod logic-altering**)
- **현상**: autopilot Match 100% + CI all green 보고 후에도 production 환경에서 실 동작 실패. **특히 DoD 산출물(reports/*.json, accuracy MD 등)이 "예상치"로 기재되고 실 파일은 미생성되는 hallucination 패턴 포함**. **변종 (S243 8회차)**: autopilot이 push 후 CI watch 단계에서 "Match 95% 완료"로 자체 보고하면서도 실 CI는 E2E FAIL 상태 — push와 CI green을 등치 처리하는 경향. **변종 (S267 13회차)**: autopilot Match 100% / CI green / unit test PASS이지만 production deploy validation step 미수행 → main merge 후 cold-start fail 발견 → revert 비용. **변종 (S269 14회차)**: autopilot이 wrangler dev/--dry-run **실 수행** + process 9분간 alive 유지했지만 reports에 evidence 미첨부 → Master가 ps + curl로 자체 검증해야 PASS 판정 가능 ("실 수행 + reports 미첨부" 패턴). **변종 (S341 16회차)**: dependency upgrade(@hono/zod-openapi 0.9.0 → 0.18.4) sprint에서 autopilot이 strict typing 대응 codemod(`c.json(data)` → `c.json(data, 200)` 35 handler 자동 fix) 적용. typecheck/lint/test/CI/openapi-spec **모두 PASS** 했지만 **production runtime 일부 분기만 fail** (`POST /api/auth/login` body-less HTTP 500, body 있으면 zod validation 우선이라 정상). **autopilot codemod의 logic-altering nature** 실증 — type 충족이 logic 정확성을 보장 안 함. ~4h 41m production downtime → revert + F-item drop.
- **재현**: S215 TD-25 / S219 F362 / S220 F366 / S228 Gap-1~4 / S230 F356-A TD-42 / S232 F402 TD-43 / S238 TD-47 / S243 F410 / S258 F417 / **S267 F358 Phase 2 (13회차)** / **S269 F358 Phase 2 재시도 (14회차 변종)** / **S341 F636 zod-openapi 0.18.4 (16회차 변종 — dependency upgrade codemod)** (S231 승격, S238 7회차, S243 8회차, S267 13회차, S269 14회차 변종, S341 16회차 변종 누적)
- **근본 원인**: autopilot의 Match Rate는 "설계 문서 ↔ 구현 코드" 매칭 기준이며, **production 데이터 shape / 배포 환경 / 외부 서비스 호환성 / DoD 산출물 실파일 존재 여부는 미검증**. 추가로 autopilot은 **실 수행 결과를 reports에 기록하는 단계를 자주 누락** — Plan DoD에 명시된 "wrangler dev PASS 결과" 같은 증거가 reports/ 또는 Report .md 본문에 안 들어감
- **필수 점검 (Sprint MERGED 직후)**:
  1. Production API 응답 shape 실측 (curl + jq) → Plan/Design 가정과 대조
  2. Production secrets/env vars 존재 확인 (`wrangler secret list --env production` + `.env` 대조)
  3. 외부 서비스 E2E 실 호출 1건 이상 수행 (mock이 아닌 실 endpoint)
  4. D1 migration production 적용 확인 (`d1_migrations` 테이블 cross-check)
  5. CF Workers 로그 `wrangler tail` 30초 관찰 (runtime error 감지)
- **변종 14회차 점검 절차 ("실 수행 + reports 미첨부" 의심 시, S269 표준화)**:
  1. **Process 생존 확인**: `ps -ef | grep -E "wrangler dev|workerd" | grep <sprint-NNN>` — autopilot이 실제 wrangler dev 띄웠는지 PID + elapsed time 확인 (5분 이상 alive면 실 수행 증거)
  2. **HTTP probe**: `curl -s -w "HTTP=%{http_code} time=%{time_total}\n" http://localhost:<port>/health` — HTTP 200 + 정상 JSON 응답이면 cold-start 정상 boot 입증
  3. **--dry-run 독립 재현**: `cd services/<svc> && npx wrangler deploy --dry-run --outdir=/tmp/dry-NNN` — Cloudflare validation 통과 + bundle size 합리적이면 PASS
  4. **PoC 패턴 적용 검증** (코드 inspection): 사전 PoC에서 정립한 우회 패턴이 본 PR 코드에 모두 적용됐는지 grep으로 확인 (예: `[alias]` + `[[rules]] type="CompiledWasm"` + `instantiateWasm` hook)
  5. **reports 보강 fixup commit**: Master 검증 결과를 `reports/sprint-NNN-master-validation-YYYY-MM-DD.md`로 기록 + 기존 Report .md에 결과 단락 추가 → main fixup commit (post-merge 가능, evidence trail 완결)
- **변종 16회차 점검 절차 ("dependency upgrade codemod logic-altering" 의심 시, S341 표준화)**:
  1. **Multi-input smoke probe**: production endpoint를 단일 input(`-d '{}'`)로만 검증 금지. **최소 3 input pattern** 시도 — (a) plain POST(no body, no content-type), (b) empty JSON body, (c) partial valid body. 다른 결과면 broken 분기 존재.
     ```bash
     # smoke-test.sh 동일 패턴 (no body)
     curl -X POST <endpoint>  # → HTTP 500이면 broken
     # manual probe (zod validation early-catch)
     curl -X POST -H "Content-Type: application/json" -d '{}' <endpoint>  # → HTTP 400 (정상이라 안심 금지)
     ```
  2. **`wrangler tail` 30초 관찰** (deploy-api success 직후): runtime exception/throw stack 감지. typecheck/test에서 잡히지 않는 logic error는 production runtime에서만 노출.
  3. **codemod 변경 line-level 감사**: PR `git diff --stat` 후 codemod-fixed files(예: `auth.ts +14/-9`)를 1건씩 manual review — autopilot이 해당 파일 안에 fix를 어디 어떻게 적용했는지 (전수 vs 부분), 다른 분기는 정확히 fix 됐는지.
  4. **회귀 테스트의 input coverage 점검**: vitest test fixture가 zod validation 통과 케이스만 다루면 broken 분기 미감지. validation 실패 케이스(no body, partial body, malformed)도 별도 expectation 명시 필요.
  5. **즉시 revert 결정 트리거**: production smoke 1건이라도 5xx 응답하면 **사용자 인터뷰 → revert vs hotfix forward 결정** (S341 절차). master HEAD revert PR 5분 내 생성 + auto-merge → deploy 트리거 + 7-probe smoke verify로 회복 확증.
- **판정 원칙**: "autopilot 자체 Match % ≠ Production 동작 증명"이라는 메타 규칙. Match 100% + CI green + Production smoke PASS 3축 동시 충족 시에만 완결 선언. **Production smoke PASS는 autopilot이 자체 증명 금지 — Master가 독립 실측 필수** (리포트 §Cost/Performance 표의 "실제" 수치는 autopilot 작성분이면 hallucination 가능성 상시 의심, reports/ 디렉토리 실파일 `ls` 확인이 최후 증거).
- **변종 14회차 판정 원칙**: reports에 evidence 미첨부 ≠ 미수행. Master가 `ps + curl` 1차 검증으로 PASS 입증 가능하면 documentation 누락(post-merge fixup 가능 사항)으로 분류. 단 5분 이상 wrangler dev process가 alive 안 했다면 실 미수행으로 분류 + revert 또는 fix-forward 결정.
- **DoD 작성 시 회피 패턴 (Plan 단계, S268~S269 정착, S341 dependency upgrade 추가)**:
  - Plan DoD에 "`wrangler dev` 200 OK + Cloudflare API code 10021 미발생" 명시 (실측 가능한 단일 PASS 기준)
  - Plan DoD에 "`wrangler deploy --dry-run` PASS (번들 사이즈 ≤ NMB)" 명시 (CI green 와 분리된 추가 게이트)
  - Plan DoD에 "결과 reports/ 디렉토리에 실파일 N건 생성" 명시 (autopilot evidence 강제)
  - PoC 단계 사전 분리 (예: Sprint 256 F424 PoC → Sprint 257 본 통합 패턴) — 신규 npm dependency 추가 시 사전 wrangler dev 단독 import PoC 의무화
  - **Dependency upgrade sprint 추가 패턴 (S341)**:
    - **PoC 사전 분리 의무화**: dependency upgrade는 단일 sprint 무리 통합 금지. minimum 1 file PoC sprint 선행 → 정확한 breaking change 식별 → 본 통합 sprint
    - **Multi-input smoke probe DoD 명시**: "production smoke 3 input pattern (no body / empty JSON / partial valid) 모두 4xx/2xx — 5xx 0건"
    - **codemod transparency DoD**: autopilot이 codemod 적용 시 변경 line별 manual review 결과 reports 첨부 (대량 fix는 grep + sample inspection)
    - **회귀 test input coverage DoD**: validation 실패 케이스 expectation 명시 (no body / partial body / malformed)
    - **wrangler tail 30s DoD**: deploy-api success 후 runtime exception 0건 30초 관찰 결과 reports 기록
    - **Type 충족 ≠ Logic 정확성 메타 인식**: typecheck PASS는 type system 만족이지 runtime semantic 보장 아님. 특히 codemod로 status code 명시화/null assertion 같은 변경은 logic 분기 영향 가능성 상시 의심

## task-daemon idle silence (S243 신설, 2026-04-29)
- **현상**: 사용자가 "task-daemon이 백그라운드에서 안 돈다/멈췄다" 인식 → 진단 결과 daemon은 정상 alive + heartbeat 매 `TICK=15s` 갱신 중. 단지 **로그 침묵**으로 dead처럼 보임
- **근본 원인**: `task-daemon.sh:894` `phase_sprint_signals`이 **`STATUS=DONE`만 처리** (`[ "$status" = "DONE" ] || continue`). FAILED/IN_PROGRESS/CREATED/MERGING/MERGED는 silent skip → DONE signal 0개면 매 tick `/dev/null` redirect로 인해 사용자 가시 활동 0. autopilot이 self-FAILED 마킹 후 외부에서 STATUS=IN_PROGRESS reset해도 daemon은 트리거 안 됨 — **STATUS=DONE 마킹은 autopilot 책임**
- **표준 점검 절차 (사용자 "daemon 안 돈다" 시 즉시 dead 가정 금지)**:
  1. `ps -p $(cat ~/.foundry-x/daemon.pid)` — process alive
  2. `cat ~/.foundry-x/daemon-heartbeat` 30s 간격 두 번 → 갱신 확인 (heartbeat이 갱신되면 work loop alive)
  3. `tail /tmp/task-signals/daemon-${PROJECT}.log` — 마지막 활동 시각 + 메시지
  4. `for s in /tmp/sprint-signals/*.signal; do grep '^STATUS=' "$s"; done` — DONE 0개면 daemon은 정상 idle
- **재발 방지 (다층화)**:
  - **L1 인식 개선**: log 침묵 ≠ daemon dead. heartbeat 갱신 = work loop alive
  - **L2 외부 reset 한계**: Master에서 STATUS=FAILED → IN_PROGRESS reset은 daemon에 의미 없음 → autopilot pane에 fix 지시 주입해서 STATUS=DONE까지 도달시키는 것이 표준 경로
  - **L3 Autopilot 패턴 인식**: autopilot이 push 후 CI 결과 미확인 + 자체 "Match X% 완료"로 STATUS=FAILED/DONE 조기 마킹 → "Autopilot Production Smoke Test" 8회차 카운트로 분류
  - **L4 daemon 코드 개선 후보 (deferred)**: `--status` 출력에 last action time + active signals breakdown(DONE/FAILED/IN_PROGRESS count) 추가, 매 N tick(예: 100 tick = 25분)마다 `[heartbeat] alive, signals=N (DONE=0, ...)` idle alive log emit. 현재는 `phase_learn` 100 tick 주기 활용 가능
- **연관 패턴**: rules/development-workflow.md "Autopilot Production Smoke Test" + S307 tmux 3.5a "task-daemon이 stale pane 복구 무한 retry" 패턴

## Sprint 병렬 (Pipeline)
- 동시 3개 Sprint 권장, ccw-auto 3개 이하
- 배치 분할: 의존성 → 변경 영역 충돌 → D1 migration 충돌 순
- merge 순서: 변경 작은 것 먼저, D1 오름차순, shared/ 먼저

## 멀티 pane 격리
- pane = worktree 1:1 바인딩 (같은 워킹트리 2 pane 금지)
- worktree 루트: `CLAUDE_WT_BASE=/home/sinclair/work/worktrees` (C10: 절대경로 고정)
- ad-hoc: `wtsplit <name>` (scratch/* 브랜치), 정리: `wtclean`
- scratch WT 완료 후 master merge+push 검증 필수 (S252 교훈)
- merge 후 `git worktree remove` 필수 (유령 worktree 방지)

## Git 고아 리소스 방지 (S253 교훈)
- **근본 원인 5종**: GitHub `delete_branch_on_merge` 꺼짐 + git `fetch.prune` unset + squash merge는 `git branch --merged`에 안 잡힘 + sprint clean 스코프가 `sprint/*`만 + 자동 trigger 부재
- **L1 prevention (설정)**: `git config --global fetch.prune true` + GitHub repo `delete_branch_on_merge=true` 유지
- **L2 감지/정리 (스크립트)**: `/home/sinclair/scripts/git-orphan-scan.sh` (점검), `git-orphan-clean.sh` (실행)
  - Squash-aware: `git branch --merged` 대신 `gh pr list --head <branch> --state all`로 PR API 기반 판정
  - 스코프: 모든 로컬 브랜치 (sprint/*, task/*, fix/*, feat/*, test/* 등 무관)
  - 보호: master/현재/WT/tmux 활성/signal IN_PROGRESS
- **L3 session-start 자동 점검**: 세션 시작 시 `git-orphan-scan.sh --quiet` 실행 → 고아 발견 시 안내. 자동 삭제는 않고 사용자 확인 후 `git-orphan-clean.sh`
- **L4 post-merge 자동 정리**: `sprint-merge-monitor.sh`가 PR merge 직후 해당 브랜치 로컬 삭제 수행 (squash-aware)
- **판정 원칙**: MERGED = 자동 삭제 가능 / CLOSED = 수동 확인 / OPEN·no-PR = 유지

## PDCA Gap 처리
- 코드 불가 gap: Design에 사유 기록, FAIL로 남기되 의도적 제외 명시
- iterate 후 Design 역동기화 (코드→Design)

## ax plugin 스킬 추가/삭제 동기화 (8곳)
1. 스킬 소스 → 2. 캐시 양쪽 버전 → 3. help 스킬 → 4. marketplace 문서
5. Global CLAUDE.md → 6. 웹 UI 하드코딩 → 7. selfcheck(자동) → 8. 캐시 문서

## ax plugin 스킬 내용 수정 동기화 (3단계)
1. source 편집: `~/.claude/plugins/marketplaces/ax-marketplace/skills/*/SKILL.md`
2. cache 동기화: `cp source cache` — 양쪽 HOME(real/work)의 cache 확인
   - 현재 환경: symlink 공유라 1회 편집으로 전파 (환경 의존적, 보장 아님)
   - drift 발생 시: `diff -rq source cache` → cp 또는 plugin 재설치
3. git commit+push: `cd ~/.claude/plugins/marketplaces/ax-marketplace && git add <파일> && git commit && git push`
- 검증: `/ax:infra-selfcheck` C9 (Plugin Cache Drift) — drift=0 확인

## 프로젝트 스킬 이름 충돌 금지
- `.claude/skills/`에 스킬 생성 시 ax 플러그인 스킬과 동일한 이름 사용 금지
- 확인: `ls ~/.claude/plugins/cache/ax-marketplace/ax/*/skills/` 목록과 이름 중복 체크
- 위반 시: Claude Code `/` 메뉴에 동일 커맨드가 중복 표시됨 (S250 교훈)
- 플러그인 스킬 확장이 필요하면 플러그인 원본을 수정하거나, 다른 이름(접두사 `fx-` 등) 사용

## API key 과금 방어 (S250 교훈)
- `.claude.json`에 `primaryApiKey` 절대 금지 — 있으면 구독 대신 API 과금
- bashrc `_cc_billing_guard()` + ccs 래퍼가 시작 전 자동 차단
- 발견 시: `_cc_remove_api_key` 실행 → `claude auth login` 재인증
- WT 탭 계정 전파: `wt-claude-worktree.sh`에 `CALLER_HOME` 인자로 Master HOME 전달

## Hook
- PreToolUse: 5초 timeout / PostToolUse (typecheck+lint): 60초 timeout

## tmux 3.5a segfault 대응 (S307 교훈, 2026-04-19)
- **현상**: `/home/sinclair/.claude-work/.local/bin/tmux` (3.5a custom build)의 null pointer dereference(`mov r13d, [r14+0x8]`, r14=NULL)로 server[PID] SIGSEGV → 전체 pane 영구 소실 → Claude Code 세션 강제 종료
- **2차 피해**: task-daemon이 stale pane `%N`을 계속 복구 시도 → 무한 retry 루프 (C79 36회+ 관측). tasks-cache.json `status=in_progress` + `pane=%N` 필드가 daemon phase_watch 진입점이라 외부 정리 없이는 자동 해소 안 됨
- **L1 근본 해결 (✅ 세션 213, 2026-04-19)**: tmux **3.6a + Issue #4851 cherry-pick** 빌드 교체 완료
  - 조사 결과: upstream은 이미 3.6(2025-11-26) / 3.6a(2025-12-05) stable 릴리스, "3.5a master 재빌드"는 실질적으로 master HEAD 빌드임
  - #4851(`server_client_check_modes` NULL curw deref, 2026-02-10 fix by nicm, commit `5a33616e`)가 S307 스택(`r14=NULL, +0x8` offset = `curw->window` field)과 계열 일치
  - 3.6a는 #4851 fix 미포함(2025-12 릴리스) → 3.6a tarball + `5a33616e.patch` cherry-pick (Hunk #2 핵심 fix만 적용, Hunk #1은 cosmetic line-break)
  - 설치: `/home/sinclair/.claude-work/.local/bin/tmux` (1,281KB, 3.6a) + backup `tmux.3.5a-backup` (1,193KB)
  - 활성화: 기존 3.5a server 프로세스는 메모리 로드 상태로 계속 동작 → **`tmux kill-server` + 새 session 생성 시점부터 3.6a 사용**. 전환 전 L4(tmux-resurrect) 도입 권장(현재 pane 보존)
- **L2 하드 상한 (구현 완료)**: `task-daemon.sh` `TASK_MAX_RETRY=5` 추가. `enqueue_retry`에서 attempts 초과 시 `tasks-cache.json status=failed` + retry 파일 `/tmp/task-retry/archive/` 이동
- **L3 재시작 감지 (구현 완료)**: `phase_tmux_health` 추가. `tmux display -p '#{start_time}'` 변화 감지 시 모든 `in_progress` task를 `failed(tmux_server_restarted)`로 일괄 전환. 매 tick 실행, phase_watch 직전 배치
- **L4 세션 복구 (✅ 세션 215, 2026-04-19)**: tpm + tmux-resurrect + tmux-continuum 설치 완료. `/home/sinclair/.tmux/plugins/{tpm,tmux-resurrect,tmux-continuum}` + `~/.tmux.conf` 하단에 플러그인 섹션 추가(`@continuum-save-interval '15'`, `@continuum-restore 'on'`, `@resurrect-capture-pane-contents 'on'`). 키: `prefix(C-b) + C-s` save / `prefix + C-r` restore. resurrect 저장소: `~/.tmux/resurrect/last` (symlink to `tmux_resurrect_*.txt`) + `pane_contents.tar.gz`. `tmux kill-server` + 새 세션 기동 시 continuum-restore=on에 의해 자동 복구. **3.6a 전환은 kill-server 이후 차기 tmux server부터 활성화**
  - **Retention 정책 (세션 215)**: 15분 주기 × 96 saves/day → 연간 ~60MB 누적 방지. `~/.claude/scripts/prune-resurrect.sh` (ax-config 리포에서 git 추적) ← `~/.tmux/prune-resurrect.sh` symlink로 연결. `@resurrect-hook-post-save-all` hook 등록(**절대경로 필수** — `~` expansion은 shell HOME=`.claude-work` 따라감, tmux server HOME=`/home/sinclair`). 정책: **최신 20개 무조건 보존 + 20개 초과분 중 7일 이상만 삭제**. 로그 `~/.tmux/resurrect/prune.log` (prune 발생 시만 기록, 조건 미충족 시 조용히 exit 0). 검증: 30개 투입 → 10일 전 10개 삭제, 20개 유지.
  - **환경 간 배포 (세션 215 후속)**: ax-config clone 후 `bash ~/.claude/scripts/install-tmux-hooks.sh` 실행 → (1) symlink 생성, (2) `~/.tmux.conf` 말미에 `source-file ~/.claude/scripts/tmux-plugins.conf` 자동 주입, (3) tmux 서버 실행 중이면 즉시 reload. Idempotent (재실행 안전, 기존 파일은 `.bak` 백업 후 교체). Shell `$HOME`이 real HOME과 다른 환경(Claude Code `.claude-work`) 대응을 위해 `getent passwd $USER`로 target HOME 자동 감지 (`AX_TARGET_HOME` env var로 오버라이드 가능).
  - **Conf 분할 구조**: `~/.tmux.conf` = 시스템별 유지(win32yank 경로 등) / `~/.claude/scripts/tmux-plugins.conf` = ax-config repo 공유 (@plugin + @resurrect + @continuum + @resurrect-hook-post-save-all). 공유 conf에서는 `~/`로 경로 지정 — tmux 서버가 expand (continuum 자동 save는 서버 컨텍스트라 정상, 수동 `bash save.sh` 디버깅만 shell HOME 영향).
- **긴급 대응 플레이북**: (1) `tmux list-sessions` 로 server 생존 확인, (2) dmesg `tmux.*segfault` grep, (3) `task-daemon.sh --stop`, (4) `tasks-cache.json`에서 `status=in_progress && pane=%N` 중 실제 pane 없는 건 수동 `status=failed` 마킹, (5) daemon 재시작

## Sprint MERGED Master 알림 4-Layer (S262 신설, 2026-05-04)
- **현상**: Sprint 250 MERGED(09:33) 후 Master Claude가 사용자 수동 입력("작업 점검") 시점까지 인지 못함. `task-daemon`이 다른 프로젝트(Foundry-X) repo에서 시동되어 Decode-X signal까지 처리하지만, 자체 로그(`/tmp/task-signals/daemon-{project}.log`)에만 기록 + Master pane에 외부 알림 0건.
- **근본 원인**: `phase_sprint_signals` MERGED 마킹 단계가 `log "✅ sprint-{N} — MERGED"` 만 수행. Master Claude는 signal 파일을 polling 안 하고 notification 시스템도 미연결. autopilot pane이 `sprint_cleanup_pane`로 자동 종료되어 시각적 신호조차 사라짐.
- **Fix — 4-Layer (Foundry-X `scripts/task/task-daemon.sh:1064~1090`, commit `9b5460a8`)**:
  - **L1 notification file**: `~/.foundry-x/notifications.ndjson` append (`event:sprint_merged`, `consumed:false`, sprint/pr/project/match_rate/api/web/ts 포함)
  - **L2 tmux display-message**: master claude pane 휴리스틱 탐색(`pane_current_command=claude` && `pane_current_path !~ worktrees|sprint-`) → 30s 토스트
  - **L3 notify-send**: WSL/Linux desktop notification (있으면, 비치명 silent fail)
  - **L4 UserPromptSubmit hook**: `/home/sinclair/scripts/sprint-notification-surface.sh` — `~/.claude/settings.json` `hooks.UserPromptSubmit`에 등록. 매 user prompt 직전 consumed:false 이벤트 stderr 출력 + consumed:true 마킹(중복 surface 방지). 5s timeout (SessionStart 5s 룰 동일).
- **검증 절차 (재발 시)**: (1) signal `STATUS=MERGED` 시 `~/.foundry-x/notifications.ndjson`에 새 line 있는지 `tail -1` 확인, (2) tmux display-message 떴는지 master pane 화면, (3) hook script 직접 실행 `bash ~/scripts/sprint-notification-surface.sh` 시 consumed:false 모두 surface 후 consumed:true 변환되는지, (4) 다음 user prompt 직전 stderr surface 확인.
- **WT 정리는 정상 동작**이므로 silent 종료 ≠ broken pipeline. 알림 layer 누락 fix만 의미.
- **확장 후보**: `event:sprint_failed`, `event:ci_failed`도 동일 4-layer 적용 가능. 현재는 MERGED만 활성.

## Sprint stale `.sprint-context` / signal F_ITEMS 패턴 (6회 재현 승격 S269, 2026-05-05)
- **현상**: `bash -i -c "sprint N"` 실행 시 신규 Sprint 정보(SPRINT_NUM, F_ITEMS)가 **직전 Sprint 컨텍스트 캐시 값으로 채워진 채** signal + `.sprint-context` 양쪽에 기록됨. tmux WT 탭 제목이 "Sprint N — F<직전 F-item>"으로 표시되고, autopilot이 잘못된 F-item으로 작업 시도 가능.
- **재현 6회 누적**: S256 (Sprint 240→241?) / **S262 신설 명명** (Sprint 248→250) / S263 (Sprint 250→251 SPRINT_NUM=250 + F_ITEMS=F403) / S266×3 (Sprint 252/253/254 모두 — Sprint 252 F359→F357 / Sprint 253 F359→TD-41 / Sprint 254 F357→F358-phase-1) / S267 (Sprint 254→255 F358-phase-1→F358-phase-2,F361) / **S269 6회차** (Sprint 256→257 F424→F358-phase-2,F361). lifecycle 승격 조건 A(2회+) 한참 초과 + 사용자 명시 요청(C 조건)으로 본 섹션 신설.
- **근본 원인 (미확정 — 후보 3종)**:
  1. bashrc `sprint()` 함수가 `.sprint-context` 직전 값을 그대로 복사하여 새 signal 생성 (전체 stale)
  2. SPEC.md에서 F-item 추출 시 직전 Sprint 블록 매칭 (F-item만 stale, SPRINT_NUM은 정상)
  3. signal+context 두 파일 중 하나만 신규로 갱신, 다른 하나는 캐시 잔존
- **Master 표준 보정 절차 (회피책, 근본 fix 전까지 매번 수행)**:
  1. `cat /tmp/sprint-signals/<PROJECT>-<N>.signal` — `F_ITEMS=` 줄이 신규 Sprint 의도와 일치하는지 확인
  2. `cat <WT_PATH>/.sprint-context` — `SPRINT_NUM`, `F_ITEMS`, `MASTER_COMMIT`, `CHECKPOINT` 모두 확인
  3. 불일치 시 양쪽 모두 수동 보정:
     ```bash
     sed -i 's/^F_ITEMS=.*/F_ITEMS=<신규>/' /tmp/sprint-signals/<PROJECT>-<N>.signal
     # .sprint-context는 cat <<EOF로 전체 재작성 권장 (SPRINT_NUM도 stale 가능)
     ```
  4. tmux 탭 제목은 보정 안 됨 — autopilot이 signal 기준으로 동작하므로 무해 (cosmetic only)
- **근본 fix 후보 (deferred, 우선순위 순)**:
  - **L1 bashrc fix**: `sprint()` 함수 코드 점검 → SPEC.md F-item 추출 패턴 fix (Sprint 블록 헤더 정확 매칭) + signal/context 동시 갱신 보장
  - **L2 sprint() 진입점 검증 step**: signal 생성 후 `SPRINT_NUM`/`F_ITEMS` 매칭 검증 + 불일치 시 stderr warn 출력
  - **L3 ax-marketplace `/ax:sprint` skill 사용 강제**: bashrc 우회 금지. skill은 stale 패턴 자체 감지 + 보정 가능
  - **임시 회피**: 위 표준 보정 절차를 Master 세션 시작 시 자동 수행하도록 session-start Phase 5d 확장 (활성 signal 중 stale F_ITEMS 휴리스틱 감지)
- **연관 이슈**: S268 cleanup 단계에서 stale `.sprint-context` 잔존이 `git worktree remove --force` 필요 원인 1가지로 관찰. signal/context fix 후 cleanup도 정상화 가능성.
- **검증 기준 (재발 판정)**: 차기 Sprint 시동 시 signal + .sprint-context 양쪽이 신규 SPRINT_NUM + 신규 F_ITEMS로 즉시 정확히 채워지면 fix 완료. 1회라도 보정 필요 시 재발로 카운트.

## Sprint 사전 등록 + Plan 작성 fs 실측 의무화 (2회 재현 승격 S283, 2026-05-08)
- **현상**: Master(Sinclair) Sprint 사전 등록(`/ax:todo plan` Pipeline 구성, SPEC §6 신규 블록) 또는 Plan 문서 작성(`docs/01-plan/features/F{N}-*.plan.md`) 시점에 SPEC/PRD/직전 세션 기억만 보고 fs 실측 누락 → path/component 부정확. autopilot이 fs 실측 기반으로 자동 보정하여 정확한 결과 도출하지만, Plan 본문 부정확 자체는 추후 분석/감사 시 혼란.
- **재현 2회 누적**:
  1. **S280 Sprint 268 F435 (positive case)** — AIF-REQ-018 UX 개선이 `d30c002` (2026-03-10)에 이미 구현 완료. 사전 등록 시 코드 점검 누락 + REQ status IN_PROGRESS만 보고 신규 작업 등록. autopilot grep으로 정확 인식 + Plan claim "기구현"이 실제 정확. Master가 autopilot Production Smoke 14회차 변종 의심으로 STATUS reset 시도 → 잘못된 의심 (autopilot 정확).
  2. **S282 Sprint 270 F437 (Plan inaccuracy + autopilot recovery)** — Master Plan에 (a) `dashboard/GaugeSet.tsx` 명시했으나 Decode-X에 dashboard 폴더 자체 부재 (실제 `analysis-report/`), (b) "기구현 컴포넌트: ScoreGauge + CollapsibleSection + ExecutiveSummary" 단정했으나 ExecutiveSummary 미존재. autopilot이 fs 실측으로 (a) `analysis-report/` 자율 배치 + (b) ExecutiveSummary 신규 작성 → Match 97% 정상 결과.
- **공통 패턴**: 두 사례 모두 Master 작성 단계 fs 실측 누락. autopilot은 양쪽 다 fs 실측 기반 정확 동작 (hallucination 0건). lifecycle 승격 조건 A(2회 관찰)/B(원칙 수준)/C(사용자 명시 요청 "Plan 정확도 회고") 모두 충족 → 본 섹션 신설.
- **표준 절차 (3단계 점검)**:
  1. **Sprint 사전 등록** (`/ax:todo plan`, SPEC §6): 각 신규 Sprint F-item 후보별로 코드 상태 점검 1회 — `find` + `grep` + `git log --grep="REQ-XXX"`
  2. **Plan 작성** (`docs/01-plan/features/F{N}-*.plan.md`): 본문에 명시할 path/component/file을 1건씩 `ls`/`find`/`grep`으로 실재 검증. 특히 **"기구현 컴포넌트"** 또는 **"기존 인프라 재활용"** 주장은 반드시 git log + find 1회 검증
  3. **Sprint 시동 직전** (`/ax:sprint N`): 1회 추가 점검 (안전망)
- **판단 분기 (이미 구현된 경우)**:
  - (a) E2E 보강만 별도 Sprint — 회귀 검증 + Plan/Report 사후 작성
  - (b) AIF-REQ status DONE 자연 종결 — 새 Sprint 등록 안 하고 SPEC §7 status만 갱신
  - (c) docs-only Sprint — 문서 추가/보강만
- **autopilot 신뢰도 평가**: autopilot의 fs 실측 + 자율 보정은 **신뢰 가능한 표준 동작**. Production Smoke 14회차 변종(reports hallucination)과 **분리 평가**. 구분 휴리스틱: PR body에 "기구현 컴포넌트" 명시 + Master find 검증 가능 → 정확. reports/*.json 미존재 + DoD "예상치" 기재 → 의심.
- **메타 학습**: Master Plan 부정확이 있어도 autopilot fs 실측 보정으로 합리적 결과 도출되지만, **Plan 본문 자체의 정확성은 분석 문서 신뢰성 + 후속 세션 컨텍스트 정합성에 영향** → 사전 차단이 가치 있음.

## Turbo Cache 함정 — 로컬 typecheck PASS ≠ CI PASS (S337 신설, 2026-05-08)
- **현상**: 로컬에서 `pnpm typecheck` 또는 `pnpm test` 가 PASS인데 동일 코드가 CI에서 동일 명령으로 fail. 특히 신규 추가 파일(test/source 모두)의 typecheck 에러를 로컬이 놓치는 패턴.
- **재현 1회 (Foundry-X PR #769, S337 2026-05-08)**: `__tests__/openapi-spec.test.ts` 신설 + `Object.keys(obj)` + `obj[k]` 패턴 사용 → `noUncheckedIndexedAccess` strict mode 위반. 로컬 `pnpm typecheck` 결과 `Tasks: 19 successful, 19 total. **Cached: 18 cached, 19 total**` PASS 보고. CI에서 4건 TS2532/TS18048 에러로 fail. 사용자 c17ada22 hotfix(`Object.entries → [k, v]` destructure + nullable 체크)로 회복.
- **근본 원인 (Foundry-X 환경 추정)**:
  1. 로컬 `pnpm typecheck`(packages cwd) 가 turbo wrapper로 실행되며 `.turbo/` 캐시를 참조
  2. turbo cache key 계산이 신규 파일 추가를 정확히 invalidation에 반영 못함 (또는 개발 중 cache가 stale로 잔존)
  3. cache hit으로 `tsc --noEmit` 실제 실행 skip → 새 strict 에러 검출 실패
  4. CI는 `actions/cache` 캐시 miss(또는 다른 OS hash) → 실제 tsc 실행 → 진짜 에러 표면화
- **표준 회피 절차 (변경 큰 PR 직전 또는 신규 파일 추가 후)**:
  1. **`Cached: N cached, M total`** 메시지에서 `cached >= 80%` 면 의심
  2. **직접 tsc 실행**: `cd packages/<pkg> && pnpm exec tsc --noEmit` (turbo 우회). cache 무관한 진짜 결과
  3. **또는 force 재실행**: `pnpm turbo run typecheck --force` (모든 task cache 무시 재실행)
  4. **또는 cache 폐기**: `rm -rf .turbo packages/*/.turbo` 후 재실행
  5. 변경 파일이 5개 이상 또는 신규 디렉토리/파일 추가 시 위 중 1가지 필수
- **회피 어려운 strict 에러 패턴 (Foundry-X TS strict mode)**:
  - `Object.keys(obj)` 후 `obj[k]` 인덱싱 → `TS2532: Object is possibly 'undefined'`. **회피**: `Object.entries(obj)` 로 `[k, v]` destructure
  - `arr[i]` 직접 인덱싱 → `TS18048: 'arr[i]' is possibly 'undefined'`. **회피**: `arr.at(i)` + nullable 체크 또는 `for (const x of arr)` 패턴
  - `responses[code]` (Record 인덱싱) → `r?.content` nullable 체크 필수
  - 동일 패턴 eslint rule(`@typescript-eslint/no-non-null-assertion` + `noUncheckedIndexedAccess`) 강제 가치 있음
- **판정 원칙**: 로컬 `Tasks: N successful, **all cached**` 는 PASS 증거가 **아님** — "이전에 PASS 캐시" 증거. 실 변경의 typecheck 통과 증거는 cache miss로 실 실행한 결과만 유효. PR 직전엔 항상 cache 우회 1회 실행.
- **연관 패턴**: rules/development-workflow.md "Autopilot Production Smoke Test"(15회 재현)와 동계열 — "통과 보고 ≠ 진정 통과". autopilot Match % / cache PASS / CI green 모두 자체 증명 신뢰 금지, 독립 실측이 진실.
- **확장 후보 (deferred)**:
  - L1 PostToolUse hook에 `pnpm exec tsc --noEmit` 직접 실행 추가 (turbo 우회, 신규 파일 변경 시 즉시 검증)
  - L2 PR template에 "변경 파일 5개+ 시 `--force` 재실행 결과 첨부" 체크박스
  - L3 turbo cache key 계산에 디렉토리 ls 결과 포함하도록 패키지별 turbo.json 조정 (turbo 자체 한계라 어려움)
- **재현 카운트**: 1회 (S337). 2회+ 시 "Source-First Fix Order" 패턴처럼 lifecycle 폐기/유지 재판정.
