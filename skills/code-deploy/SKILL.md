---
name: code-deploy
description: "프리뷰 배포 또는 명시적 재배포. 프로덕션 배포는 /ax:session-end에 포함되어 있으므로, 이 명령은 --preview 또는 수동 재배포 시 사용. Use when: 배포, deploy, preview, 수동 배포"
argument-hint: "[preview]"
user-invocable: true
allowed-tools:
  - Bash
  - Read
---

# Deploy — 프리뷰 배포 또는 명시적 재배포

> **참고**: 일반적인 프로덕션 배포는 `/ax-session-end`에 포함되어 있다 (Phase 5: Git Push).
> `/ax-code-deploy`는 **프리뷰 배포** 또는 **명시적 재배포**가 필요할 때만 사용한다.

## Arguments

`$ARGUMENTS`가 `--preview`를 포함하면 프리뷰 배포, 아니면 프로덕션 배포.

## Steps

### 1. 미커밋 변경사항 확인

```bash
git status --short
```

미커밋 변경사항이 있으면 커밋 먼저 수행.

### 2. 검증

프로젝트의 검증 명령을 실행:
```bash
# 자동 감지
for cmd in "pnpm typecheck" "pnpm lint" "pnpm test"; do
  echo "Running: $cmd"
  $cmd 2>&1
done
```

### 3. 배포

`$ARGUMENTS`에 `--preview` 포함 여부에 따라 분기:

- **프로덕션** (CI/CD):
  ```bash
  git push origin $(git branch --show-current)
  gh run list --limit 1
  ```

- **프리뷰** (로컬):
  프로젝트에 따라 배포 명령이 다르므로, 프로젝트의 배포 설정을 확인:
  - Cloudflare Pages: `wrangler pages deploy ./build/client --branch=preview`
  - Vercel: `vercel --preview`
  - Netlify: `netlify deploy`

### 4. 결과 안내

배포 완료/실패 상태를 안내한다.


---

## Gotchas

- TODO: 이 스킬 사용 시 주의사항을 작성하세요
