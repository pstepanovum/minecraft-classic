// ==============================================================
// FILE: frontend/log-server.js
// ==============================================================

const express = require("express");
const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = 3001;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Log directory
const LOG_DIR = path.join(__dirname, "training_logs");

// Ensure log directory exists synchronously on startup
function ensureLogDirSync() {
  try {
    if (!fsSync.existsSync(LOG_DIR)) {
      fsSync.mkdirSync(LOG_DIR, { recursive: true });
      console.log(`✅ Created log directory: ${LOG_DIR}`);
    } else {
      console.log(`✅ Log directory exists: ${LOG_DIR}`);
    }
  } catch (error) {
    console.error("❌ Failed to create log directory:", error);
    process.exit(1);
  }
}

// Ensure directory exists (async, for routes)
async function ensureDir(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if (error.code !== "EEXIST") {
      console.error("❌ Failed to ensure directory:", error);
    }
  }
}

// APPEND to log file (for real-time updates) - NOW WITH SUBDIRECTORIES
app.post("/api/append-log", async (req, res) => {
  try {
    const { filename, content } = req.body;

    if (!filename || content === undefined) {
      return res.status(400).json({ error: "Missing filename or content" });
    }

    // NEW: Handle subdirectory structure
    // filename can be like "20251014_034634/ppo_training_20251014_034634.log"
    const normalizedPath = filename
      .split("/")
      .map((part) => path.basename(part))
      .join("/");
    const filePath = path.join(LOG_DIR, normalizedPath);
    const fileDir = path.dirname(filePath);

    // Ensure session directory exists
    await ensureDir(fileDir);

    // Check if file exists
    let fileExists = false;
    try {
      await fs.access(filePath);
      fileExists = true;
    } catch {
      fileExists = false;
    }

    // Append to file (creates if doesn't exist)
    await fs.appendFile(filePath, content, "utf8");

    // Log to console (timestamp only, not full content for performance)
    const timestamp = new Date().toISOString().substring(11, 19);
    const action = fileExists ? "✍️ " : "📝";
    console.log(
      `[${timestamp}] ${action} ${normalizedPath} (+${content.length} bytes)`
    );

    res.json({ success: true, path: filePath });
  } catch (error) {
    console.error("❌ Error appending to log:", error);
    res.status(500).json({ error: error.message });
  }
});

