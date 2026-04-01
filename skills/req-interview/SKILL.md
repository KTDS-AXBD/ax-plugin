---
name: req-interview
description: |
  요구사항 기획 단계에서 인터뷰 → PRD 작성 → 외부 AI 다중 검토 → 반복 개선 → 착수 판단까지의 전체 워크플로우를 자동화하는 스킬.
  Use when: 기획, 요구사항, PRD, 인터뷰, 뭘 만들지 정리, requirements interview
  다음 상황에서 반드시 사용한다:
  - "기획", "요구사항", "PRD", "인터뷰로 시작", "뭘 만들지 정리" 등의 표현이 등장할 때
  - 새로운 프로젝트/기능/서비스 시작 전 요구사항을 정리하고 싶을 때
  - 아이디어를 구체화하여 검토 가능한 문서로 만들고 싶을 때
  - 기존 PRD를 다시 검토 사이클에 넣고 싶을 때
argument-hint: "[프로젝트명 또는 기능 설명]"
user-invocable: true
---

# Requirements Interview Skill

## 개요

이 스킬은 요구사항 기획 패턴을 자동화한다.

```
[인터뷰] → [PRD 생성] → [검토 패키지 생성] → [외부 AI 검토] → [피드백 반영] → [충분도 평가] → (반복 or 착수)
```

**스킬 루트**: `~/.claude/skills/ax-req-interview/`

---

## 진입 방법

사용자 발화에 따라 3가지 진입점 중 하나로 시작한다.

| 상황 | 명령 |
|------|------|
| 처음부터 시작 | `"인터뷰 시작"` / `"새 프로젝트 기획"` |
| 기존 PRD 이어받기 | `"PRD 검토 사이클 시작"` + 파일 경로 |
| 검토의견 반영 | `"검토의견 반영"` + 피드백 텍스트 |

---

## Phase 1: 인터뷰

### 참조 파일
```
Read ~/.claude/skills/ax-req-interview/templates/interview-tree.md
```

### 진행 방식
1. 먼저 프로젝트 이름/코드네임을 확인한다
2. `interview-tree.md`의 5개 파트를 순서대로 진행한다
3. 각 파트는 핵심 질문 1개 → 후속 질문 방식으로 진행한다 (한 번에 여러 질문 금지)
4. 음성 입력이라도 그대로 받아서 정리한다
5. 모든 파트 완료 후 요약 확인을 거친다

### 파일 생성
인터뷰 완료 시 즉시 생성:
```
{project-name}/
├── interview-log.md      # 인터뷰 원문 기록
└── prd-v1.md             # PRD 초안 (prd-template.md 기반)
```

PRD 생성 시 참조:
```
Read ~/.claude/skills/ax-req-interview/templates/prd-template.md
```

---

## Phase 2: API 자동 검토

### 참조 파일
```
Read ~/.claude/skills/ax-req-interview/config/models.json
```

PRD 작성 직후 자동으로 수행한다.

### 2-1. 모델 선택
1. `config/models.json`에서 `enabled: true`인 모델 목록을 읽는다
2. AskUserQuestion으로 사용할 모델을 확인한다 (기본: 전체 enabled 모델)
3. 사용자가 특정 모델만 선택하면 `--models` 플래그로 전달

### 2-2. API 키 확인
- 선택된 모델의 `envKey`가 환경변수 또는 `.dev.vars`에 설정되어 있는지 확인
- 미설정 모델은 자동 스킵 + 안내 메시지

### 2-3. 자동 호출
출력 디렉토리 생성 후 review-api.mjs를 Bash로 실행:
```bash
mkdir -p {project-name}/review/round-{N}
node ~/.claude/skills/ax-req-interview/scripts/review-api.mjs \
  {project-name}/prd-v{N}.md \
  {project-name}/review/round-{N} \
  --env .dev.vars --round {N}
```

특정 모델만 선택한 경우:
```bash
node ~/.claude/skills/ax-req-interview/scripts/review-api.mjs \
  {project-name}/prd-v{N}.md \
  {project-name}/review/round-{N} \
  --env .dev.vars --round {N} --models chatgpt,deepseek
```

### 2-4. 결과 확인
호출 완료 후 자동 생성된 파일:
```
{project-name}/
└── review/
    └── round-{N}/
        ├── feedback.md           # 통합 피드백 (타이밍 + 메트릭)
        ├── chatgpt-feedback.md   # 개별 피드백
        ├── gemini-feedback.md
        └── deepseek-feedback.md
```

`feedback.md`를 읽어서 착수 판단 결과를 사용자에게 표시한다.

