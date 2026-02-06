/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string }>; };

const APP_SHELL_CACHE = 'photonflux-app-shell-v1';
const STATIC_ASSET_CACHE = 'photonflux-static-assets-v1';
const PLAN_CACHE = 'photonflux-plan-cache-v1';
const ESSENTIAL_ASSETS: string[] = ['/', '/index.html', '/metadata.json'];

self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_SHELL_CACHE);
      await Promise.all(
        ESSENTIAL_ASSETS.map(async asset => {
          try {
            await cache.add(new Request(asset, { cache: 'reload' }));
          } catch (error) {
            console.warn(`[sw] Failed to cache essential asset: ${asset}`, error);
          }
        })
      );
    })()
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  const expectedCaches = new Set([APP_SHELL_CACHE, STATIC_ASSET_CACHE, PLAN_CACHE]);
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter(cacheName => !expectedCaches.has(cacheName) && !cacheName.startsWith('workbox-precache'))
          .map(cacheName => caches.delete(cacheName))
      );
    })()
  );
  clientsClaim();
});

self.addEventListener('message', event => {
  if (event.data && (event.data.type === 'SKIP_WAITING' || event.data === 'SKIP_WAITING')) {
    self.skipWaiting();
  }
});

const manifestEntries = self.__WB_MANIFEST ?? [];
precacheAndRoute(manifestEntries);
cleanupOutdatedCaches();

registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({
    cacheName: APP_SHELL_CACHE,
    networkTimeoutSeconds: 5,
  })
);

registerRoute(
  ({ request }) => ['style', 'script', 'font'].includes(request.destination),
  new StaleWhileRevalidate({
    cacheName: STATIC_ASSET_CACHE,
  })
);

registerRoute(
  ({ url, request }) => request.method === 'GET' && url.pathname.startsWith('/api/store/'),
  new NetworkFirst({
    cacheName: PLAN_CACHE,
    networkTimeoutSeconds: 5,
    plugins: [
      {
        cacheWillUpdate: async ({ response }) => {
          if (!response || !response.ok) {
            return null;
          }
          return response;
        },
      },
    ],
  })
);
