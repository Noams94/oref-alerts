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

# סגור טונל קודם אם קיים
pkill -f "cloudflared tunnel" 2>/dev/null

cd "$DIR"

# ── Cloudflare Tunnel ──────────────────────────────
CLOUDFLARED="$(which cloudflared 2>/dev/null)"
TUNNEL_LOG=""
TUNNEL_PID=""

if [ -n "$CLOUDFLARED" ]; then
  TUNNEL_LOG=$(mktemp)
  "$CLOUDFLARED" tunnel --url http://localhost:5050 --no-autoupdate 2>"$TUNNEL_LOG" &
  TUNNEL_PID=$!

  echo "🌐  מחפש כתובת ציבורית (Cloudflare Tunnel)..."
  TUNNEL_URL=""
  for i in $(seq 1 20); do
    TUNNEL_URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | head -1)
    [ -n "$TUNNEL_URL" ] && break
    sleep 1
  done

  if [ -n "$TUNNEL_URL" ]; then
    echo ""
    echo "  ┌─────────────────────────────────────────────┐"
    echo "  │ 🏠 מקומי:   http://localhost:5050           │"
    printf "  │ 🌍 ציבורי:  %-33s │\n" "$TUNNEL_URL"
    echo "  │                                             │"
    echo "  │  שתף את הכתובת הציבורית עם כל אחד! 🔗     │"
    echo "  └─────────────────────────────────────────────┘"
  else
    echo "  ⚠️  לא הצליח לפתוח טונל — זמין מקומית בלבד"
    echo "     כתובת: http://localhost:5050"
  fi
else
  echo "  ℹ️  cloudflared לא נמצא — זמין מקומית בלבד"
  echo "     כתובת: http://localhost:5050"
fi

echo ""
echo "   לעצירה: Ctrl+C"
echo ""

# פתח דפדפן
sleep 1 && open "http://localhost:5050" &

# הרץ שרת (foreground — מציג לוגים)
python3 oref_app.py

# ── ניקוי בסגירה ──────────────────────────────────
[ -n "$TUNNEL_PID" ]  && kill "$TUNNEL_PID"  2>/dev/null
[ -n "$TUNNEL_LOG" ]  && rm -f "$TUNNEL_LOG"

echo ""
echo "השרת הופסק. לחץ Enter לסגירה."
read
