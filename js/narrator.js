/* One cancellable queue for recorded speech and browser fallback. */
(function () {
  'use strict';
  class Narrator {
    constructor({ enabled = () => true, onText = () => {} } = {}) {
      this.enabled = enabled;
      this.onText = onText;
      this.ids = new Set();
      this.queue = Promise.resolve();
      this.generation = 0;
      this.pending = new Set();
      this.active = null;
      this.last = null;
    }
    async init() {
      if (Array.isArray(globalThis.MONOPOLY_VOICE_MANIFEST)) {
        this.ids = new Set(globalThis.MONOPOLY_VOICE_MANIFEST);
      } else {
        try {
          const r = await fetch('audio/manifest.json');
          if (r.ok) this.ids = new Set(await r.json());
        } catch { /* Recorded clips are optional offline. */ }
      }
    }
    available() { return this.ids.size > 0; }
    say(ids, text, { interrupt = false } = {}) {
      if (!this.enabled() || (!ids.length && !text)) return Promise.resolve();
      if (interrupt) this.stop();
      const key = ids.length ? ids.join('|') : text;
      if (this.pending.has(key)) return this.queue;
      const generation = this.generation;
      this.pending.add(key);
      this.last = { ids, text };
      this.queue = this.queue.then(async () => {
        if (generation !== this.generation || !this.enabled()) return;
        const lines = globalThis.MONOPOLY_VOICE_TEXT || {};
        this.onText(ids.length && ids.every((id) => lines[id]) ? ids.map((id) => lines[id]).join(' ') : text || '');
        if (ids.length && ids.every((id) => this.ids.has(id))) {
          for (const id of ids) {
            if (generation !== this.generation || !this.enabled()) break;
            const played = await this.playClip(id);
            if (!played && generation === this.generation) await this.playText(lines[id] || text);
          }
        } else await this.playText(text);
      }).catch(() => {}).finally(() => {
        if (generation === this.generation) this.pending.delete(key);
      });
      return this.queue;
    }
    playClip(id) {
      return new Promise((resolve) => {
        const aliases = globalThis.MONOPOLY_VOICE_FILES || {};
        const audio = new Audio(`audio/${aliases[id] || id}.mp3?v=20`);
        let finished = false;
        const finish = (ok) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          audio.onended = audio.onerror = null;
          audio.pause();
          if (this.active?.audio === audio) this.active = null;
          resolve(ok);
        };
        const timer = setTimeout(() => finish(false), 45000);
        this.active = { audio, cancel: () => finish(true) };
        audio.onended = () => finish(true);
        audio.onerror = () => finish(false);
        audio.play().catch(() => finish(false));
      });
    }
    playText(text) {
      if (!text || !globalThis.speechSynthesis) return Promise.resolve();
      // Never read Hebrew using a non-Hebrew voice: captions remain visible.
      const voice = speechSynthesis.getVoices().find((v) => /^he(?:-|_)/i.test(v.lang));
      if (!voice) return Promise.resolve();
      return new Promise((resolve) => {
        const utterance = new SpeechSynthesisUtterance(text.replace(/[\u0591-\u05c7]/g, '').replace(/ש"ח|₪/g, ' שקלים '));
        utterance.lang = 'he-IL'; utterance.voice = voice; utterance.rate = 0.9;
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          utterance.onend = utterance.onerror = null;
          if (this.active?.utterance === utterance) this.active = null;
          resolve();
        };
        const timer = setTimeout(() => { speechSynthesis.cancel(); finish(); }, 45000);
        this.active = { utterance, cancel: finish };
        utterance.onend = utterance.onerror = finish;
        speechSynthesis.speak(utterance);
      });
    }
    repeat() { if (this.last) return this.say(this.last.ids, this.last.text, { interrupt: true }); }
    stop() {
      this.generation++;
      this.pending.clear();
      this.active?.cancel();
      globalThis.speechSynthesis?.cancel();
      this.queue = Promise.resolve();
    }
  }
  globalThis.MonopolyNarrator = Narrator;
})();
