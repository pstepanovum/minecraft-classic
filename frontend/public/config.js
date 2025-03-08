//-------------------------------------------------------------
//                  Frontend configuration
//-------------------------------------------------------------
const CONFIG = {
    SERVER_URL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:3000'
        : 'https://minecraft-classic-production.up.railway.app',
    GAME_MODES: {
        SINGLEPLAYER: '/modes/singleplayer',
        MULTIPLAYER: '/modes/multiplayer',
        RESEARCH: '/modes/research'
    }
};

// Add mode detection
CONFIG.CURRENT_MODE = window.location.pathname.split('/')[2] || 'singleplayer';

