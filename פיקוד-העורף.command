#!/bin/bash
# קובץ זה נפתח ב-Terminal בלחיצה כפולה (macOS .command)
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🛡️  פיקוד העורף — מערכת ניטור התראות"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# סגור שרת קודם אם קיים
OLD_PID=$(lsof -ti :5050 2>/dev/null | head -1)
if [ -n "$OLD_PID" ]; then
  echo "⏹  סוגר שרת קיים (PID $OLD_PID)..."
  kill "$OLD_PID" 2>/dev/null
  sleep 2
fi

cd "$DIR"

PUBLIC_URL=""

# ── Tailscale Funnel (ראשי — URL קבוע) ─────────────────────
if command -v tailscale &>/dev/null; then
  echo "🔗  מפעיל Tailscale Funnel..."
  tailscale funnel --bg 5050 2>/dev/null

  # שלוף את ה-hostname מ-Tailscale
  TS_HOST=$(tailscale status --json 2>/dev/null | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    print(d.get('Self', {}).get('DNSName', '').rstrip('.'))
except:
    pass
" 2>/dev/null)
  [ -n "$TS_HOST" ] && PUBLIC_URL="https://${TS_HOST}"

# ── Cloudflare Tunnel (גיבוי — אם Tailscale לא מותקן) ──────
elif command -v cloudflared &>/dev/null; then
  pkill -f "cloudflared tunnel" 2>/dev/null
  TUNNEL_LOG=$(mktemp)
  cloudflared tunnel --url http://localhost:5050 --no-autoupdate 2>"$TUNNEL_LOG" &
  TUNNEL_PID=$!

  echo "🌐  מחפש כתובת ציבורית (Cloudflare Tunnel)..."
  for i in $(seq 1 20); do
    PUBLIC_URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | head -1)
    [ -n "$PUBLIC_URL" ] && break
    sleep 1
  done
fi

# הצג כתובות
echo ""
echo "  ┌─────────────────────────────────────────────────────┐"
echo "  │ 🏠 מקומי:   http://localhost:5050                   │"
if [ -n "$PUBLIC_URL" ]; then
  printf "  │ 🌍 ציבורי:  %-41s │\n" "$PUBLIC_URL"
  echo "  │                                                     │"
  echo "  │  URL קבוע — שתף עם כל אחד! 🔗                     │"
else
  echo "  │  ⚠️  אין גישה ציבורית                               │"
fi
echo "  └─────────────────────────────────────────────────────┘"
echo ""
echo "   לעצירה: Ctrl+C"
echo ""

# פתח דפדפן
sleep 1 && open "http://localhost:5050" &

# הרץ שרת (foreground — מציג לוגים)
python3 oref_app.py

# ── ניקוי בסגירה ──────────────────────────────────────────
[ -n "$TUNNEL_PID" ] && kill "$TUNNEL_PID" 2>/dev/null
[ -n "$TUNNEL_LOG" ] && rm -f "$TUNNEL_LOG"
tailscale funnel off 2>/dev/null

echo ""
echo "השרת הופסק. לחץ Enter לסגירה."
read
