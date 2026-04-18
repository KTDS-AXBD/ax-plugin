---
name: infra-selfcheck
description: "ax plugin 자율점검 — plugin skills, project skills, standards, hooks, 참조 정합성을 자동 검증한다. 플러그인 인프라 변경 후 실행하여 구조적 결함을 사전 감지. Use when: 플러그인 점검, selfcheck, 정합성, plugin health"
argument-hint: ""
user-invocable: true
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
---

# ax-13-selfcheck — ax Plugin 자율점검

ax plugin 시스템(plugin skills, project skills, standards, hooks)의 구조적 건강성을 자동 검증한다.
프로젝트 코드가 아닌 **플러그인 인프라 자체**를 점검한다.

## 점검 항목 (9개)

### C1. Plugin Skills Frontmatter 일관성

`~/.claude/plugins/marketplaces/ax-marketplace/skills/*/SKILL.md` 전체를 대상으로 필수 필드를 검증한다:

1. Glob으로 `~/.claude/plugins/marketplaces/ax-marketplace/skills/*/SKILL.md` 파일 목록을 수집한다.
2. 각 파일의 frontmatter(YAML, `---` 사이)를 Read로 읽어 다음 필드 존재를 확인한다:
   - `name` — 필수 (디렉토리명과 일치해야 함)
   - `description` — 필수
   - `user-invocable: true` — 필수
   - `allowed-tools` — 필수 (최소 1개)
3. `name` 값이 상위 디렉토리명과 일치하는지 확인한다.
4. 결과 테이블 출력:
   ```
   | 스킬 | name | desc | invocable | tools | 디렉토리일치 | 결과 |
   ```

### C2. CLAUDE.md 스킬 테이블 동기화

프로젝트 CLAUDE.md의 스킬 테이블과 실제 project skill 파일이 1:1 매칭되는지 확인한다:

1. 프로젝트 CLAUDE.md에서 `.claude/skills/` 패턴이 포함된 행을 추출한다.
2. 실제 파일 목록을 수집한다:
   - `.claude/skills/*/SKILL.md` (project scope)
3. 비교하여 불일치를 보고한다:
   - CLAUDE.md에 있지만 파일 없음
   - 파일은 있지만 CLAUDE.md에 없음
4. 결과 출력.

### C3. Standards 정합성

`~/.claude/standards/INDEX.md`의 GOV 코드 ↔ 실제 파일 매핑을 검증한다:

1. `~/.claude/standards/INDEX.md`를 Read로 읽는다. 없으면 FAIL.
2. INDEX.md 테이블에서 `파일` 컬럼의 값을 추출한다.
3. 각 파일이 `~/.claude/standards/` 에 실제 존재하는지 확인한다.
4. 반대로, `~/.claude/standards/*.md` 중 INDEX.md에 없는 파일이 있는지 확인한다 (INDEX.md 자체 제외).
5. 결과 출력:
   ```
   | GOV 코드 | 파일 | 존재 |
   ```

### C4. Skills → Standards 참조 검증

plugin skills 및 project skills의 description에서 `~/.claude/standards/` 경로를 참조하는 경우, 해당 파일이 실제 존재하는지 확인한다:

1. plugin skills (`~/.claude/plugins/marketplaces/ax-marketplace/skills/*/SKILL.md`) 및 project skills (`.claude/skills/*/SKILL.md`)의 내용에서 `~/.claude/standards/*.md` 패턴을 Grep으로 추출한다.
2. 추출된 경로의 파일이 `~/.claude/standards/` 에 실제 존재하는지 확인한다.
3. 불일치가 있으면 FAIL 보고.

### C5. Hook 설정 검증

프로젝트의 `.claude/settings.json` hooks 설정을 검증한다:

1. `.claude/settings.json`을 Read로 읽는다. 없으면 SKIP.
2. `hooks` 섹션의 각 항목을 확인한다:
   - `type: "command"` — command 값이 비어있지 않은지
   - 외부 스크립트 참조 시 파일 존재 여부 (예: `bash .claude/hooks/xxx.sh`)
   - `timeout` 설정 여부 (미설정 시 WARN)
3. 결과 출력.

### C6. Project Skills 검증

`.claude/skills/*/SKILL.md` 파일의 frontmatter를 검증한다:

