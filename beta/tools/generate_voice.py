#!/usr/bin/env python3
"""יצירת קובצי הקריינות (MP3) מתוך tools/voice_lines.json.

משתמש בקול נוירוני עברי של Edge TTS (חינמי). הטקסט בעברית רגילה, בלי
ניקוד — הקול הנוירוני קורא אותה נכון בעצמו. כל קליפ מרופד בשקט קצר
בסופו (ffmpeg, אם זמין) כדי שהמילה האחרונה לא תיחתך.

ריצה: pip install edge-tts && python tools/generate_voice.py
"""
import asyncio
import json
import os
import shutil
import subprocess
import sys

import edge_tts

VOICE = "he-IL-HilaNeural"   # קול נשי חם וברור; חלופה: he-IL-AvriNeural
RATE = "+8%"                 # קצב זריז שמתאים לקצב המשחק
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "audio")
LINES = os.path.join(os.path.dirname(__file__), "voice_lines.json")
FFMPEG = shutil.which("ffmpeg")


def pad_silence(path):
    """חיתוך שקט מיותר בתחילת הקליפ + ריפוד שקט קצר בסופו נגד חיתוך מילים."""
    if not FFMPEG:
        return
    tmp = path + ".pad.mp3"
    r = subprocess.run(
        [FFMPEG, "-y", "-v", "error", "-i", path,
         "-af", "silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.08,apad=pad_dur=0.3",
         "-codec:a", "libmp3lame", "-b:a", "48k", tmp],
        capture_output=True,
    )
    if r.returncode == 0 and os.path.getsize(tmp) > 0:
        os.replace(tmp, path)
    elif os.path.exists(tmp):
        os.remove(tmp)


async def synth(item, sem):
    out = os.path.join(OUT_DIR, f"{item['id']}.mp3")
    if os.path.exists(out) and os.path.getsize(out) > 0:
        return  # כבר קיים — מדלגים (מאפשר ריצות המשך)
    text = item["text"]
    # נקודה בסוף עוזרת ל-TTS לסגור את המשפט בנעימה טבעית
    if not text.rstrip().endswith((".", "!", "?")):
        text = text.rstrip() + "."
    async with sem:
        for attempt in range(3):
            try:
                c = edge_tts.Communicate(text, VOICE, rate=RATE)
                await c.save(out)
                pad_silence(out)
                print(f"✓ {item['id']}")
                return
            except Exception as e:  # noqa: BLE001
                print(f"נסיון {attempt + 1} נכשל עבור {item['id']}: {e}")
                await asyncio.sleep(2 * (attempt + 1))
        raise SystemExit(f"נכשלה יצירת {item['id']}")


async def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    lines = json.load(open(LINES, encoding="utf-8"))
    sem = asyncio.Semaphore(4)
    await asyncio.gather(*(synth(item, sem) for item in lines))
    manifest = [item["id"] for item in lines]
    with open(os.path.join(OUT_DIR, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False)
    # גרסת JS של המניפסט — נטענת כ-<script> ולכן עובדת גם אופליין (file://),
    # שם fetch חסום. ה-UI מעדיף את הגלובל הזה על פני fetch.
    with open(os.path.join(OUT_DIR, "manifest.js"), "w", encoding="utf-8") as f:
        f.write("globalThis.MONOPOLY_VOICE_MANIFEST = "
                + json.dumps(manifest, ensure_ascii=False) + ";\n")
    print(f"נוצרו {len(manifest)} קליפים + manifest (json + js)")
    if not FFMPEG:
        print("אזהרה: ffmpeg לא נמצא — הקליפים לא רופדו בשקט")


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
