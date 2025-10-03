#!/bin/bash

# Configuration
PROFILE_NAME="chrome-ml-research"
PROFILE_DIR="$HOME/.config/$PROFILE_NAME"
RESEARCH_URL="http://localhost:8080/modes/research/"

# Function to cleanup Chrome processes
cleanup() {
    echo ""
    echo "🛑 Received interrupt signal - cleaning up..."
    echo "🔴 Killing research Chrome instances..."
    pkill -f "$PROFILE_DIR" 2>/dev/null || true
    sleep 1
    # Force kill if needed
    if pgrep -f "$PROFILE_DIR" > /dev/null; then
        echo "🔄 Force killing remaining processes..."
        pkill -9 -f "$PROFILE_DIR" 2>/dev/null || true
    fi
    echo "✅ Cleanup complete. Chrome processes terminated."
    echo "💡 Terminal remains open. You can run the script again or close manually."
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

echo "🧠 ML Research Chrome Launcher"
echo "================================"

# Kill any existing Chrome instances using our research profile
echo "🔴 Closing existing research Chrome instances..."
pkill -f "$PROFILE_DIR" 2>/dev/null || true
sleep 1

# Double-check and force kill if needed
if pgrep -f "$PROFILE_DIR" > /dev/null; then
    echo "🔄 Force closing stubborn processes..."
    pkill -9 -f "$PROFILE_DIR" 2>/dev/null || true
    sleep 1
fi

# Create profile directory if it doesn't exist
mkdir -p "$PROFILE_DIR"

# Clear ONLY the research profile cache
echo "🧹 Cleaning research profile cache..."
rm -rf "$PROFILE_DIR/Default/Cache" 2>/dev/null || true
rm -rf "$PROFILE_DIR/Default/Code Cache" 2>/dev/null || true
rm -rf "$PROFILE_DIR/Default/Service Worker" 2>/dev/null || true
rm -rf "$PROFILE_DIR/Default/Application Cache" 2>/dev/null || true
rm -rf "$PROFILE_DIR/Default/Storage" 2>/dev/null || true

# Also clear some common cache locations
find "$PROFILE_DIR" -name "*cache*" -type d -exec rm -rf {} + 2>/dev/null || true

echo "🚀 Launching fresh Chrome for ML research..."
echo "📁 Profile: $PROFILE_DIR"

# Launch Chrome with the dedicated profile and ML optimizations
google-chrome-stable \
  --user-data-dir="$PROFILE_DIR" \
  --profile-directory="ML-Research" \
  --max_old_space_size=8192 \
  --js-flags="--max_old_space_size=8192" \
  --ignore-gpu-blocklist \
  --enable-gpu-rasterization \
  --enable-webgl-draft-extensions \
  --enable-accelerated-2d-canvas \
  --disable-features=VizDisplayCompositor \
  --disable-web-security \
  --allow-file-access-from-files \
  --aggressive-cache-discard \
  --disable-cache \
  --disk-cache-size=1 \
  --media-cache-size=1 \
  --no-default-browser-check \
  --no-first-run \
  --window-size=1400,1000 \
  --window-position=100,100 \
  --new-window \
  "$RESEARCH_URL" &

# Get the Chrome PID
CHROME_PID=$!
echo "📝 Chrome PID: $CHROME_PID"

echo "✅ ML Research Chrome launched!"
echo ""
echo "💡 TIPS:"
echo "   • Press Ctrl+C in this terminal to close Chrome and exit"
echo "   • Run this script again anytime to get a clean reload"
echo "   • Your main Chrome with YouTube/tabs is unaffected"
echo ""
echo "🎯 Memory: 8GB allocated | GPU: Accelerated | Cache: Cleared"

# Wait for Chrome to exit, then cleanup
wait $CHROME_PID
echo "🌐 Chrome window closed. Run the script again to launch a new instance."
echo "📝 Terminal remains active. Press Ctrl+C to exit or run another command."