### 2-5. 수동 폴백
API 호출이 전체 실패하거나 사용자가 수동 검토를 원하는 경우:
1. `review-prompts.md` 기반으로 프롬프트 파일을 생성한다
2. 사용자에게 복붙 안내를 한다 (기존 방식)

---

## Phase 2b: Six Hats 토론 (선택)

PRD에 대해 Six Thinking Hats 프레임워크로 다관점 토론을 진행한다.
Phase 2 대신 또는 Phase 2와 함께 사용할 수 있다.

### 호출
```bash
node ~/.claude/skills/ax-req-interview/scripts/review-api.mjs \
  {project-name}/prd-v{N}.md \
  {project-name}/debate/ \
  --mode sixhats --rounds 20 --env .dev.vars
```

특정 모델 지정:
```bash
node ~/.claude/skills/ax-req-interview/scripts/review-api.mjs \
  {project-name}/prd-v{N}.md \
  {project-name}/debate/ \
  --mode sixhats --rounds 20 --model gemini --env .dev.vars
```

### 6개 모자 역할
| 모자 | 역할 | 관점 |
|------|------|------|
| ⚪ White | 사실·데이터 | PRD 수치, 근거, 객관적 정보 |
| 🔴 Red | 감정·직관 | 첫인상, 팀 사기, 사용자 감정 |
| ⚫ Black | 비판·리스크 | 약점, 실패 경로, 비현실적 가정 |
| 🟡 Yellow | 기회·가치 | 잠재 이점, 성공 시나리오 |
| 🟢 Green | 창의·대안 | 새로운 접근, 혁신적 해결책 |
| 🔵 Blue | 종합·프로세스 | 논점 정리, 합의점, 최종 판단 |

### 토론 구조
- 20턴 = 6모자 × 3.3회전, 마지막 턴은 항상 Blue Hat(최종 종합)
- 각 턴: 이전 토론 맥락을 참고하며 200-400자 핵심 의견
- 단일 모델 사용 (기본: models.json `$sixhats.defaultModel`)

### 출력 파일
```
{project-name}/debate/
├── sixhats-discussion.md  # 전체 토론 로그 + 통계
└── sixhats-data.json      # 기계 판독용 데이터
```

### Claude의 역할
토론 완료 후:
1. `sixhats-discussion.md`를 읽어 핵심 논점을 사용자에게 요약
2. Blue Hat 최종 종합에서 착수 판단(Ready/Conditional/Not Ready)을 추출
3. Phase 2 review 결과와 병행하여 종합 판단 안내

---

## Phase 3: 검토의견 자동 반영

Phase 2 완료 후, 검토의견을 PRD에 자동 반영한다.

### 3-1. 자동 반영 (기본)

Phase 2가 생성한 `actionable-items.json`과 개별 피드백 파일을 입력으로 사용한다.

```bash
node ~/.claude/skills/ax-req-interview/scripts/review-api.mjs \
  {project-name}/prd-v{N}.md \
  {project-name}/review/round-{N} \
  --mode apply --env .dev.vars
```

특정 모델 지정:
```bash
node ~/.claude/skills/ax-req-interview/scripts/review-api.mjs \
  {project-name}/prd-v{N}.md \
  {project-name}/review/round-{N} \
  --mode apply --model gemini --env .dev.vars
```

### 3-2. 동작 방식

1. `actionable-items.json`에서 flaws/gaps/risks 로드
2. `*-feedback.md` 파일에서 verdict + 핵심 피드백 원문 추출
3. LLM에 PRD 전문 + 검토의견을 전달하여 수정된 PRD 생성
4. 변경 부분에 `<!-- CHANGED: 이유 -->` 마커 자동 삽입

### 3-3. 출력 파일

```
{project-name}/
├── prd-v{N+1}.md                # 수정된 PRD (자동 생성)
├── review/
│   └── round-{N}/
│       ├── apply-diff.md        # 변경 diff (마커 기반)
│       └── actionable-items.json # Phase 2에서 생성된 입력
└── review-history.md            # 누적 변경 이력 (자동 append)
```

### 3-4. Claude의 역할

자동 반영 완료 후 Claude는:
1. `apply-diff.md`를 읽어 변경 내역을 사용자에게 표시한다
2. `prd-v{N+1}.md`의 `<!-- CHANGED -->` 마커 수를 확인한다
3. 사용자에게 변경 사항 확인을 요청한다
4. 확인 후 다음 라운드(Phase 2 → Phase 3 → Phase 4 반복) 또는 착수 판단으로 안내한다

### 3-5. 수동 폴백

