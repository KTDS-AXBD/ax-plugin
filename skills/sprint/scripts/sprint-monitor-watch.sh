#!/bin/bash
# sprint-monitor-watch.sh - Sprint signal/pane 감시 루프 (Monitor 도구용)
#
# 사용: bash sprint-monitor-watch.sh <PROJECT> <SPRINT_NUM> [IDLE_MIN]
#   Monitor(persistent: true, command: "bash .../sprint-monitor-watch.sh RFP-X 132")
#
# 이벤트 (stdout 1줄 = Monitor 알림 1건 - 출력은 행동 가능한 것만):
#   - signal STATUS/CHECKPOINT/PR_NUM/MATCH_RATE 변화 diff
#   - 종결(DONE/MERGED/FAILED) 시 보고 후 exit
#   - tmux 세션 소멸 / pane이 claude가 아님 WARN
#   - ⭐ idle stall WARN (v0.9.0 회고 Try 3): pane이 작업 표시 없이 idle인데
#     signal도 IDLE_MIN(기본 15)분째 미진행 → rate limit 소진(5h:0%) 등
#     "침묵=진행중" 오인 사각을 자동 검출. statusline의 5h:N%를 메시지에 동봉.
#     쿨다운 20분(이벤트 폭주 방지), 진행 재개 시 카운터 리셋.
#   - 오탐 보정(2026-06-12, RFP-X Sprint 132~134 WARN 3회 전부 오탐):
#     원인 = tail -6 캡처 창이 TUI 입력 박스+statusline만 포함, 그 위의 라이브
#     스피너 줄("· Incubating… (18s · ↓ 730 tokens)")을 놓침 → busy를 idle로 오인.
#     fix = 캡처 창 15줄 + 라이브 마커 보강 + WARN 전 30초 재확인(2-strike) + IDLE_MIN 기본 15분.
#
# 선례: RFP-X Sprint 131(2026-06-11)에서 5h 윈도 소진으로 autopilot idle 정지를
#       signal 기반 Monitor가 미감지 - 수동 점검에서야 발견된 사각의 기계화.

set -u
PROJECT="${1:?사용법: $0 <PROJECT> <SPRINT_NUM> [IDLE_MIN]}"
N="${2:?SPRINT_NUM 필요}"
IDLE_MIN="${3:-15}"

SIGNAL="/tmp/sprint-signals/${PROJECT}-${N}.signal"
SESSION="sprint-${PROJECT}-${N}"
IDLE_SEC=$((IDLE_MIN * 60))
COOLDOWN_SEC=1200

prev=""
last_change_ts=$(date +%s)
last_warn_ts=0

while true; do
  if [ ! -f "$SIGNAL" ]; then
    echo "SIGNAL FILE REMOVED (정리됨 또는 비정상) - watch 종료"
    exit 0
  fi

  cur=$(grep -E '^(STATUS|CHECKPOINT|PR_NUM|MATCH_RATE)=' "$SIGNAL" 2>/dev/null | sort)
  if [ "$cur" != "$prev" ]; then
    if [ -n "$prev" ]; then
      echo "--- signal 변화 ---"
      comm -13 <(echo "$prev") <(echo "$cur")
    fi
    last_change_ts=$(date +%s)
  fi
  prev="$cur"

  STATUS=$(grep '^STATUS=' "$SIGNAL" | cut -d= -f2)
  case "$STATUS" in
    DONE|MERGED|FAILED)
      echo "TERMINAL STATUS=${STATUS} - sprint ${N} 종료"
      exit 0
      ;;
  esac

  if ! tmux has-session -t "$SESSION" 2>/dev/null; then
    echo "tmux 세션 ${SESSION} 종료됨 (STATUS=${STATUS})"
    exit 0
  fi

  PANE_CMD=$(tmux display-message -t "$SESSION" -p '#{pane_current_command}' 2>/dev/null || echo "")
  if [ "$PANE_CMD" != "claude" ] && [ -n "$PANE_CMD" ]; then
    echo "WARN: pane이 claude가 아님 (cmd=${PANE_CMD}, STATUS=${STATUS}) - autopilot 죽었을 수 있음"
    sleep 60
    continue
  fi

  # ⭐ idle stall 감지: pane 작업 표시 없음 + signal 미진행 IDLE_MIN분+
  # 라이브 마커: 스피너 글리프 + 토큰 카운터((Ns · / ↓N) + esc to interrupt - 턴 종료 시 사라지는 표시만
  now=$(date +%s)
  stalled=$((now - last_change_ts))
  if [ "$stalled" -ge "$IDLE_SEC" ] && [ $((now - last_warn_ts)) -ge "$COOLDOWN_SEC" ]; then
    BUSY_RE='✻|✢|✽|∗|✶|✳|·.*tokens|[↓↑] [0-9]|\([0-9]+m?s ·|esc to interrupt|Running|interrupt|thinking'
    TAIL=$(tmux capture-pane -t "$SESSION" -p 2>/dev/null | tail -15)
    if ! echo "$TAIL" | grep -qE "$BUSY_RE"; then
      # 2-strike: 30초 후 재확인 - 턴 경계/렌더 순간 오탐 차단
      sleep 30
      TAIL=$(tmux capture-pane -t "$SESSION" -p 2>/dev/null | tail -15)
      if ! echo "$TAIL" | grep -qE "$BUSY_RE"; then
        USAGE=$(echo "$TAIL" | grep -oE '5h:[0-9]+%' | tail -1)
        echo "⚠️ IDLE STALL: pane idle(2회 확인) + signal ${IDLE_MIN}분+ 미진행 (STATUS=${STATUS}, CHECKPOINT=$(grep '^CHECKPOINT=' "$SIGNAL" | cut -d= -f2)${USAGE:+, usage ${USAGE}}) - rate limit 소진/턴 중단 의심. '작업 재개' nudge 검토"
        last_warn_ts=$now
      fi
    fi
  fi

  sleep 20
done
