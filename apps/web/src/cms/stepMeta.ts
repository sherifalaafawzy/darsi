/** How the course editor pictures each kind of step: an icon, and the group it is offered in when adding a step. */
import type { IconName } from "@darsi/design-system";
import type { Step } from "../content/types";
import type { MessageKey } from "../i18n";

export const STEP_ICON: Record<Step["type"], IconName> = {
  video: "video", read: "book", choice: "target", multi: "check", truefalse: "info", image: "image", match: "link", order: "chart",
  fill: "file", type: "edit", hotspot: "search", scenario: "chat", lab: "flask", project: "award", reflect: "idea",
  code: "code", parsons: "code", codefill: "code", bug: "warning", blocks: "agent",
};

export type StepGroup = "watch" | "ask" | "code" | "do";
/** A lesson usually runs watch → read → practise → project → reflect; "Add a step" offers them in that order. */
export const STEP_GROUPS: { id: StepGroup; label: MessageKey; types: Step["type"][] }[] = [
  { id: "watch", label: "cms.group.watch", types: ["video", "read"] },
  { id: "ask", label: "cms.group.ask", types: ["choice", "multi", "truefalse", "image", "match", "order", "fill", "type", "hotspot", "scenario"] },
  { id: "code", label: "cms.group.code", types: ["code", "parsons", "codefill", "bug", "blocks"] },
  { id: "do", label: "cms.group.do", types: ["lab", "project", "reflect"] },
];
export const groupOf = (type: Step["type"]): StepGroup => STEP_GROUPS.find((g) => g.types.includes(type))?.id ?? "ask";
