import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserContext } from "@playwright/test";
import { contentTypeOf, kitFiles, withKitUrls } from "../../../scripts/lib/kits.mjs";

/**
 * The app ships no courses: it reads them from Cloud Storage. These tests answer its Storage requests with ai-1, the
 * first starting course (retired from the live site, kept in content/retired as the test course), laid out as
 * `npm run seed` publishes a unit (scripts/seed-content.mjs): the catalog, the unit's JSON and its kit files.
 * Anything else in Storage (settings, language packs) is "not published yet".
 */
const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const urlOf = (path: string) => `https://firebasestorage.googleapis.com/v0/b/e2e/o/${encodeURIComponent(path)}?alt=media`;

export async function fakeStorage(context: BrowserContext) {
  const source = JSON.parse(readFileSync(resolve(ROOT, "content/retired/ai-1.json"), "utf8"));
  const unit = withKitUrls(source, urlOf);
  const files = new Map<string, { body: Buffer | string; type: string }>([
    ["content/catalog.json", { type: "application/json", body: JSON.stringify({ version: 1, units: [{
      id: unit.id, track: unit.track, level: unit.level, title: unit.title, summary: unit.summary, lessons: unit.lessons.length,
      sizeMB: 2.4, available: true, src: "content/units/ai-1/v1.json", version: 1, owner: "public",
    }] }) }],
    ["content/units/ai-1/v1.json", { type: "application/json", body: JSON.stringify(unit) }],
    ...kitFiles(source).map((k: { path: string; file: string; fmt: string }) =>
      [k.path, { type: contentTypeOf(k.fmt), body: readFileSync(resolve(ROOT, "content/kits", k.file)) }] as const),
  ]);
  await context.route(/^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/([^?]+)/, (route) => {
    const path = decodeURIComponent(/\/o\/([^?]+)/.exec(route.request().url())![1]);
    const f = files.get(path);
    return f ? route.fulfill({ status: 200, contentType: f.type, body: f.body, headers: { "access-control-allow-origin": "*" } })
      : route.fulfill({ status: 404, contentType: "application/json", body: '{"error":{"code":404}}', headers: { "access-control-allow-origin": "*" } });
  });
}
