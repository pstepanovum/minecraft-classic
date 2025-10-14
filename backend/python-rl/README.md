# Minecraft Classic - RL Training Setup

Multi-agent reinforcement learning for Minecraft hide-and-seek game with browser-based frontend and Python backend.

---

## 📋 Table of Contents

- [Overview](#overview)
- [System Requirements](#system-requirements)
- [Mac Setup (Development)](#mac-setup-development)
- [Ubuntu Setup (Production Training)](#ubuntu-setup-production-training)
- [Daily Workflows](#daily-workflows)
- [Chrome Automation](#chrome-automation)
- [TensorBoard](#tensorboard)
- [Troubleshooting](#troubleshooting)
- [Git Workflow](#git-workflow)
- [Project Structure](#project-structure)

---

## 🎯 Overview

**Architecture:**
- **Frontend:** Browser-based Minecraft game (Three.js, Node.js)
- **Backend:** Python RL training (Ray RLlib, PPO algorithm)
- **Communication:** WebSocket (port 8765)
- **Training:** Multi-agent (seekers vs hiders)

**Development Flow:**
```
Mac (Development) → GitHub → Ubuntu (Heavy Training)
   Native Python              Docker Container
```

---

## 💻 System Requirements

### Mac (Development)
- macOS with Python 3.11
- Conda or pip
- Node.js 20+
- VS Code (optional but recommended)

### Ubuntu (Production)
- Ubuntu with Docker installed
- Remote Desktop or SSH access
- Chrome/Firefox browser
- VS Code (optional)

---

## 🍎 Mac Setup (Development)

### One-Time Installation

```bash
# 1. Clone repository
cd ~/Projects
git clone https://github.com/pstepanovum/minecraft-classic.git
cd minecraft-classic

# 2. Create Conda environment
conda create -n ppo-project python=3.11
conda activate ppo-project

# 3. Install Python dependencies
cd backend/python-rl
pip install ray[rllib]==2.50.0
pip install gymnasium==0.28.1
pip install torch==2.1.0
pip install numpy==1.24.3
pip install websockets==12.0
pip install pyyaml==6.0.1
pip install tensorboard==2.15.1
pip install pandas==2.1.0
pip install nest-asyncio==1.5.8
pip install matplotlib==3.8.2

# 4. Install frontend dependencies
cd ../../frontend
npm install

# 5. Verify installation
python -c "import ray; print('Ray:', ray.__version__)"  # Should show 2.50.0
```

### Chrome Auto-Launch Setup (Optional)

```bash
# Install concurrently for frontend
cd ~/minecraft-classic/frontend
npm install --save-dev concurrently

# Create Chrome launcher script
cat > open-chrome.sh << 'EOF'
#!/bin/bash
echo "⏳ Waiting for server..."
until curl -s http://localhost:8080 > /dev/null 2>&1; do sleep 0.5; done
echo "🌐 Opening Chrome..."
open -na "Google Chrome" --args --incognito --auto-open-devtools-for-tabs --disable-cache --new-window "http://localhost:8080/modes/research/"
EOF

chmod +x open-chrome.sh

# Update package.json scripts
npm pkg set scripts.start="concurrently --kill-others \"npm run server\" \"npm run chrome\""
npm pkg set scripts.server="http-server public -p 8080 --cors"
npm pkg set scripts.chrome="./open-chrome.sh"
```

### Mac Daily Workflow

```bash
# Terminal 1: Backend
conda activate ppo-project
cd ~/minecraft-classic/backend/python-rl
python main.py

# Terminal 2: Frontend (auto-opens Chrome)
cd ~/minecraft-classic/frontend
npm start
# Chrome opens automatically to http://localhost:8080/modes/research/ with DevTools
```

---

## 🐧 Ubuntu Setup (Production Training)

### One-Time Docker Installation

```bash
# 1. Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 2. Add user to docker group (NO SUDO NEEDED AFTER THIS!)
sudo usermod -aG docker $USER

# 3. Logout and login again (or reboot)
sudo reboot

# 4. Verify Docker works without sudo
docker ps  # Should work without sudo!
```

### Create Docker Container

```bash
# 1. Clone repository
cd ~
git clone https://github.com/pstepanovum/minecraft-classic.git

# 2. Create Docker container with Python 3.11
docker run -it \
  --name ppo-station-place \
  -p 8765:8765 \
  -p 6006:6006 \
  -p 8080:8080 \
  -v /home/local/csc752/csc411/minecraft-classic:/workspace \
  -w /workspace \
  python:3.11 \
  bash

# You're now inside the container!

# 3. Install system dependencies
apt-get update
apt-get install -y build-essential git curl

# 4. Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# 5. Install Python packages (Ray 2.50.0)
pip install ray[rllib]==2.50.0
pip install gymnasium==0.28.1
pip install torch==2.1.0
pip install numpy==1.24.3
pip install websockets==12.0
pip install pyyaml==6.0.1
pip install tensorboard==2.15.1
pip install pandas==2.1.0
pip install nest-asyncio==1.5.8
pip install matplotlib==3.8.2

# 6. Install frontend dependencies
cd /workspace/frontend
npm install

# 7. Create useful aliases
cat >> ~/.bashrc << 'EOF'
alias tb='tensorboard --logdir /workspace/backend/python-rl/runs --host 0.0.0.0 --port 6006'
alias backend='cd /workspace/backend/python-rl && python main.py'
alias frontend='cd /workspace/frontend && npm start'
EOF
source ~/.bashrc

# 8. Exit and save container
exit
docker commit ppo-station-place csc411-training:latest
```

### Ubuntu Startup Script

```bash
# Create startup script
cat > ~/start-csc411.sh << 'EOF'
#!/bin/bash
echo "🚀 Starting CSC411 Development Environment..."
docker start ppo-station-place
sleep 2
echo "👀 Starting Chrome auto-launcher..."
~/chrome-auto.sh > /tmp/chrome-auto.log 2>&1 &
echo $! > /tmp/chrome-watcher.pid
echo "✅ Chrome watcher started"
echo "🔌 Opening VS Code..."
code
echo ""
echo "✅ Ready! Attach VS Code to container"
EOF

chmod +x ~/start-csc411.sh

# Create Chrome auto-launcher
cat > ~/chrome-auto.sh << 'EOF'
#!/bin/bash
CHROME_PID=""
while true; do
    if curl -s http://localhost:8080 > /dev/null 2>&1; then
        if [ -z "$CHROME_PID" ] || ! kill -0 $CHROME_PID 2>/dev/null; then
            google-chrome --new-window --disable-cache --incognito http://localhost:8080/modes/research/ &
            CHROME_PID=$!
            echo $CHROME_PID > /tmp/minecraft-chrome.pid
        fi
    else
        if [ ! -z "$CHROME_PID" ] && kill -0 $CHROME_PID 2>/dev/null; then
            kill $CHROME_PID 2>/dev/null
            CHROME_PID=""
            rm -f /tmp/minecraft-chrome.pid
        fi
    fi
    sleep 1
done
EOF

chmod +x ~/chrome-auto.sh

# Create stop script
cat > ~/csc411-stop.sh << 'EOF'
#!/bin/bash
echo "🛑 Stopping..."
[ -f /tmp/chrome-watcher.pid ] && kill $(cat /tmp/chrome-watcher.pid) 2>/dev/null && rm -f /tmp/chrome-watcher.pid
[ -f /tmp/minecraft-chrome.pid ] && kill $(cat /tmp/minecraft-chrome.pid) 2>/dev/null && rm -f /tmp/minecraft-chrome.pid
echo "✅ Done!"
EOF

chmod +x ~/csc411-stop.sh

# Create aliases
cat >> ~/.bashrc << 'EOF'
alias csc411="~/start-csc411.sh"
alias csc411-stop="~/csc411-stop.sh"
EOF
source ~/.bashrc
```

### Ubuntu Daily Workflow

```bash
# 1. Start everything
csc411

# 2. In VS Code:
#    - Ctrl+Shift+P
#    - "Dev Containers: Attach to Running Container"
#    - Select: ppo-station-place
#    - File → Open Folder → /workspace

# 3. Open 3 terminals in VS Code:
#    Terminal 1: cd backend/python-rl && python main.py
#    Terminal 2: cd frontend && npm start
#    Terminal 3: tb

# 4. Open Ubuntu browser:
#    - Frontend: http://localhost:8080
#    - TensorBoard: http://localhost:6006

# 5. When done:
csc411-stop
```

---

## 🔄 Daily Workflows

### Mac Development Workflow

```bash
# 1. Start backend
conda activate ppo-project
cd ~/minecraft-classic/backend/python-rl
python main.py

# 2. Start frontend (new terminal)
cd ~/minecraft-classic/frontend
npm start
# Chrome auto-opens to research mode with console

# 3. Develop and test
# Edit code in VS Code
# Changes reflect immediately

# 4. Push to GitHub
git add .
git commit -m "Update training logic"
git push origin main
```

### Ubuntu Training Workflow

```bash
# 1. Pull latest code
cd ~/minecraft-classic
git pull origin main

# 2. Start environment
csc411

# 3. Attach VS Code to Docker
# Ctrl+Shift+P → Attach to Running Container → ppo-station-place
# File → Open Folder → /workspace

# 4. Run training (in VS Code terminals)
# Terminal 1: cd backend/python-rl && python main.py
# Terminal 2: cd frontend && npm start
# Terminal 3: tb

# 5. Monitor training
# Browser → http://localhost:6006 (TensorBoard)
# Browser → http://localhost:8080 (Game frontend)

# 6. Train for hours/days!
```

---

## 🌐 Chrome Automation

### Mac: Auto-Launch Chrome

```bash
# Already set up in frontend/package.json
npm start  # Automatically opens Chrome in incognito + DevTools + research mode
```

### Ubuntu: Auto-Launch Chrome

```bash
# Chrome watcher runs in background (started by csc411)
# Automatically opens Chrome when npm start runs
# Automatically closes Chrome when server stops
```

### Manual Chrome Launch

```bash
# If auto-launch fails, open manually:

# Mac:
open -na "Google Chrome" --args --incognito --auto-open-devtools-for-tabs http://localhost:8080/modes/research/

# Ubuntu:
google-chrome --new-window --disable-cache --incognito http://localhost:8080/modes/research/
```

---

## 📊 TensorBoard

### Start TensorBoard

**Inside Docker:**
```bash
# Quick start
tb

# Or full command
tensorboard --logdir /workspace/backend/python-rl/runs --host 0.0.0.0 --port 6006
```

**On Ubuntu browser:** Open `http://localhost:6006`

### Training Outputs

All training data saved in:
```
backend/python-rl/
├── checkpoints/           # Model checkpoints (every 10 iterations)
│   ├── checkpoint_000010/
│   ├── training_metrics_iter_10.png
│   └── metrics_iter_10.json
└── runs/                  # TensorBoard logs
    └── ppo_minecraft_TIMESTAMP/
```

---

## 🐛 Troubleshooting

### Docker Issues

**Permission denied when running docker:**
```bash
sudo usermod -aG docker $USER
sudo reboot
```

**Container not found:**
```bash
docker ps -a  # Check all containers
docker start ppo-station-place
```

**Port already in use:**
```bash
# Find what's using it
lsof -i :8765
# Kill it
kill -9 <PID>
```

### Connection Issues

**Frontend can't connect to backend:**
```bash
# 1. Check backend is running
docker ps  # Should show ppo-station-place

# 2. Check logs
docker logs ppo-station-place

# 3. Verify WebSocket URL
# Frontend should use: ws://localhost:8765

# 4. Check config.yaml
# Should have: host: "0.0.0.0"
```

**Chrome doesn't auto-open:**
```bash
# Check Chrome watcher is running
ps aux | grep chrome-auto

# Restart watcher
csc411-stop
csc411
```

### Python/Ray Issues

**Import errors:**
```bash
# Verify Ray version
python -c "import ray; print(ray.__version__)"
# Should show: 2.50.0

# Reinstall if needed
pip install --force-reinstall ray[rllib]==2.50.0
```

**Training errors:**
```bash
# Check config.yaml syntax
cat backend/python-rl/config.yaml

# Verify all files present
ls backend/python-rl/
# Should see: main.py, ppo_trainer.py, minecraft_env.py, websocket_server.py, config.yaml
```

### VS Code Issues

**Can't attach to container:**
```bash
# 1. Check container is running
docker ps

# 2. Install Dev Containers extension
# VS Code → Extensions → Search "Dev Containers" → Install

# 3. Restart VS Code
```

---

## 📂 Git Workflow

### .gitignore

Already configured to ignore:
```
__pycache__/
checkpoints/
runs/
node_modules/
.DS_Store
.env
*.pyc
*.log
venv/
```

### Branch Strategy

```bash
# Main branch: Ubuntu/Docker version
git checkout main

# Development on Mac
git add .
git commit -m "Update feature"
git push origin main

# Pull on Ubuntu
cd ~/minecraft-classic
git pull origin main
```

### Syncing Code

**From Mac to Ubuntu:**
```bash
# Mac
git push origin main

# Ubuntu
cd ~/minecraft-classic
git pull origin main
```

**From Ubuntu to Mac:**
```bash
# Ubuntu (inside Docker)
cd /workspace
git add .
git commit -m "Training improvements"
git push origin main

# Mac
cd ~/minecraft-classic
git pull origin main
```

---

## 📁 Project Structure

```
minecraft-classic/
├── frontend/                      # Browser-based game
│   ├── public/
│   │   └── index.html
│   ├── package.json
│   ├── open-chrome.sh            # Mac Chrome launcher
│   └── node_modules/             # (gitignored)
│
├── backend/
│   └── python-rl/                # RL training
│       ├── main.py               # Entry point
│       ├── ppo_trainer.py        # PPO algorithm
│       ├── minecraft_env.py      # Gym environment
│       ├── websocket_server.py   # WebSocket server
│       ├── config.yaml           # Training config
│       ├── checkpoints/          # (gitignored)
│       └── runs/                 # (gitignored)
│
├── .gitignore
└── README.md
```

---

## 🚀 Quick Reference

### Mac Commands

```bash
# Start training
conda activate ppo-project
cd ~/minecraft-classic/backend/python-rl && python main.py

# Start frontend
cd ~/minecraft-classic/frontend && npm start

# Push code
git push origin main
```

### Ubuntu Commands

```bash
# Start everything
csc411

# Stop Chrome watcher
csc411-stop

# Attach VS Code
# Ctrl+Shift+P → Attach to Running Container

# Inside Docker
tb                    # Start TensorBoard
backend              # Start Python backend
frontend             # Start frontend server

# Pull latest code
cd ~/minecraft-classic && git pull
```

### Docker Management

```bash
# Container operations
docker ps                          # List running containers
docker ps -a                       # List all containers
docker start ppo-station-place     # Start container
docker stop ppo-station-place      # Stop container
docker restart ppo-station-place   # Restart container
docker exec -it ppo-station-place bash  # Enter running container

# Save/Load container
docker commit ppo-station-place csc411-training:v1
docker save -o backup.tar csc411-training:v1
docker load -i backup.tar

# Cleanup
docker system prune -f             # Clean unused resources
```

---

## 🎯 Key Features

### ✅ What Works

- **Unified Codebase:** Same code works on Mac and Ubuntu (Ray 2.50.0)
- **No Sudo Required:** Docker handles all Python dependencies on Ubuntu
- **Chrome Automation:** Auto-opens with DevTools and research mode
- **VS Code Integration:** Full IDE experience inside Docker
- **TensorBoard:** Real-time training visualization
- **WebSocket Communication:** Browser ↔ Python backend
- **Multi-Agent Training:** Seekers vs Hiders PPO algorithm
- **Automatic Checkpoints:** Saves models + plots every 10 iterations

### 🎨 Workflow Benefits

- **Mac:** Fast native development with instant feedback
- **Ubuntu:** Heavy training in isolated Docker environment
- **GitHub:** Code sync between machines
- **Port Exposure:** All services accessible from host browser

---

## 📚 Additional Resources

- **Ray RLlib Docs:** https://docs.ray.io/en/latest/rllib/
- **PPO Algorithm:** https://spinningup.openai.com/en/latest/algorithms/ppo.html
- **Docker Best Practices:** https://docs.docker.com/develop/dev-best-practices/
- **TensorBoard Guide:** https://www.tensorflow.org/tensorboard

---

## 🙏 Acknowledgments

Project setup optimized for:
- Mac (native Python) development
- Ubuntu (Docker) production training
- Seamless GitHub synchronization
- Chrome automation for rapid testing
- Real-time monitoring with TensorBoard

---

## 📝 Notes

- **Ray Version:** 2.50.0 (unified on both machines)
- **Python Version:** 3.11 (consistent across Mac and Docker)
- **Node.js Version:** 20+ (for frontend)
- **WebSocket Port:** 8765 (backend ↔ frontend)
- **TensorBoard Port:** 6006 (training visualization)
- **Frontend Port:** 8080 (game interface)

---

**Last Updated:** October 2024  
**Maintained by:** Pavel Stepanov  
**Repository:** https://github.com/pstepanovum/minecraft-classic