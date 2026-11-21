/*
 * Darsi's first script (index.html's <head>). A file, not inline code, so a Content-Security-Policy without
 * 'unsafe-inline' allows it. ES5, no imports: it is served as written, to browsers too old for the app as well.
 * Why each part is so: apps/web/tests/boot.test.ts and vite.config.ts ("darsi-early-sw").
 */
(function () {
  // The Hosting site's own addresses send people to darsiai.org, before anything loads.
  if (/^darsi-f0685\.(web\.app|firebaseapp\.com)$/.test(location.hostname)) {
    location.replace("https://darsiai.org" + location.pathname + location.search + location.hash);
    return;
  }

  // The service worker, at once, when the tag names one: the build adds data-sw="/sw.js"; npm run dev has none.
  var me = document.currentScript;
  var sw = me && me.getAttribute ? me.getAttribute("data-sw") : null;
  // A refused registration (private mode in some browsers, storage blocked, a failed fetch of sw.js offline) must not
  // reach the console as an unhandled rejection, which the app's error telemetry would then count: the app runs without
  // the worker, and vite-plugin-pwa registers it again on the next load. then(null, …): `.catch` is a reserved word to
  // the oldest browsers this file must still parse in.
  if (sw && "serviceWorker" in navigator) {
    try {
      var registering = navigator.serviceWorker.register(sw);
      if (registering && registering.then) registering.then(null, function () {});
    } catch (e) { /* a SecurityError thrown at once: the same */ }
  }

  // "Please update your browser" (#boot-fallback): only if the app has not mounted 15 s after the page was parsed, and
  // gone again if it mounts later (a slow phone). The first mount ends the watch: when React empties #root afterwards
  // (an error no boundary caught), the card must not come up on a browser that plainly runs the app.
  function watch() {
    var root = document.getElementById("root");
    var box = document.getElementById("boot-fallback");
    if (!root || !box) return;
    var observer = null;
    var timer = 0;
    function mounted() { return root.childNodes.length > 0; }
    // The attribute, not the `hidden` property, which the browsers this card is for do not all have.
    function done() {
      box.setAttribute("hidden", "");
      if (observer) observer.disconnect();
      clearTimeout(timer);
    }
    // A module script runs before DOMContentLoaded, so the app may be there already.
    if (mounted()) { done(); return; }
    if (window.MutationObserver) {
      observer = new window.MutationObserver(function () { if (mounted()) done(); });
      observer.observe(root, { childList: true });
    }
    timer = setTimeout(function () { if (mounted()) done(); else box.removeAttribute("hidden"); }, 15000);
  }
  // This runs in the <head>: #root and the card exist once the body is parsed.
  if (document.readyState === "loading" && document.addEventListener) document.addEventListener("DOMContentLoaded", watch);
  else watch();
})();
