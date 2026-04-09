# AX Plugin for Claude Code

KTDS AX BD팀의 개발 워크플로우를 자동화하는 Claude Code 플러그인.

## 구성

- **23개 스킬**: 세션, Sprint, 거버넌스, 요구사항, 코드, 인프라 관리
- **15개 표준**: GOV-001~015 (문서/버전/리스크/코딩/테스트/보안 등)
- **2개 규칙**: Agent Team 패턴, 개발 워크플로우

## 설치

### 1단계: Marketplace 등록 (최초 1회)

```bash
# settings.json의 extraKnownMarketplaces에 추가
claude settings set extraKnownMarketplaces.ax-marketplace '{"source":{"source":"github","repo":"KTDS-AXBD/ax-plugin"}}'
```

또는 `~/.claude/settings.json`에 직접 추가:

```json
{
  "extraKnownMarketplaces": {
    "ax-marketplace": {
      "source": {
        "source": "github",
        "repo": "KTDS-AXBD/ax-plugin"
      }
    }
  }
}
```

### 2단계: Plugin 설치

```bash
claude plugin install ax@ax-marketplace
```

### 3단계: 확인

```bash
claude plugin list
# ax@ax-marketplace (enabled) 확인
```

## 스킬 사용법

모든 스킬은 `ax:{스킬명}` 형식으로 호출:

```bash
/ax:session-start        # 세션 시작
/ax:session-end          # 세션 종료 (커밋+push+배포)
/ax:sprint               # Sprint worktree 오케스트레이션
/ax:sprint-autopilot     # Sprint 전체 자동화
/ax:code-verify          # lint + typecheck + test
/ax:gov-doc              # 문서 관리
/ax:req-interview        # 요구사항 인터뷰 → PRD
```

자동 트리거도 지원 — "세션 시작", "sprint", "코드 검증" 등 키워드 입력 시 자동 활성화.

### 전체 스킬 목록

| 카테고리 | 스킬 | 용도 |
|----------|------|------|
| 세션 | `session-start`, `daily-check`, `session-end` | 컨텍스트 복원/점검/종료 |
| 코드 | `code-verify`, `code-deploy` | 검증/배포 |
| Git | `git-sync`, `git-team`, `sprint`, `sprint-autopilot`, `sprint-pipeline`, `sprint-watch` | 동기화/팀작업/Sprint |
| 거버넌스 | `gov-doc`, `gov-version`, `gov-risk`, `gov-retro`, `gov-standards` | 문서/버전/리스크/회고/표준 |
| 요구사항 | `req-manage`, `req-integrity`, `req-interview` | 등록/검증/인터뷰 |
| 인프라 | `infra-selfcheck`, `infra-statusline`, `e2e-audit`, `help` | 점검/E2E/상태표시/가이드 |

## 표준 (standards/)

프로젝트에서 `${CLAUDE_PLUGIN_ROOT}/standards/` 경로로 참조 가능:

- `doc-governance.md` — 문서 관리 표준 (GOV-001)
- `version-governance.md` — 버전 관리 표준 (GOV-002)
- `risk-governance.md` — 리스크 관리 표준 (GOV-005)
- `requirements-governance.md` — 요구사항 관리 표준
- `project-governance.md` — 프로젝트 거버넌스
- 그 외 10개 (coding-convention, test-strategy, security, cicd-pipeline 등)

## 버전 관리

### 버전 정책

- **SemVer** (Major.Minor.Patch) — Minor: 스킬 추가/삭제 또는 동작 변경, Patch: 문서/설명 수정
- **버전 범프 시점**: 스킬 로직이 변경된 커밋을 push할 때 (문서만 수정은 Patch)
- **스킬 수 하드코딩 금지**: README/CLAUDE.md에 스킬 수를 적지 않고 `ls skills/ | wc -l`로 확인

### 업데이트 흐름

```
1. marketplace 소스 수정 (skills/*.md)
2. cache 동기화 (양쪽 버전):
   cp skills/X/SKILL.md ~/.claude/plugins/cache/ax-marketplace/ax/{version}/skills/X/SKILL.md
3. git commit + push (ax-plugin repo)
4. 다른 환경에서: claude plugin update ax@ax-marketplace
```

### 현재 세션 즉시 반영

Claude Code Skills 2.0은 SKILL.md를 **세션 중 매번 디스크에서 읽어요** (hot reload).
`cp`로 캐시를 갱신하면 **다음 스킬 호출부터 즉시 반영**돼요.

```bash
# 최신 버전으로 업데이트 (원격에서)
claude plugin update ax@ax-marketplace
```

## 라이선스

MIT

## 작성자

KTDS AX BD팀 (ktds.axbd@gmail.com)
