/** Messages between index.ts (the page) and tinylm-worker.ts. Types only. */
import type { FineTuneOptions, StepResult } from "./finetune";
import type { Conversation, Step } from "./format";
import type { Generation, GenerateOptions, StreamToken } from "./generate";
import type { TinyConfig } from "./model";

export interface FileInfo { bytes: number; gzip: number; sha256: string }
export interface Manifest { name: string; version: number; params: number; config: TinyConfig; files: Record<"model.bin" | "tokenizer.json" | "world.json" | "replay.json", FileInfo> }

export interface Result extends Generation { step: Step }

export type Request =
  | { type: "load"; id: number; base: string; manifest?: Manifest; saved?: ArrayBuffer | null }
  | { type: "generate"; id: number; input: Conversation | number[]; opts: GenerateOptions }
  | { type: "tokenize"; id: number; text: string }
  | { type: "finetune"; id: number; examples: Conversation[]; steps: number; opts: FineTuneOptions; resume?: ArrayBuffer; replay?: number }
  | { type: "use"; id: number; saved: ArrayBuffer | null }
  | { type: "stop"; id: number };

export type Response =
  | { type: "progress"; id: number; loaded: number; total: number }
  | { type: "ready"; id: number; config: TinyConfig; vocab: number }
  | { type: "tokens"; id: number; tokens: StreamToken[] }
  | { type: "done"; id: number; result: Result }
  | { type: "pieces"; id: number; ids: number[]; pieces: string[] }
  | ({ type: "ft-ready"; id: number; examples: number; targets: number; trainable: number; ms: number })
  | ({ type: "ft-step"; id: number; step: number } & StepResult)
  | { type: "ft-done"; id: number; saved: ArrayBuffer; stopped: boolean }
  | { type: "ok"; id: number }
  | { type: "error"; id: number; message: string };
