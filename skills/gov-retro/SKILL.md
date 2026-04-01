---
name: gov-retro
description: "마일스톤 회고 — SemVer Minor 태그 시점에 지표 수집, 회고 작성, CHANGELOG/MEMORY 반영. Use when: 회고, retrospective, 마일스톤, 태그, CHANGELOG 갱신"
argument-hint: ""
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

# retro — 마일스톤 회고

SemVer Minor 버전 완료 시점에 회고를 수행한다.

## Steps

### 1. 현재 마일스톤 정보 수집

```bash
# 현재 버전 확인
node -p "require('./package.json').version"
# 마지막 태그 이후 커밋
git log $(git describe --tags --abbrev=0 2>/dev/null || echo HEAD~20)..HEAD --oneline
```

### 2. 지표 수집

다음 지표를 수집한다 (프로젝트에 따라 가용한 것만):

```bash
# 코드 규모
find app/ -name '*.ts' -o -name '*.tsx' | xargs wc -l 2>/dev/null | tail -1
# 테스트 수
pnpm test --reporter=verbose 2>&1 | tail -5
# 라우트 수 (Remix)
find app/routes -name '*.ts' -o -name '*.tsx' | wc -l
# 린트/타입 에러
pnpm lint 2>&1 | grep -c 'error' || echo 0
pnpm typecheck 2>&1 | grep -c 'error' || echo 0
```

### 3. 이전 지표와 비교

SPEC.md "주요 지표" 섹션에서 이전 수치를 읽어 변화량을 계산한다.

### 4. 회고 작성

AskUserQuestion으로 다음 항목을 수집한다:

- **잘된 점**: 이번 마일스톤에서 효과적이었던 것
- **개선점**: 비효율적이거나 반복된 문제
- **결정 검증**: 이전 결정 중 번복/수정할 것

### 5. CHANGELOG.md에 기록

CHANGELOG.md에 회고 섹션을 추가한다:

```markdown
## 마일스톤 회고: v{version}

### 지표 변화
| 지표 | 이전 | 현재 | 변화 |
|------|------|------|------|
| 코드 | {prev} | {curr} | +{delta} |
| 테스트 | {prev} | {curr} | +{delta} |
| 라우트 | {prev} | {curr} | +{delta} |

### 잘된 점
- {items}

### 개선점
- {items}

### 결정 검증
- {items}

### 다음 마일스톤 방향
- {items}
```

### 6. SPEC.md + MEMORY.md 갱신

- SPEC.md "주요 지표" 섹션을 현재 수치로 갱신한다.
- MEMORY.md "주요 지표" 섹션을 갱신한다.
- 핵심 교훈이 있으면 MEMORY.md에 반영한다.

### 7. 결과 출력

회고 요약을 출력하고, 태그 생성 여부를 확인한다:
```bash
git tag -a v{version} -m "마일스톤: {한줄 요약}"
```


---

## Gotchas

- TODO: 이 스킬 사용 시 주의사항을 작성하세요
