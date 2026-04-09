---
name: help
description: |
  ax 스킬셋 사용 가이드 — 23개 스킬의 용도, 서브커맨드, 실전 사례 안내.
  Use when: ax help, ax 도움말, 스킬 목록, 사용법, ax commands, 뭐가 있어
argument-hint: "[스킬명]"
user-invocable: true
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
---

# ax Help — 스킬셋 사용 가이드

`$ARGUMENTS`에 특정 명령명이 있으면 해당 명령 상세 안내, 없으면 전체 목록을 출력한다.

## 전체 목록 (인자 없을 때)

```
## ax 스킬셋 가이드

### 🔄 세션 라이프사이클
| 명령 | 용도 | 트리거 |
|------|------|--------|
| `/ax:session-start` | 세션 시작 — 컨텍스트 복원 + F항목 감지 + 정합성 점검 | "시작", "session start" |
| `/ax:daily-check` | 환경 점검 — 런타임/Git/의존성/TypeScript/Hook/D1/SPEC.md 수치 | "환경 점검", "daily check" |
| `/ax:session-end` | 세션 종료 — 수치 동기화 + 커밋 + 문서 갱신 + push + 배포 점검 | "마무리", "끝", "session end" |

### 🌳 Sprint & 병렬 작업
| 명령 | 용도 | 트리거 |
|------|------|--------|
| `/ax:sprint` | Master에서 Sprint worktree 오케스트레이션 | "sprint", "스프린트", "worktree" |
| `/ax:sprint-autopilot` | Sprint WT 전체 자동화 — Plan→Design→Implement→Analyze→Report | "autopilot" |
| `/ax:sprint-pipeline` | 복수 Sprint 의존성 분석→배치 병렬 실행→자동 merge | "pipeline", "배치 스프린트" |
| `/ax:sprint-watch` | Sprint WT 원격 모니터링 — Gist 주기 갱신 + 완료 시 merge 자동 실행 | "sprint watch", "모니터링", "gist" |
| `/ax:git-team` | tmux Agent Teams 병렬 실행 (같은 pane 내) | "agent team", "병렬 작업" |

### 📋 요구사항 관리
| 명령 | 용도 | 트리거 |
|------|------|--------|
| `/ax:req-interview` | 인터뷰 → PRD → AI 검토 → 착수 판단 | "기획", "요구사항", "PRD" |
| `/ax:req-manage` | REQ 등록/분류/상태변경/동기화 | "요구사항 등록", "REQ" |
| `/ax:req-integrity` | SPEC ↔ Issues ↔ Plan 3-way 정합성 | "정합성", "drift" |

### 🔧 코드 & 배포
| 명령 | 용도 | 트리거 |
|------|------|--------|
| `/ax:code-verify` | lint + typecheck + test 한번에 | "검증", "test", "lint" |
| `/ax:e2e-audit` | E2E 실행 + 감사 + 커버리지 매트릭스 | "E2E", "e2e", "playwright" |
| `/ax:code-deploy` | 프리뷰 배포 또는 수동 재배포 | "배포", "deploy" |
| `/ax:git-sync` | 멀티 환경 동기화 + ~/.claude 설정 sync | "동기화", "git sync" |

### 📊 거버넌스
| 명령 | 용도 | 트리거 |
|------|------|--------|
| `/ax:gov-doc` | 문서 관리 (생성/인덱스/아카이브) | "문서 생성", "INDEX" |
| `/ax:gov-version` | 버전 범프/태그/일관성 검증 | "버전", "bump" |
| `/ax:gov-standards` | 15개 표준 적용 상태 점검 | "거버넌스", "표준 점검" |
| `/ax:gov-retro` | 마일스톤 회고 + CHANGELOG | "회고", "retro" |
| `/ax:gov-risk` | 리스크/기술부채 관리 | "리스크", "tech debt" |

### 🔍 인프라
| 명령 | 용도 | 트리거 |
|------|------|--------|
| `/ax:infra-selfcheck` | ax 플러그인 정합성 자율점검 | "selfcheck", "점검" |
| `/ax:infra-statusline` | tmux pane REQ 표시 관리 | "statusline" |

---

💡 상세 보기: `/ax:help sprint` 또는 `/ax:help session-end`
```

## 특정 명령 상세 (인자 있을 때)

`$ARGUMENTS`에서 명령명을 추출하고 해당 명령 파일을 읽어 상세 안내를 출력한다.

```bash
CMD_NAME="$ARGUMENTS"  # 예: "sprint", "session-end", "req-manage"
CMD_FILE="$HOME/.claude/commands/ax:${CMD_NAME}.md"
```

파일이 존재하면 읽어서 아래 형식으로 출력:

```
## /ax:{명령명}

### 용도
{description에서 추출}

### 서브커맨드
{파일 내용에서 서브커맨드 섹션 추출}

### 사용 예시
{실전 사례 — 아래 "명령별 실전 사례" 참조}

### 관련 명령
{워크플로우 상 전후 관계 명령}
```

## 명령별 실전 사례

### session-start / session-end

```
# 기본 사용
/ax:session-start                    # 컨텍스트 복원 + 제안
/ax:session-start F183 F184          # F항목 지정 시작
/ax:session-end                      # 전체 사이클 실행
/ax:session-end 추가 메모            # 메모 포함 종료

# Sprint Worktree에서
/ax:session-start Sprint 53          # Sprint 컨텍스트 로드
/ax:session-end                      # sprint 브랜치에 push (master X)
```

### sprint

