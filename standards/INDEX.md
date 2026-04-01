# 거버넌스 표준 인덱스

## 핵심 표준 (GOV-001 ~ GOV-010)

| 코드 | 제목 | 파일 | 상태 | 시행 |
|------|------|------|:----:|------|
| GOV-001 | 문서 관리 | `doc-governance.md` | Active | `ax-gov-doc`, `validate-doc-meta.sh` |
| GOV-002 | 버전 관리 | `version-governance.md` | Active | `ax-gov-version`, `check-version.sh` |
| GOV-003 | 요구사항 관리 | `requirements-governance.md` | Active | `ax-req-manage`, `ax-01/02` |
| GOV-004 | 프로젝트 관리 | `project-governance.md` | Active | `ax-session-start`, `ax-session-end` |
| GOV-005 | 리스크 관리 | `risk-governance.md` | Active | `ax-gov-risk`, `check-risks.sh` |
| GOV-006 | 코드 품질 | `coding-convention.md` | Active | `ax-code-verify`, PostToolUse hook |
| GOV-007 | 보안 | `security.md` | Active | `ax-a03-security` agent, PreToolUse hook |
| GOV-008 | 데이터/스키마 관리 | `data-schema.md` | Active | `ax-a02-migration` agent |
| GOV-009 | 인프라/운영 | `cicd-pipeline.md` | Active | `deploy` skill, `ax-code-deploy` |
| GOV-010 | 온보딩/지식 공유 | `onboarding.md` | Active | `ax-session-start` (Tier loading) |

## 보충 표준

| 코드 | 제목 | 파일 | 상태 | 시행 |
|------|------|------|:----:|------|
| GOV-011 | 테스트/QA 전략 | `test-strategy.md` | Active | `ax-code-verify` (test 포함), PostToolUse hook |
| GOV-012 | 성능 기준 | `performance.md` | Active | PostToolUse hook (번들/응답시간 참조) |
| GOV-013 | 모니터링/관찰성 | `observability.md` | Active | `health-check.sh`, `svc-notification` |
| GOV-014 | 의존성 관리 | `dependency-management.md` | Active | lock 파일 커밋 검증, `bun audit` |
| GOV-015 | 아키텍처 결정 기록 | `adr.md` | Active | `ax-gov-doc` (DSGN type) |

## 유틸리티 스크립트

| 파일 | 용도 | 연관 표준 |
|------|------|-----------|
| `check-risks.sh` | SessionStart 시 리스크 알림 | GOV-005 |
| `check-version.sh` | 버전 일관성 검증 | GOV-002 |
| `cleanup-artifacts.sh` | 불필요 파일 정리 | GOV-009 |
| `validate-doc-meta.sh` | 문서 frontmatter 검증 | GOV-001 |
