---
name: gov-retro
description: "마일스톤 회고 — SemVer Minor 태그 시점에 지표 수집, 회고 작성, CHANGELOG/MEMORY 반영. Use when: 회고, retrospective, 마일스톤, 태그, CHANGELOG 갱신"
argument-hint: "[tag]"
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

### 2b. Phase 32 스크립트 연동 — Velocity + Priority 이력 (F508)

프로젝트에 Phase 32 Work Management 스크립트가 있으면 회고 자료로 자동 수집한다. 없으면 조용히 건너뜀.

```bash
# Velocity 트렌드 (F505) — 이번 Phase의 Sprint 메트릭 집계
if [ -x scripts/velocity/phase-trend.sh ]; then
  PHASE_NUM=$(echo "${ARG:-}" | grep -oE '[0-9]+' | head -1)
  [ -z "$PHASE_NUM" ] && PHASE_NUM=$(grep -oP 'Phase \K\d+' SPEC.md 2>/dev/null | sort -n | tail -1)
  if [ -n "$PHASE_NUM" ]; then
    VELOCITY_SUMMARY=$(bash scripts/velocity/phase-trend.sh "$PHASE_NUM" 2>/dev/null || true)
  fi
fi

# Priority 변경 이력 (F507) — 이번 회고 기간 내 P0~P3 변동
if [ -x scripts/priority/list-history.sh ]; then
  # 이전 태그 날짜 추출 (없으면 30일 prefix)
  LAST_TAG_DATE=$(git log -1 --format=%cd --date=short "$(git describe --tags --abbrev=0 2>/dev/null)" 2>/dev/null || date -d '30 days ago' +%Y-%m 2>/dev/null || echo "$(date +%Y)")
  PRIORITY_CHANGES=$(bash scripts/priority/list-history.sh --since "$LAST_TAG_DATE" 2>/dev/null || true)
fi
```

이 두 출력은 Step 4 회고 작성에서 "스코프 드리프트" 분석 자료로 사용한다 (Priority 강등/승격 빈도 = 의사결정 안정성 지표).

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

### 7. Phase F-items 소급 GitHub Issue 등록 (F489, 선택)

Phase 단위 회고일 경우 해당 Phase의 미등록 F-items를 일괄 GitHub Issue로 소급 등록한다.
req-integrity의 *구조적 공백* 카테고리를 점진적으로 해소하는 루틴이다.

**발동 조건:**
- 사용자가 Phase 완료 회고를 수행 중일 때 (예: `/ax:gov-retro phase-27`)
- `gh` CLI + `GITHUB_REPO` 존재
- Phase 역순 원칙 (최신 Phase부터 소급) — Issues 인플레이션 통제

**절차:**

1. 대상 Phase의 F-items를 SPEC.md §5에서 수집한다:
   ```bash
   PHASE_NUM="{phase}"
   PHASE_F_ITEMS=$(grep -E "^\| F[0-9]+ \|" SPEC.md | awk -F'|' -v p="Phase ${PHASE_NUM}:" '
     /Phase [0-9]+:/ { cur=$0 }
     { if (cur ~ p) print $2 }' | grep -oE 'F[0-9]+' | sort -u)
   ```

2. 각 F-item의 GitHub Issue 존재 여부를 확인한다 (`[F{N}]` 제목 패턴):
   ```bash
   for F in $PHASE_F_ITEMS; do
     EXISTS=$(gh issue list --repo "$GITHUB_REPO" --state all \
       --search "${F} in:title" --json number --jq '.[0].number' 2>/dev/null)
     [ -z "$EXISTS" ] && MISSING="$MISSING $F"
   done
   ```

3. 누락 F-items를 사용자에게 표시하고 AskUserQuestion으로 확인:
   - 전체 등록 / 선별 등록 / 건너뛰기