```
# Master에서 실행
/ax:sprint start 53 F183 F184 F185   # Sprint 생성 + F항목 연동
/ax:sprint list                      # 활성 Sprint 목록
/ax:sprint review 53                 # 변경사항 리뷰
/ax:sprint pr 53                     # Push + PR 생성
/ax:sprint merge 53                  # PR merge + D1 + Workers 배포
/ax:sprint done 53                   # worktree 정리

# bash에서도 가능
sprint 53                            # WT 탭 열기 (tmux 환경)
sprint 53 54                         # 여러 Sprint 동시
sprints                              # 활성 목록
sprint-done 53                       # 정리
```

### git-team

```
/ax:git-team F183 API 서비스 + 테스트 구현
  → Worker 2개 병렬 실행 (tmux split)
  → Positive File Constraint + File Guard
  → DONE 마커 확인 후 자동 복원
```

### req-interview

```
/ax:req-interview                    # 5파트 인터뷰 시작
/ax:req-interview 기존 PRD 검토      # 기존 PRD 재검토 사이클
  → 인터뷰 → PRD 생성 → 3사 AI 검토 → Six Hats → Go/No-Go
```

### req-manage / req-integrity

```
/ax:req-manage new "사용자 인증 강화"  # REQ 등록
/ax:req-manage list --status OPEN    # 목록 조회
/ax:req-manage status FX-REQ-183 IN_PROGRESS  # 상태 변경
/ax:req-integrity check              # 3-way 정합성 점검 (읽기 전용)
/ax:req-integrity fix                # 자동 보정
```

### code-verify / code-deploy

```
/ax:code-verify                      # lint + typecheck + test 전체
/ax:code-verify test                 # 테스트만
/ax:code-verify lint                 # 린트만
/ax:code-deploy                      # Workers + D1 프로덕션 배포
/ax:code-deploy --preview            # 프리뷰 배포
```

### git-sync

```
/ax:git-sync status                  # 로컬 ↔ 리모트 비교
/ax:git-sync push                    # 커밋 + push
/ax:git-sync pull                    # pull --rebase
/ax:git-sync config push             # ~/.claude/ 설정 파일 동기화
/ax:git-sync config pull             # 다른 환경에서 설정 가져오기
```

### gov-*

```
/ax:gov-doc new PLAN "Sprint 53 계획"  # 문서 생성
/ax:gov-version bump minor           # 버전 범프
/ax:gov-standards                    # 15개 표준 적용 상태
/ax:gov-retro                        # 마일스톤 회고
/ax:gov-risk register "D1 락 이슈"   # 리스크 등록
```

### infra-selfcheck

```
/ax:infra-selfcheck                  # 8개 항목 자율점검
  → C1: Commands frontmatter
  → C2: CLAUDE.md ↔ 실제 명령 매칭
  → C3: Standards INDEX.md 정합성
  → C4~C7: 참조/훅/플러그인/교차참조
```

## 워크플로우 맵

```
┌─ 기획 ──────────────────────────────────────────────┐
│ /ax:req-interview → PRD → /ax:req-manage → SPEC.md  │
└────────────────────────┬────────────────────────────┘
                         ▼
┌─ Sprint 실행 ──────────────────────────────────────┐
│ /ax:sprint start N → WT 탭 → /ax:session-start     │
│   → 코드 작업 → /ax:code-verify → /ax:session-end  │
│   → /ax:sprint review → /ax:sprint merge            │
└────────────────────────┬────────────────────────────┘
                         ▼
┌─ 통합 & 배포 ──────────────────────────────────────┐
│ /ax:code-deploy → /ax:req-integrity                 │
│   → /ax:gov-retro → /ax:gov-version                │
└─────────────────────────────────────────────────────┘
```

## Master에서 Sprint 완료 처리

Sprint 탭에서 `/ax:session-end` 후, Master 탭에서 순서대로 실행:

```
Sprint 탭                         Master 탭
─────────                         ─────────
코드 작업 완료
  ↓
/ax:session-end
  → sprint/N 브랜치에 push
  → "Master에서 merge 해주세요"
  ↓
탭 닫기 (선택)                    /ax:sprint review N    ← diff, 커밋, 테스트 확인
                                    ↓
                                  /ax:sprint pr N       ← PR 생성
                                    ↓
                                  /ax:sprint merge N    ← PR merge + D1 + 배포
                                    ↓
                                  /ax:sprint done N     ← worktree 정리
```

### 실전 순서 (Master에서 복사해서 쓰기)

```
# 1. Sprint 53 리뷰 + merge + 정리
/ax:sprint review 53
/ax:sprint pr 53
/ax:sprint merge 53
/ax:sprint done 53

# 2. 다음 Sprint도 같은 패턴
/ax:sprint review 54
/ax:sprint merge 54
/ax:sprint done 54

# 3. 모든 Sprint 완료 후 세션 종료
/ax:session-end
```

### 여러 Sprint 동시 완료 시

```
# 순서대로 하나씩 (충돌 방지)
/ax:sprint merge 53     # 먼저 merge (master에 반영)
/ax:sprint merge 54     # 53 기반으로 54 merge

# 같은 파일 수정 시 → 두 번째 Sprint에서 rebase 필요할 수 있음
```

## Gotchas

- `/ax:sprint`은 Master 세션에서만 실행 (worktree에서 실행하면 중첩 생성 위험)
- `/ax:session-end`는 worktree 감지 시 자동으로 간소화 모드로 동작
- `/ax:git-team`과 `/ax:sprint`은 다른 병렬화 방식: team은 같은 pane 내 tmux split, sprint는 독립 WT 탭
- Master는 코드를 직접 작성하지 않음 — 계획/리뷰/통합/배포만 담당
- merge 순서가 중요 — 같은 파일을 건드리는 Sprint는 순차 merge 필수
- `/ax:sprint done`은 merge 확인 후 마지막에 — 안 하면 worktree가 계속 남음
