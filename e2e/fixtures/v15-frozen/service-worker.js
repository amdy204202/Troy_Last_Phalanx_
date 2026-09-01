const CACHE_NAME = 'troy-last-phalanx-v15-run-2';
const APP_SHELL = [
  './', './index.html', './css/game.css', './js/game-v15.js', './js/combat-rules-v15.js', './js/run-rules-v15.js', './manifest.webmanifest',
  './assets/backgrounds/ground.webp', './assets/bosses/hector-v15.png', './assets/bosses/nessos-chariot-v15.png',
  './assets/bosses/paris-v15.png','./assets/bosses/sarpedon-v15.png','./assets/bosses/aeneas-v15.png','./assets/bosses/penthesilea-v15.png','./assets/bosses/memnon-v15.png',
  './assets/heroes/telamon.png','./assets/heroes/achileon.png','./assets/heroes/calchas.png',
  './assets/animations/telamon-strip-v10.png','./assets/animations/achileon-strip-v10.png','./assets/animations/calchas-strip-v10.png','./assets/animations/greek-heroes-atlas-v14.png','./assets/animations/calchas-female-atlas-v14.png','./assets/animations/troy-defense-atlas-v15.png','./assets/animations/troy-defense-atlas-v15.json','./assets/obstacles/greek-obstacles-atlas-v15.png','./assets/obstacles/greek-obstacles-atlas-v15.json',
  './assets/ui/dodge-roll-v10.png','./assets/ui/ultimate-v10.png','./assets/elites/trojan-elite-atlas-v10.png',
  './assets/effects/bronze-impact.png', './assets/icons/icon-192.png', './assets/icons/icon-512.png',
  './assets/audio/battle-loop.wav','./assets/audio/boss-loop.wav','./assets/audio/spear.wav','./assets/audio/sword.wav','./assets/audio/shield.wav','./assets/audio/pickup.wav','./assets/audio/level.wav','./assets/audio/evolve.wav','./assets/audio/boss-horn.wav','./assets/audio/revive.wav',
  './assets/sprites/hoplite.webp', './assets/sprites/hoplite-walk.webp', './assets/sprites/trojan-walk.webp',
  './assets/sprites/raider.webp', './assets/sprites/skirmisher.webp', './assets/sprites/archer.webp',
  './assets/sprites/shieldman.webp', './assets/sprites/slinger.webp', './assets/sprites/standard.webp', './assets/sprites/trojan-forces-atlas-v15.png','./assets/sprites/trojan-forces-atlas-v15.json', './assets/heroes/calchas-female-v14.png', './assets/weapons/greek-weapons-atlas-v14.png',
  './assets/sprites/spear-walk.webp', './assets/sprites/sword-walk.webp', './assets/sprites/javelin-walk.webp', './assets/sprites/shield-walk.webp',
  './assets/weapons/greek-spear-v14.png','./assets/weapons/greek-sword-v14.png','./assets/weapons/greek-javelin-v14.png','./assets/weapons/greek-shield-v14.png','./assets/weapons/greek-discus-v14.png','./assets/weapons/greek-firepot-v14.png','./assets/weapons/greek-sling-v14.png'
  ,'./assets/weapons/bow-v14.png','./assets/weapons/flail-v14.png','./assets/weapons/thunder-v14.png','./assets/weapons/caltrops-v14.png','./assets/weapons/ram-v14.png','./assets/weapons/greek-arsenal-atlas-v14.png'
  ,'./assets/sprites/cavalry-v15.png','./assets/sprites/axeman-v15.png','./assets/sprites/lancer-v15.png','./assets/sprites/medic-v15.png','./assets/sprites/firearcher-v15.png','./assets/sprites/netter-v15.png','./assets/sprites/giant-v15.png','./assets/sprites/horncaller-v15.png','./assets/sprites/ghost-v15.png','./assets/sprites/engineer-v15.png','./assets/sprites/amazonrider-v15.png','./assets/sprites/assassin-v15.png'
  ,'./assets/relics/owlseal-v14.png','./assets/relics/bloodspear-v14.png','./assets/relics/stormamphora-v14.png','./assets/relics/wingclasp-v14.png','./assets/relics/fleeceknot-v14.png','./assets/relics/gorgonshard-v14.png','./assets/relics/labyrinthgear-v14.png','./assets/relics/healingcup-v14.png','./assets/relics/laurelbrooch-v14.png','./assets/relics/moonstone-v14.png','./assets/relics/wardrum-v14.png','./assets/relics/bowstring-v14.png','./assets/relics/forgehammer-v14.png','./assets/relics/obsidianeye-v14.png','./assets/relics/seacharm-v14.png','./assets/relics/brokencrown-v14.png','./assets/relics/trojan-relics-atlas-v14.png'
  ,'./assets/redesign/troy-title-background-v14.png','./assets/redesign/hoplite-motion-concept-v14.png','./assets/redesign/trojan-motion-concept-v14.png','./assets/redesign/combat-vfx-atlas-v14.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request,{ignoreSearch:true}).then(cached => cached || fetch(event.request).then(response => {
    const copy = response.clone(); caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)); return response;
  }).catch(() => caches.match('./index.html'))));
});
