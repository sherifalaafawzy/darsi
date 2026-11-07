// The open-source licences page (/licences): every dependency that ships to phones has its copyright and licence there,
// with the licence texts, in both languages' pages. scripts/licences.mjs writes the data; re-run it after adding one.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import data from "../src/landing/licences.json";
import { I18nProvider } from "../src/i18n";
import { Licences } from "../src/landing/Licences";

const pkg = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf8")) as { dependencies: Record<string, string> };
const listed = new Set(data.components.flatMap((c) => c.packages));

describe("open-source licences", () => {
  it("cover every dependency that ships, and the runtimes, service worker and fonts that aren't in package.json's dependencies", () => {
    for (const dep of Object.keys(pkg.dependencies).filter((d) => d !== "@darsi/design-system")) expect(listed.has(dep), `${dep}: run node scripts/licences.mjs after adding it there`).toBe(true);
    for (const shipped of ["sql.js", "@micropython/micropython-webassembly-pyscript", "workbox-window", "vite-plugin-pwa", "core-js", "systemjs", "firebase"]) expect(listed.has(shipped), shipped).toBe(true);
    const fonts = readdirSync(join(__dirname, "../../../packages/design-system/assets/fonts")).filter((f) => f.endsWith(".woff2"));
    const families = data.components.filter((c) => c.group === "fonts").map((c) => c.name.toLowerCase().replace(/\s+/g, "-")).join(",");
    for (const f of fonts) expect(families, f).toContain(f.split(/-(?:latin|arabic)/)[0]);
  });

  it("give each one a copyright line and a licence whose text is on the page", () => {
    for (const c of data.components) {
      expect(c.copyright.length, c.name).toBeGreaterThan(0);
      const ids = [c.licence, ...("includes" in c && c.includes ? c.includes.map((i) => i.licence) : [])];
      for (const id of ids.flatMap((l) => l.replace(/[()]/g, "").split(/\s+(?:OR|AND)\s+/))) {
        if (id === "Public domain" || id.startsWith("GPL")) continue; // GPL is the other choice of a dual licence (JSZip: MIT)
        expect(Object.keys(data.texts), `${c.name}: ${id}`).toContain(id);
      }
    }
    expect(data.texts.MIT).toMatch(/^Permission is hereby granted, free of charge/);
    expect(data.texts["Apache-2.0"]).toMatch(/END OF TERMS AND CONDITIONS$/);
    expect(data.texts["OFL-1.1"]).toMatch(/^SIL OPEN FONT LICENSE Version 1\.1/);
  });

  it("shows in Arabic too, with the names and licences kept in English", () => {
    render(<I18nProvider lang="ar"><MemoryRouter><Licences /></MemoryRouter></I18nProvider>);
    expect(screen.getByRole("heading", { name: "تراخيص البرمجيات مفتوحة المصدر" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "الخطوط" })).toBeTruthy();
    const react = screen.getByText("React").closest("ul")!;
    expect(react.getAttribute("lang")).toBe("en");
    expect(react.getAttribute("dir")).toBe("ltr");
    expect(screen.getAllByText("Apache-2.0").length).toBeGreaterThan(0);
  });
});
