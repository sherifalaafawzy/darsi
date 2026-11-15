/*
 * Darsi: what a phone saved for offline survives app updates (TECHNICAL.md "Offline and caching"). Workbox's sw.js
 * loads this file with importScripts (vite.config.ts), so it is plain JS for old WebViews: no modules, no optional
 * chaining, nothing newer than ES2017.
 *
 * "darsi-saved" holds the chunks that downloaded courses and "Save all labs" need beyond the precache: the page pins them
 * by group ("code", "lab:<id>", "pack:<id>", "labs" for every lab) in /__darsi/pins.json (platform/offline.ts), and
 * offline-manifest.json lists each group's files. Chunk names change with every build, so:
 * - install: the new version fetches its own files for the pinned groups before it may take over. A phone that goes
 *   offline right after the update still has them. Phones on the Chrome 61 build keep every legacy file they used.
 *   No connection fails the install, and the browser tries again later; the old version keeps working meanwhile.
 * - activate: the previous version's files leave darsi-saved.
 */
/* eslint-env serviceworker */
(function () {
  "use strict";
  var SAVED = "darsi-saved";
  var PINS = "/__darsi/pins.json";
  var KEEP = "/__darsi/keep.json";
  var CHUNKS = ["darsi-saved", "darsi-chunks", "darsi-labs"];

  function pathOf(url) { return new URL(url, self.location.origin).pathname; }
  /** A request that got no answer at all (no connection): the only failure that may hold an update back. */
  function net(url, init) {
    return fetch(url, init).catch(function (e) { var err = new Error("offline: " + (e && e.message)); err.offline = true; throw err; });
  }
  /** A built file's name without its 8-character hash: "assets/lab-bias-legacy-Ab_d-123.js" → "assets/lab-bias-legacy.js". */
  function stable(path) { return path.replace(/-[\w-]{8}(\.(?:js|css))$/, "$1"); }
  function unique(list) { var seen = {}; return list.filter(function (x) { if (seen[x]) return false; seen[x] = true; return true; }); }

  /** JSON from the network: null when the server has no such file, a rejection when there is no connection. */
  async function fetchJSON(path) {
    var res = await net(path, { cache: "no-store" });
    return res.ok ? res.json().catch(function () { return null; }) : null;
  }
  async function readJSON(cache, key) {
    var res = await cache.match(key);
    return res ? res.json().catch(function () { return null; }) : null;
  }
  /** The built files (/assets/…) in this phone's chunk caches. */
  async function cachedAssets() {
    var names = await caches.keys(), out = [];
    for (var i = 0; i < CHUNKS.length; i++) {
      if (names.indexOf(CHUNKS[i]) < 0) continue;
      var keys = await (await caches.open(CHUNKS[i])).keys();
      for (var j = 0; j < keys.length; j++) { var p = pathOf(keys[j].url); if (p.indexOf("/assets/") === 0) out.push(p); }
    }
    return unique(out);
  }
  /**
   * Before pins existed (the first update with this file), the caches show what downloads needed: the code steps and the
   * light lessons' packs. Labs were never saved with a course then; the page pins those itself (Downloads).
   */
  function inferGroups(assets) {
    var groups = [];
    assets.forEach(function (p) {
      if (/-legacy-/.test(p)) return;
      var m;
      if (/^\/assets\/CodeSteps-/.test(p)) groups.push("code");
      else if ((m = /^\/assets\/lessonstudio-pack-([a-z]+)-/.exec(p))) groups.push("pack:" + m[1]);
    });
    return unique(groups);
  }
  /** The files of these groups in a manifest ("labs" is every lab). */
  function filesOf(manifest, groups) {
    var all = (manifest && manifest.groups) || {}, files = [];
    var want = groups.indexOf("labs") >= 0 ? groups.concat(Object.keys(all).filter(function (g) { return g.indexOf("lab:") === 0; })) : groups;
    unique(want).forEach(function (g) { (all[g] || []).forEach(function (f) { files.push("/" + f); }); });
    return unique(files);
  }

  /**
   * Copies (from another cache) or fetches each file into darsi-saved. A file the server doesn't have is skipped. A full
   * phone stops it there: the update goes ahead without the rest, and Downloads offers the course again.
   */
  async function save(saved, files) {
    // A web page where a built file should be (a Wi-Fi sign-in page answers every request): never kept as the file.
    function isPage(res) { return (res.headers.get("Content-Type") || "").indexOf("text/html") >= 0; }
    var kept = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (await saved.match(f)) { kept.push(f); continue; }
      var res = await caches.match(f, { ignoreVary: true });
      if (!res) {
        res = await net(f); // no connection: the install fails and is tried again later
        if (!res.ok || isPage(res)) continue;
      }
      try { await saved.put(f, res); } catch (e) { break; }
      kept.push(f);
    }
    return kept;
  }

  async function carryOver() {
    var had = await caches.has(SAVED);
    var assets = await cachedAssets();
    var saved = had ? await caches.open(SAVED) : null;
    // A list from an earlier update must never decide what this one's activation deletes.
    if (saved) await saved.delete(KEEP);
    var pins = saved ? await readJSON(saved, PINS) : null;
    var groups = pins && Array.isArray(pins.groups) ? pins.groups : inferGroups(assets);
    var legacy = assets.filter(function (p) { return /-legacy[-.]/.test(p); });
    if (!had && !groups.length && !legacy.length) return; // nothing saved on this phone
    var want = [], known = true;
    if (groups.length) {
      var manifest = await fetchJSON("/offline-manifest.json");
      if (!manifest || !manifest.groups) known = false;
      want = want.concat(filesOf(manifest, groups));
    }
    if (legacy.length) {
      // By name without the hash. Two chunks can share a name ("esm"): then the phone gets both new ones.
      var list = await fetchJSON("/offline-legacy.json"), byName = {};
      if (!list || !Array.isArray(list.files)) known = false;
      ((list && list.files) || []).forEach(function (f) { var k = stable("/" + f); (byName[k] = byName[k] || []).push("/" + f); });
      legacy.forEach(function (p) { want = want.concat(byName[stable(p)] || []); });
    }
    saved = saved || await caches.open(SAVED);
    var kept = await save(saved, unique(want));
    if (!pins && groups.length) await saved.put(PINS, new Response(JSON.stringify({ v: 1, groups: groups }), { headers: { "Content-Type": "application/json" } }));
    // A list that couldn't be read (a Wi-Fi sign-in page answered, say) writes no keep list: the activation then deletes
    // nothing, and the new version's first check online (Downloads useOfflineRefresh) fetches its files and drops the old.
    if (known) await saved.put(KEEP, new Response(JSON.stringify(kept), { headers: { "Content-Type": "application/json" } }));
  }

  /** The new version is in charge: the files only the previous one used leave darsi-saved. */
  async function cleanUp() {
    if (!(await caches.has(SAVED))) return;
    var saved = await caches.open(SAVED);
    var keep = await readJSON(saved, KEEP);
    if (!Array.isArray(keep)) return;
    var keys = await saved.keys();
    await Promise.all(keys.filter(function (r) {
      var p = pathOf(r.url);
      return p.indexOf("/assets/") === 0 && keep.indexOf(p) < 0;
    }).map(function (r) { return saved.delete(r); }));
  }

  // Only a missing connection holds the update back (the browser tries again later). Anything else, such as a phone with
  // no room left, must never stop Darsi from updating: the new version goes ahead with what could be saved.
  self.addEventListener("install", function (event) {
    event.waitUntil(carryOver().catch(function (e) { if (e && e.offline) throw e; }));
  });
  self.addEventListener("activate", function (event) { event.waitUntil(cleanUp().catch(function () {})); });
})();
