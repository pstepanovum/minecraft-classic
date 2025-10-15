// ==============================================================
// FILE: research/src/ml/logger.js (UPDATED - Session Directories)
// ==============================================================

export class Logger {
  constructor(systemName, serverUrl = "http://localhost:3001", options = {}) {
    this.systemName = systemName;
    this.serverUrl = serverUrl;
    this.sessionId = this.generateSessionId();

    // Configuration options
    this.config = {
      enabled: options.enabled !== false, // Default: enabled
      logInterval: options.logInterval || 100, // Log every N operations
      flushInterval: options.flushInterval || 5000, // Flush every N ms
      bufferSize: options.bufferSize || 50, // Flush when buffer reaches N entries
      logLevel: options.logLevel || "INFO", // MIN, INFO, WARN, ERROR
      sessionDir: options.sessionDir || this.sessionId, // Allow shared session dir
      ...options,
    };

    // NEW: Log file path includes session directory
    this.logFile = `${this.config.sessionDir}/${systemName}_${this.sessionId}.log`;

    this.buffer = [];
    this.flushInterval = null;
    this.operationCount = 0;

    // Start auto-flush
    if (this.config.enabled) {
      this.startAutoFlush();
      this.logHeader();
    }
  }

  generateSessionId() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    return `${year}${month}${day}_${hours}${minutes}${seconds}`;
  }

  logHeader() {
    this.raw(`${"=".repeat(70)}`);
    this.info(`${this.systemName.toUpperCase()} LOGGING SESSION STARTED`);
    this.info(`Session ID: ${this.sessionId}`);
    this.info(`Session Dir: ${this.config.sessionDir}`);
    this.info(`Time: ${new Date().toLocaleString()}`);
    this.info(`Log Interval: Every ${this.config.logInterval} operations`);
    this.raw(`${"=".repeat(70)}\n`);
  }

  startAutoFlush() {
    this.flushInterval = setInterval(() => {
      if (this.buffer.length > 0) {
        this.flush();
      }
    }, this.config.flushInterval);
  }

  stopAutoFlush() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  shouldLog() {
    return (
      this.config.enabled &&
      (this.operationCount % this.config.logInterval === 0 ||
        this.operationCount === 1)
    );
  }

  incrementOperation() {
    this.operationCount++;
  }

  log(message, level = "INFO") {
    if (!this.config.enabled) return;

    // Check log level threshold
    const levels = { MIN: 0, INFO: 1, WARN: 2, ERROR: 3 };
    if (levels[level] < levels[this.config.logLevel]) return;

    const timestamp = new Date().toISOString().substring(11, 23);
    const logEntry =
      level === "RAW" ? message : `[${timestamp}] [${level}] ${message}`;

    this.buffer.push(logEntry);

    // Only console.log important messages
    if (level === "ERROR" || level === "WARN") {
      console.log(logEntry);
    }

    // Flush if buffer is full
    if (this.buffer.length >= this.config.bufferSize) {
      this.flush();
    }
  }

  async flush() {
    if (this.buffer.length === 0) return;

    const content = this.buffer.join("\n") + "\n";
    this.buffer = [];

    try {
      await fetch(`${this.serverUrl}/api/append-log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: this.logFile, // Now includes session directory
          content: content,
        }),
      });
    } catch (error) {
      console.error(`Failed to write ${this.systemName} log:`, error);
    }
  }

  // Logging methods
  min(message) {
    this.log(message, "MIN");
  }

  info(message) {
    this.log(message, "INFO");
  }

  warn(message) {
    this.log(message, "WARN");
  }

  error(message) {
    this.log(message, "ERROR");
  }

  raw(message) {
    this.log(message, "RAW");
  }

  async close() {
    await this.flush();
    this.stopAutoFlush();

    this.raw(`\n${"=".repeat(70)}`);
    this.info(`${this.systemName.toUpperCase()} LOGGING SESSION ENDED`);
    this.info(`Time: ${new Date().toLocaleString()}`);
    this.raw(`${"=".repeat(70)}`);

    await this.flush();
  }
}

export default Logger;
