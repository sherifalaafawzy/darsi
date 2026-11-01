/** Stand-in for the Vite PWA virtual module, so screens that register the worker can render in unit tests. */
export function registerSW() {
  return () => {};
}
