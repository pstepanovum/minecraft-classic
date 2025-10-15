// ==============================================================
// FILE: research/src/ml/log/session-manager.js
// ==============================================================
// Manages shared session directory for all loggers in a training run

class SessionManager {
  constructor() {
    this.sessionId = null;
    this.sessionDir = null;
  }

  initSession() {
    if (!this.sessionId) {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      const hours = String(now.getHours()).padStart(2, "0");
      const minutes = String(now.getMinutes()).padStart(2, "0");
      const seconds = String(now.getSeconds()).padStart(2, "0");

      this.sessionId = `${year}${month}${day}_${hours}${minutes}${seconds}`;
      this.sessionDir = this.sessionId;

      console.log(`📁 Training session: ${this.sessionDir}`);
    }

    return this.sessionDir;
  }

  getSessionDir() {
    if (!this.sessionDir) {
      return this.initSession();
    }
    return this.sessionDir;
  }

  reset() {
    this.sessionId = null;
    this.sessionDir = null;
  }
}

// Global singleton instance
const sessionManager = new SessionManager();

export default sessionManager;
