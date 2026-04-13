#!/usr/bin/env node
/**
 * review-api.mjs — PRD 외부 AI 검토 + Six Hats 토론 + 검토의견 자동 반영 스크립트 v6
 *
 * 사용법:
 *   node review-api.mjs <prd-file> <output-dir> [options]
 *
 * 모드:
 *   --mode review         병렬 AI 검토 (기본)
 *   --mode sixhats        Six Thinking Hats 토론
 *
 * 공통 옵션:
 *   --env <file>         환경변수 파일 (기본: .dev.vars)
 *   --config <file>      모델 레지스트리 JSON (기본: ../config/models.json)
 *
 * review 모드 옵션:
 *   --prompt-dir <dir>   라운드별 커스텀 프롬프트 디렉토리
 *   --round <N>          라운드 번호 (기본: 1)
 *   --models <a,b,c>     사용할 모델 키 (쉼표 구분, 기본: enabled 전체)
 *
 * sixhats 모드 옵션:
 *   --rounds <N>         토론 턴 수 (기본: 20)
 *   --model <key>        사용할 모델 키 (기본: $sixhats.defaultModel)
 *
 * 예시:
 *   node review-api.mjs prd-v1.md review/round-1 --env .dev.vars
 *   node review-api.mjs prd-v1.md debate/ --mode sixhats --rounds 20
 *   node review-api.mjs prd-v1.md debate/ --mode sixhats --model gemini --rounds 12
 *
 * v5 변경사항:
 *   - Six Thinking Hats 토론 모드 추가 (--mode sixhats)
 *   - 토론 턴 수 설정 (--rounds, 기본 20)
 *   - 단일 모델 선택 (--model, sixhats 모드용)
 *   - actionable-items.json 출력 (Phase 3 자동화 준비)
 *   - verdict 파싱 패턴 강화 + 구조화된 출력 요청
 *   - 모델 레지스트리 $sixhats 섹션 지원
 *
 * v6.1 변경사항:
 *   - OpenRouter 프록시 지원 — 개별 API 키 없으면 OPENROUTER_API_KEY로 자동 폴백
 *   - models.json에 openrouterModels 필드 추가, $openrouter 글로벌 설정
 *   - Gemini도 OpenRouter 경유 시 OpenAI 호환 API로 통일 (별도 callGemini 불필요)
 *
 * v6 변경사항:
 *   - 검토의견 자동 반영 모드 추가 (--mode apply, Phase 3 완전 자동화)
 *   - actionable-items.json + 개별 피드백 → LLM PRD 수정 → prd-v{N+1}.md 출력
 *   - <!-- CHANGED: 이유 --> 마커 기반 변경 추적
 *   - apply-diff.md 변경 보고서 자동 생성
 *   - review-history.md 누적 이력 자동 append
 *   - stripCodeFence() 후처리 (LLM 코드 펜스 제거)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── 설정 ───────────────────────────────────────

const MAX_OUTPUT_TOKENS = 8192;
const DEBATE_MAX_TOKENS = 1500;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 2000;
const DEFAULT_OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_ENV_KEY = "OPENROUTER_API_KEY";

// ─── 모델 레지스트리 로드 ────────────────────────

function loadModelRegistry(configPath) {
  if (!existsSync(configPath)) {
    console.error(`❌ 모델 레지스트리를 찾을 수 없어요: ${configPath}`);
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(configPath, "utf-8"));
  const models = {};
  let sixhats = null;

  for (const [key, cfg] of Object.entries(raw)) {
    if (key === "$sixhats") {
      sixhats = cfg;
      continue;
    }
    // $schema, $version 등 메타 필드 스킵
    if (key.startsWith("$")) continue;
    models[key] = cfg;
  }

  return { models, sixhats };
}

// ─── 유틸 ───────────────────────────────────────

function loadEnvFile(envFile) {
  const envPath = resolve(envFile);
  if (!existsSync(envPath)) return {};

  const env = {};
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

function getApiKey(envKey, fileEnv) {
  // 1. process.env 우선
  if (process.env[envKey]) return process.env[envKey];
  // 2. .dev.vars 폴백
  if (fileEnv[envKey]) return fileEnv[envKey];
  return null;
}

function log(emoji, msg) {
  const ts = new Date().toLocaleTimeString("ko-KR", { hour12: false });
  console.log(`[${ts}] ${emoji} ${msg}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── API 호출 ───────────────────────────────────

async function callOpenAI(apiKey, model, systemPrompt, userPrompt, endpoint) {
  const url = endpoint || DEFAULT_OPENAI_ENDPOINT;
  const isOpenRouter = url === OPENROUTER_ENDPOINT;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  if (isOpenRouter) {
    headers["HTTP-Referer"] = "https://fx.minu.best";
    headers["X-Title"] = "Foundry-X PRD Review";
  }
  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: MAX_OUTPUT_TOKENS,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI-compatible API ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  const finishReason = data.choices[0].finish_reason;
  return {
    content: data.choices[0].message.content,
    usage: data.usage,
    model: data.model,
    truncated: finishReason === "length",
  };
}

async function callGemini(apiKey, model, systemPrompt, userPrompt, { maxTokens = MAX_OUTPUT_TOKENS, temperature = 0.7 } = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
      },
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Gemini API ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const finishReason = data.candidates?.[0]?.finishReason;
  return {
    content,
    usage: data.usageMetadata || {},
    model,
    truncated: finishReason === "MAX_TOKENS",
  };
}

// ─── 재시도 + fallback 로직 ─────────────────────

async function callWithRetry(apiKey, cfg, userPrompt, { openrouterKey = null, forceOpenRouter = false } = {}) {
  // OpenRouter: --proxy openrouter 강제 모드 또는 개별 API 키 없으면 자동 경유
  const useOpenRouter = (forceOpenRouter || !apiKey) && openrouterKey && cfg.openrouterModels;
  const effectiveKey = useOpenRouter ? openrouterKey : (apiKey || openrouterKey);
  const models = useOpenRouter ? cfg.openrouterModels : cfg.models;
  const effectiveEndpoint = useOpenRouter ? OPENROUTER_ENDPOINT : cfg.endpoint;

  if (!effectiveKey) {
    throw new Error(`${cfg.name}: API 키 없음 (${cfg.envKey} 또는 ${OPENROUTER_ENV_KEY})`);
  }

  if (useOpenRouter) {
    log("🔀", `${cfg.name}: OpenRouter 경유 (${models[0]})`);
  }

  let lastError = null;

  for (const model of models) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
          log("🔄", `${cfg.name} 재시도 ${attempt}/${MAX_RETRIES} (${model}, ${delay}ms 대기)`);
          await sleep(delay);
        }

        let result;
        // OpenRouter 경유 시 모든 모델을 OpenAI 호환 API로 호출
        if (useOpenRouter || cfg.provider === "openai") {
          result = await callOpenAI(effectiveKey, model, cfg.systemPrompt, userPrompt, effectiveEndpoint);
        } else if (cfg.provider === "google") {
          result = await callGemini(effectiveKey, model, cfg.systemPrompt, userPrompt);
        } else {
          throw new Error(`지원하지 않는 provider: ${cfg.provider}`);
        }

        if (model !== models[0]) {
          result.fallbackFrom = models[0];
          result.fallbackTo = model;
        }
        result.attempts = attempt + 1;
        if (useOpenRouter) result.viaOpenRouter = true;
        return result;
      } catch (err) {
        lastError = err;
        const isModelError = err.message.includes("404") || err.message.includes("no longer available") || err.message.includes("does not exist");
        if (isModelError) {
          log("⚠️", `${cfg.name}: ${model} 사용 불가 → 다음 모델로 fallback`);
          break;
        }
        if (attempt < MAX_RETRIES) {
          log("⚠️", `${cfg.name} (${model}) 오류: ${err.message}`);
        }
      }
    }
  }

  throw lastError || new Error(`${cfg.name}: 모든 모델/재시도 실패`);
}

// ─── 결과 파싱 ──────────────────────────────────

function parseReviewResponse(content) {
  const result = { flaws: [], gaps: [], risks: [], verdict: "Unknown", conditions: [], parseQuality: {} };

  // ── verdict 파싱 (기존 유지) ──
  const verdictPatterns = [
    /착수\s*판단[:\s]*\**\s*(Ready|Not\s*Ready|Conditional)\s*\**/i,
    /착수\s*판단[:\s]*`?(Ready|Not\s*Ready|Conditional)`?/i,
    /\*\*착수\s*판단\*\*[:\s]*\**\s*(Ready|Not\s*Ready|Conditional)/i,
    /판단[:\s]*\**\s*(Ready|Not\s*Ready|Conditional)\s*\**/i,
  ];

  for (const pattern of verdictPatterns) {
    const match = content.match(pattern);
    if (match) {
      result.verdict = match[1].replace(/\s+/g, " ").trim();
      break;
    }
  }
  result.parseQuality.verdictParsed = result.verdict !== "Unknown";

  result.parseQuality.possiblyTruncated = ![".", "。", "!", "?", "다", "요", "세", "니"].some((c) => content.trim().endsWith(c));

  // ── 이슈 카운트 v2: 구조화된 항목 파싱 ──
  // 전략: 각 섹션(결함/누락/리스크)의 구체적 지적 항목을 개별 카운트
  const sections = content.split(/\n#{1,3}\s*\d+\./);
  for (const section of sections) {
    const lower = section.toLowerCase();

    // 섹션 내 구체적 지적 항목 추출 (번호/불릿 기반)
    const issueItems = extractIssueItems(section);
    const issueCount = issueItems.length;

    if (lower.includes("결함") || lower.includes("완결성") || lower.includes("flaw") || lower.includes("논리")) {
      for (const item of issueItems) result.flaws.push(item);
      // 지적 항목이 없지만 섹션에 개선 포인트가 있으면 최소 1건
      if (issueCount === 0 && (lower.includes("개선") || lower.includes("부족") || lower.includes("불명확"))) {
        result.flaws.push(section.trim().slice(0, 300));
      }
    }
    if (lower.includes("누락") || lower.includes("gap") || lower.includes("빠진") || lower.includes("missing")) {
      for (const item of issueItems) result.gaps.push(item);
      if (issueCount === 0 && (lower.includes("없음") || lower.includes("부재") || lower.includes("미비"))) {
        result.gaps.push(section.trim().slice(0, 300));
      }
    }
    if (lower.includes("리스크") || lower.includes("risk") || lower.includes("우려") || lower.includes("실패")) {
      for (const item of issueItems) result.risks.push(item);
      if (issueCount === 0 && (lower.includes("위험") || lower.includes("가능성"))) {
        result.risks.push(section.trim().slice(0, 300));
      }
    }
  }

  // Conditional 조건 추출 (verdict 근처 번호 항목)
  if (result.verdict === "Conditional") {
    const condMatch = content.match(/조건[:\s]*\n([\s\S]*?)(?:\n---|\n##|\n\*\*착수)/);
    if (condMatch) {
      const condItems = extractIssueItems(condMatch[1]);
      result.conditions = condItems;
    }
  }

  result.parseQuality.issueCount = result.flaws.length + result.gaps.length + result.risks.length;
  result.parseQuality.conditionCount = result.conditions.length;

  return result;
}

// 섹션 내 구체적 지적 항목을 추출 (번호/불릿/볼드 기반)
function extractIssueItems(text) {
  const items = [];
  const lines = text.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    // 번호 항목: "1.", "2.", "- **항목명**:" 패턴
    if (/^[\d]+[\.\)]\s+/.test(trimmed) || /^-\s+\*\*[^*]+\*\*/.test(trimmed)) {
      const cleaned = trimmed.replace(/^[\d]+[\.\)]\s+/, "").replace(/^-\s+/, "").slice(0, 200);
      if (cleaned.length > 10) items.push(cleaned); // 10자 미만은 제목만 있는 경우 제외
    }
  }

  return items;
}

