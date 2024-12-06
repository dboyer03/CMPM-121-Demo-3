// Demo Assignment 3
// Dylan Boyer

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
const TILE_DEGREES = 0.0001; // Size of each tile in degrees
const NEIGHBORHOOD_SIZE = 8; // Size of the neighborhood around the player
const CACHE_SPAWN_PROBABILITY = 0.1; // Probability of spawning a cache in a tile

// Interface representing a grid cell
interface Cell {
  i: number;
  j: number;
}

// Interface representing a coin
interface Coin {
  cell: Cell;
  serial: number;
}

// Interface representing a cache
interface Cache {
  cell: Cell;
  coins: Coin[];
  marker: L.Marker;
  toMemento(): string;
  fromMemento(memento: string): void;
}

// State management
const caches: Map<string, Cache> = new Map();
const knownTiles: Map<string, Cell> = new Map();
let playerCoins: Coin[] = [];
let playerLat = PLAYER_LAT;
let playerLng = PLAYER_LNG;

// Additional state management
let locationWatcher: number | null = null;
let movementHistory: L.Polyline | null = null;
const locationHistory: [number, number][] = [];

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

// Custom icon definition for the player marker
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

// Custom icon definition for the cache marker
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

// Convert latitude–longitude pairs into game cells using a global coordinate system anchored at Null Island
function latLngToCell(lat: number, lng: number): Cell {
  const i = Math.floor(lat / TILE_DEGREES);
  const j = Math.floor(lng / TILE_DEGREES);
  const key = `${i},${j}`;
  if (!knownTiles.has(key)) {
    knownTiles.set(key, { i, j });
  }
  return knownTiles.get(key)!;
}

// Create marker factory function
function createCacheMarker(lat: number, lng: number): L.Marker {
  return leaflet.marker([lat, lng], {
    icon: cacheIcon,
  });
}

// Extract coin generation to a separate function
function generateCoinsForCell(cell: Cell): Coin[] {
  const coins: Coin[] = [];
  const coinCount = Math.floor(luck(`${cell.i},${cell.j},coins`) * 10);
  for (let serial = 0; serial < coinCount; serial++) {
    coins.push({ cell, serial });
  }
  return coins;
}

// Modified cache creation function with improved cohesion
function createCache(cell: Cell, lat: number, lng: number) {
  const cacheMarker = createCacheMarker(lat, lng);
  const coins = generateCoinsForCell(cell);

  const cache: Cache = {
    cell,
    coins,
    marker: cacheMarker,
    toMemento() {
      return JSON.stringify(this.coins);
    },
    fromMemento(memento: string) {
      this.coins = JSON.parse(memento);
    },
  };

  const cacheId = `${cell.i},${cell.j}`;
  caches.set(cacheId, cache);

  cacheMarker.bindPopup(createCachePopup(cache));
  cacheMarker.addTo(map);
}

// Create a popup for the cache displaying its coins and actions
function createCachePopup(cache: Cache): HTMLElement {
  const container = document.createElement("div");
  const coinList = cache.coins.map((coin) => {
    const coinId = `${coin.cell.i}:${coin.cell.j}#${coin.serial}`;
    return `<span class="coin-id" style="cursor: pointer; text-decoration: underline;" 
            data-lat="${coin.cell.i * TILE_DEGREES}" 
            data-lng="${coin.cell.j * TILE_DEGREES}">${coinId}</span>`;
  }).join(", ");

  const content = `
    <div>
      <p>Cache at (${cache.cell.i}, ${cache.cell.j})</p>
      <p>Coins: <span id="coins-${cache.cell.i}-${cache.cell.j}">${coinList}</span></p>
      <button class="collect-btn">Collect</button>
      <button class="deposit-btn">Deposit</button>
    </div>
  `;

  container.innerHTML = content;

  container.querySelectorAll(".coin-id").forEach((elem) => {
    elem.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const lat = parseFloat(target.dataset.lat || "0");
      const lng = parseFloat(target.dataset.lng || "0");
      map.setView([lat, lng]);
    });
  });

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

// Collect coins from the specified cache cell
function collectCoins(cell: Cell) {
  const cacheId = `${cell.i},${cell.j}`;
  const cache = caches.get(cacheId);
  if (cache && cache.coins.length > 0) {
    playerCoins.push(...cache.coins);
    cache.coins = [];
    cache.marker.setPopupContent(createCachePopup(cache));
    updateInventoryDisplay();
    saveGameState();
  }
}

