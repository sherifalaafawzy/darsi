/** Labs: hands-on apps that really compute on the phone. Each app lives in labs/apps/<id>/ (meta.ts + index.tsx). */
export type Track = "ai" | "iot" | "cyber";
/** Labs text is always written in both languages (a LocalText that requires Arabic too). */
export type LocalStr = { en: string; ar: string } & Partial<Record<string, string>>;

export type CategoryId =
  | "ai-learning" | "ai-networks" | "ai-vision" | "ai-language" | "ai-decisions" | "ai-use"
  | "iot-sensors" | "iot-electronics" | "iot-automation"
  | "cyber-accounts" | "cyber-threats" | "cyber-crypto" | "cyber-privacy";

export interface LabMeta {
  /** Same as the folder name; also what a lesson's `lab` step stores. */
  id: string;
  category: CategoryId;
  /** 1 starter, 2 explorer, 3 advanced. */
  level: 1 | 2 | 3;
  minutes: number;
  /** Order inside its category. */
  order: number;
  /**
   * Position on "The AI ladder", if it is on it. The ladder, in order:
   * 1 neuron, 2 activation, 3 perceptron, 4 gradient, 5 backprop, 6 playground, 7 overfit, 8 pixels, 9 convolution,
   * 10 shapes, 11 tokens, 12 embeddings, 13 nextword, 14 minilm, 15 attention, 16 llm, 17 rag, 18 tree, 19 rl, 20 decision.
   */
  ladder?: number;
  title: LocalStr;
  summary: LocalStr;
}

/** What every app component receives. `embedded`: shown inside a lesson step rather than on its own screen. */
export interface LabProps { meta: LabMeta; embedded?: boolean; onDone?: () => void }