// OVERWRITE log file (for initial save or replace)
app.post("/api/save-log", async (req, res) => {
  try {
    const { filename, content } = req.body;

    if (!filename || !content) {
      return res.status(400).json({ error: "Missing filename or content" });
    }

    const normalizedPath = filename
      .split("/")
      .map((part) => path.basename(part))
      .join("/");
    const filePath = path.join(LOG_DIR, normalizedPath);
    const fileDir = path.dirname(filePath);

    // Ensure directory exists
    await ensureDir(fileDir);

    await fs.writeFile(filePath, content, "utf8");

    console.log(`✅ Saved: ${normalizedPath}`);
    res.json({ success: true, path: filePath });
  } catch (error) {
    console.error("❌ Error saving log:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get list of sessions (top-level directories)
app.get("/api/sessions", async (req, res) => {
  try {
    await ensureDir(LOG_DIR);

    const entries = await fs.readdir(LOG_DIR, { withFileTypes: true });
    const sessions = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .reverse(); // Newest first

    const sessionDetails = await Promise.all(
      sessions.map(async (sessionName) => {
        const sessionPath = path.join(LOG_DIR, sessionName);
        const files = await fs.readdir(sessionPath);
        const stats = await fs.stat(sessionPath);

        return {
          session: sessionName,
          fileCount: files.length,
          modified: stats.mtime,
          path: sessionPath,
        };
      })
    );

    res.json({ sessions: sessionDetails });
  } catch (error) {
    console.error("❌ Error listing sessions:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get list of log files in a session
app.get("/api/sessions/:sessionId/logs", async (req, res) => {
  try {
    const sessionId = path.basename(req.params.sessionId);
    const sessionPath = path.join(LOG_DIR, sessionId);

    const files = await fs.readdir(sessionPath);
    const logFiles = files.filter(
      (f) => f.endsWith(".log") || f.endsWith(".json") || f.endsWith(".txt")
    );

    const fileDetails = await Promise.all(
      logFiles.map(async (filename) => {
        const filePath = path.join(sessionPath, filename);
        const stats = await fs.stat(filePath);
        return {
          filename,
          size: stats.size,
          modified: stats.mtime,
          session: sessionId,
        };
      })
    );

    // Sort by modified time (newest first)
    fileDetails.sort((a, b) => b.modified - a.modified);

    res.json({ files: fileDetails, session: sessionId });
  } catch (error) {
    console.error("❌ Error listing logs:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get specific log file content
app.get("/api/sessions/:sessionId/logs/:filename", async (req, res) => {
  try {
    const sessionId = path.basename(req.params.sessionId);
    const filename = path.basename(req.params.filename);
    const filePath = path.join(LOG_DIR, sessionId, filename);

    const content = await fs.readFile(filePath, "utf8");
    res.type("text/plain").send(content);
  } catch (error) {
    console.error("❌ Error reading log:", error);
    res.status(404).json({ error: "Log file not found" });
  }
});

// Get latest session
app.get("/api/sessions/latest", async (req, res) => {
  try {
    await ensureDir(LOG_DIR);

    const entries = await fs.readdir(LOG_DIR, { withFileTypes: true });
    const sessions = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .reverse();

    if (sessions.length === 0) {
      return res.status(404).json({ error: "No sessions found" });
    }

    const latestSession = sessions[0];
    const sessionPath = path.join(LOG_DIR, latestSession);
    const files = await fs.readdir(sessionPath);

    res.json({
      session: latestSession,
      path: sessionPath,
      fileCount: files.length,
      files: files,
    });
  } catch (error) {
    console.error("❌ Error reading latest session:", error);
    res.status(500).json({ error: error.message });
  }
});

// Delete old sessions (keep last N)
app.delete("/api/sessions/cleanup", async (req, res) => {
  try {
    const { keepLastN = 5 } = req.body;

    await ensureDir(LOG_DIR);
    const entries = await fs.readdir(LOG_DIR, { withFileTypes: true });
    const sessions = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort(); // Oldest first

    if (sessions.length <= keepLastN) {
      return res.json({ message: "No cleanup needed", kept: sessions.length });
    }

    // Delete oldest sessions
    const toDelete = sessions.slice(0, sessions.length - keepLastN);

    for (const session of toDelete) {
      const sessionPath = path.join(LOG_DIR, session);
      await fs.rm(sessionPath, { recursive: true, force: true });
      console.log(`🗑️  Deleted old session: ${session}`);
    }

    res.json({
      deleted: toDelete.length,
      kept: keepLastN,
      deletedSessions: toDelete,
    });
  } catch (error) {
    console.error("❌ Error cleaning up sessions:", error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    logDir: LOG_DIR,
    logDirExists: fsSync.existsSync(LOG_DIR),
    timestamp: new Date().toISOString(),
  });
});

// Start server
async function start() {
  ensureLogDirSync();

  app.listen(PORT, () => {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`📝 Training Log Server (Session-Based)`);
    console.log(`${"=".repeat(70)}`);
    console.log(`Server:      http://localhost:${PORT}`);
    console.log(`Logs Dir:    ${LOG_DIR}`);
    console.log(`Health:      http://localhost:${PORT}/health`);
    console.log(`Sessions:    http://localhost:${PORT}/api/sessions`);
    console.log(`Latest:      http://localhost:${PORT}/api/sessions/latest`);
    console.log(
      `Cleanup:     DELETE http://localhost:${PORT}/api/sessions/cleanup`
    );
    console.log(`${"=".repeat(70)}`);
    console.log(`\n💡 Watch latest session logs:`);
    console.log(`   tail -f ${path.join(LOG_DIR, "*/*.log")}`);
    console.log(`\n💡 View specific session:`);
    console.log(`   ls ${path.join(LOG_DIR, "20251014_034634/")}`);
    console.log(`   tail -f ${path.join(LOG_DIR, "20251014_034634/*.log")}`);
    console.log(`\n✅ Ready for connections!\n`);
  });
}

start().catch(console.error);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n\n👋 Shutting down log server...");
  process.exit(0);
});
