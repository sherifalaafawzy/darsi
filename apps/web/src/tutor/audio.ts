/**
 * The tutor's voice on a slow, expensive connection: the microphone goes out as 8 kHz μ-law (about 64 kbit/s), and only
 * while the learner speaks, plus a second of the pause after so the tutor hears the turn end. The tutor's voice comes back
 * the same way and is queued gaplessly; an interruption stops it at once. Same codec as functions/src/tutorCore.ts.
 */

export function ulawToFloat(u: Uint8Array): Float32Array {
  const out = new Float32Array(u.length);
  for (let i = 0; i < u.length; i++) {
    const x = ~u[i] & 0xff, sign = x & 0x80, exp = (x >> 4) & 7, man = x & 0x0f;
    const v = (((man << 3) + 0x84) << exp) - 0x84;
    out[i] = (sign ? -v : v) / 32768;
  }
  return out;
}
export function floatToUlaw(f: Float32Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(f.length);
  for (let i = 0; i < f.length; i++) {
    let s = Math.round(Math.max(-1, Math.min(1, f[i])) * 32767);
    const sign = s < 0 ? 0x80 : 0;
    if (sign) s = -s;
    s = Math.min(s, 32635) + 0x84;
    let exp = 7;
    for (let m = 0x4000; (s & m) === 0 && exp > 0; m >>= 1) exp--;
    out[i] = ~(sign | (exp << 4) | ((s >> (exp + 3)) & 0x0f)) & 0xff;
  }
  return out;
}
/** Any rate to 8 kHz, averaging the samples that fall in each output sample. */
export function to8k(input: Float32Array, rate: number): Float32Array {
  const ratio = rate / 8000, out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const a = Math.floor(i * ratio), b = Math.max(a + 1, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = a; j < b; j++) sum += input[j];
    out[i] = sum / (b - a);
  }
  return out;
}
export const rms = (f: Float32Array) => Math.sqrt(f.reduce((a, x) => a + x * x, 0) / Math.max(1, f.length));

/**
 * Decides which 8 kHz frames to send: frames from when the voice rises above the threshold (with 200 ms before it)
 * until 1 s after it falls. While the tutor is speaking the threshold is four times higher, so its own voice from the
 * phone's speaker isn't taken for the learner, but a clear "wait" still interrupts it.
 */
export class Gate {
  private before: Float32Array[] = [];
  private hold = 0;
  constructor(private threshold = 0.015, private frameMs = 20) {}
  push(frame: Float32Array, tutorSpeaking: boolean): Float32Array[] {
    const loud = rms(frame) > this.threshold * (tutorSpeaking ? 4 : 1);
    if (loud) {
      const out = this.hold > 0 ? [frame] : [...this.before, frame];
      this.before = []; this.hold = 1000 / this.frameMs;
      return out;
    }
    if (this.hold > 0) { this.hold--; return [frame]; }
    this.before.push(frame);
    if (this.before.length > 200 / this.frameMs) this.before.shift();
    return [];
  }
}

/** The microphone, as 20 ms frames at 8 kHz. Stop() releases it. */
export async function startMic(onFrame: (f: Float32Array) => void) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
  const ctx = new AudioContext();
  const code = "class C extends AudioWorkletProcessor{process(i){const c=i[0]&&i[0][0];if(c)this.port.postMessage(c.slice(0));return true}}registerProcessor('darsi-mic',C)";
  const url = URL.createObjectURL(new Blob([code], { type: "application/javascript" }));
  await ctx.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
  const node = new AudioWorkletNode(ctx, "darsi-mic");
  ctx.createMediaStreamSource(stream).connect(node);
  let pending = new Float32Array(0);
  node.port.onmessage = (e: MessageEvent<Float32Array>) => {
    const next = new Float32Array(pending.length + e.data.length);
    next.set(pending); next.set(e.data, pending.length);
    const per = Math.round(ctx.sampleRate / 50); // 20 ms
    let at = 0;
    for (; at + per <= next.length; at += per) onFrame(to8k(next.subarray(at, at + per), ctx.sampleRate));
    pending = next.slice(at);
  };
  return { stop: () => { node.port.onmessage = null; stream.getTracks().forEach((t) => t.stop()); void ctx.close(); } };
}

/** How open the mouth is for a stretch of speech (0–1): loudness, lifted so quiet syllables still move it. */
export const mouthFor = (f: Float32Array) => Math.min(1, Math.sqrt(rms(f) * 6));

/**
 * The tutor's voice: 8 kHz μ-law chunks, played one after another; clear() stops at once (an interruption).
 * onLevel gets the mouth's opening for every 50 ms of voice, at the moment it is heard (the avatar's lip-sync).
 */
export class Speaker {
  private ctx = new AudioContext();
  private next = 0;
  private playing: AudioBufferSourceNode[] = [];
  private timers = new Set<number>();
  constructor(private onLevel?: (v: number) => void) {}
  get speaking() { return this.playing.length > 0; }
  play(chunk: Uint8Array) {
    const f = ulawToFloat(chunk);
    const buf = this.ctx.createBuffer(1, f.length, 8000);
    buf.getChannelData(0).set(f);
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.connect(this.ctx.destination);
    this.next = Math.max(this.next, this.ctx.currentTime + 0.05);
    src.start(this.next);
    if (this.onLevel) for (let i = 0; i < f.length; i += 400) this.at(this.next + i / 8000, mouthFor(f.subarray(i, i + 400)));
    this.next += buf.duration;
    this.playing.push(src);
    src.onended = () => { this.playing = this.playing.filter((s) => s !== src); if (!this.playing.length) this.onLevel?.(0); };
  }
  private at(when: number, v: number) {
    const id = window.setTimeout(() => { this.timers.delete(id); this.onLevel?.(v); }, Math.max(0, (when - this.ctx.currentTime) * 1000));
    this.timers.add(id);
  }
  clear() {
    for (const s of this.playing) { try { s.stop(); } catch { /* already ended */ } }
    for (const id of this.timers) clearTimeout(id);
    this.playing = []; this.timers.clear(); this.next = 0;
    this.onLevel?.(0);
  }
  close() { this.clear(); void this.ctx.close(); }
}
