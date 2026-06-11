---
name: gov-version
description: "버전 관리 — 현재 버전 상태 확인, 범프, 태그 생성, 일관성 검증. GOV-002 버전 관리 표준 기반. Use when: 버전, version bump, 태그, tag, semver"
argument-hint: "[status|bump|tag|check]"
user-invocable: true
allowed-tools:
  - Read
  - Edit
  - Bash
  - Glob
  - Grep
---

# ax-08-ver — 버전 관리

GOV-002 버전 관리 표준에 따라 SemVer 버전 상태 확인, 범프, 태그 생성, 일관성 검증을 수행한다.

## Arguments

`/ax-gov-version [status|bump|tag|check]`

- `status` — 현재 버전 상태 확인
- `bump [major|minor|patch]` — 버전 범프
- `tag` — git 태그 생성
- `check` — 일관성 검증
- `milestone <vX.Y.Z> [설명]` — **마일스톤 원자 절차**: CHANGELOG entry + 전 패키지 bump + 태그 + push를 한 번에 (선언·태깅 비동기 누락 방지)

## Steps

### `/ax-gov-version status` — 현재 버전 상태

1. 다음 3가지 소스에서 버전을 수집한다:

   ```bash
   # package.json 버전 (SSOT)
   node -p "require('./package.json').version"
   # 최신 git tag
   git describe --tags --abbrev=0 2>/dev/null || echo "(태그 없음)"
   # 마지막 태그 이후 커밋 수
   git rev-list $(git describe --tags --abbrev=0 2>/dev/null || echo HEAD~20)..HEAD --count
   ```

2. MEMORY.md에서 "현재 버전" 또는 "버전" 항목을 Grep으로 찾는다.

3. 비교 결과를 출력한다:
   ```
   ## 버전 상태
   | 소스 | 버전 | 일치 |
   |------|------|:----:|
   | package.json (SSOT) | 0.5.0 | - |
   | 최신 git tag | v1.0.0-rc | 불일치 |
   | MEMORY.md | v0.5.0 | 일치 |

   마지막 태그 이후 커밋: 15개
   ```

### `/ax-gov-version bump [major|minor|patch]` — 버전 범프

1. 인수가 없으면 AskUserQuestion으로 범프 수준을 확인한다:
   - `major` — 호환성 깨지는 변경
   - `minor` — 기능 추가 (마일스톤)
   - `patch` — 버그 수정

2. 현재 package.json 버전을 Read로 읽는다.

3. SemVer 규칙에 따라 새 버전을 계산한다:
   - 0.x 단계: minor = 마일스톤, patch = 소규모 수정
   - 1.0+ 단계: 표준 SemVer

4. package.json의 version 필드를 Edit으로 수정한다.

5. MEMORY.md의 버전 기록을 Edit으로 동기화한다.

6. 결과를 출력한다:
   ```
   버전 범프: 0.5.0 → 0.6.0 (minor)
   - package.json: 갱신 완료
   - MEMORY.md: 갱신 완료
   ```

### `/ax-gov-version tag` — git 태그 생성

1. `/ax-gov-version status`를 먼저 실행하여 현재 상태를 확인한다.

2. package.json 버전과 최신 tag가 이미 일치하면 "이미 태그됨"을 알리고 종료한다.

3. AskUserQuestion으로 태그 메시지(마일스톤 설명)를 입력받는다.

4. 태그를 생성한다:
   ```bash
   git tag -a v{version} -m "v{version}: {마일스톤 설명}"
   ```

5. push 여부를 확인한다:
   ```bash
   git push origin $(git branch --show-current) --tags
   ```

### `/ax-gov-version milestone <vX.Y.Z> [설명]` — 마일스톤 원자 절차

> **도입 배경 (RFP-X v0.9.0 회고 Try 4, 2026-06-12)**: "CHANGELOG 마일스톤 entry 작성"과
> "package.json bump + git tag"가 비동기라 누락이 반복됐다 - v0.5/0.6/0.7 3연속 bump 누락(2026-06-10
> 일괄 보정) 후 **v0.8.0에서 또 재발**(태그·bump 없이 CHANGELOG만 기록, 다음 마일스톤에서 소급 태깅).
> 마일스톤 선언 = 아래 4단계를 **하나의 절차**로 묶어 구조적으로 차단한다.

