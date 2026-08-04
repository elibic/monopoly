#!/usr/bin/env python3
"""יצירת קובצי הקריינות (MP3) מתוך tools/voice_lines.json.

משתמש בקול נוירוני עברי של Edge TTS (חינמי). מיועד לריצה ב-GitHub Actions
או מקומית:  pip install edge-tts && python tools/generate_voice.py
"""
import asyncio
import json
import os
import sys

import edge_tts

VOICE = "he-IL-HilaNeural"   # קול נשי חם וברור; חלופה: he-IL-AvriNeural
RATE = "-10%"                # מעט לאט — מותאם לילדים
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "audio")
LINES = os.path.join(os.path.dirname(__file__), "voice_lines.json")


async def synth(item, sem):
    out = os.path.join(OUT_DIR, f"{item['id']}.mp3")
    if os.path.exists(out) and os.path.getsize(out) > 0:
        return  # כבר קיים — מדלגים (מאפשר ריצות המשך)
    async with sem:
        for attempt in range(3):
            try:
                c = edge_tts.Communicate(item["text"], VOICE, rate=RATE)
                await c.save(out)
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
    print(f"נוצרו {len(manifest)} קליפים + manifest")


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
