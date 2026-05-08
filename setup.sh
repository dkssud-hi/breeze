#!/usr/bin/env bash
# ── 서울 틈새 나들이 — 초기 세팅 스크립트 ──────────────────
set -e

echo "📦 의존성 설치 중..."
npm install

echo ""
echo "✅ 준비 완료! 개발 서버 시작합니다..."
echo "   브라우저에서 http://localhost:5173 으로 접속하세요."
echo ""
npm run dev