4. 배치 등록 (배치 크기 10건, 과도한 인플레이션 방지):
   ```bash
   for F in $MISSING; do
     TITLE=$(grep -oP "\| ${F} \| \K[^(]+" SPEC.md | head -1 | sed 's/ *$//')
     REQ=$(grep -oP "\| ${F} \|.*?\K(FX|DX)-REQ-[0-9]+" SPEC.md | head -1)
     PRIO=$(grep -oP "\| ${F} \|.*?\KP[0-3]" SPEC.md | head -1)
     STATUS=$(grep "^\| ${F} \|" SPEC.md | awk -F'|' '{print $5}' | tr -d ' ')
     # 이미 완료된 F는 Closed 상태로 등록
     gh issue create --repo "$GITHUB_REPO" \
       --title "[${F}] ${TITLE}" \
       --label "enhancement" \
       --body "**REQ**: ${REQ} | **Priority**: ${PRIO} | **Status**: ${STATUS}

소급 등록 (Phase ${PHASE_NUM} 회고 시점)

🤖 via /ax:gov-retro F489 routine"
     # ✅ 상태면 즉시 close
     if [ "$STATUS" = "✅" ]; then
       LAST_URL=$(gh issue list --repo "$GITHUB_REPO" --search "${F} in:title" --json url --jq '.[0].url')
       LAST_NUM=$(echo "$LAST_URL" | grep -oP '\d+$')
       gh issue close "$LAST_NUM" --repo "$GITHUB_REPO" --comment "소급 등록 — 이미 완료된 F-item" 2>/dev/null
     fi
     sleep 1  # rate limit 완화
   done
   ```

5. 등록 결과를 회고 문서에 기록:
   ```markdown
   ### 소급 Issue 등록 (F489)
   - Phase ${PHASE_NUM}: N건 등록, M건 완료(closed)
   - 구조적 공백 해소: 이전 K건 → 현재 (K-N)건
   ```

**중단/재개:**
- Ctrl+C 중단 시 마지막 등록된 F번호를 `/tmp/gov-retro-backfill-state` 에 저장
- 재실행 시 해당 번호 이후부터 이어서 등록

### 8. 결과 출력

회고 요약을 출력하고, 태그 생성 여부를 확인한다:
```bash
git tag -a v{version} -m "마일스톤: {한줄 요약}"
```

**CHANGELOG.md Release Notes 전환 (F502)** — 태그 생성 성공 시 `[Unreleased]`를 `[v{version}] - {date}`로 승격:
```bash
if [ -f CHANGELOG.md ] && grep -q '^## \[Unreleased\]' CHANGELOG.md; then
  NEW_VERSION=$(git describe --tags --abbrev=0)
  DATE=$(date +%Y-%m-%d)
  # Unreleased 섹션 위에 새로운 [vX.Y.Z] 헤더를 올리고, 기존 [Unreleased]는 빈 상태로 유지
  sed -i "s|^## \[Unreleased\]$|## [Unreleased]\n\n## [${NEW_VERSION}] - ${DATE}|" CHANGELOG.md
  git add CHANGELOG.md
  git commit -m "docs: release notes ${NEW_VERSION}" 2>/dev/null || true
fi
```


---

## Gotchas

- **Phase 역순 원칙**: 오래된 Phase부터 등록하면 Issues 번호가 "미래 F"를 앞서 차지해요. 반드시 **최신 Phase부터 역순**으로 진행하세요.
- **배치 크기 제한**: 한 번에 10건 이상 등록하지 마세요 (GitHub API rate limit + Project 인플레이션).
- **상태 동기화**: 이미 완료(✅)된 F-item은 Issue 생성 직후 close 해야 "미해결 이슈" 카운트가 오염되지 않아요.
- **F489 자체는 P2**: 이 루틴은 *회고 시에만* 선택적으로 실행. 일반 `/ax:gov-retro` 흐름을 방해하지 않도록 Step 7을 AskUserQuestion으로 확인 후 진입합니다.