API 호출 실패 시 Claude가 직접 수행:
1. `actionable-items.json`과 피드백 파일을 읽는다
2. flaws는 수정 필수, gaps는 보완, risks는 리스크 섹션에 명시
3. PRD를 직접 편집하고 diff를 보여준다

---

## Phase 4: 충분도 평가 (자동 채점)

### 참조 파일
```
Read ~/.claude/skills/ax-req-interview/references/scorecard.md
```

### 자동 채점 (review-api.mjs v5 review 모드)

`review-api.mjs`가 Phase 2 API 검토 완료 후 **자동으로** 스코어카드를 계산한다.
수동 계산이 필요 없다 — 스크립트가 다음 파일을 자동 생성한다:

```
{project-name}/review/round-{N}/
├── scorecard.md     # 사람이 읽는 스코어카드
└── scorecard.json   # 다음 라운드 비교용 기계 데이터
```

### 채점 로직

| 항목 | 데이터 소스 | 점수 |
|------|-----------|------|
| 1. 신규 이슈 없음 | AI 검토 결과 (flaws+gaps+risks) vs 이전 라운드 `scorecard.json` | 20점 |
| 2. Ready 판정 비율 | AI verdict (Ready=3, Conditional=1.5, Not Ready=0) 비율 환산 | 30점 |
| 3. 핵심 요소 커버리지 | PRD 섹션 존재 + 내용 유무 (§2~§5) | 30점 |
| 4. 다관점 반영 여부 | PRD 키워드 분석 (사용자/기술/비즈니스) | 20점 |

- **Round 1**: 항목 1은 자동 스킵(만점) — 초안이므로 신규 이슈 비교 불가
- **Round 2+**: `round-{N-1}/scorecard.json`에서 이전 이슈 수를 읽어 비교

### 출력 예시

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 착수 충분도 스코어카드 — Round {N}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
항목 1: 신규 이슈 없음      [ 20 / 20 ]  (초안, 스킵)
항목 2: Ready 판정 비율     [ 22 / 30 ]  ChatGPT:Ready, Gemini:Conditional, DeepSeek:Ready
항목 3: 핵심 요소 커버리지  [ 26 / 30 ]  미달: Out-of-scope
항목 4: 다관점 반영 여부    [ 20 / 20 ]  전관점 충족
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
총점:  88 / 100

✅ 착수 준비 완료
최종 PRD 생성 후 착수 가능
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Claude의 역할

스코어카드가 자동 생성된 후 Claude는:
1. `scorecard.md`를 읽어 사용자에게 표시한다
2. 80점 이상이면 **착수 준비 완료**를 선언하고 `prd-final.md` 생성을 제안한다
3. 80점 미만이면 미달 항목과 함께 **다음 라운드 안내**를 한다
4. 사용자의 최종 결정을 확인한다 (착수 판단은 Claude가 하지 않는다)

### Phase 4-B: Ambiguity Score 산출 (ouroboros 패턴)

기존 스코어카드와 별도로, PRD의 모호함 수준을 정량화한다.

#### 참조 파일
```
Read ~/.claude/skills/ax-req-interview/references/ambiguity-score.md
```

#### 채점 절차

1. `references/ambiguity-score.md`의 채점 기준을 참고한다
2. PRD 내용을 기반으로 각 차원의 clarity를 0.0~1.0으로 채점한다:
   - **Goal Clarity**: 목표가 구체적이고 측정 가능한가?
   - **Constraint Clarity**: 기술적/비즈니스 제약이 명시적인가?
   - **Success Criteria**: AC가 테스트 가능 수준인가?
   - **Context Clarity** (기존 프로젝트만): 코드베이스 영향 범위를 파악했는가?
3. 프로젝트 유형(신규/기존)에 맞는 가중치를 적용한다
4. **Ambiguity = 1 − Σ(clarityᵢ × weightᵢ)** 계산

#### 출력 형식

```
| Dimension | Clarity | Weight | Score |
|-----------|:-------:|:------:|:-----:|
| Goal      | {0~1.0} | {weight} | {clarity×weight} |
| Constraint| {0~1.0} | {weight} | {clarity×weight} |
| Success   | {0~1.0} | {weight} | {clarity×weight} |
| Context   | {0~1.0} | {weight} | {clarity×weight} | ← 기존 프로젝트만
| **Total** |         |        | **{sum}** |
**Ambiguity = 1 − {sum} = {result}** → {판정}
```

#### 판정 기준

- **≤ 0.2**: 모호함 낮음 — 착수 가능
- **0.2 ~ 0.4**: 모호함 중간 — Socratic 심화 질문으로 보완 가능
- **> 0.4**: 모호함 높음 — 추가 인터뷰 라운드 필요