// Deposit coins into the specified cache cell
function depositCoins(cell: Cell) {
  const cacheId = `${cell.i},${cell.j}`;
  const cache = caches.get(cacheId);
  if (cache && playerCoins.length > 0) {
    cache.coins.push(...playerCoins);
    playerCoins = [];
    cache.marker.setPopupContent(createCachePopup(cache));
    updateInventoryDisplay();
    saveGameState();
  }
}

// Update the inventory display with the current coins
function updateInventoryDisplay() {
  const inventory = document.getElementById("inventory");
  if (inventory) {
    const coinElements = playerCoins.map((coin) => {
      const coinId = `${coin.cell.i}:${coin.cell.j}#${coin.serial}`;
      return `<span class="coin-id" style="cursor: pointer; text-decoration: underline;" 
              data-lat="${coin.cell.i * TILE_DEGREES}" 
              data-lng="${coin.cell.j * TILE_DEGREES}">${coinId}</span>`;
    }).join(", ");

    inventory.innerHTML = `Current Coins: ${coinElements}`;

    // Add click handlers for coin identifiers
    inventory.querySelectorAll(".coin-id").forEach((elem) => {
      elem.addEventListener("click", (e) => {
        const target = e.target as HTMLElement;
        const lat = parseFloat(target.dataset.lat || "0");
        const lng = parseFloat(target.dataset.lng || "0");
        map.setView([lat, lng]);
      });
    });
  }
}

// Generate caches around the player's location
function generateCaches(centerLat: number, centerLng: number) {
  for (let i = -NEIGHBORHOOD_SIZE; i <= NEIGHBORHOOD_SIZE; i++) {
    for (let j = -NEIGHBORHOOD_SIZE; j <= NEIGHBORHOOD_SIZE; j++) {
      const lat = centerLat + i * TILE_DEGREES;
      const lng = centerLng + j * TILE_DEGREES;
      const cell = latLngToCell(lat, lng);
      const cacheId = `${cell.i},${cell.j}`;

      // Only create a cache if:
      // 1. It doesn't already exist
      // 2. The random check based on absolute coordinates passes
      if (
        !caches.has(cacheId) &&
        luck(`cache_at_${cell.i},${cell.j}`) < CACHE_SPAWN_PROBABILITY
      ) {
        createCache(cell, lat, lng);
      }
    }
  }
}

// Load saved state from localStorage
function loadGameState() {
  const savedState = localStorage.getItem("gameState");
  if (savedState) {
    const state = JSON.parse(savedState);
    playerLat = state.playerLat;
    playerLng = state.playerLng;
    playerCoins = state.playerCoins;
    locationHistory.push(...state.locationHistory);

    // Clear existing caches and restore saved cache states
    caches.clear();

    // Restore cache states with their coins
    state.caches.forEach(
      (cacheState: { lat: number; lng: number; memento: string }) => {
        const cell = latLngToCell(cacheState.lat, cacheState.lng);
        const lat = cell.i * TILE_DEGREES;
        const lng = cell.j * TILE_DEGREES;

        // Create the cache if it doesn't exist
        const cacheMarker = leaflet.marker([lat, lng], {
          icon: cacheIcon,
        });

        const cache: Cache = {
          cell,
          coins: [],
          marker: cacheMarker,
          toMemento() {
            return JSON.stringify(this.coins);
          },
          fromMemento(memento: string) {
            this.coins = JSON.parse(memento);
          },
        };

        // Restore the cache's state from the memento
        cache.fromMemento(cacheState.memento);

        // Add the cache to the map
        const cacheId = `${cell.i},${cell.j}`;
        caches.set(cacheId, cache);
        cacheMarker.bindPopup(createCachePopup(cache));
      },
    );

    // Update display
    playerMarker.setLatLng([playerLat, playerLng]);
    map.setView([playerLat, playerLng]);
    updateVisibleCaches();
    updateInventoryDisplay();
    drawMovementHistory();
  } else {
    // If no saved state exists, generate initial caches
    generateCaches(playerLat, playerLng);
  }
}

