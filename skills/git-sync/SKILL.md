---
name: git-sync
description: |
  Git을 통한 멀티 환경(Windows/WSL/Mac) 간 프로젝트 동기화.
  로컬과 GitHub 리모트 상태를 비교하고 push/pull로 동기화한다.
  config 서브커맨드: ~/.claude/ 설정 파일(commands, skills, standards, rules) 동기화.
  Use when user mentions: git sync, 환경 동기화, push, pull, 코드 동기화, 환경 전환, config sync, 설정 동기화
argument-hint: "[push|pull|status|stash|config]"
user-invocable: true
allowed-tools:
  - Bash
  - Read
---

# Git Sync — 멀티 환경 프로젝트 동기화

여러 환경에서 GitHub을 허브로 사용하여 프로젝트를 동기화한다.

## 서브커맨드 분기

- `$ARGUMENTS` 비어 있거나 `status` → **Status 플로우**
- `push` → **Push 플로우** (환경 떠나기 전)
- `pull` → **Pull 플로우** (환경 진입 후)
- `stash` → **Stash 상태 확인**
- `config` → **Config Sync 플로우** (설정 파일 동기화)
- `config push` → Config Push (변경된 설정을 리모트에 반영)
- `config pull` → Config Pull (리모트에서 설정 가져오기)
- `config status` → Config 상태 확인
- `config init` → 최초 설정 (git init + remote 추가)

---

## 공통 로직 (모든 플로우에서 먼저 실행)

### Step 1: 로컬 상태 수집

```bash
git status --short
git stash list
git log --oneline -5
```

### Step 2: 리모트 최신 정보 가져오기

```bash
git fetch origin
```

### Step 3: 로컬 ↔ 리모트 비교

```bash
git branch --show-current
git rev-list --left-right --count HEAD...origin/$(git branch --show-current)
```

### Step 4: 상태 분류

| 조건 | 상태 |
|------|------|
| LOCAL_AHEAD=0, REMOTE_AHEAD=0 | `synced` |
| LOCAL_AHEAD>0, REMOTE_AHEAD=0 | `ahead` (push 필요) |
| LOCAL_AHEAD=0, REMOTE_AHEAD>0 | `behind` (pull 필요) |
| LOCAL_AHEAD>0, REMOTE_AHEAD>0 | `diverged` (주의) |

---

## Status 플로우

공통 로직 실행 후 결과를 출력한다.
`diverged` 상태인 경우 경고를 표시하고 rebase/merge 중 택일을 확인.

## Push 플로우

1. 로컬 변경사항 확인
2. 변경사항이 있으면 WIP 커밋 또는 정식 커밋 선택
3. 정식 커밋 시 검증 실행 (lint, typecheck 등)
4. `git push origin <현재브랜치>`
5. 결과 출력

## Pull 플로우

1. behind=0이면 "이미 최신" 출력 후 종료
2. 미커밋 변경사항이 있으면 stash 또는 WIP 커밋 후 진행
3. `git pull --rebase origin <현재브랜치>`
4. stash 복원 (해당 시)
5. WIP 커밋 정리 제안
6. 결과 출력

## Stash 플로우

```bash
git stash list
```

stash가 있으면 목록 표시 + pop/drop/show 선택지 제공.

## Config Sync 플로우

`~/.claude/` 내 ax 설정 파일(commands, standards, CLAUDE.md)을 Git으로 환경 간 동기화한다.

### 동기화 대상

| 디렉토리 | 파일 수 | 내용 |
|---------|--------|------|
| `~/.claude/commands/` | 14 | ax-*.md 커맨드 파일 |
| `~/.claude/skills/` | 8 | ax-req-interview (SKILL.md + config + templates + scripts + references) |
| `~/.claude/standards/` | 20 | 거버넌스 표준 (15 md + 4 sh + INDEX.md) |
| `~/.claude/rules/` | 2 | 크로스 프로젝트 패턴 (agent-team-patterns, development-workflow) |
| `~/.claude/CLAUDE.md` | 1 | 글로벌 사용자 설정 |

