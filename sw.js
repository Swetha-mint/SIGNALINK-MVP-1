const CACHE_NAME = "signalink-mvp-2-v1";

const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js?v=20261005-6",
  "./favicon.svg?v=20261005-2",
  "./manifest.webmanifest"
];

const EXTERNAL_ASSETS = [
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/+esm",
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm",
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      await cache.addAll(APP_SHELL);
      for (const url of EXTERNAL_ASSETS) {
        try {
          await cache.add(url);
        } catch (error) {
          console.warn("Optional offline asset was not precached:", url, error);
        }
      }
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  const isOfflineDependency =
    url.origin === self.location.origin ||
    url.origin === "https://cdn.jsdelivr.net" ||
    url.origin === "https://storage.googleapis.com";

  if (!isOfflineDependency) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        if (response && (response.ok || response.type === "opaque")) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      }).catch(() =>
        new Response("SIGNALINK offline resource unavailable.", {
          status: 503,
          headers: { "Content-Type": "text/plain" }
        })
      );
    })
  );
});