// ─── 스코어카드 자동 채점 ─────────────────────

function sectionHasContent(prd, headerPattern, minLen = 50) {
  const idx = prd.search(headerPattern);
  if (idx === -1) return false;

  const after = prd.slice(idx);
  const nextH2 = after.slice(1).search(/\n## /);
  const section = nextH2 === -1 ? after : after.slice(0, nextH2 + 1);

  const cleaned = section
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return (
        t &&
        !t.startsWith("#") &&
        !t.startsWith(">") &&
        !/^\|[\s-]+\|$/.test(t) &&
        !t.includes("{") &&
        t !== "---" &&
        t !== "[미확인]"
      );
    })
    .join("")
    .trim();

  return cleaned.length >= minLen;
}

// 3단계 커버리지 평가: 없음(0) / 최소(절반) / 충실(만점)
function gradeCoverage(prd, headerPattern, minLen, qualityKeywords) {
  const hasSection = sectionHasContent(prd, headerPattern, Math.floor(minLen * 0.5));
  if (!hasSection) return { score: 0, grade: "없음" };

  // 내용 충실도: qualityKeywords 중 몇 개가 포함되어 있는지
  const idx = prd.search(headerPattern);
  if (idx === -1) return { score: 0, grade: "없음" };
  const after = prd.slice(idx);
  const nextH2 = after.slice(1).search(/\n## /);
  const section = (nextH2 === -1 ? after : after.slice(0, nextH2 + 1)).toLowerCase();
  const matchedKw = qualityKeywords.filter((kw) => section.includes(kw.toLowerCase()));

  if (matchedKw.length >= 3) return { grade: "충실", matchedKeywords: matchedKw };
  if (matchedKw.length >= 1) return { grade: "최소", matchedKeywords: matchedKw };
  // 섹션은 있지만 키워드 없음 → 최소 점수
  return { grade: "최소", matchedKeywords: [] };
}

// 키워드 수 기반 관점 충실도: 0개=0, 1~2개=절반, 3개+=만점
function gradeKeywords(lc, keywords) {
  const matched = keywords.filter((k) => lc.includes(k));
  const count = matched.length;
  if (count >= 3) return { grade: "충실", matchedKeywords: matched };
  if (count >= 1) return { grade: "최소", matchedKeywords: matched };
  return { score: 0, grade: "없음", matchedKeywords: [] };
}

function calculateScorecard(prdContent, successResults, roundNum, outputDir) {
  // PRD에서 CHANGED 마커 제거 (키워드 매칭 방해 방지)
  const cleanPrd = prdContent.replace(/<!--\s*CHANGED:[^>]*-->\n?/g, "");

  // ── 항목 1: 가중 이슈 밀도 (20점) ──
  // v4: severity 가중치 적용 (flaw×3 + gap×1 + risk×1) + 라운드 간 품질 비교
  const flawCount = successResults.reduce((s, r) => s + (r.parsed?.flaws?.length || 0), 0);
  const gapCount = successResults.reduce((s, r) => s + (r.parsed?.gaps?.length || 0), 0);
  const riskCount = successResults.reduce((s, r) => s + (r.parsed?.risks?.length || 0), 0);
  const rawIssueCount = flawCount + gapCount + riskCount;
  const weightedIssueCount = flawCount * 3 + gapCount * 1 + riskCount * 1;
  const prdLen = cleanPrd.length;
  const currentDensity = prdLen > 0 ? (weightedIssueCount / prdLen) * 1000 : 0;
  const severityBreakdown = { flaws: flawCount, gaps: gapCount, risks: riskCount, weighted: weightedIssueCount, raw: rawIssueCount };

  let item1;
  if (roundNum <= 1) {
    item1 = { score: 20, max: 20, reason: "초안 검토 — 스킵(만점)", skipped: true, totalIssues: rawIssueCount, weightedIssues: weightedIssueCount, density: Math.round(currentDensity * 10) / 10, severityBreakdown };
  } else {
    const prevDir = outputDir.replace(`round-${roundNum}`, `round-${roundNum - 1}`);
    const prevPath = resolve(prevDir, "scorecard.json");
    let prevDensity = 0;
    let prevIssues = 0;
    let prevBreakdown = null;
    if (existsSync(prevPath)) {
      try {
        const prev = JSON.parse(readFileSync(prevPath, "utf-8"));
        prevIssues = prev.item1?.totalIssues || 0;
        prevDensity = prev.item1?.density || 0;
        prevBreakdown = prev.item1?.severityBreakdown || null;
      } catch {}
    }
    // 가중 밀도 기반 판정: 밀도 감소 = 개선, 밀도 증가 = 악화
    const densityDelta = currentDensity - prevDensity;
    let score;
    if (densityDelta <= 0) score = 20;        // 밀도 감소 또는 동일 = 만점
    else if (densityDelta <= 1) score = 14;   // 소폭 증가
    else if (densityDelta <= 2) score = 8;    // 중간 증가
    else score = 0;                            // 대폭 증가

    // 라운드 간 품질 변화 요약
    let qualityTrend = "";
    if (prevBreakdown) {
      const flawDelta = flawCount - (prevBreakdown.flaws || 0);
      const gapDelta = gapCount - (prevBreakdown.gaps || 0);
      const riskDelta = riskCount - (prevBreakdown.risks || 0);
      const parts = [];
      if (flawDelta !== 0) parts.push(`flaw${flawDelta > 0 ? "+" : ""}${flawDelta}`);
      if (gapDelta !== 0) parts.push(`gap${gapDelta > 0 ? "+" : ""}${gapDelta}`);
      if (riskDelta !== 0) parts.push(`risk${riskDelta > 0 ? "+" : ""}${riskDelta}`);
      qualityTrend = parts.length > 0 ? ` [${parts.join(", ")}]` : " [변화 없음]";
    }

    item1 = {
      score, max: 20,
      reason: `가중밀도 ${Math.round(currentDensity * 10) / 10}/1K자 (이전 ${Math.round(prevDensity * 10) / 10}, Δ${densityDelta > 0 ? "+" : ""}${Math.round(densityDelta * 10) / 10})${qualityTrend}`,
      totalIssues: rawIssueCount, weightedIssues: weightedIssueCount, prevIssues, density: Math.round(currentDensity * 10) / 10, prevDensity: Math.round(prevDensity * 10) / 10, severityBreakdown
    };
  }

  // ── 항목 2: Ready 판정 비율 (30점) ──
  // v2: 실제 참여 AI 수 기반 비율 환산 (2개든 4개든 동일 기준)
  const verdictMap = { Ready: 1.0, Conditional: 0.5, "Not Ready": 0 };
  let readyRatio = 0;
  const readyDetails = [];
  let parsedCount = 0;
  for (const r of successResults) {
    const v = r.parsed?.verdict || "Unknown";
    const ratio = verdictMap[v] ?? 0;
    if (v !== "Unknown") parsedCount++;
    readyRatio += ratio;
    readyDetails.push({ name: r.name, verdict: v, ratio });
  }
  const aiCount = parsedCount || successResults.length;
  // 비율 환산: 0.0~1.0 → 0~30점 (연속적 스케일링)
  const readyPercent = aiCount > 0 ? readyRatio / aiCount : 0;
  // 0%→0, 50%→15, 75%→22, 100%→30 (선형)
  const item2Score = Math.round(readyPercent * 30);
  const item2 = { score: item2Score, max: 30, details: readyDetails, readyPercent: Math.round(readyPercent * 100), count: aiCount };

  // ── 항목 3: 핵심 요소 커버리지 (30점) ──
  // v3: cleanPrd 사용 + 키워드 풀 확장 (한국어/영어 혼합 PRD 대응)
  const coverageRaw = [
    { name: "핵심 문제 정의", max: 5, ...gradeCoverage(cleanPrd, /## 2[\.\s]|문제 정의/, 50, ["as-is", "to-be", "시급", "현재", "목표", "현재 상태", "목표 상태", "문제", "기회", "pain"]) },
    { name: "사용자/이해관계자", max: 5, ...gradeCoverage(cleanPrd, /## 3[\.\s]|사용자/, 40, ["페르소나", "니즈", "역할", "사용 환경", "여정", "사용자", "이해관계자", "주 사용자", "기술 수준"]) },
    { name: "핵심 기능 범위", max: 5, ...gradeCoverage(cleanPrd, /## 4[\.\s]|기능 범위|### 4\.1/, 60, ["p0", "must", "phase", "핵심", "must have", "기능", "단계별", "help agent", "온보딩", "hitl"]) },
    { name: "Out-of-scope", max: 4, ...gradeCoverage(cleanPrd, /### 4\.3|제외|out[- ]of[- ]scope/i, 15, ["금지", "제외", "포함하지", "2차", "미포함", "scope", "제외 범위"]) },
    { name: "KPI/성공 기준", max: 6, ...gradeCoverage(cleanPrd, /### 5\.1|성공 기준|정량 지표|kpi/i, 30, ["현재", "목표", "측정", "지표", "현재값", "목표값", "주간", "비율", "kpi"]) },
    { name: "MVP 기준", max: 5, ...gradeCoverage(cleanPrd, /### 5\.2|mvp|최소 기준/i, 15, ["[ ]", "[x]", "최소", "필수", "mvp", "데모", "완료"]) },
  ];
  // grade → score 변환: 없음=0, 최소=절반, 충실=만점
  const coverageChecks = coverageRaw.map((c) => ({
    ...c,
    score: c.grade === "충실" ? c.max : c.grade === "최소" ? Math.ceil(c.max * 0.5) : 0,
  }));
  const item3Score = coverageChecks.reduce((s, c) => s + c.score, 0);
  const item3 = { score: item3Score, max: 30, details: coverageChecks };

  // ── 항목 4: 다관점 반영 여부 (20점) ──
  // v3: cleanPrd 사용 + 키워드 풀 확장
  const lc = cleanPrd.toLowerCase();
  const perspRaw = [
    { name: "사용자 관점", max: 7, ...gradeKeywords(lc, ["사용자 경험", "ux", "사용성", "사용자 니즈", "페르소나", "사용 환경", "사용 시나리오", "사용자 여정", "온보딩", "접근성"]) },
    { name: "기술 관점", max: 7, ...gradeKeywords(lc, ["기술 스택", "아키텍처", "api", "인프라", "프론트엔드", "백엔드", "데이터베이스", "기술적 제약", "edge runtime", "ssr"]) },
    { name: "비즈니스 관점", max: 6, ...gradeKeywords(lc, ["roi", "비용", "수익", "시장", "비즈니스", "예산", "경쟁", "차별화", "사업", "가치"]) },
  ];
  const perspChecks = perspRaw.map((p) => ({
    ...p,
    score: p.grade === "충실" ? p.max : p.grade === "최소" ? Math.ceil(p.max * 0.5) : 0,
  }));
  const item4Score = perspChecks.reduce((s, p) => s + p.score, 0);
  const item4 = { score: item4Score, max: 20, details: perspChecks };

  // ── 종합 판정 ──
  const total = item1.score + item2.score + item3.score + item4.score;
  let verdict, emoji, recommendation;
  if (total >= 80) {
    verdict = "착수 준비 완료";
    emoji = "✅";
    recommendation = "최종 PRD 생성 후 착수 가능";
  } else if (total >= 60) {
    verdict = "추가 검토 권장";
    emoji = "🔄";
    recommendation = "미달 항목 중심으로 1라운드 추가";
  } else {
    verdict = "검토 필수";
    emoji = "⚠️";
    recommendation = "핵심 항목 재정의 후 재검토";
  }

  const pad = (n) => String(n).padStart(2);
  const item1Reason = item1.skipped ? "(초안, 스킵)" : item1.reason;
  const item1Severity = `flaw:${severityBreakdown.flaws} gap:${severityBreakdown.gaps} risk:${severityBreakdown.risks} (가중:${severityBreakdown.weighted})`;
  const item2Summary = readyDetails.map((d) => `${d.name}:${d.verdict}`).join(", ");
  // v3: grade별 상세 표시 (충실/최소/없음 구분)
  const item3Details = coverageChecks.map((c) => `${c.name}:${c.grade}(${c.score}/${c.max})`);
  const item3NonFull = coverageChecks.filter((c) => c.grade !== "충실");
  const item3Summary = item3NonFull.length === 0 ? "전항목 충실" : item3NonFull.map((c) => `${c.name}(${c.grade})`).join(", ");
  const item4NonFull = perspChecks.filter((p) => p.grade !== "충실");
  const item4Summary = item4NonFull.length === 0 ? "전관점 충실" : item4NonFull.map((p) => `${p.name}(${p.grade})`).join(", ");

  const md = [
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    `📊 착수 충분도 스코어카드 — Round ${roundNum}`,
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    `항목 1: 가중 이슈 밀도      [ ${pad(item1.score)} / 20 ]  ${item1Reason}`,
    `         severity 분포      ${item1Severity}`,
    `항목 2: Ready 판정 비율     [ ${pad(item2.score)} / 30 ]  ${item2Summary}`,
    `항목 3: 핵심 요소 커버리지  [ ${pad(item3.score)} / 30 ]  ${item3Summary}`,
    `항목 4: 다관점 반영 여부    [ ${pad(item4.score)} / 20 ]  ${item4Summary}`,
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    `총점:  ${total} / 100`,
    "",
    `${emoji} ${verdict}`,
    recommendation,
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  ].join("\n");

  const json = { round: roundNum, timestamp: new Date().toISOString(), total, verdict, emoji, item1, item2, item3, item4 };

  return { md, json };
}

// ─── Actionable Items 생성 (Phase 3 자동화 준비) ──

function generateActionableItems(successResults, outputDir) {
  const items = [];
  for (const r of successResults) {
    const source = r.name;
    for (const flaw of r.parsed?.flaws || []) {
      items.push({ type: "flaw", source, text: flaw.slice(0, 200), severity: "high" });
    }
    for (const gap of r.parsed?.gaps || []) {
      items.push({ type: "gap", source, text: gap.slice(0, 200), severity: "medium" });
    }
    for (const risk of r.parsed?.risks || []) {
      items.push({ type: "risk", source, text: risk.slice(0, 200), severity: "medium" });
    }
    if (r.parsed?.verdict && r.parsed.verdict !== "Unknown") {
      items.push({ type: "verdict", source, text: r.parsed.verdict, severity: "info" });
    }
  }

  const output = {
    generated: new Date().toISOString(),
    totalItems: items.length,
    byType: {
      flaw: items.filter((i) => i.type === "flaw").length,
      gap: items.filter((i) => i.type === "gap").length,
      risk: items.filter((i) => i.type === "risk").length,
    },
    items,
  };

  const outPath = resolve(outputDir, "actionable-items.json");
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  log("📋", `Actionable items 저장: ${outPath} (${items.length}건)`);
  return output;
}

// ─── Apply Feedback (Phase 3 자동화) ─────────────

function loadActionableItems(roundDir) {
  const itemsPath = resolve(roundDir, "actionable-items.json");
  if (!existsSync(itemsPath)) {
    log("⚠️", `actionable-items.json 없음: ${itemsPath}`);
    return null;
  }
  const data = JSON.parse(readFileSync(itemsPath, "utf-8"));
  log("📋", `Actionable items 로드: ${data.totalItems}건 (flaw:${data.byType.flaw}, gap:${data.byType.gap}, risk:${data.byType.risk})`);
  return data;
}

function loadFeedbackSummaries(roundDir) {
  const files = readdirSync(roundDir).filter(
    (f) => f.endsWith("-feedback.md") && f !== "feedback.md"
  );

  return files.map((f) => {
    const content = readFileSync(resolve(roundDir, f), "utf-8");
    const name = f.replace("-feedback.md", "");

    // verdict 추출
    const verdictMatch = content.match(
      /착수\s*판단[:\s]*\**\s*(Ready|Not\s*Ready|Conditional)/i
    );
    const verdict = verdictMatch
      ? verdictMatch[1].replace(/\s+/g, " ").trim()
      : "Unknown";

    // 역할 추출
    const roleMatch = content.match(/\*\*역할:\*\*\s*(.+)/);
    const role = roleMatch ? roleMatch[1].trim() : "";

    return { name, verdict, role, content: content.slice(0, 4000) };
  });
}

function buildApplySystemPrompt() {
  return `당신은 PRD(Product Requirements Document) 편집 전문가입니다.
AI 검토 의견을 반영하여 PRD를 개선하는 것이 당신의 역할입니다.

## 수정 규칙

1. **구조 유지**: 기존 마크다운 구조(## 섹션 번호, 표, 목록)를 그대로 유지하세요.
2. **삭제 금지**: 기존 내용을 삭제하지 마세요. 보완, 추가, 구체화만 하세요.
3. **변경 마커**: 변경한 부분 바로 위에 \`<!-- CHANGED: {이유 한줄} -->\` 주석을 달아주세요.
4. **Out-of-scope**: 범위 밖 요청은 Out-of-scope 섹션에 명시적으로 추가하세요.
5. **출력 형식**: 수정된 PRD 전문만 출력하세요. 앞뒤 설명이나 코드 펜스(\`\`\`) 없이 마크다운 원문만.
6. **과잉 수정 금지**: 지적된 항목만 수정하세요. 지적되지 않은 부분은 건드리지 마세요.
7. **버전 갱신**: 문서 상단 버전 번호가 있으면 +1 증가시키세요.`;
}

function buildApplyUserPrompt(prdContent, actionableData, feedbackSummaries) {
  const parts = [];

  parts.push("## 현재 PRD\n");
  parts.push(prdContent);
  parts.push("\n---\n");

  parts.push("## 검토 의견 — 반영 대상\n");

  // Flaws (수정 필수)
  const flaws = actionableData.items.filter((i) => i.type === "flaw");
  if (flaws.length > 0) {
    parts.push("### 결함 (Flaws) — 수정 필수\n");
    for (const f of flaws) {
      parts.push(`- **[${f.source}]** ${f.text}`);
    }
    parts.push("");
  }

  // Gaps (보완 필요)
  const gaps = actionableData.items.filter((i) => i.type === "gap");
  if (gaps.length > 0) {
    parts.push("### 누락 (Gaps) — 섹션 추가 또는 보완\n");
    for (const g of gaps) {
      parts.push(`- **[${g.source}]** ${g.text}`);
    }
    parts.push("");
  }

  // Risks (리스크 명시)
  const risks = actionableData.items.filter((i) => i.type === "risk");
  if (risks.length > 0) {
    parts.push("### 리스크 (Risks) — 리스크 섹션에 명시\n");
    for (const r of risks) {
      parts.push(`- **[${r.source}]** ${r.text}`);
    }
    parts.push("");
  }

  // AI 판정 요약
  const verdicts = actionableData.items.filter((i) => i.type === "verdict");
  if (verdicts.length > 0) {
    parts.push("### AI별 착수 판단\n");
    for (const v of verdicts) {
      parts.push(`- **${v.source}**: ${v.text}`);
    }
    parts.push("");
  }

  // 주요 피드백 원문 발췌 (컨텍스트 보강)
  if (feedbackSummaries.length > 0) {
    parts.push("### 주요 피드백 원문 (참고)\n");
    for (const fb of feedbackSummaries) {
      parts.push(`#### ${fb.name} (${fb.role}) — ${fb.verdict}\n`);
      // 피드백에서 핵심 내용만 추출 (--- 이후 본문)
      const bodyMatch = fb.content.match(/---\n\n([\s\S]*?)(\n---|\n\*토큰:)/);
      if (bodyMatch) {
        const body = bodyMatch[1].trim();
        // 2000자 제한
        parts.push(body.length > 2000 ? body.slice(0, 2000) + "\n...(중략)" : body);
      }
      parts.push("");
    }
  }

  parts.push("---\n");
  parts.push("위 검토 의견을 반영하여 수정된 PRD 전문을 출력하세요.");
  parts.push("변경한 부분마다 `<!-- CHANGED: 이유 -->` 주석을 달아주세요.");

  return parts.join("\n");
}

function extractChangedMarkers(prdText) {
  const markers = [];
  const lines = prdText.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/<!--\s*CHANGED:\s*(.+?)\s*-->/);
    if (match) {
      markers.push({ line: i + 1, reason: match[1] });
    }
  }
  return markers;
}

function generateApplyDiff(oldPrd, newPrd, markers, roundNum) {
  const parts = [];
  parts.push(`# Apply Diff — Round ${roundNum}\n`);
  parts.push(`**생성 시각:** ${new Date().toISOString()}`);
  parts.push(`**변경 마커:** ${markers.length}건\n`);

  // 변경 마커 요약
  if (markers.length > 0) {
    parts.push("## 변경 내역\n");
    parts.push("| # | 위치(줄) | 변경 이유 |");
    parts.push("|---|---------|----------|");
    for (let i = 0; i < markers.length; i++) {
      parts.push(`| ${i + 1} | L${markers[i].line} | ${markers[i].reason} |`);
    }
    parts.push("");
  }

  // 기본 통계
  const oldLines = oldPrd.split("\n").length;
  const newLines = newPrd.split("\n").length;
  const oldLen = oldPrd.length;
  const newLen = newPrd.length;

  parts.push("## 문서 통계\n");
  parts.push("| 항목 | 수정 전 | 수정 후 | 변화 |");
  parts.push("|------|--------|--------|------|");
  parts.push(`| 줄 수 | ${oldLines} | ${newLines} | ${newLines - oldLines >= 0 ? "+" : ""}${newLines - oldLines} |`);
  parts.push(`| 글자 수 | ${oldLen.toLocaleString()} | ${newLen.toLocaleString()} | ${newLen - oldLen >= 0 ? "+" : ""}${(newLen - oldLen).toLocaleString()} |`);

  // 변경된 섹션 식별 (## 기준)
  const oldSections = new Set(oldPrd.match(/^## .+$/gm) || []);
  const newSections = new Set(newPrd.match(/^## .+$/gm) || []);
  const addedSections = [...newSections].filter((s) => !oldSections.has(s));
  if (addedSections.length > 0) {
    parts.push(`\n## 추가된 섹션\n`);
    for (const s of addedSections) parts.push(`- ${s}`);
  }

  return parts.join("\n");
}

function appendReviewHistory(projectDir, roundNum, markers, oldLen, newLen) {
  const historyPath = resolve(projectDir, "review-history.md");
  const timestamp = new Date().toISOString().split("T")[0];

  const entry = [
    "",
    `### Round ${roundNum} → v${roundNum + 1} (${timestamp})`,
    "",
    `**변경 ${markers.length}건** | ${oldLen.toLocaleString()}자 → ${newLen.toLocaleString()}자 (${newLen - oldLen >= 0 ? "+" : ""}${(newLen - oldLen).toLocaleString()}자)`,
    "",
  ];

  if (markers.length > 0) {
    for (const m of markers) {
      entry.push(`- L${m.line}: ${m.reason}`);
    }
  }

  if (existsSync(historyPath)) {
    const existing = readFileSync(historyPath, "utf-8");
    writeFileSync(historyPath, existing + "\n" + entry.join("\n"));
  } else {
    const header = `# Review History\n\n> PRD 검토 → 반영 누적 이력\n`;
    writeFileSync(historyPath, header + entry.join("\n"));
  }

  return historyPath;
}

function stripCodeFence(text) {
  // LLM이 코드 펜스로 감싸서 응답할 경우 제거
  let result = text.trim();
  if (result.startsWith("```markdown")) {
    result = result.slice("```markdown".length);
  } else if (result.startsWith("```md")) {
    result = result.slice("```md".length);
  } else if (result.startsWith("```")) {
    result = result.slice(3);
  }
  if (result.endsWith("```")) {
    result = result.slice(0, -3);
  }
  return result.trim();
}

async function runApplyFeedback(prdContent, opts, registry) {
  const applyStart = Date.now();
  const allModels = registry.models;

  // 1. Actionable items 로드
  const actionableData = loadActionableItems(opts.outputDir);
  if (!actionableData || actionableData.totalItems === 0) {
    log("⚠️", "반영할 검토 의견이 없어요. Phase 2(--mode review)를 먼저 실행하세요.");
    process.exit(1);
  }

  // 2. 피드백 요약 로드
  const feedbackSummaries = loadFeedbackSummaries(opts.outputDir);
  log("📄", `피드백 파일 ${feedbackSummaries.length}개 로드: ${feedbackSummaries.map((f) => `${f.name}(${f.verdict})`).join(", ")}`);

  // 3. 모델 선택
  const modelKey = opts.debateModel || "chatgpt";
  const modelCfg = allModels[modelKey];
  if (!modelCfg) {
    console.error(`❌ 모델 '${modelKey}'가 레지스트리에 없어요. 사용 가능: ${Object.keys(allModels).join(", ")}`);
    process.exit(1);
  }

  const fileEnv = loadEnvFile(opts.envFile);
  const apiKey = getApiKey(modelCfg.envKey, fileEnv);
  const openrouterKey = getApiKey(OPENROUTER_ENV_KEY, fileEnv);
  if (!apiKey && !openrouterKey) {
    console.error(`❌ ${modelCfg.name}: API 키 없음 (${modelCfg.envKey} 또는 ${OPENROUTER_ENV_KEY})`);
    process.exit(1);
  }

  // 4. 프롬프트 구성
  const systemPrompt = buildApplySystemPrompt();
  const userPrompt = buildApplyUserPrompt(prdContent, actionableData, feedbackSummaries);
  log("🔧", `프롬프트 구성 완료 (system: ${systemPrompt.length}자, user: ${userPrompt.length}자)`);
  log("🚀", `${modelCfg.name} (${modelCfg.models[0]})에 PRD 수정 요청 중...`);

  // 5. LLM 호출
  const callStart = Date.now();
  const callCfg = { ...modelCfg, systemPrompt };
  const result = await callWithRetry(apiKey, callCfg, userPrompt, { openrouterKey });
  const callElapsed = ((Date.now() - callStart) / 1000).toFixed(1);

  log("✅", `LLM 응답 완료 (${callElapsed}초, ${result.content.length}자, 모델: ${result.model}${result.truncated ? ", ⚠️잘림" : ""})`);

  if (result.truncated) {
    log("⚠️", "응답이 잘렸어요. PRD가 불완전할 수 있어요. maxOutputTokens 확대를 고려하세요.");
  }

  // 6. PRD 추출 + 후처리
  const newPrd = stripCodeFence(result.content);
  const markers = extractChangedMarkers(newPrd);
  log("📝", `변경 마커 ${markers.length}개 감지`);

  // 7. 버전 번호 추출 + 새 PRD 저장
  const roundNum = parseInt(opts.roundNum) || 1;
  const prdDir = dirname(opts.prdFile);
  const versionMatch = opts.prdFile.match(/prd-v(\d+)/);
  const currentVersion = versionMatch ? parseInt(versionMatch[1]) : roundNum;
  const nextVersion = currentVersion + 1;
  const newPrdPath = resolve(prdDir, `prd-v${nextVersion}.md`);

  writeFileSync(newPrdPath, newPrd);
  log("💾", `수정된 PRD 저장: ${newPrdPath}`);

  // 8. Diff 저장
  const diffMd = generateApplyDiff(prdContent, newPrd, markers, roundNum);
  const diffPath = resolve(opts.outputDir, "apply-diff.md");
  writeFileSync(diffPath, diffMd);
  log("💾", `변경 diff 저장: ${diffPath}`);

  // 9. Review history 갱신
  const historyPath = appendReviewHistory(prdDir, roundNum, markers, prdContent.length, newPrd.length);
  log("💾", `리뷰 이력 갱신: ${historyPath}`);

  // 10. 결과 요약 출력
  const totalElapsed = ((Date.now() - applyStart) / 1000).toFixed(1);

  console.log("\n" + [
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    `📝 Phase 3 Apply — Round ${roundNum}`,
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    `모델: ${modelCfg.name} (${result.model})`,
    `소요: ${totalElapsed}초 (LLM ${callElapsed}초)`,
    `변경: ${markers.length}건`,
    `문서: ${prdContent.length.toLocaleString()}자 → ${newPrd.length.toLocaleString()}자`,
    `출력: ${newPrdPath}`,
    "",
    ...markers.map((m, i) => `  ${i + 1}. L${m.line}: ${m.reason}`),
    "",
    `다음 단계: --mode review로 Round ${roundNum + 1} 검토 실행`,
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  ].join("\n") + "\n");

  log("🎉", `Phase 3 완료! prd-v${currentVersion}.md → prd-v${nextVersion}.md (${markers.length}건 변경, ${totalElapsed}초)`);
}

// ─── Six Hats 토론 ──────────────────────────────

function buildDebatePrompt(prdContent, history, hat, isFirst, isLast) {
  const parts = [];

  if (isFirst) {
    parts.push(`아래 PRD에 대해 Six Thinking Hats 토론을 시작해요.`);
    parts.push(`당신은 첫 번째 발언자(${hat.name})예요.\n`);
    parts.push(`---\n${prdContent}\n---\n`);
  } else {
    parts.push(`PRD에 대한 Six Thinking Hats 토론이 진행 중이에요.\n`);
    parts.push(`--- PRD (요약) ---`);
    // 컨텍스트가 너무 길어지면 PRD 요약 사용, 아니면 전문
    if (prdContent.length > 6000 && history.length > 6) {
      parts.push(prdContent.slice(0, 3000) + "\n...(중략)...\n" + prdContent.slice(-1500));
    } else {
      parts.push(prdContent);
    }
    parts.push(`---\n`);

    parts.push(`\n### 이전 토론\n`);
    for (const turn of history) {
      parts.push(`**Turn ${turn.turn} — ${turn.emoji} ${turn.name} (${turn.role}):**`);
      parts.push(turn.content);
      parts.push("");
    }
  }

  parts.push(`\n---\n`);

  if (isLast) {
    parts.push(hat.synthesisPrompt || hat.turnPrompt);
  } else {
    parts.push(hat.turnPrompt);
    if (!isFirst) {
      parts.push(`\n이전 발언자들의 주장에 동의하거나 반박할 수 있어요.`);
    }
  }
  parts.push(`\n200-400자 내외로 핵심만 말해주세요.`);

  return parts.join("\n");
}

async function runSixHatsDebate(prdContent, apiKey, modelCfg, sixhatsCfg, totalRounds, outputDir) {
  const debateStart = Date.now();
  const hatOrder = sixhatsCfg.hatOrder || ["white", "red", "black", "yellow", "green", "blue"];
  const hats = sixhatsCfg.hats;
  const maxTokens = sixhatsCfg.maxTokensPerTurn || DEBATE_MAX_TOKENS;
  const history = [];

  log("🎩", `Six Hats 토론 시작: ${totalRounds}턴, 모델: ${modelCfg.name} (${modelCfg.models[0]})`);

  for (let i = 0; i < totalRounds; i++) {
    const isLast = i === totalRounds - 1;
    const hatKey = isLast ? "blue" : hatOrder[i % hatOrder.length];
    const hat = hats[hatKey];
    const isFirst = i === 0;

    const userPrompt = buildDebatePrompt(prdContent, history, hat, isFirst, isLast);
    const turnStart = Date.now();

    try {
      const turnCfg = {
        ...modelCfg,
        systemPrompt: hat.systemPrompt,
      };
      const result = await callWithRetryDebate(apiKey, turnCfg, userPrompt, maxTokens);
      const elapsed = ((Date.now() - turnStart) / 1000).toFixed(1);

      history.push({
        turn: i + 1,
        hatKey,
        name: hat.name,
        emoji: hat.emoji,
        role: hat.role,
        content: result.content,
        model: result.model,
        elapsed,
        tokens: result.usage?.total_tokens || result.usage?.totalTokenCount || 0,
      });

      log(hat.emoji, `Turn ${i + 1}/${totalRounds}: ${hat.name} (${hat.role}) — ${elapsed}초, ${result.content.length}자`);
    } catch (err) {
      log("❌", `Turn ${i + 1} (${hat.name}) 실패: ${err.message}`);
      history.push({
        turn: i + 1,
        hatKey,
        name: hat.name,
        emoji: hat.emoji,
        role: hat.role,
        content: `[오류: ${err.message}]`,
        error: true,
      });
    }
  }

  const totalElapsed = ((Date.now() - debateStart) / 1000).toFixed(1);
  const totalTokens = history.reduce((s, t) => s + (t.tokens || 0), 0);

  // 토론 로그 생성
  const logParts = [
    `# Six Hats 토론 — ${totalRounds}턴`,
    "",
    `**날짜:** ${new Date().toISOString().split("T")[0]}`,
    `**PRD:** ${resolve(outputDir, "..")}`,
    `**모델:** ${modelCfg.name} (${modelCfg.models[0]})`,
    `**총 소요:** ${totalElapsed}초`,
    `**총 토큰:** ${totalTokens.toLocaleString()}`,
    "",
    "---",
    "",
  ];

  for (const turn of history) {
    logParts.push(`### Turn ${turn.turn} — ${turn.emoji} ${turn.name} (${turn.role})`);
    if (turn.elapsed) logParts.push(`*${turn.elapsed}초*`);
    logParts.push("");
    logParts.push(turn.content);
    logParts.push("");
    logParts.push("---");
    logParts.push("");
  }

  // 최종 판단 (마지막 Blue Hat에서 verdict만 추출)
  const lastBlue = history[history.length - 1];
  if (lastBlue && lastBlue.hatKey === "blue" && !lastBlue.error) {
    const parsed = parseReviewResponse(lastBlue.content);
    if (parsed.verdict !== "Unknown") {
      logParts.push(`## 최종 판단`);
      logParts.push("");
      logParts.push(`**착수 판단: ${parsed.verdict}**`);
      logParts.push("");
    }
  }

  // 통계 테이블
  logParts.push("");
  logParts.push("## 토론 통계");
  logParts.push("");
  logParts.push("| 모자 | 발언 수 | 총 토큰 |");
  logParts.push("|------|---------|---------|");
  const hatStats = {};
  for (const turn of history) {
    if (!hatStats[turn.hatKey]) hatStats[turn.hatKey] = { count: 0, tokens: 0 };
    hatStats[turn.hatKey].count++;
    hatStats[turn.hatKey].tokens += turn.tokens || 0;
  }
  for (const [key, stats] of Object.entries(hatStats)) {
    const hat = hats[key];
    logParts.push(`| ${hat.emoji} ${hat.name} | ${stats.count} | ${stats.tokens.toLocaleString()} |`);
  }

  // 파일 저장
  const logPath = resolve(outputDir, "sixhats-discussion.md");
  writeFileSync(logPath, logParts.join("\n"));
  log("💾", `토론 로그 저장: ${logPath}`);

  // JSON 데이터 저장
  const jsonData = {
    timestamp: new Date().toISOString(),
    totalRounds,
    model: modelCfg.name,
    modelId: modelCfg.models[0],
    totalElapsed,
    totalTokens,
    hatStats,
    turns: history.map((t) => ({ turn: t.turn, hat: t.hatKey, role: t.role, contentLength: t.content.length, tokens: t.tokens, elapsed: t.elapsed })),
    verdict: lastBlue ? parseReviewResponse(lastBlue.content).verdict : "Unknown",
  };
  const jsonPath = resolve(outputDir, "sixhats-data.json");
  writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));

  log("🎉", `Six Hats 토론 완료! ${totalRounds}턴, ${totalElapsed}초, ${totalTokens.toLocaleString()} 토큰`);

  return { history, jsonData };
}

// callWithRetry 변형 — 토론용 짧은 maxTokens
async function callWithRetryDebate(apiKey, cfg, userPrompt, maxTokens) {
  const models = cfg.models;
  let lastError = null;

  for (const model of models) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
          await sleep(delay);
        }

        let result;
        if (cfg.provider === "openai") {
          const url = cfg.endpoint || DEFAULT_OPENAI_ENDPOINT;
          const resp = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model,
              messages: [
                { role: "system", content: cfg.systemPrompt },
                { role: "user", content: userPrompt },
              ],
              temperature: 0.8,
              max_tokens: maxTokens,
            }),
          });
          if (!resp.ok) throw new Error(`API ${resp.status}: ${await resp.text()}`);
          const data = await resp.json();
          result = { content: data.choices[0].message.content, usage: data.usage, model: data.model };
        } else if (cfg.provider === "google") {
          result = await callGemini(apiKey, model, cfg.systemPrompt, userPrompt, { maxTokens, temperature: 0.8 });
        } else {
          throw new Error(`지원하지 않는 provider: ${cfg.provider}`);
        }
        result.attempts = attempt + 1;
        return result;
      } catch (err) {
        lastError = err;
        const isModelError = err.message.includes("404") || err.message.includes("does not exist");
        if (isModelError) break;
      }
    }
  }
  throw lastError || new Error("모든 모델/재시도 실패");
}

// ─── CLI 인자 파싱 ──────────────────────────────

function parseArgs(args) {
  if (args.length < 2) {
    console.log(`사용법: node review-api.mjs <prd-file> <output-dir> [options]

모드:
  --mode review         병렬 AI 검토 (기본)
  --mode sixhats        Six Thinking Hats 토론
  --mode apply          검토의견 PRD 자동 반영 (Phase 3)

공통 옵션:
  --env <file>         환경변수 파일 (기본: .dev.vars)
  --config <file>      모델 레지스트리 JSON 경로

review 모드 옵션:
  --prompt-dir <dir>   커스텀 프롬프트 디렉토리
  --round <N>          라운드 번호 (기본: 1)
  --models <a,b,c>     사용할 모델 키 (쉼표 구분)

sixhats 모드 옵션:
  --rounds <N>         토론 턴 수 (기본: 20)
  --model <key>        사용할 모델 키

apply 모드 옵션:
  --round <N>          반영 대상 라운드 번호 (기본: 1)
  --model <key>        수정에 사용할 모델 키 (기본: chatgpt)

프록시 옵션:
  --proxy openrouter   모든 모델을 OpenRouter 경유 (개별 API 키 무시)

예시:
  node review-api.mjs prd-v1.md review/round-1 --env .dev.vars
  node review-api.mjs prd-v2.md review/round-2 --models chatgpt,deepseek --round 2
  node review-api.mjs prd-v1.md review/round-1 --mode apply --model chatgpt`);
    process.exit(1);
  }

  const parsed = {
    prdFile: resolve(args[0]),
    outputDir: resolve(args[1]),
    envFile: ".dev.vars",
    promptDir: null,
    roundNum: "1",
    modelKeys: null,
    configPath: resolve(__dirname, "../config/models.json"),
    mode: "review",
    debateRounds: null,
    debateModel: null,
    applyModel: null,
    proxy: null,
  };

  for (let i = 2; i < args.length; i++) {
    switch (args[i]) {
      case "--env": parsed.envFile = args[++i]; break;
      case "--prompt-dir": parsed.promptDir = resolve(args[++i]); break;
      case "--round": parsed.roundNum = args[++i]; break;
      case "--models": parsed.modelKeys = args[++i].split(",").map(s => s.trim()); break;
      case "--config": parsed.configPath = resolve(args[++i]); break;
      case "--mode": parsed.mode = args[++i]; break;
      case "--rounds": parsed.debateRounds = parseInt(args[++i]); break;
      case "--model": parsed.debateModel = args[++i]; break;
      case "--proxy": parsed.proxy = args[++i]; break;
    }
  }

  return parsed;
}

// ─── 메인 ───────────────────────────────────────

async function main() {
  const processStart = Date.now();
  const opts = parseArgs(process.argv.slice(2));

  // 모델 레지스트리 로드
  const registry = loadModelRegistry(opts.configPath);
  const allModels = registry.models;
  const sixhatsCfg = registry.sixhats;
  log("📋", `모델 레지스트리 로드: ${opts.configPath} (${Object.keys(allModels).length}개 모델${sixhatsCfg ? ", Six Hats 설정 포함" : ""})`);

  // PRD 로드 (공통)
  if (!existsSync(opts.prdFile)) {
    console.error(`❌ PRD 파일을 찾을 수 없어요: ${opts.prdFile}`);
    process.exit(1);
  }
  const prdContent = readFileSync(opts.prdFile, "utf-8");
  log("📄", `PRD 로드 완료: ${opts.prdFile} (${prdContent.length}자)`);

  // 환경변수 로드 (공통)
  const fileEnv = loadEnvFile(opts.envFile);
  const envSource = existsSync(resolve(opts.envFile)) ? opts.envFile : "(파일 없음, process.env만 사용)";
  log("🔑", `환경변수: process.env 우선 + ${envSource} 폴백`);
  if (opts.proxy === "openrouter") {
    log("🔀", `프록시 모드: OpenRouter 강제 — 모든 모델이 OpenRouter 경유`);
  }

  // ─── Apply 모드 분기 ─────────────────────────
  if (opts.mode === "apply") {
    mkdirSync(opts.outputDir, { recursive: true });
    await runApplyFeedback(prdContent, opts, registry);
    return;
  }

  // ─── Six Hats 모드 분기 ───────────────────────
  if (opts.mode === "sixhats") {
    if (!sixhatsCfg) {
      console.error("❌ models.json에 $sixhats 설정이 없어요.");
      process.exit(1);
    }

    const modelKey = opts.debateModel || sixhatsCfg.defaultModel || Object.keys(allModels)[0];
    const modelCfg = allModels[modelKey];
    if (!modelCfg) {
      console.error(`❌ 모델 '${modelKey}'가 레지스트리에 없어요. 사용 가능: ${Object.keys(allModels).join(", ")}`);
      process.exit(1);
    }

    const apiKey = getApiKey(modelCfg.envKey, fileEnv);
    if (!apiKey) {
      console.error(`❌ ${modelCfg.name}: API 키 없음 (${modelCfg.envKey})`);
      process.exit(1);
    }

    mkdirSync(opts.outputDir, { recursive: true });

    const totalRounds = opts.debateRounds || sixhatsCfg.defaultRounds || 20;
    await runSixHatsDebate(prdContent, apiKey, modelCfg, sixhatsCfg, totalRounds, opts.outputDir);
    return;
  }

  // ─── Review 모드 (기본) ───────────────────────

  // 활성 모델 필터링
  let activeModels;
  if (opts.modelKeys) {
    activeModels = {};
    for (const key of opts.modelKeys) {
      if (!allModels[key]) {
        log("⚠️", `모델 '${key}'가 레지스트리에 없어요. 사용 가능: ${Object.keys(allModels).join(", ")}`);
        continue;
      }
      activeModels[key] = allModels[key];
    }
  } else {
    activeModels = Object.fromEntries(
      Object.entries(allModels).filter(([, cfg]) => cfg.enabled !== false)
    );
  }

  if (Object.keys(activeModels).length === 0) {
    console.error("❌ 사용 가능한 모델이 없어요.");
    process.exit(1);
  }

  log("🎯", `활성 모델: ${Object.entries(activeModels).map(([k, v]) => `${v.name} (${v.models[0]})`).join(", ")}`);

  // 커스텀 프롬프트 로드
  const customPrompts = {};
  if (opts.promptDir) {
    for (const key of Object.keys(activeModels)) {
      const promptPath = resolve(opts.promptDir, `${key}-user-prompt.md`);
      if (existsSync(promptPath)) {
        customPrompts[key] = readFileSync(promptPath, "utf-8");
        log("📋", `${key} 커스텀 프롬프트 로드: ${promptPath}`);
      }
    }
  }

  // 모델별 API 호출 (병렬)
  const openrouterKey = getApiKey(OPENROUTER_ENV_KEY, fileEnv);
  const tasks = Object.entries(activeModels).map(async ([key, cfg]) => {
    const apiKey = getApiKey(cfg.envKey, fileEnv);
    if (!apiKey && !openrouterKey) {
      log("⚠️", `${cfg.name}: API 키 없음 (${cfg.envKey} 또는 ${OPENROUTER_ENV_KEY}) — 스킵`);
      return { key, name: cfg.name, error: `API 키 없음: ${cfg.envKey}` };
    }

    log("🚀", `${cfg.name} (${cfg.models[0]}) 검토 요청 중...${customPrompts[key] ? " (커스텀 프롬프트)" : ""}`);
    const startTime = Date.now();

    try {
      let userPrompt;
      if (customPrompts[key]) {
        userPrompt = customPrompts[key].replace("{{PRD_CONTENT}}", prdContent);
      } else {
        userPrompt = `아래 PRD를 검토해주세요.\n\n---\n${prdContent}\n---\n\n${cfg.reviewPrompt}`;
      }
      const result = await callWithRetry(apiKey, cfg, userPrompt, { openrouterKey, forceOpenRouter: opts.proxy === "openrouter" });
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      log("✅", `${cfg.name} 완료 (${elapsed}초, ${result.content.length}자, 모델: ${result.model}${result.fallbackTo ? `, fallback: ${result.fallbackFrom}→${result.fallbackTo}` : ""}${result.truncated ? ", ⚠️잘림" : ""})`);

      // 개별 피드백 파일 저장
      const parsed = parseReviewResponse(result.content);
      const feedbackMd = [
        `## ${cfg.name} 검토의견`,
        "",
        `**모델:** ${result.model}`,
        `**역할:** ${cfg.role}`,
        `**소요:** ${elapsed}초`,
        `**시도:** ${result.attempts}회`,
        result.fallbackTo ? `**Fallback:** ${result.fallbackFrom} → ${result.fallbackTo}` : null,
        `**착수 판단:** ${parsed.verdict}`,
        result.truncated ? `**⚠️ 응답 잘림:** maxOutputTokens(${MAX_OUTPUT_TOKENS}) 도달` : null,
        "",
        "---",
        "",
        result.content,
        "",
        "---",
        "",
        `*토큰: ${JSON.stringify(result.usage)}*`,
        `*파싱 품질: verdict=${parsed.parseQuality.verdictParsed}, truncated=${result.truncated || parsed.parseQuality.possiblyTruncated}*`,
      ]
        .filter(Boolean)
        .join("\n");

      const outPath = resolve(opts.outputDir, `${key}-feedback.md`);
      writeFileSync(outPath, feedbackMd);
      log("💾", `${cfg.name} 피드백 저장: ${outPath}`);

      return { key, name: cfg.name, content: result.content, parsed, usage: result.usage, elapsed, model: result.model, attempts: result.attempts, fallback: result.fallbackTo || null, truncated: result.truncated || false };
    } catch (err) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      log("❌", `${cfg.name} 최종 실패 (${elapsed}초): ${err.message}`);
      return { key, name: cfg.name, error: err.message, elapsed };
    }
  });

  log("⏳", `${Object.keys(activeModels).length}개 AI 병렬 검토 시작...`);
  const results = await Promise.allSettled(tasks);
  const processElapsed = ((Date.now() - processStart) / 1000).toFixed(1);

  // 통합 피드백 생성
  log("📝", "통합 피드백 생성 중...");

  const successResults = [];
  const failResults = [];

  for (const r of results) {
    const val = r.status === "fulfilled" ? r.value : { name: "Unknown", error: r.reason?.message };
    if (val.error) {
      failResults.push(val);
    } else {
      successResults.push(val);
    }
  }

  const feedbackParts = [
    `# 검토 피드백 — Round ${opts.roundNum}`,
    "",
    `**날짜:** ${new Date().toISOString().split("T")[0]}`,
    `**PRD:** ${opts.prdFile}`,
    `**전체 소요:** ${processElapsed}초`,
    `**모델 레지스트리:** ${opts.configPath}`,
    "",
    "---",
    "",
    "## 프로세스 타이밍",
    "",
    "| AI | 모델 | 역할 | 소요(초) | 시도 | Fallback | 잘림 | 착수 판단 |",
    "|----|------|------|---------|------|----------|------|----------|",
  ];

  for (const val of successResults) {
    const role = activeModels[val.key]?.role || "-";
    feedbackParts.push(
      `| ${val.name} | ${val.model} | ${role} | ${val.elapsed} | ${val.attempts} | ${val.fallback || "-"} | ${val.truncated ? "⚠️" : "-"} | ${val.parsed.verdict} |`
    );
  }
  for (const val of failResults) {
    feedbackParts.push(`| ${val.name} | - | - | ${val.elapsed || "-"} | - | - | - | ❌ 실패 |`);
  }

  feedbackParts.push("", "---", "");

  for (const val of successResults) {
    feedbackParts.push(`## ${val.name} 검토의견`, "", `**착수 판단:** ${val.parsed.verdict}`, `**역할:** ${activeModels[val.key]?.role || "-"}`, `**소요:** ${val.elapsed}초`, "", val.content, "", "---", "");
  }
  for (const val of failResults) {
    feedbackParts.push(`## ${val.name} — ❌ 실패`, "", `오류: ${val.error}`, "", "---", "");
  }

  // 품질 메트릭
  const totalModels = Object.keys(activeModels).length;
  const metrics = {
    totalAI: totalModels,
    success: successResults.length,
    fail: failResults.length,
    totalTokens: 0,
    verdictParsed: 0,
    truncated: 0,
    fallbacks: 0,
    totalRetries: 0,
  };

  for (const val of successResults) {
    const tokens = val.usage?.total_tokens || val.usage?.totalTokenCount || 0;
    metrics.totalTokens += tokens;
    if (val.parsed.verdict !== "Unknown") metrics.verdictParsed++;
    if (val.truncated) metrics.truncated++;
    if (val.fallback) metrics.fallbacks++;
    metrics.totalRetries += (val.attempts || 1) - 1;
  }

  feedbackParts.push(
    "## 품질 메트릭",
    "",
    "| 메트릭 | 값 |",
    "|--------|-----|",
    `| 검토 AI | ${metrics.success}/${metrics.totalAI} 성공 |`,
    `| 총 토큰 | ${metrics.totalTokens.toLocaleString()} |`,
    `| 착수 판단 파싱 | ${metrics.verdictParsed}/${metrics.success} 성공 (${metrics.success ? Math.round((metrics.verdictParsed / metrics.success) * 100) : 0}%) |`,
    `| 응답 잘림 | ${metrics.truncated}건 |`,
    `| 모델 Fallback | ${metrics.fallbacks}건 |`,
    `| 재시도 | ${metrics.totalRetries}건 |`,
    `| 전체 소요 | ${processElapsed}초 |`,
    `| 완료 시각 | ${new Date().toLocaleTimeString("ko-KR", { hour12: false })} |`
  );

  const feedbackPath = resolve(opts.outputDir, "feedback.md");
  writeFileSync(feedbackPath, feedbackParts.join("\n"));
  log("✅", `통합 피드백 저장: ${feedbackPath}`);

  // Actionable items JSON 생성 (Phase 3 자동화 준비)
  if (successResults.length > 0) {
    generateActionableItems(successResults, opts.outputDir);
  }

  log("🎉", `검토 완료! ${metrics.success}/${metrics.totalAI} AI 성공, 전체 ${processElapsed}초`);

  // 품질 경고
  if (metrics.verdictParsed < metrics.success) {
    log("⚠️", `착수 판단 파싱 실패: ${metrics.success - metrics.verdictParsed}건 — 프롬프트 개선 필요`);
  }
  if (metrics.truncated > 0) {
    log("⚠️", `응답 잘림: ${metrics.truncated}건 — maxOutputTokens 확대 고려`);
  }
  if (metrics.fallbacks > 0) {
    log("ℹ️", `모델 Fallback 발생: ${metrics.fallbacks}건 — 기본 모델 업데이트 고려`);
  }

  // ─── 스코어카드 자동 채점 ───────────────────
  if (successResults.length > 0) {
    log("📊", "스코어카드 계산 중...");
    const scorecard = calculateScorecard(prdContent, successResults, parseInt(opts.roundNum), opts.outputDir);

    const scorecardMdPath = resolve(opts.outputDir, "scorecard.md");
    writeFileSync(scorecardMdPath, scorecard.md);

    const scorecardJsonPath = resolve(opts.outputDir, "scorecard.json");
    writeFileSync(scorecardJsonPath, JSON.stringify(scorecard.json, null, 2));

    log("📊", `스코어카드 저장: scorecard.md + scorecard.json`);
    console.log("\n" + scorecard.md + "\n");

    if (scorecard.json.total >= 80) {
      log("✅", `착수 준비 완료 (${scorecard.json.total}점)`);
    } else {
      log("🔄", `추가 검토 필요 (${scorecard.json.total}점) — 미달 항목 확인 후 다음 라운드 진행`);
    }
  }
}

main().catch((err) => {
  log("💥", `치명적 오류: ${err.message}`);
  process.exit(1);
});
