# 아키텍처 결정 기록 (ADR) 표준

> 범용 표준 — 모든 프로젝트에 공통 적용

## 1. 개요

아키텍처 결정 기록(Architecture Decision Record)은 프로젝트에서 내린 중대한 기술 결정의 맥락, 선택, 결과를 기록하는 문서이다.

### 목적

- 결정의 **이유**를 보존 (시간이 지나도 "왜 이렇게 했는지" 알 수 있도록)
- 새 팀원/AI가 기존 결정의 맥락을 빠르게 파악
- 동일한 결정을 반복 논의하는 낭비 방지

## 2. 문서 관리 통합

### 기존 문서 체계 활용

- **문서코드**: `{PROJECT}-DSGN-{NNN}` (설계 유형 활용)
- **파일 위치**: `docs/designs/{PROJECT}-DSGN-{NNN}_adr-{topic}.md`
- **INDEX.md**: 일반 설계 문서와 함께 등록
- **상태**: Draft → Active → Superseded (새 결정으로 대체 시)

### 별도 시스템 불필요

- 기존 문서 관리 표준(doc-governance.md)의 DSGN 유형으로 통합
- 파일명 규칙, frontmatter, 상태 관리 모두 기존 체계 따름

## 3. ADR 템플릿

### 4항목 간결 포맷

```markdown
---
code: {PROJECT}-DSGN-{NNN}
title: "ADR: {결정 제목}"
version: 1.0
status: Active
category: design
created: YYYY-MM-DD
updated: YYYY-MM-DD
author: {작성자}
---

# ADR: {결정 제목}

## 맥락 (Context)

왜 이 결정이 필요했는지 배경과 상황을 설명한다.
- 어떤 문제를 해결하려 했는지
- 어떤 제약 조건이 있었는지

## 결정 (Decision)

무엇을 선택했는지, 대안은 무엇이었는지 기록한다.

**선택**: {선택한 방안}

**검토한 대안**:
1. {대안 1} — {불채택 이유}
2. {대안 2} — {불채택 이유}

## 결과 (Consequences)

이 결정으로 인한 영향을 기록한다.

**긍정적**:
- ...

**부정적/트레이드오프**:
- ...
```

## 4. 작성 기준

### 작성해야 하는 경우

- 기술 스택/프레임워크 선택 (예: "왜 Remix인가", "왜 D1인가")
- 아키텍처 패턴 변경 (예: "Bounded Context 도입", "Service Layer 분리")
- 외부 서비스/플랫폼 선택 (예: "Cloudflare Pages 선택 이유")
- 운영 정책 변경 (예: "trunk-based로 전환", "배포 전략 변경")
- 주요 트레이드오프 결정 (예: "성능 vs 개발 속도에서 속도 우선")

### 작성하지 않아도 되는 경우

- 라이브러리 버전 업데이트
- 사소한 코드 구조 변경
- 명백한 선택 (대안이 없는 경우)
- 일시적/실험적 결정

## 5. 관리 규칙

### 불변 원칙

- 한 번 작성된 ADR의 맥락/결정 섹션은 수정하지 않음
- 결정이 바뀌면 기존 ADR을 Superseded로 변경하고 새 ADR 작성
- 새 ADR에서 이전 ADR을 `[[문서코드]]`로 참조

### ADR 검색

- INDEX.md에서 DSGN 유형 필터로 ADR 목록 확인
- MEMORY.md의 결정사항 섹션에서 활성 ADR 요약 참조
