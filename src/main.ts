// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css";
import "./style.css";

// Fix missing marker images
import "./leafletWorkaround.ts";

// Deterministic random number generator
import luck from "./luck.ts";

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

interface Coin {
  cell: Cell;
  serial: number;
}

interface Cache {
  cell: Cell;
  coins: Coin[];
  marker: L.Marker;
}

// State management
const caches: Map<string, Cache> = new Map();
let playerCoins: Coin[] = [];

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

// Custom icon definition
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

// Player marker
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

// Convert latitude–longitude pairs into game cells using a global coordinate system anchored at Null Island
function latLngToCell(lat: number, lng: number): Cell {
  return {
    i: Math.floor(lat / TILE_DEGREES),
    j: Math.floor(lng / TILE_DEGREES),
  };
}

function createCache(cell: Cell, lat: number, lng: number) {
  const cacheMarker = leaflet.marker([lat, lng], {
    icon: cacheIcon,
  });

  const coins: Coin[] = [];
  const coinCount = Math.floor(luck(`${cell.i},${cell.j},coins`) * 10);
  for (let serial = 0; serial < coinCount; serial++) {
    coins.push({ cell, serial });
  }

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
  const coinList = cache.coins.map(coin => `${coin.cell.i}:${coin.cell.j}#${coin.serial}`).join(", ");
  const content = `
        <div>
            <p>Cache at (${cache.cell.i}, ${cache.cell.j})</p>
            <p>Coins: <span id="coins-${cache.cell.i}-${cache.cell.j}">${coinList}</span></p>
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
  if (cache && cache.coins.length > 0) {
    playerCoins.push(...cache.coins);
    cache.coins = [];
    cache.marker.setPopupContent(createCachePopup(cache));
    updateInventoryDisplay();
  }
}

function depositCoins(cell: Cell) {
  const cacheId = `${cell.i},${cell.j}`;
  const cache = caches.get(cacheId);
  if (cache && playerCoins.length > 0) {
    cache.coins.push(...playerCoins);
    playerCoins = [];
    cache.marker.setPopupContent(createCachePopup(cache));
    updateInventoryDisplay();
  }
}

function updateInventoryDisplay() {
  const inventory = document.getElementById("inventory");
  if (inventory) {
    const coinList = playerCoins.map(coin => `${coin.cell.i}:${coin.cell.j}#${coin.serial}`).join(", ");
    inventory.textContent = `Current Coins: ${coinList}`;
  }
}

// Initialize the game
generateCaches();
updateInventoryDisplay();
