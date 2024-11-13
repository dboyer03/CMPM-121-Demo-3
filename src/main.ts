import leaflet from "leaflet";
import luck from "./luck.ts";
import "./leafletWorkaround.ts";

// Initial player location
const PLAYER_LAT = 36.98949379578401;
const PLAYER_LNG = -122.06277128548504;
const TILE_DEGREES = 0.0001;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

interface Cell {
  i: number;
  j: number;
}

interface Cache {
  cell: Cell;
  coins: number;
  marker: L.Marker;
}

// State management
const caches: Map<string, Cache> = new Map();
let playerCoins = 0;

// Create the map with proper zoom constraints
const map = leaflet.map("map", {
  center: [PLAYER_LAT, PLAYER_LNG],
  zoom: 19,
  minZoom: 19,
  maxZoom: 19,
  zoomControl: false,
  scrollWheelZoom: false,
});

// Add the tile layer with proper attribution
leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

// After your initial constants, add this custom icon definition
const playerIcon = leaflet.icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Then modify your player marker creation to use this icon
const playerMarker = leaflet.marker([PLAYER_LAT, PLAYER_LNG], {
  icon: playerIcon,
});
playerMarker.bindTooltip("That's you!");
playerMarker.addTo(map);

const cacheIcon = leaflet.icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function generateCaches() {
  for (let i = -NEIGHBORHOOD_SIZE; i <= NEIGHBORHOOD_SIZE; i++) {
    for (let j = -NEIGHBORHOOD_SIZE; j <= NEIGHBORHOOD_SIZE; j++) {
      if (luck(`${i},${j}`) < CACHE_SPAWN_PROBABILITY) {
        const lat = PLAYER_LAT + i * TILE_DEGREES;
        const lng = PLAYER_LNG + j * TILE_DEGREES;
        createCache({ i, j }, lat, lng);
      }
    }
  }
}

function createCache(cell: Cell, lat: number, lng: number) {
  const cacheMarker = leaflet.marker([lat, lng], {
    icon: cacheIcon,
  });
  const coins = Math.floor(luck(`${cell.i},${cell.j},coins`) * 10);

  const cache: Cache = {
    cell,
    coins,
    marker: cacheMarker,
  };

  const cacheId = `${cell.i},${cell.j}`;
  caches.set(cacheId, cache);

  cacheMarker.bindPopup(createCachePopup(cache));
  cacheMarker.addTo(map);
}

function createCachePopup(cache: Cache): HTMLElement {
  const container = document.createElement("div");
  const content = `
        <div>
            <p>Cache at (${cache.cell.i}, ${cache.cell.j})</p>
            <p>Coins: <span id="coins-${cache.cell.i}-${cache.cell.j}">${cache.coins}</span></p>
            <button class="collect-btn">Collect</button>
            <button class="deposit-btn">Deposit</button>
        </div>
    `;
  container.innerHTML = content;

  container.querySelector(".collect-btn")?.addEventListener(
    "click",
    () => collectCoins(cache.cell),
  );
  container.querySelector(".deposit-btn")?.addEventListener(
    "click",
    () => depositCoins(cache.cell),
  );

  return container;
}

function collectCoins(cell: Cell) {
  const cacheId = `${cell.i},${cell.j}`;
  const cache = caches.get(cacheId);
  if (cache && cache.coins > 0) {
    playerCoins += cache.coins;
    cache.coins = 0;
    cache.marker.setPopupContent(createCachePopup(cache));
    updateInventoryDisplay();
  }
}

function depositCoins(cell: Cell) {
  const cacheId = `${cell.i},${cell.j}`;
  const cache = caches.get(cacheId);
  if (cache && playerCoins > 0) {
    cache.coins += playerCoins;
    playerCoins = 0;
    cache.marker.setPopupContent(createCachePopup(cache));
    updateInventoryDisplay();
  }
}

function updateInventoryDisplay() {
  const inventory = document.getElementById("inventory");
  if (inventory) {
    inventory.textContent = `Current Coins: ${playerCoins}`;
  }
}

// Initialize the game
generateCaches();
updateInventoryDisplay();
