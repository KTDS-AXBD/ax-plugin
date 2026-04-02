# AX Plugin — Claude Code 개발 워크플로우

AX BD팀의 개발 워크플로우를 자동화하는 Claude Code 플러그인이에요.
21개 스킬 + 15개 표준 + 2개 규칙으로 구성돼요.

## 스킬 목록 (21개)

모든 스킬은 `ax:{스킬명}` 형식으로 호출해요. (예: `/ax:session-start`)

| 카테고리 | 스킬 | 트리거 | 용도 |
|----------|------|--------|------|
| **세션** | `session-start` | "세션 시작" | 프로젝트 컨텍스트 복원 (MEMORY → SPEC 보충 읽기) |
| | `daily-check` | "환경 점검", "daily check" | 환경 점검 + 자동 보정 (Node/Git/빌드/D1/CLAUDE.md 수치) |
| | `session-end` | "세션 종료" | 코드 커밋 + 문서 갱신 + git push + CI/CD 배포 |
| **코드** | `code-verify` | "코드 검증", "lint", "test" | lint + typecheck + test 통합 실행 |
| | `code-deploy` | "프리뷰 배포" | 프리뷰 배포 또는 명시적 재배포 |
| **Git** | `git-sync` | "git sync" | 멀티 환경 프로젝트 동기화 |
| | `git-team` | "agent team" | tmux Agent Team 병렬 수행 |
| | `sprint` | "sprint" | Sprint worktree 오케스트레이션 |
| | `sprint-autopilot` | "autopilot" | Sprint WT 전체 자동화 |
| | `sprint-pipeline` | "pipeline" | 복수 Sprint 배치 병렬 실행 |
| **거버넌스** | `gov-doc` | "문서 생성" | 문서 관리 (GOV-001) |
| | `gov-version` | "버전" | 버전 관리 (GOV-002) |
| | `gov-risk` | "리스크" | 리스크/기술부채 관리 (GOV-005) |
| | `gov-retro` | "회고" | 마일스톤 회고 |
| | `gov-standards` | "거버넌스" | 15개 표준 점검 |
| **요구사항** | `req-manage` | "요구사항" | 요구사항 등록/분류/상태변경 |
| | `req-integrity` | "정합성" | SPEC ↔ GitHub ↔ Plan 3-way 검증 |
| | `req-interview` | "기획", "PRD" | 인터뷰 → PRD → AI 검토 → 착수 판단 |
| **인프라** | `infra-selfcheck` | "selfcheck" | Plugin 구조 자율점검 |
| | `infra-statusline` | "statusline" | tmux StatusLine 관리 |
| | `help` | "ax help" | 전체 스킬 가이드 |

## 표준 (standards/)

15개 거버넌스 표준 (GOV-001~015) + 셸 스크립트 5개.
프로젝트에서 `${CLAUDE_PLUGIN_ROOT}/standards/` 경로로 참조 가능.

## 규칙 (rules/)

- `agent-team-patterns.md` — Agent Team 운영 패턴
- `development-workflow.md` — 개발 워크플로우 패턴

## 설치

```bash
# 1. marketplace 등록 (최초 1회)
claude plugin add-marketplace ax-marketplace --source github --repo KTDS-AXBD/ax-plugin

# 2. 플러그인 설치
claude plugin install ax@ax-marketplace

# 3. 활성화 확인
claude plugin list
```

## 어투

- 반존대(해요체) — "~해요", "~할게요", "~이에요"

## 상호작용

- 인터뷰/확인 질문: AskUserQuestion 도구 사용
