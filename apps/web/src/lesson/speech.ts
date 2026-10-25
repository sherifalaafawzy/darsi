/** Read-aloud with the device's own voices (works offline on most phones). Native apps can swap in a TTS plugin here. */
export function speak(text: string, lang: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;
  if (synth.speaking) { synth.cancel(); return; }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === "ar" ? "ar-SA" : "en-GB";
  const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang));
  if (voice) u.voice = voice;
  u.rate = 0.95;
  synth.speak(u);
}