// Save current state to localStorage
function saveGameState() {
  const state = {
    playerLat,
    playerLng,
    playerCoins,
    locationHistory,
    caches: Array.from(caches.values()).map((cache) => ({
      lat: cache.cell.i * TILE_DEGREES,
      lng: cache.cell.j * TILE_DEGREES,
      memento: cache.toMemento(),
    })),
  };
  localStorage.setItem("gameState", JSON.stringify(state));
}

// Draw movement history on the map
function drawMovementHistory() {
  if (movementHistory) {
    map.removeLayer(movementHistory);
  }
  movementHistory = leaflet.polyline(locationHistory, {
    color: "blue",
    weight: 2,
    opacity: 0.5,
  }).addTo(map);
}

// Update player position and related state
function updatePlayerPosition(lat: number, lng: number) {
  playerLat = lat;
  playerLng = lng;
  playerMarker.setLatLng([lat, lng]);
  map.setView([lat, lng]);
  locationHistory.push([lat, lng]);
  drawMovementHistory();
  generateCaches(lat, lng);
  updateVisibleCaches();
  saveGameState();
}

// Handle geolocation
function startLocationTracking() {
  if ("geolocation" in navigator) {
    locationWatcher = navigator.geolocation.watchPosition(
      (position) => {
        updatePlayerPosition(
          position.coords.latitude,
          position.coords.longitude,
        );
      },
      (error) => {
        console.error("Error getting location:", error);
        stopLocationTracking();
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 5000,
      },
    );

    // Visual feedback that tracking is active
    const geolocateButton = document.getElementById("geolocate");
    if (geolocateButton) {
      geolocateButton.style.backgroundColor = "#646cff";
    }
  } else {
    alert("Geolocation is not supported by your browser");
  }
}

function stopLocationTracking() {
  if (locationWatcher !== null) {
    navigator.geolocation.clearWatch(locationWatcher);
    locationWatcher = null;

    // Visual feedback that tracking is inactive
    const geolocateButton = document.getElementById("geolocate");
    if (geolocateButton) {
      geolocateButton.style.backgroundColor = "";
    }
  }
}

// Reset game state
function resetGameState() {
  if (
    confirm(
      "Are you sure you want to reset the game? This will erase all progress and location history.",
    )
  ) {
    localStorage.removeItem("gameState");
    playerLat = PLAYER_LAT;
    playerLng = PLAYER_LNG;
    playerCoins = [];
    locationHistory.length = 0;
    caches.clear();
    if (movementHistory) {
      map.removeLayer(movementHistory);
      movementHistory = null;
    }
    stopLocationTracking();
    generateCaches(playerLat, playerLng);
    updateVisibleCaches();
    updateInventoryDisplay();
  }
}

// Modify the movePlayer function to include history
function movePlayer(dLat: number, dLng: number) {
  updatePlayerPosition(playerLat + dLat, playerLng + dLng);
}

function updateVisibleCaches() {
  caches.forEach((cache, _cacheId) => {
    const distance = Math.sqrt(
      Math.pow(cache.cell.i * TILE_DEGREES - playerLat, 2) +
        Math.pow(cache.cell.j * TILE_DEGREES - playerLng, 2),
    );
    if (distance <= NEIGHBORHOOD_SIZE * TILE_DEGREES) {
      cache.marker.addTo(map);
    } else {
      map.removeLayer(cache.marker);
    }
  });
}

// Initialize the game
loadGameState();
updateInventoryDisplay();
updateVisibleCaches();

// Add event listeners for movement buttons
document.getElementById("moveNorth")?.addEventListener(
  "click",
  () => movePlayer(TILE_DEGREES, 0),
);
document.getElementById("moveSouth")?.addEventListener(
  "click",
  () => movePlayer(-TILE_DEGREES, 0),
);
document.getElementById("moveWest")?.addEventListener(
  "click",
  () => movePlayer(0, -TILE_DEGREES),
);
document.getElementById("moveEast")?.addEventListener(
  "click",
  () => movePlayer(0, TILE_DEGREES),
);

// Event listeners for new buttons
document.getElementById("geolocate")?.addEventListener("click", () => {
  if (locationWatcher === null) {
    startLocationTracking();
  } else {
    stopLocationTracking();
  }
});

document.getElementById("reset")?.addEventListener("click", resetGameState);
