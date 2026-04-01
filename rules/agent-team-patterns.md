# Agent Team 운영 패턴 (Cross-Project)

## 프롬프트 작성
- Worker pane 프롬프트는 **간결하게** — 길거나 코드블록이 많으면 포맷 보정 루프에 빠져 파일 미생성 종료됨
- 핵심 지시사항만 포함, 불필요한 컨텍스트 제거

## 범위 관리 (3-Layer 방어)

### Layer 1: Positive File Constraint (프롬프트)
- **허용 파일만 명시** (negative "금지" 대신 positive "허용"):
  ```
  [수정 허용 파일] 아래 파일만 수정할 수 있다. 이 외 파일 수정 시 작업 실패로 간주:
  - apps/app-web/src/components/MyComponent.tsx
  ```
- 금지 파일 명시(negative)는 효과 낮음 — Worker는 CLAUDE.md를 읽고 "도움이 될 것 같은" 추가 작업을 시도
- **CLAUDE.md/SPEC.md/INDEX.md** 등 프로젝트 메타 파일 수정 금지를 반드시 명시

### Layer 2: File Guard (runner 스크립트)
- runner 스크립트에서 Worker 완료 후 `allowed-{N}.txt` 목록 외 변경을 **자동 revert**
- 새로 생성된 파일도 허용 목록에 없으면 **자동 삭제**
- revert 내역은 `guard-{N}.log`에 기록 → 리더가 Step 4b에서 확인

### Layer 3: 리더 수동 검증 (최후 방어)
- File Guard 미적용 시, 리더가 `git diff --stat` + `git checkout --` 으로 수동 정리
- 범위 이탈은 반복 패턴 — 3-Layer 전부 적용해도 100% 차단은 불가, 항상 확인

## 완료 확인
- Worker 완료 여부: pane title만으로 판단 불가 → **DONE 마커 + 파일 존재** 동시 확인
- `--dangerously-skip-permissions` 모드에서 Worker가 git commit까지 실행할 수 있음 → 프롬프트에 "git 작업 금지" 명시

## 테스트 위임
- DB 기반 복잡 테스트(FK 관계, 다중 insert)는 Worker 실패 확률 높음 → 리더가 직접 처리
- 순수 함수 테스트만 Worker에 위임
- tenantMembers insert 시 `id` PK 필수 — Worker가 자주 누락하는 패턴, 프롬프트에 명시

## Worktree Isolation 조합

- **CC 2.1.75+** Agent 도구에 `isolation: "worktree"` 옵션 추가됨 — 빌트인 subagent용
- `/ax-git-team` (tmux 기반)에서도 동일 개념 적용 가능: worker runner에서 `git worktree add`로 독립 복사본 생성 → 작업 후 리더가 `git merge`
- **사용 시점**: worker끼리 같은 모듈/파일을 건드릴 가능성이 있을 때, 실험적 변경을 안전하게 시도할 때
- **주의**: DB 의존 작업(마이그레이션, 시드)은 worktree마다 로컬 DB가 별도 → 기존 공유 모드가 적합
- worktree에서는 `pnpm install` 필요할 수 있음 (node_modules 심볼릭 링크 여부에 따라)

## 문서 작업 위임
- Worker에 Plan/Design 작성을 위임할 때, **SPEC.md F-item 등록은 리더가 먼저 완료** 후 F번호를 프롬프트에 명시 (예: "F37~F40 범위로 Design 작성"). Worker가 자체적으로 F번호를 결정하면 SPEC과 drift 발생
- 상세: `~/.claude/rules/development-workflow.md` "문서 거버넌스" 섹션 참조

## 멀티 pane 교차 커밋 방지 (S23 교훈)
- **Worker 완료 후 즉시 커밋 필수**: Worker 작업이 끝나면 리더가 `git add + commit`을 먼저 수행. 미커밋 파일이 공유 워킹 트리에 남아 있으면 다른 pane이 `git add .` 또는 `git checkout`으로 손실 가능
- **병렬 pane이 있을 때 worktree 사용 권장**: 같은 window에 여러 Leader가 있으면, `/ax-git-team`의 worktree 모드를 사용하거나 최소한 리더가 Worker 완료 직후 즉시 커밋
- **`git add .` 절대 금지 재확인**: 다른 pane의 미커밋 파일까지 포함될 수 있음. 반드시 파일 개별 지정
- 실제 사례: Sprint 8 API services 9개 + routes 2개 + tests 12개가 F47 pane 커밋 시 손실 (c7dd44c)

## Sprint Pipeline 배치 운영

### 배치 크기 + 자원 제한
- **동시 Sprint**: 최대 3개 권장. 4개 이상은 tmux pane + Claude API rate limit 확인
- **ccw-auto 동시 실행**: 3개 이하 (429 에러 방지)
- **배치 시간**: Sprint 1개 = 20~40분, 배치 = 최대 Sprint의 소요시간
- **Monitor pane**: 배치당 1개 background — `sprint-merge-monitor.sh`

### Sprint 간 상태 추적
- **Signal 파일**: `/tmp/sprint-signals/{project}-{N}.signal` 상태 머신
- **Pipeline State**: `/tmp/sprint-pipeline-state.json` — 배치별 진행/완료/실패
- Master Claude는 Monitor 완료 알림까지 다른 작업 가능 (non-blocking)

### 배치 간 Merge 순서
- 같은 배치 내: **변경 범위 작은 Sprint 먼저** merge (충돌 최소화)
- D1 마이그레이션 포함: 마이그레이션 번호 오름차순
- `shared/` 타입 변경 포함: 다른 Sprint보다 먼저 (의존 가능성)
- 상세: `~/.claude/rules/development-workflow.md` "Sprint 병렬 작업 원칙" 참조

## 에러 패턴
- `toThrow("한국어 메시지")` → 에러 클래스 리팩토링 시 메시지 포맷 변경으로 테스트 깨짐 → `toThrow(ErrorClass)` 타입 기반으로 전환
- pane title `tmux select-pane -T` 명령은 `claude -p` 실행 **전**에 위치시켜야 실행 중 표시됨
