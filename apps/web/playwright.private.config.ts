import base from "./playwright.config";
const url = "http://localhost:4180";
export default { ...base, use: { ...base.use, baseURL: url }, webServer: { command: "npm run build && npx vite preview --port 4180 --strictPort", url, reuseExistingServer: false, timeout: 300_000 } };
