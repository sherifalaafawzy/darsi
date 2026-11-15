// Types for studio-media.mjs (a lesson's video from Lesson Studio), for the tests.
/** Darsi language → Lesson Studio language, for a language's video, timing and light lesson. */
export type StudioLangs = Record<string, string>;
export const STUDIO_LANGS: { en: "en"; ar: "ar-EG" };
export const EXTRA_LANGS: { fr: "fr"; es: "es"; de: "de"; pt: "pt-BR" };
export const HOLD: number;
export function readJson<T = any>(p: string): T;
export function walk(dir: string, out?: string[]): string[];
export function videoLangs(studio: string, studioId: string): StudioLangs;
export interface VideoInfo { seconds: number; narrated?: boolean; checks?: { at: number }[]; [k: string]: unknown }
export function studioMedia(root: string, studio: string, studioId: string, lessonId: string): {
  sources: Record<string, string>; captions: Record<string, string>; info: Record<string, VideoInfo>; langs: StudioLangs;
  duration: number; sizeMB: number;
  light: { files: Record<string, string>; langs: StudioLangs; sizeKB: Record<string, number> };
};
export function sceneTimes(studio: string, studioId: string, langs?: StudioLangs): Record<string, number[]>;
export interface StoryOverlay { title: string; scenes: Record<string, { narration: string; on_screen_text?: string }>; [k: string]: unknown }
export function storyboard(studio: string, studioId: string): {
  story: { scenes: { n: number; start: string; narration: string }[]; chapters: { at: string; label: string }[]; checkpoints?: { prompt: string }[] };
  arabic: StoryOverlay; overlays: Record<string, StoryOverlay>;
};
