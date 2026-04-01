#!/bin/bash
# requirements-interview 스킬: 프로젝트 초기화 스크립트
# 사용법: ./init-project.sh {project-name}

if [ -z "$1" ]; then
  echo "사용법: ./init-project.sh {project-name}"
  echo "예시: ./init-project.sh my-project-2026"
  exit 1
fi

PROJECT_NAME="$1"
BASE_DIR="${2:-.}"  # 두 번째 인자가 없으면 현재 디렉토리
PROJECT_DIR="$BASE_DIR/$PROJECT_NAME"

if [ -d "$PROJECT_DIR" ]; then
  echo "❌ 이미 존재하는 프로젝트입니다: $PROJECT_DIR"
  exit 1
fi

# 폴더 구조 생성
mkdir -p "$PROJECT_DIR/review/round-1"

# 초기 파일 생성
TODAY=$(date +%Y-%m-%d)

cat > "$PROJECT_DIR/interview-log.md" << EOF
# 인터뷰 로그: $PROJECT_NAME

**날짜:** $TODAY
**진행:** AX BD팀

---

## 인터뷰 원문

_인터뷰 완료 후 자동 기록됩니다._
EOF

cat > "$PROJECT_DIR/review-history.md" << EOF
# 검토 이력: $PROJECT_NAME

| 라운드 | 날짜 | 주요 변경사항 | 스코어 |
|--------|------|--------------|--------|
| 초안 | $TODAY | 최초 작성 | - |
EOF

cat > "$PROJECT_DIR/review/round-1/.gitkeep" << EOF
EOF

echo "✅ 프로젝트 초기화 완료: $PROJECT_DIR"
echo ""
echo "생성된 구조:"
find "$PROJECT_DIR" -type f | sort | sed "s|$PROJECT_DIR|  $PROJECT_NAME|"
echo ""
echo "다음 단계: Claude Code에서 인터뷰를 시작하세요."
