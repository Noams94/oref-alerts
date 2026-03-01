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

echo "▶  מפעיל שרת..."
echo "   כתובת: http://localhost:5050"
echo "   לעצירה: Ctrl+C"
echo ""

cd "$DIR"
python3 oref_app.py

# אם Python יצא — שמור את ה-Terminal פתוח
echo ""
echo "השרת הופסק. לחץ Enter לסגירה."
read
