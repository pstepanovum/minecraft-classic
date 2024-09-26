const CONFIG = {
    SERVER_URL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:3000'
        : 'https://minecraft-classic-production.up.railway.app'
};