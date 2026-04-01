---
name: gov-version
description: |
  버전 관리 — 현재 버전 상태 확인, 범프, 태그 생성, 일관성 검증.
  GOV-002 버전 관리 표준 기반.
  Use when: 버전, version bump, 태그, tag, semver, 버전 확인
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

### `/ax-gov-version check` — 일관성 검증

GOV-002 표준의 5가지 검증 항목을 수행한다:

1. **package.json version 존재**: package.json에 version 필드가 있는지 확인한다.

2. **최신 git tag와 package.json 일치**: 태그가 존재할 때 두 값을 비교한다.

3. **SPEC.md 레거시 버전 마커 없음**: SPEC.md 본문에서 `(v숫자.숫자)` 패턴을 Grep으로 검색한다. 인라인 버전 마커가 있으면 경고한다.

4. **문서 system-version 범위 확인**: SPEC/GUID/OPS 문서의 frontmatter에서 `system-version` 필드를 확인하고 현재 버전과 비교한다.

5. **MEMORY.md 버전 일치**: MEMORY.md에 기록된 버전이 package.json과 일치하는지 확인한다.

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