1. **CHANGELOG entry 확인/작성**: CHANGELOG에 `## [vX.Y.Z]` entry가 이미 있으면 재사용,
   없으면 마지막 태그 이후 커밋(feat/fix)을 요약해 entry를 작성한다 (Keep a Changelog 형식).
2. **전 패키지 bump**: root + workspace 전 패키지의 package.json version을 일괄 갱신한다.
   root만 올리면 패키지 간 drift가 남는다 (RFP-X 6패키지 일괄 선례):
   ```bash
   for p in package.json packages/*/package.json; do
     [ -f "$p" ] && sed -i "s/\"version\": \"$OLD\"/\"version\": \"$NEW\"/" "$p"
   done
   ```
3. **커밋·반영**: 프로젝트 git-workflow 분류에 따라 - package.json이 code 분류(빌드 설정)인
   프로젝트는 **PR 경유**(CHANGELOG·회고는 같은 PR에 혼합 허용), meta-only 정책이면 직접 push.
4. **태그 + push**: entry·bump가 master에 반영된 **직후 같은 절차 안에서**:
   ```bash
   git tag -a "v$NEW" -m "v$NEW: 설명"
   git push origin master --tags
   ```

> CHANGELOG에 마일스톤 entry를 쓰면서 2~4단계를 "나중에"로 미루지 않는다 - 비동기가 곧 누락이다.
> 부분 실패 시(예: PR만 merge되고 태그 누락) `check` #6이 검출한다.

### `/ax-gov-version check` — 일관성 검증

GOV-002 표준의 5가지 검증 항목을 수행한다:

1. **package.json version 존재**: package.json에 version 필드가 있는지 확인한다.

2. **최신 git tag와 package.json 일치**: 태그가 존재할 때 두 값을 비교한다.

3. **SPEC.md 레거시 버전 마커 없음**: SPEC.md 본문에서 `(v숫자.숫자)` 패턴을 Grep으로 검색한다. 인라인 버전 마커가 있으면 경고한다.

4. **문서 system-version 범위 확인**: SPEC/GUID/OPS 문서의 frontmatter에서 `system-version` 필드를 확인하고 현재 버전과 비교한다.

5. **MEMORY.md 버전 일치**: MEMORY.md에 기록된 버전이 package.json과 일치하는지 확인한다.

6. **CHANGELOG 최신 entry ↔ 태그 일치 (선언·태깅 비동기 누락 검출, Try 4)**:
   ```bash
   CL=$(find . -maxdepth 3 -name CHANGELOG.md -not -path "*/node_modules/*" | head -1)
   CL_VER=$(grep -oPm1 '^## \[\Kv?[0-9]+\.[0-9]+\.[0-9]+' "$CL" 2>/dev/null)
   TAG_VER=$(git describe --tags --abbrev=0 2>/dev/null)
   ```
   - CHANGELOG 최신 entry 버전 > 최신 태그 → **WARN "마일스톤 선언됐는데 태그/bump 누락"** +
     `milestone` 서브커맨드 보정 안내 (RFP-X v0.8.0 재발 사례의 검출망)
   - workspace 패키지 간 version 불일치도 검출: `grep -h '"version"' package.json packages/*/package.json 2>/dev/null | sort -u` 결과 2줄+ 이면 WARN

결과를 출력한다:
```
## 버전 일관성 검증
| # | 검증 항목 | 결과 | 비고 |
|---|-----------|:----:|------|
| 1 | package.json version | PASS | 0.5.0 |
| 2 | git tag 일치 | WARN | 태그 v1.0.0-rc != 0.5.0 |
| 3 | SPEC.md 레거시 마커 | PASS | 없음 |
| 4 | 문서 system-version | PASS | 범위 내 |
| 5 | MEMORY.md 버전 | PASS | 일치 |

총 결과: 4/5 PASS, 1 WARN
```


---

## Gotchas

- TODO: 이 스킬 사용 시 주의사항을 작성하세요
