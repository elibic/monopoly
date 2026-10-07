import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../js/narrator.js', import.meta.url), 'utf8');
function setup() {
  const played = [], spoken = [], captions = [];
  const synth = { getVoices: () => [{ lang: 'he-IL' }], speak: (u) => spoken.push(u), cancel() {} };
  const context = vm.createContext({ setTimeout, clearTimeout, speechSynthesis: synth,
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    Audio: class { constructor(src) { this.src = src; } play() { played.push(this); return Promise.resolve(); } pause() { this.paused = true; } },
    MONOPOLY_VOICE_MANIFEST: ['a','b'], MONOPOLY_VOICE_FILES: { b: 'a' }, MONOPOLY_VOICE_TEXT: { a: 'שלום', b: 'שלום' },
  });
  vm.runInContext(source, context);
  const narrator = new context.MonopolyNarrator({ onText: (t) => captions.push(t) });
  return { narrator, played, spoken, synth, captions };
}
const flush = () => new Promise((r) => setImmediate(r));
test('recordings and synthesized speech share one queue; duplicate requests collapse', async () => {
  const { narrator: n, played, spoken } = setup(); await n.init();
  n.say(['a'], 'a'); n.say(['a'], 'a'); n.say([], 'dynamic');
  await flush(); assert.equal(played.length, 1); assert.equal(spoken.length, 0);
  played[0].onended(); await flush(); assert.equal(spoken.length, 1);
  spoken[0].onend(); await n.queue;
});
test('stop settles active playback and cancels old pending requests', async () => {
  const { narrator: n, played, spoken } = setup(); await n.init();
  const old = n.say(['a'], 'a'); n.say([], 'stale'); await flush();
  n.stop(); n.say(['b'], 'b'); await flush();
  assert.ok(played[0].paused); assert.equal(played.length, 2); assert.equal(spoken.length, 0);
  assert.match(played[1].src, /audio\/a\.mp3/);
  played[1].onended(); await n.queue; await old;
});
test('missing audio falls back once; no Hebrew voice leaves readable captions', async () => {
  const { narrator: n, played, spoken, synth, captions } = setup(); await n.init();
  n.say(['a'], 'שלום'); await flush(); played[0].onerror(); await flush();
  assert.equal(spoken.length, 1); spoken[0].onend(); await n.queue;
  synth.getVoices = () => [{ lang: 'en-US' }]; await n.say([], 'טקסט');
  assert.equal(spoken.length, 1); assert.equal(captions.at(-1), 'טקסט');
});
