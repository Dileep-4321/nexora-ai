#!/usr/bin/env bash

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "=========================================================="
echo "  🚀 Starting NEXORA — AI Project Management Platform     "
echo "=========================================================="

# 1. Check MongoDB
if ! nc -z localhost 27017 2>/dev/null; then
  echo "⚠️  MongoDB does not seem to be running on port 27017."
  echo "   Attempting to start MongoDB service..."
  brew services start mongodb-community 2>/dev/null || true
  sleep 2
fi

# 2. Check and stop any stale processes on 5001 or 3000
echo "Checking ports 5001 and 3000..."
lsof -ti :5001 | xargs kill -9 2>/dev/null || true
lsof -ti :3000 | xargs kill -9 2>/dev/null || true

# 3. Start Backend
echo "Starting Backend (Express + Socket.IO) on port 5001..."
(
  cd "$DIR/projectpulse-ai/backend"
  nohup node src/server.js > /tmp/nexora-backend.log 2>&1 &
  echo $! > /tmp/nexora-backend.pid
)

# Wait for backend health
for i in {1..15}; do
  if curl -s http://localhost:5001/api/v1/health | grep -q '"status":"healthy"'; then
    echo "✓ Backend API is live on http://localhost:5001"
    break
  fi
  sleep 1
done

# 4. Start Frontend
echo "Starting Frontend (Next.js) on port 3000..."
(
  cd "$DIR"
  nohup npm run start > /tmp/nexora-frontend.log 2>&1 &
  echo $! > /tmp/nexora-frontend.pid
)

# Wait for frontend
for i in {1..15}; do
  if curl -s -I http://localhost:3000 | grep -q "200 OK"; then
    echo "✓ Frontend is live on http://localhost:3000"
    break
  fi
  sleep 1
done

echo ""
echo "=========================================================="
echo "  🎉 NEXORA IS LIVE AND READY FOR ACADEMIC EVALUATION     "
echo "=========================================================="
echo "  Application URL : http://localhost:3000                 "
echo "  Backend API     : http://localhost:5001/api/v1          "
echo "  API Health      : http://localhost:5001/api/v1/health   "
echo "----------------------------------------------------------"
echo "  DEMO CREDENTIALS (Password for all: Password123!)       "
echo "  • Project Manager : dileep@nexora.ai  (or pm@nexora.ai) "
echo "  • Team Lead       : sohel@nexora.ai   (or lead@nexora.ai)"
echo "  • Team Member     : hema@nexora.ai    (or member@nexora.ai)"
echo "  • Client          : client@nexora.ai                    "
echo "  • Administrator   : admin@nexora.ai                     "
echo "=========================================================="
