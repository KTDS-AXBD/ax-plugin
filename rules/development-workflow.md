# 개발 워크플로우 패턴 (Cross-Project)

## 배포
- Cloudflare Pages 배포 시 프로젝트명 정확히 확인 (예: `ai-foundry-web` ≠ `ai-foundry`)
- Production 배포 시 `--env production` 필수 여부 확인

## D1/SQLite 공통
- D1 remote `--file` 사용 시 OAuth 인증 에러 발생 가능 → `--command` 인라인 방식이 안정적
- 마이그레이션 추가 시 테스트 헬퍼에도 SQL 추가 필수 (프로젝트별 위치 상이)
- **프로덕션 마이그레이션 drift 방지**: 세션 종료 전 `wrangler d1 migrations list --remote`로 미적용 마이그레이션 확인 필수. 로컬에서만 적용하고 프로덕션에 누락하면 런타임 500 에러 발생 (S396 교훈)
- 프로덕션 마이그레이션은 `wrangler d1 migrations apply --remote` 권장. `--command` 수동 적용은 wrangler 추적 테이블(`d1_migrations`)에 기록되지 않아 drift 감지에 방해

## 문서 거버넌스 (PDCA + SPEC 정합성)
- **SPEC.md 등록 선행 원칙**: Plan/Design/Analysis 작성 전에 반드시 SPEC.md에 F-item + REQ코드를 먼저 등록. SPEC 없이 F번호를 선점하면 나중에 범위·제목·우선순위 drift 발생 (Foundry-X S18 교훈)
- **SPEC 등록 후 즉시 커밋+push 필수**: `/ax-req-manage new` 또는 F-item 수동 등록 후, WT 생성(`sprint N`) 전에 반드시 `git commit + push`. 미커밋 상태에서 WT를 생성하면 WT가 미등록 SPEC을 갖게 됨 (S149 교훈). 순서: SPEC 등록 → 커밋 → push → sprint N
- **병렬 세션 drift 방지**: 여러 세션에서 동시에 문서를 작성할 때, SPEC.md 갱신은 **한 세션에서만** 수행. 다른 세션은 F번호를 참조만 하고, SPEC 변경은 리더 세션에 위임
- **소급 등록 시 점검 항목**: 이미 Plan/Design이 F번호를 사용 중인데 SPEC 미등록이면 → (1) 제목·우선순위를 기존 문서 기준으로 통일 (2) SPEC에 소급 등록 (3) 6-way 정합성 확인 (SPEC / Plan / Design / Analysis / GitHub Issue / GitHub Project)

## Sprint WT 실행 규칙 (S149 교훈)
- **WT 생성**: 반드시 `bash -i -c "sprint N"` 사용. `git worktree add` + `wt.exe` 직접 호출 금지
  - bashrc `sprint()` → `wt-claude-worktree.sh` → tmux 세션 + 배너 + ccs/ccw 래퍼
  - WT 경로: `~/work/worktrees/{project}/sprint-{N}` (`CLAUDE_WT_BASE` 기반)
  - `~/.claude-work/work/worktrees/`에 생성하면 경로 불일치로 전체 인프라 미적용
- **claude 실행**: WT에서 항상 인터랙티브 모드(`ccs` 또는 `ccw`). `claude -p` / pipe 모드 금지 (TUI 미표시)
- **autopilot 자동 실행**: `tmux send-keys -t "sprint-{project}-{N}" "ccs" Enter` → `sleep 5` → `tmux send-keys ... "/ax-sprint-autopilot" Enter`
- **진행 점검**: `tmux capture-pane -t "sprint-{project}-{N}" -p -S -30`

## Hook 설정
- PreToolUse hook: 5초 timeout 권장
- PostToolUse hook (typecheck+lint): 60초 timeout 권장

## Sprint 병렬 작업 원칙 (Pipeline Optimization)

### 배치 구성 기준
- **최대 배치 크기**: 동시 3개 Sprint 권장, 4개 이상은 리소스(tmux pane, CPU, 메모리) 상황 확인 후 결정
- **예상 시간**: Sprint 1개 = 약 20~40분 (Plan/Design 존재 시), 배치 = 최대 Sprint의 소요시간
- **배치 분할 우선순위**: (1) 의존성 → (2) 변경 영역 충돌 → (3) D1 마이그레이션 충돌 → (4) 배치 크기 제한

### 충돌 영역 사전 감지 (배치 구성 전 필수)
- **위험 영역** (같은 배치 금지 또는 주의):
  - 같은 `packages/api/src/routes/*.ts` 파일 수정 → merge 시 라우트 등록 충돌
  - 같은 `packages/web/src/app/(app)/` 하위 페이지 수정 → 레이아웃 충돌
  - `packages/shared/types.ts` 양쪽 수정 → 타입 정의 충돌
  - D1 마이그레이션 동시 추가 → 번호 충돌 (자동 renumber 지원하지만, 3개 이상 동시면 수동 확인)
- **안전 영역** (같은 배치 가능):
  - 서로 다른 `routes/`, `services/`, `schemas/` 파일 → 독립
  - `.claude/skills/` vs `packages/web/` vs `tools/` → 완전 독립
  - 문서만 수정 (docs/) vs 코드 수정 → 독립
- **사전 점검 명령**: 배치 구성 후, 각 Sprint의 Plan/Design에서 변경 예상 파일을 추출하여 교차 확인

### 의존성 형식 (SPEC.md 비고 컬럼)
- `"F197 선행"` — F197이 포함된 Sprint 완료 후 실행
- `"Sprint 62 선행"` 또는 `"62 선행"` — Sprint 62 완료 후 실행
- `"61→62 순차"` — Sprint 61 결과물이 62의 입력 (순서 강제)
- `"병렬 가능"` — 명시적 독립 선언 (의존성 없음)
- `"F139 기반"` — F139의 코드를 활용하지만, 별도 수정 없이 참조만 (병렬 가능)
- 비고에 의존성 키워드가 없으면 **독립으로 간주** (배치 1 후보)

### 병렬 마이그레이션 충돌 방지
- 같은 배치의 여러 Sprint가 D1 마이그레이션을 추가하면 번호가 충돌
- **원칙**: 마이그레이션이 필요한 Sprint는 같은 배치에 최대 2개까지만 (자동 renumber 범위)
- 3개 이상이면 별도 배치로 분리하거나, merge 순서를 지정

### Merge 순서 규칙
- 같은 배치 내에서 merge 순서: **변경 범위가 작은 Sprint 먼저** (충돌 최소화)
- D1 마이그레이션이 있는 Sprint: 마이그레이션 번호 오름차순으로 merge
- `shared/` 타입 변경이 있는 Sprint: 다른 Sprint보다 먼저 merge (의존 가능성)

### 리소스 제약
- **tmux pane**: 배치당 Sprint 수 + monitor 1개 = 최대 4 pane 권장
- **ccw-auto 동시 실행**: 3개 이하 권장 (Claude API rate limit 고려)
- **Pipeline 중 master 변경 금지**: Pipeline 실행 중에는 master에 다른 push 자제

## 코드 리뷰/디자인
- PPT/UI 디자인 반복 방지: 초기 디자인 가이드라인 확정 후 구현 권장
- Agent 도구 증가 시 사용빈도 기반 정리/통합 검토
