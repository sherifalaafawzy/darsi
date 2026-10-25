/*
 * Darsi push handlers. Workbox's sw.js loads this file with importScripts (vite.config.ts), so it is plain JS for old
 * WebViews: no imports, no modules, no Firebase SDK. Cloud Functions send data-only web push through FCM, and FCM
 * delivers { data: { title, body, link, tag, lang, dir }, from, fcmMessageId, ... }.
 */
/* eslint-env serviceworker */
(function () {
  "use strict";
  var ICON = "/app-icons/app-icon-192.png";
  var BADGE = "/app-icons/app-icon-monochrome-512.png";

  /** Only paths inside this app: anything else (another origin, "//host", "javascript:") opens Learn. */
  function appUrl(link) {
    try {
      if (typeof link === "string" && link.charAt(0) === "/" && link.charAt(1) !== "/" && link.charAt(1) !== "\\") {
        var url = new URL(link, self.location.origin);
        if (url.origin === self.location.origin) return url.href;
      }
    } catch (e) { /* fall through */ }
    return new URL("/learn", self.location.origin).href;
  }

  function text(v) { return typeof v === "string" ? v : ""; }

  self.addEventListener("push", function (event) {
    var payload = {};
    try { payload = (event.data && event.data.json()) || {}; } catch (e) { payload = {}; }
    var d = payload.data != null ? payload.data : payload;
    var lang = d.lang === "ar" ? "ar" : "en";
    var options = {
      body: text(d.body),
      lang: lang,
      dir: d.dir === "rtl" || d.dir === "ltr" ? d.dir : (lang === "ar" ? "rtl" : "ltr"),
      icon: ICON,
      badge: BADGE,
      data: { link: text(d.link) || "/learn" },
    };
    // A newer notification with the same tag replaces the old one (one daily nudge, one per review); renotify keeps
    // the replacement audible instead of silent.
    if (text(d.tag)) { options.tag = d.tag; options.renotify = true; }
    // Every push must show a notification, or the browser shows its own generic one.
    event.waitUntil(self.registration.showNotification(text(d.title) || (lang === "ar" ? "درسي" : "Darsi"), options));
  });

  self.addEventListener("notificationclick", function (event) {
    event.notification.close();
    var url = appUrl(event.notification.data && event.notification.data.link);
    event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      var win = null;
      for (var i = 0; i < list.length; i++) {
        if (new URL(list[i].url).origin === self.location.origin) { win = list[i]; break; }
      }
      if (!win) return self.clients.openWindow(url);
      return win.focus().then(function (focused) {
        var c = focused || win;
        if (c.url === url) return c;
        // navigate() only works on windows this worker controls (not a first visit before a reload): open one instead.
        return typeof c.navigate === "function" ? c.navigate(url).then(function (r) { return r || self.clients.openWindow(url); }) : self.clients.openWindow(url);
      }).catch(function () { return self.clients.openWindow(url); });
    }));
  });
})();
