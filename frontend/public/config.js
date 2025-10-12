// ==============================================================
// FILE: src/config.js
// ==============================================================

const CONFIG = {
  SERVER_URL:
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
      ? "http://localhost:3000"
      : "https://minecraft-classic-production.up.railway.app",

  // NEW: Python PPO WebSocket (optional - already hardcoded in websocket-client.js)
  PPO_WEBSOCKET_URL: "ws://localhost:8765",

  GAME_MODES: {
    SINGLEPLAYER: "/modes/singleplayer",
    MULTIPLAYER: "/modes/multiplayer",
    RESEARCH: "/modes/research",
  },
};

CONFIG.CURRENT_MODE = window.location.pathname.split("/")[2] || "singleplayer";