1. Bash `find`로 수집한다 — Claude의 Glob 도구는 `.claude/` 같은 dot-prefix 디렉토리를 기본 스킵하므로 false-negative 방지를 위해 `find` 사용:
   ```bash
   find .claude/skills -maxdepth 2 -name "SKILL.md" 2>/dev/null
   ```
2. 각 파일의 frontmatter에서 `name`, `description` 필드 존재를 확인한다.
3. 결과 출력 — 파일이 0건이면 SKIP, 하나라도 있으면 N/M 정상 보고.

### C7. MEMORY→CLAUDE 동기화

Auto Memory의 MEMORY.md에 승격 대기 마커(`[→CLAUDE]`)가 남아있는지 확인한다:

1. 현재 프로젝트의 Auto Memory 디렉토리에서 MEMORY.md를 찾는다:
   - `~/.claude/projects/*/memory/MEMORY.md`
2. 각 MEMORY.md에서 `[→CLAUDE]` 패턴을 Grep으로 검색한다.
3. 마커가 발견되면 WARN — 해당 항목이 CLAUDE.md에 승격되지 않은 상태.
4. 마커가 없으면 PASS.
5. 결과 출력:
   ```
   | 프로젝트 | 마커 수 | 미승격 항목 |
   ```

### C8. Project Hygiene (프로젝트 위생)

프로젝트 디렉토리의 구조적 위생을 점검한다:

1. **임시 파일 잔류** — `node_modules/`, `.git/` 제외 범위에서 검색:
   ```bash
   find . -name "*Zone.Identifier" -o -name "*.bak" -o -name "*.tmp" \
     | grep -v node_modules | grep -v .git
   ```
   - 발견 시 WARN + 파일 목록 출력
   - 0건이면 PASS

2. **문서 위치 검증** — `docs/` 하위 PDCA 디렉토리에 규칙 외 파일이 있는지 확인:

   프로젝트 prefix는 고정값이 아니라 **프로젝트별로 동적 탐지**한다. 프로젝트 CLAUDE.md의 요구사항 관리 섹션에서 `{PREFIX}-REQ-` 또는 `{PREFIX}-ANLS-` 패턴을 grep하여 `$PREFIX` 추출:
   ```bash
   # 자동 탐지 (예: Decode-X는 AIF, Foundry-X는 FX 등)
   PREFIX=$(grep -oE '[A-Z]+-(REQ|ANLS|PLAN|DSGN|RPRT)-' CLAUDE.md 2>/dev/null | head -1 | cut -d- -f1)
   [ -z "$PREFIX" ] && PREFIX="PROJECT"  # fallback
   ```

   탐지된 `$PREFIX`로 허용 패턴 외 파일 검색:
   ```bash
   # 각 PDCA 디렉토리에 허용 패턴 외 파일
   # 허용: 프로젝트 표준({PREFIX}-{TYPE}-*) + bkit feature 디렉토리(features/)
   ls docs/01-plan/ 2>/dev/null | grep -v "^${PREFIX}-PLAN-" | grep -v '^features$'
   ls docs/02-design/ 2>/dev/null | grep -v "^${PREFIX}-DSGN-" | grep -v '^features$'
   ls docs/03-analysis/ 2>/dev/null | grep -v "^${PREFIX}-ANLS-" | grep -v '^features$'
   ls docs/04-report/ 2>/dev/null | grep -v "^${PREFIX}-RPRT-" | grep -v '^features$'
   ```
   - `features/` 서브디렉토리는 bkit PDCA feature 문서 전용으로 허용 (패턴: `{feature}.{type}.md`)
   - 위치 이탈 파일이 있으면 WARN + 이동 제안
   - 디렉토리 미존재 시 SKIP
   - prefix 미탐지 시 SKIP (다른 프로젝트에서 false-positive 방지)

3. **PRD 인터뷰 산출물 정리 상태** — 완료된 인터뷰 프로젝트에서 중간 파일이 archive 되었는지 확인:
   ```bash
   # prd-final.md가 있는데 prd-v*.md도 같은 디렉토리에 있으면 미정리
   find docs/ -name "prd-final.md" -exec dirname {} \; | while read dir; do
     ls "$dir"/prd-v*.md 2>/dev/null
   done
   ```
   - 미정리 파일 발견 시 WARN + "archive/ 이동 필요"