### Phase 4-C: 통합 판정

스코어카드(100점)와 Ambiguity Score를 결합하여 최종 판정한다.

| 스코어카드 | Ambiguity | 판정 |
|:---------:|:---------:|------|
| ≥ 80      | ≤ 0.2     | ✅ 착수 가능 — 스코어 {score}/100, Ambiguity {amb} |
| ≥ 80      | > 0.2     | ⚠️ 스코어 통과, 모호함 잔존 — Socratic 심화 질문 필요 |
| < 80      | any       | ❌ 미달 — 추가 인터뷰 라운드 필요 |

#### Claude의 역할

1. Phase 4 스코어카드와 Phase 4-B Ambiguity Score를 모두 산출한 후, 위 매트릭스에 따라 판정을 표시한다
2. ⚠️ 판정 시: 모호함이 높은 차원을 구체적으로 안내하고, Socratic 질문(Why/How/What-if)을 제시한다
3. ❌ 판정 시: 미달 항목(스코어카드)과 고모호 차원(Ambiguity)을 함께 보여주고, 다음 라운드를 안내한다
4. 최종 결정은 사용자에게 — Claude는 판정과 근거만 제시한다

---

## 파일 구조 전체

### 진행 중 (Phase 1~4)

```
{project-name}/
├── interview-log.md
├── prd-v1.md
├── prd-v2.md  ...
├── review-history.md         # 누적 변경 이력
└── review/
    ├── round-1/
    │   ├── feedback.md            # 통합 피드백 (API 자동 생성)
    │   ├── chatgpt-feedback.md    # 개별 피드백 (API 자동 생성)
    │   ├── gemini-feedback.md
    │   ├── deepseek-feedback.md
    │   ├── scorecard.md           # 스코어카드 (자동 채점)
    │   └── scorecard.json         # 다음 라운드 비교용 데이터
    └── round-2/
        └── ...
```

### 완료 후 (Phase 5 정리 완료)

```
{project-name}/
├── interview-log.md           # 인터뷰 원문
├── prd-final.md               # 최종 PRD (착수 판정 후)
├── review-history.md          # 누적 변경 이력
└── archive/                   # 중간 산출물
    ├── prd-v1.md ... prd-v{N}.md
    └── review/
        ├── round-1/ ...
        └── round-{N}/ ...
```

---

## Phase 5: 완료 후 정리

착수 판정(Phase 4에서 80점 이상 + 사용자 확인) 후 `prd-final.md`를 생성하면, 중간 산출물을 자동 정리한다.

### 5-1. 정리 대상

| 유지 (프로젝트 루트) | archive/ 이동 |
|---------------------|--------------|
| `interview-log.md` | `prd-v1.md` ~ `prd-v{N}.md` (중간 버전 전체) |
| `prd-final.md` | `review/` (전체 라운드) |
| `review-history.md` | `debate/` (Six Hats 토론, 있는 경우) |

### 5-2. 실행 방식

`prd-final.md` 생성 직후 자동 수행:

```bash
mkdir -p {project-name}/archive
mv {project-name}/prd-v*.md {project-name}/archive/
mv {project-name}/review {project-name}/archive/review
# debate/ 디렉토리가 있으면 함께 이동
[ -d {project-name}/debate ] && mv {project-name}/debate {project-name}/archive/debate
```

### 5-3. 정리 후 구조

```
{project-name}/
├── interview-log.md       # 인터뷰 원문 (컨텍스트 보존)
├── prd-final.md           # 최종 PRD (이것만 개발에 사용)
├── review-history.md      # 누적 변경 이력 요약
└── archive/               # 중간 산출물 (감사 추적용)
    ├── prd-v1.md ... prd-v{N}.md
    ├── review/
    │   ├── round-1/
    │   └── round-{N}/
    └── debate/             # (선택)
```

### 5-4. Claude의 역할

1. `prd-final.md` 생성 완료 후, 정리 수행 여부를 AskUserQuestion으로 확인한다
2. 승인 시 위 구조로 파일을 이동한다
3. 이동 결과를 간단히 보고한다 (이동 파일 수, 정리 전후 구조)

---

## Phase 6: SPEC/Sprint 등록 (착수 확정 후 필수)

착수 판정(Phase 4에서 사용자 확인) 후 `prd-final.md`를 생성하면, 반드시 SPEC.md F-item 등록과 Sprint 배정을 수행한다.

### 6-1. F-item 등록

1. SPEC.md에서 마지막 F번호를 확인한다 (예: F262 → 다음은 F263)
2. PRD의 Must Have 기능 수만큼 F-item을 등록한다
3. 각 F-item에 REQ 코드를 부여한다 (예: FX-REQ-255)

