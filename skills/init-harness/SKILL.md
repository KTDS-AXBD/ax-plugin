---
name: init-harness
description: "ax-harness-kit Tier 1 — Foundry-X에서 정착한 BD 라이프사이클 자동화 인프라를 신규 프로젝트에 안전하게 이식. 3단계(preflight → install → verify)로 Tier 1 설치 완료, monorepo 골격 + .nvmrc + Claude hooks + drift check + Cloudflare 배포 옵션. Use when: init-harness, ax-harness-kit, Tier 1, harness 초기 설치, 신규 프로젝트, scaffold, 프로젝트 초기화, BD 라이프사이클 이식"
argument-hint: "<project-name> <github-org/repo> \"<description>\" [--cf-account <id>] [--worker-subdomain <name>]"
user-invocable: true
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
---

# ax-harness-kit Tier 1 — init-harness

Foundry-X에서 정착한 BD 라이프사이클 자동화 인프라를 신규 프로젝트에 안전하게 이식한다.
3단계(preflight → install → verify)로 Tier 1 설치를 완료한다.

## 사용법

```
/ax:init-harness <project-name> <github-org/repo> "<description>" [--cf-account <id>] [--worker-subdomain <name>]
```

**예시**:
```
/ax:init-harness proposal-tf-platform KTDS-AXBD/proposal-tf-platform "제안TF 지원 플랫폼" --cf-account abc123def456
```

## 파라미터

| 파라미터 | 필수 | 설명 |
|---------|------|------|
| `<project-name>` | ✅ | 프로젝트명 (kebab-case), GitHub repo 이름 |
| `<github-org>` | ✅ | GitHub Org (예: KTDS-AXBD) |
| `<github-repo>` | ✅ | GitHub Repo 이름 |
| `"<description>"` | ✅ | 프로젝트 한 줄 설명 |
| `--cf-account` | 선택 | Cloudflare Account ID |
| `--worker-subdomain` | 선택 | Workers sub-name (기본: project-name) |

## 실행 흐름

### Step 1: Preflight (환경 점검)

다음 8개 항목을 점검한다:

```bash
SKILL_DIR="$HOME/.claude/plugins/cache/ax-marketplace/ax/1.2.0/skills/init-harness"
bash "$SKILL_DIR/scripts/preflight.sh"
```

점검 항목:
1. `git` 설치 여부
2. `pnpm` 설치 여부
3. `node` 22.x 이상
4. `bash` 설치 여부
5. `gh` CLI 설치 여부 (선택)
6. `wrangler` CLI 설치 여부 (선택)
7. GitHub 인증 상태 `gh auth status` (선택)
8. Cloudflare 인증 `wrangler whoami` (선택)

❌ 필수 항목(1~4) 실패 시: 가이드 출력 후 중단
⚠️ 선택 항목(5~8) 실패 시: 경고만 출력하고 계속 진행

### Step 2: Install (Tier 1 설치)

```bash
bash "$SKILL_DIR/scripts/install.sh" \
  "$PROJECT_NAME" "$GITHUB_ORG" "$GITHUB_REPO" "$DESCRIPTION" \
  [--cf-account "$CF_ACCOUNT"] [--worker-subdomain "$WORKER_SUBDOMAIN"]
```

설치 동작:
1. 출력 디렉토리 확인 (기존 존재 시 확인 후 진행)
2. `harness init-monorepo` CLI 실행 → 4-package 골격 생성
3. 생성 파일 목록 출력

생성 구조:
```
{project-name}/
  package.json, pnpm-workspace.yaml, turbo.json
  .nvmrc (22), .gitignore, tsconfig.base.json
  packages/
    api/    — Hono + Cloudflare Workers
    web/    — React 18 + Vite 8
    cli/    — Commander + Ink 5
    shared/ — 공유 타입
```

### Step 3: Verify (검증)

```bash
bash "$SKILL_DIR/scripts/verify.sh" "$PROJECT_NAME"
```

검증 항목:
1. `grep -r "ktds-axbd\|Foundry-X\|foundry-x" {project-name}/` → 0건 확인
2. 2차 install 실행 → 파일 내용 동일(멱등성)

## 설치 후 다음 단계

1. `cd {project-name} && pnpm install` — 의존성 설치
2. `/ax:sprint 1` — 첫 Sprint 시동 (F667 Cloudflare 배포 설정 후)
3. GitHub repo 생성: `gh repo create $ORG/$REPO --private`

## 주의사항

- **Tier 2 옵트인 항목은 별도 F-item으로 분리**:
  - `.claude/rules/` 9 파일 변수화 → F668
  - bashrc + tmux + scripts 패치 → F669
  - claude hooks 4종 → F670
- Cloudflare 배포 인프라(wrangler.toml + deploy.yml) → F667
- `--dry-run` 지원 예정 (S2, F666+ backlog)

## 연관 스킬

- `/ax:session-start` — 세션 시작 시 컨텍스트 복원
- `/ax:sprint N` — Sprint worktree 생성 및 autopilot
- `/ax:daily-check` — 환경 점검