4. **중복 환경 템플릿**:
   ```bash
   [ -f .env.example ] && [ -f .dev.vars.example ] && echo "WARN: 중복 env 템플릿"
   ```
   - 둘 다 존재하면 WARN

**결과**: PASS / WARN (N건)

### C9. Plugin Cache Drift (source ↔ cache 레이아웃 분기)

CC는 `~/.claude/plugins/cache/ax-marketplace/ax/<version>/`에서 스킬/hook을 로드하고, 개발 편집은 `~/.claude/plugins/marketplaces/ax-marketplace/`(flat layout)에서 발생한다. 두 경로는 설치 파이프라인 때문에 자동 동기화되지 않으므로 실행 시점 불일치(silent staleness)를 감지한다.

이 모드는 dual-clone drift(개인/work HOME)와 별개의 failure mode다 — 같은 HOME 안에서도 발생하며, 해소 경로는 `git pull`이 아니라 plugin 재설치다.

1. 버전 탐지:
   ```bash
   CACHE_ROOT=~/.claude/plugins/cache/ax-marketplace/ax
   VERSION=$(ls -1 "$CACHE_ROOT" 2>/dev/null | sort -V | tail -1)
   ```
   `$VERSION` 미탐지 시 SKIP (plugin 미설치 상태).

2. 실행 경로 2개 비교 (`skills/` + `hooks/`만 — 실행에 직접 연관된 서브트리):
   ```bash
   SRC=~/.claude/plugins/marketplaces/ax-marketplace
   CACHE=$CACHE_ROOT/$VERSION
   diff -rq "$SRC/skills" "$CACHE/skills"
   diff -rq "$SRC/hooks"  "$CACHE/hooks"
   ```

3. 판정:
   - 빈 출력 → PASS
   - 한 줄이라도 나오면 → **FAIL** + drift 개수 + 해소 안내
     - `/plugin` 메뉴에서 ax-marketplace 재설치
     - 또는 `rm -rf "$CACHE"` 후 CC 재시작 (cache 재생성)
     - 수동 복사는 version 승급 시 덮어쓰이므로 권장하지 않음

4. 결과 출력:
   ```
   | C9 | Plugin Cache Drift | PASS/FAIL/SKIP | version=X.Y.Z, drift=N (skills=A hooks=B) |
   ```

---

## 최종 출력

```
## ax Plugin 자율점검 결과

| # | 점검 항목 | 결과 | 비고 |
|---|-----------|:----:|------|
| C1 | Plugin Skills Frontmatter | PASS/FAIL | N/M 정상 |
| C2 | CLAUDE.md 동기화 | PASS/FAIL | 불일치 N건 |
| C3 | Standards 정합성 | PASS/FAIL | 누락 N건 |
| C4 | Skills→Standards 참조 | PASS/FAIL | 깨진 참조 N건 |
| C5 | Hook 설정 | PASS/WARN/SKIP | timeout 미설정 등 |
| C6 | Project Skills | PASS/FAIL | N/M 정상 |
| C7 | MEMORY→CLAUDE 동기화 | PASS/WARN | 미승격 N건 |
| C8 | Project Hygiene | PASS/WARN | 임시파일/위치이탈/미정리 N건 |
| C9 | Plugin Cache Drift | PASS/FAIL/SKIP | source↔cache version=X drift=N |

총: N/9 PASS
```

FAIL/WARN 항목이 있으면 구체적인 불일치 내역을 항목별로 상세 출력한다.


---

## Gotchas

- **Legacy commands 전환 완료**: `~/.claude/commands/ax-*.md` 경로는 더 이상 사용하지 않아요. ax 스킬은 `~/.claude/plugins/marketplaces/ax-marketplace/skills/*/SKILL.md`에 위치해요.
- **C2의 "스킬 테이블"**: CLAUDE.md에서 `.claude/skills/` 항목을 의미해요 (project scope). plugin skills(user scope)는 C1에서 별도 검증해요.
- **session-end Phase 0c 항목 7**: 프로젝트 스킬 자동 감지 로직이 이미 포함되어 있으므로, 세션 종료 시 CLAUDE.md drift가 자동 보정돼요.