```bash
# SPEC.md §5에 추가할 F-item 예시
| F263 | 발굴 프로세스 단계별 안내 UI (FX-REQ-255, P0) | Sprint 92 | 📋 | PRD: fx-discovery-ux |
```

4. **등록 후 즉시 커밋+push 필수** (WT 생성 전, S149 교훈)

### 6-2. Sprint 배정

PRD의 마일스톤 구성에 따라 Sprint를 배정한다:
1. F-item별 의존성을 확인하고 Sprint에 배치한다
2. SPEC.md §6 Execution Plan에 Sprint 항목을 추가한다
3. 필요 시 `/ax-sprint` 명령으로 Sprint WT를 생성한다

### 6-3. /pdca plan 연계

`/pdca plan {feature}` 명령으로 Plan 문서를 작성한다. 이때 prd-final.md를 참조하여:
- F-item 목록
- 기술 결정
- Sprint 구성
- 의존성
- 리스크

를 Plan 문서에 포함한다.

### 6-4. Claude의 역할

1. `prd-final.md` 생성 직후, F-item 등록 필요성을 안내한다
2. 사용자 확인 후 SPEC.md에 F-item을 등록한다 (`/ax-req-manage new` 연계)
3. Sprint 배정을 제안한다
4. `/pdca plan {feature}` 실행을 안내한다

> **중요**: F-item을 SPEC.md에 등록하지 않고 Plan/Design을 작성하면 SPEC↔PDCA drift가 발생한다.
> 반드시 SPEC 등록 → 커밋 → push → WT 생성 순서를 지킨다.

---

## 주요 규칙

- **인터뷰는 대화형으로**: 한 번에 하나씩 질문한다
- **버전은 누락 없이**: PRD는 항상 버전 번호를 붙여 저장한다
- **diff는 명시적으로**: 변경 전/후를 보여준다
- **점수는 투명하게**: 스코어 근거를 항목별로 설명한다
- **착수 판단은 Claude가 하지 않는다**: 스코어와 근거를 제시하고 최종 결정은 사용자에게

---

## 빠른 참조

| 파일 | 경로 | 내용 |
|------|------|------|
| 인터뷰 트리 | `~/.claude/skills/ax-req-interview/templates/interview-tree.md` | 5파트 인터뷰 질문 트리 |
| PRD 템플릿 | `~/.claude/skills/ax-req-interview/templates/prd-template.md` | PRD 출력 포맷 |
| 검토 프롬프트 | `~/.claude/skills/ax-req-interview/templates/review-prompts.md` | AI별 검토 프롬프트 (수동 폴백용) |
| 스코어카드 | `~/.claude/skills/ax-req-interview/references/scorecard.md` | 충분도 평가 기준 상세 |
| Ambiguity Score | `~/.claude/skills/ax-req-interview/references/ambiguity-score.md` | ouroboros 패턴 모호함 채점 기준 |
| 모델 레지스트리 | `~/.claude/skills/ax-req-interview/config/models.json` | AI 모델 목록/설정 (추가/변경 시 수정) |
| 검토 API 스크립트 | `~/.claude/skills/ax-req-interview/scripts/review-api.mjs` | API 자동 호출 + Six Hats 토론 (v5, 모델 레지스트리 연동) |
| 초기화 스크립트 | `~/.claude/skills/ax-req-interview/scripts/init-project.sh` | 프로젝트 폴더 자동 생성 |


---

## Gotchas

- **SPEC 등록 누락 방지**: `prd-final.md` 생성 후 반드시 Phase 6(SPEC/Sprint 등록)을 수행한다. 누락하면 F번호 없이 Plan/Design이 작성되어 SPEC drift 발생 (S149 교훈)
- **OpenRouter API Key**: `--proxy openrouter` 사용 시 `.dev.vars`에 `OPENROUTER_API_KEY` 설정 필수. 개별 모델 키가 없어도 OpenRouter 키 하나로 3개 모델 동시 사용 가능
- **스코어카드 한계**: 동일 PRD를 반복 검토하면 이슈 수가 발산할 수 있음 (항목 1 밀도 기반 개선 적용됨, v3). 정성적 판단 병행 권장
- **Gemini 빈 응답**: Google AI API 직접 호출 시 빈 응답 발생 가능 → `--proxy openrouter` 사용 시 해결됨
- **검토 비용**: OpenRouter 경유 시 3개 모델 1회 라운드 ≈ $0.01~0.05. 반복 라운드가 많으면 누적 확인
