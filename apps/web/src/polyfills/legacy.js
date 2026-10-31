/* Loaded only by the legacy build (Chrome 61–79). core-js covers the language; these are the web APIs it does not.
   Stay in ES5: this file is prepended to the polyfill chunk and may not be downlevelled again. */
if (typeof globalThis === "undefined") self.globalThis = self;
if (typeof queueMicrotask !== "function") self.queueMicrotask = function (fn) { Promise.resolve().then(fn); };
if (typeof AbortController !== "function") {
  var AbortSignalPoly = function () { this.aborted = false; this.onabort = null; };
  AbortSignalPoly.prototype.addEventListener = function () {};
  AbortSignalPoly.prototype.removeEventListener = function () {};
  var AbortControllerPoly = function () { this.signal = new AbortSignalPoly(); };
  AbortControllerPoly.prototype.abort = function () {
    var signal = this.signal;
    if (signal.aborted) return;
    signal.aborted = true;
    if (typeof signal.onabort === "function") signal.onabort();
  };
  self.AbortController = AbortControllerPoly;
  self.AbortSignal = AbortSignalPoly;
}