**동기화 제외**: plugins/, projects/, backups/, debug/, settings.json 등 환경별 로컬 데이터

### Config Init (최초 1회)

`/ax-git-sync config init`

1. `~/.claude/` 에 git repo가 없으면 초기화:
   ```bash
   cd ~/.claude
   git init
   ```

2. 선택적 `.gitignore` 생성:
   ```
   # 모든 파일 무시
   *

   # 추적 대상만 허용
   !.gitignore
   !CLAUDE.md
   !commands/
   !commands/*.md
   !skills/
   !skills/**
   !standards/
   !standards/*.md
   !standards/*.sh
   !rules/
   !rules/*.md
   ```

3. 초기 커밋:
   ```bash
   git add .gitignore CLAUDE.md commands/ skills/ standards/ rules/
   git commit -m "init: ax config — commands 14 + skills 8 + standards 20 + rules 2 + CLAUDE.md"
   ```

4. 리모트 추가 안내 출력:
   ```
   GitHub에 private repo를 만든 후 실행하세요:
     cd ~/.claude && git remote add origin git@github.com:{user}/ax-config.git && git push -u origin main

   다른 환경에서:
     cd ~/.claude && git clone git@github.com:{user}/ax-config.git .
   ```

### Config Status

`/ax-git-sync config` 또는 `/ax-git-sync config status`

1. `~/.claude/`에 git repo가 있는지 확인
2. 없으면: "config init을 먼저 실행하세요" 출력 후 종료
3. 있으면:
   ```bash
   cd ~/.claude
   git status --short
   git log --oneline -3
   ```
4. remote가 설정되어 있으면 fetch 후 ahead/behind 표시
5. 결과 출력:
   ```
   📦 ax-config 상태
   - 추적 파일: commands/ {N}개 + skills/ {N}개 + standards/ {N}개 + rules/ {N}개 + CLAUDE.md
   - 변경사항: {N}개 modified / {N}개 untracked
   - 리모트: synced / ahead {N} / behind {N} / 미설정
   ```

### Config Push

`/ax-git-sync config push`

1. `~/.claude/`로 이동
2. 변경사항 확인 (`git status --short`)
3. 변경된 파일 add + 커밋:
   ```bash
   cd ~/.claude
   git add commands/ skills/ standards/ rules/ CLAUDE.md
   git diff --cached --stat  # 커밋 내용 확인
   git commit -m "config: update $(date +%Y-%m-%d) — commands + skills + standards + rules"
   ```
4. remote가 있으면 push:
   ```bash
   git push origin main
   ```
5. 결과 출력

### Config Pull

`/ax-git-sync config pull`

1. `~/.claude/`로 이동
2. 로컬 변경사항이 있으면 stash
3. pull:
   ```bash
   cd ~/.claude
   git pull --rebase origin main
   ```
4. stash가 있었으면 pop + 충돌 확인
5. 결과 출력:
   ```
   ✅ config pull 완료
   - 갱신: commands/ {N}개 + skills/ {N}개 + standards/ {N}개 + rules/ {N}개
   - 변경 파일: [목록]
   ```

### Windows ↔ WSL 참고

- **Windows**: `C:\Users\{name}\.claude\` — Git Bash 또는 PowerShell에서 동일 명령
- **WSL**: `/home/{name}/.claude/` — 이 스킬이 직접 실행
- 양쪽 모두 같은 GitHub repo를 remote로 설정하면 push/pull로 동기화

## 엣지 케이스

- **diverged**: push 전에 반드시 pull --rebase 선행. force push 금지.
- **WIP 커밋 누적**: 3개 이상이면 squash 제안.
- **민감 파일**: `.env`, `.dev.vars` 등 절대 커밋하지 않음.
- **config init 중복 실행**: 이미 git repo면 "이미 초기화됨" 출력 후 건너뜀.
- **config remote 미설정**: push/pull 시 remote 없으면 안내 메시지 출력.


---

## Gotchas

- TODO: 이 스킬 사용 시 주의사항을 작성하세요
