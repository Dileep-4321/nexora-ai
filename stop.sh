#!/usr/bin/env bash
echo "Stopping NEXORA processes..."
for port in 5001 3000; do
  pids=$(lsof -ti :$port 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "Stopping process(es) on port $port: $pids"
    echo "$pids" | xargs kill -9 2>/dev/null || true
  fi
done
rm -f /tmp/nexora-backend.pid /tmp/nexora-frontend.pid 2>/dev/null || true
echo "✓ All NEXORA frontend and backend processes stopped cleanly."
