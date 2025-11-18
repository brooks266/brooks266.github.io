const CACHE_NAME = 'map-app-v6';  // Bump version for cache busting
const urlsToCache = [
  '/Interactive-Map.io/',
  '/Interactive-Map.io/index.html',
  '/Interactive-Map.io/login.html',
  '/Interactive-Map.io/settings.html',
  '/Interactive-Map.io/location.html',
  '/Interactive-Map.io/manifest.json',
  // CSS files
  '/Interactive-Map.io/css/common.css',
  '/Interactive-Map.io/css/leaflet.css',
  '/Interactive-Map.io/css/MarkerCluster.css',
  '/Interactive-Map.io/css/MarkerCluster.Default.css',
  // JavaScript files
  '/Interactive-Map.io/js/leaflet.js',
  '/Interactive-Map.io/js/leaflet.markercluster.js',
  '/Interactive-Map.io/js/firebase-config.js',
  '/Interactive-Map.io/js/utils.js',
  // Leaflet marker images
  '/Interactive-Map.io/images/marker-icon.png',
  '/Interactive-Map.io/images/marker-icon-2x.png',
  '/Interactive-Map.io/images/marker-shadow.png',
  // PWA icons
  '/Interactive-Map.io/icons/icon-192.png',
  '/Interactive-Map.io/icons/icon-512.png'
];

// Install event: Cache core files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
    .then(cache => cache.addAll(urlsToCache))
    .then(() => self.skipWaiting())
  );
});

// Activate event: Clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event: Optimized caching strategies
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Ignore non-GET requests and external domains
  if (event.request.method !== 'GET' || !url.origin.includes(self.location.origin.split('.')[0])) {
    return;
  }
  
  // Cache-first strategy for static assets
  if (event.request.destination === 'style' ||
      event.request.destination === 'script' ||
      event.request.destination === 'image' ||
      event.request.url.includes('.css') ||
      event.request.url.includes('.js') ||
      event.request.url.includes('.png') ||
      event.request.url.includes('.jpg')) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Network-first for HTML pages (to get updates)
  if (event.request.destination === 'document') {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Default cache-first for other requests
  event.respondWith(cacheFirst(event.request));
});

// Cache-first strategy: Try cache, then network
async function cacheFirst(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log('Cache-first failed:', error);
    // For images, return a placeholder if available
    if (request.destination === 'image') {
      return caches.match('/Interactive-Map.io/images/marker-icon.png');
    }
    return new Response('Offline: Resource not available.', { status: 503 });
  }
}

// Network-first strategy: Try network, fallback to cache
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log('Network-first failed, trying cache:', error);
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    // Fallback to cached index.html for navigation requests
    return caches.match('/Interactive-Map.io/index.html');
  }
}
   




