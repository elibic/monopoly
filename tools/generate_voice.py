#!/usr/bin/env python3
"""Generate Hebrew clips; identical text shares one file, changed text regenerates.
Install edge-tts==7.2.8. Use --only ID for a preview.
"""
import argparse
import asyncio
import hashlib
import json
from pathlib import Path
import edge_tts
ROOT = Path(__file__).resolve().parents[1]
VOICE = 'he-IL-HilaNeural'
RATE = '-8%'
async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--only')
    args = parser.parse_args()
    lines = json.loads((ROOT / 'tools/voice_lines.json').read_text(encoding='utf-8'))
    if len({x['id'] for x in lines}) != len(lines): raise ValueError('Duplicate IDs')
    out = ROOT / 'audio'
    out.mkdir(exist_ok=True)
    cache_path = out / 'build.json'
    old = json.loads(cache_path.read_text(encoding='utf-8')) if cache_path.exists() else {}
    aliases, unique, hashes, texts = {}, {}, {}, {}
    for item in lines:
        text = item['text'].strip()
        if not text.endswith(('.', '!', '?')): text += '.'
        key = hashlib.sha256((VOICE + RATE + text).encode()).hexdigest()
        canonical = unique.setdefault(key, {**item, 'text': text})['id']
        aliases[item['id']] = canonical
        hashes[canonical] = key
        texts[item['id']] = text
    sem = asyncio.Semaphore(3)
    async def build(item):
        name = item['id']
        if args.only and aliases.get(args.only) != name: return
        target = out / (name + '.mp3')
        if old.get(name) == hashes[name] and target.exists() and target.stat().st_size > 1000: return
        temporary = target.with_suffix('.tmp.mp3')
        async with sem:
            for attempt in range(3):
                try:
                    await edge_tts.Communicate(item['text'], VOICE, rate=RATE).save(str(temporary))
                    if temporary.stat().st_size < 1000: raise ValueError('Empty recording')
                    temporary.replace(target)
                    print('Generated ' + name, flush=True)
                    return
                except Exception:
                    temporary.unlink(missing_ok=True)
                    if attempt == 2: raise
                    await asyncio.sleep(1 + attempt)
    await asyncio.gather(*(build(item) for item in unique.values()))
    if args.only: return
    ids = list(aliases)
    (out / 'manifest.json').write_text(json.dumps(ids, ensure_ascii=False), encoding='utf-8')
    (out / 'manifest.js').write_text('globalThis.MONOPOLY_VOICE_MANIFEST = ' + json.dumps(ids) + ';\n' + 'globalThis.MONOPOLY_VOICE_FILES = ' + json.dumps(aliases) + ';\n' + 'globalThis.MONOPOLY_VOICE_TEXT = ' + json.dumps(texts, ensure_ascii=False) + ';\n', encoding='utf-8')
    cache_path.write_text(json.dumps(hashes, indent=2), encoding='utf-8')
    for name, canonical in aliases.items():
        if name != canonical: (out / (name + '.mp3')).unlink(missing_ok=True)
    print(f'{len(ids)} cues, {len(unique)} unique MP3 files.', flush=True)
if __name__ == '__main__': asyncio.run(main())
