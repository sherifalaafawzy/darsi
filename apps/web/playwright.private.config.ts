// Temporary: the e2e suite against this session's build on its own port (another session serves 4173).
import base from "./playwright.config";
export default { ...base, use: { ...base.use, baseURL: "http://localhost:4175" },
  webServer: { command: "npx vite preview --port 4175 --strictPort --outDir C:/Users/SHERIF~1/AppData/Local/Temp/claude/H--htdocs-darsi/5705dc83-54c6-4c3e-95e2-617552c2b621/scratchpad/build-x", url: "http://localhost:4175", reuseExistingServer: false, timeout: 60_000 } };
