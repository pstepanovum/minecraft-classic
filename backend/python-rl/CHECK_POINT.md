# Checkpoint Management Guide

## 🎯 Overview

This training system uses **Ray 2.50.0** with a custom checkpoint manager that automatically:
- ✅ Saves checkpoints every N iterations with unique version numbers
- ✅ Keeps only the last 10 checkpoints (configurable)
- ✅ Stores metadata (rewards, timestamps, iteration numbers)
- ✅ Maintains a checkpoint index for easy loading
- ✅ Supports continuing training from any checkpoint

---

## 📁 Checkpoint Structure

After training, your `checkpoints/` directory will look like this:

```
checkpoints/
├── checkpoint_index.json           # Index of all checkpoints
├── checkpoint_000010/              # Iteration 10
│   ├── algorithm_state.pkl         # Ray/RLlib trainer state
│   ├── policies/                   # Policy weights
│   │   ├── seeker_policy/
│   │   └── hider_policy/
│   ├── rlib_checkpoint.json        # RLlib metadata
│   └── metadata.json               # Custom training metrics
├── checkpoint_000020/              # Iteration 20
├── checkpoint_000030/              # Iteration 30
├── ...
├── training_metrics_iter_10.png   # Training plots
├── training_metrics_iter_20.png
└── metrics_iter_10.json           # Metrics history
```

---

## 🚀 Basic Usage

### 1. **Start New Training**

```bash
# Start fresh training
python main.py
```

This will:
- Create new checkpoints every 10 iterations (configurable in `config.yaml`)
- Save to `./checkpoints/checkpoint_XXXXXX/`
- Generate plots and metrics
- Keep only last 10 checkpoints

### 2. **Continue Training from Checkpoint**

```bash
# Continue from specific checkpoint
python continue_training.py ./checkpoints/checkpoint_000050

# Or use main.py directly
python main.py ./checkpoints/checkpoint_000050
```

This will:
- Load the specified checkpoint
- Resume training from that iteration
- Continue saving new checkpoints
- Preserve all previous checkpoints

### 3. **Demo Mode - Watch Trained Agents**

```bash
python demo_model.py
```

This will:
- Show you all available checkpoints
- Let you select which one to load
- Run agents in visual mode (real-time)
- Display performance statistics

### 4. **List All Checkpoints**

```bash
# Basic list
python list_checkpoints.py

# Detailed view with sizes and timestamps
python list_checkpoints.py --detailed
```

Output example:
```
================================================================================
📂 CHECKPOINT DIRECTORY: /path/to/checkpoints
================================================================================
Total checkpoints: 5
Index last updated: 2024-12-19T15:30:45
================================================================================

Iter     Date         Reward     Episodes   Path
--------------------------------------------------------------------------------
10       2024-12-19   161.06     300        checkpoint_000010
20       2024-12-19   165.23     600        checkpoint_000020
30       2024-12-19   170.45     900        checkpoint_000030
40       2024-12-19   168.92     1200       checkpoint_000040
50       2024-12-19   172.18     1500       checkpoint_000050 [FINAL]
--------------------------------------------------------------------------------

📊 Summary:
   Total checkpoints: 5
   Total disk usage: 245.3 MB
   Latest iteration: 50
```

---

## ⚙️ Configuration

### Checkpoint Settings in `config.yaml`

```yaml
ppo:
  checkpoint_freq: 10  # Save every 10 iterations
  checkpoint_dir: "./checkpoints"
```

### Keep More/Fewer Checkpoints

Edit `ppo_trainer.py`:

```python
# In train() function
checkpoint_manager = CheckpointManager(
    checkpoint_dir,
    keep_last_n=10  # Change this number (0 = keep all)
)
```

---

## 📊 What Gets Saved

### 1. **Ray/RLlib State** (automatic)
- Policy neural network weights
- Optimizer states
- Training statistics
- Replay buffers (if applicable)

### 2. **Custom Metadata** (`metadata.json`)
```json
{
  "iteration": 50,
  "timestamp": "2024-12-19T15:30:45",
  "checkpoint_path": "/path/to/checkpoint_000050",
  "reward_mean": 172.18,
  "seeker_reward": -5.32,
  "hider_reward": 48.91,
  "episode_len_mean": 135.0,
  "episodes_completed": 1500
}
```

### 3. **Training Metrics** (`metrics_iter_N.json`)
Complete history of all training metrics up to that iteration.

### 4. **Training Plots** (`training_metrics_iter_N.png`)
6-panel visualization showing:
- Episode rewards over time
- Seeker vs Hider rewards
- Episode length
- KL divergence (policy stability)
- Entropy (exploration)
- Latest metrics summary

---

## 🔄 Common Workflows

### Workflow 1: Long Training with Checkpoints

```bash
# Start training for 50K episodes
python main.py

# Training runs...
# Checkpoints saved every 10 iterations

# Interrupt with Ctrl+C at any time
# Resume later:
python continue_training.py ./checkpoints/checkpoint_000180
```

### Workflow 2: Evaluate Multiple Checkpoints

```bash
# List all checkpoints
python list_checkpoints.py

# Demo different checkpoints to compare
python demo_model.py
# Select checkpoint 10 (early training)

python demo_model.py
# Select checkpoint 50 (late training)
```

### Workflow 3: Experiment with Different Configs

```bash
# Train with config A
python main.py
# Saves to ./checkpoints/

# Change config.yaml (e.g., learning rate)
# Move old checkpoints
mv checkpoints checkpoints_experiment1

# Train with config B
mkdir checkpoints
python main.py
# New checkpoints in clean directory
```

### Workflow 4: Best Checkpoint Selection

```bash
# List all checkpoints with rewards
python list_checkpoints.py --detailed

# Find best performing checkpoint
# Example output shows checkpoint_000035 has highest reward

# Demo that specific checkpoint
python demo_model.py
# Select checkpoint 35

# Use it for production
cp -r checkpoints/checkpoint_000035 checkpoints/best_model
```

---

## 🛠️ Programmatic Checkpoint Loading

### Loading in Your Own Scripts

```python
from ppo_trainer import create_ppo_trainer
import yaml

# Load config
with open('config.yaml', 'r') as f:
    config = yaml.safe_load(f)

# Create trainer and restore
trainer, _ = create_ppo_trainer(
    config, 
    restore_path="./checkpoints/checkpoint_000050"
)

# Now use trainer for inference
action = trainer.compute_single_action(
    observation,
    policy_id="seeker_policy",
    explore=False
)
```

### Using Checkpoint Manager Directly

```python
from ppo_trainer import CheckpointManager

# Create manager
manager = CheckpointManager("./checkpoints", keep_last_n=10)

# Get latest checkpoint
latest = manager.get_latest_checkpoint()
print(f"Latest: {latest}")

# Get specific iteration
checkpoint_50 = manager.get_checkpoint_by_iteration(50)

# List all checkpoints with metadata
all_checkpoints = manager.list_checkpoints()
for cp in all_checkpoints:
    print(f"Iter {cp['iteration']}: Reward {cp['reward_mean']:.2f}")
```

---

## 🐛 Troubleshooting

### Problem: "No checkpoints found"

**Solution:**
```bash
# Verify checkpoint directory exists
ls -la checkpoints/

# If empty, no training has completed yet
# Run training for at least 10 iterations
```

### Problem: "Failed to restore checkpoint"

**Causes:**
1. Checkpoint corrupted (interrupted during save)
2. Ray version mismatch
3. Wrong path

**Solutions:**
```bash
# Try previous checkpoint
python continue_training.py ./checkpoints/checkpoint_000040

# Verify checkpoint structure
ls -la checkpoints/checkpoint_000050/
# Should contain: algorithm_state.pkl, policies/, etc.

# Check Ray version
pip show ray  # Should be 2.50.0
```

### Problem: Checkpoints taking too much disk space

**Solutions:**

1. **Reduce retention:**
```python
# In ppo_trainer.py train() function
checkpoint_manager = CheckpointManager(
    checkpoint_dir,
    keep_last_n=5  # Keep only 5 instead of 10
)
```

2. **Manual cleanup:**
```bash
# Keep only iterations 10, 50, 100, 200, 500
rm -rf checkpoints/checkpoint_0000[2-4]?
rm -rf checkpoints/checkpoint_000[6-9]?
# etc.
```

3. **Compress old checkpoints:**
```bash
# Archive old checkpoints
tar -czf checkpoint_000010.tar.gz checkpoint_000010/
rm -rf checkpoint_000010/
```

---

## 📈 Monitoring Training Progress

### 1. **TensorBoard** (Real-time)
```bash
tensorboard --logdir runs/
# Open http://localhost:6006
```

### 2. **Training Plots** (Periodic)
Automatically generated every checkpoint:
- `training_metrics_iter_10.png`
- `training_metrics_iter_20.png`
- etc.

### 3. **Console Output** (Live)
```
🔄 Training Iteration 42/500
────────────────────────────────────────────────────────────
📊 Progress:
   Episodes completed: ~1260/5000
   Episodes this iteration: 30
   Reward mean: 168.45
   Episode length mean: 135.2 steps
   Seeker reward: -8.23 | KL: 0.007234 | Entropy: 9.8923
   Hider reward: 45.67 | KL: 0.008142 | Entropy: 9.6234
```

---

## 🎯 Best Practices

### ✅ DO:
- Save checkpoints frequently during early training (every 10 iterations)
- Keep at least 5-10 recent checkpoints
- Test checkpoints in demo mode before long training runs
- Document significant checkpoints (best performing, etc.)
- Use `list_checkpoints.py` to track progress

### ❌ DON'T:
- Don't delete checkpoints while training is running
- Don't modify checkpoint files manually
- Don't set `keep_last_n=1` (no fallback if latest corrupts)
- Don't run multiple trainings in same checkpoint directory simultaneously

---

## 📝 Quick Reference

| Command | Purpose |
|---------|---------|
| `python main.py` | Start new training |
| `python main.py <checkpoint>` | Continue from checkpoint |
| `python continue_training.py <checkpoint>` | Continue with confirmation |
| `python demo_model.py` | Watch trained agents (interactive) |
| `python list_checkpoints.py` | List all checkpoints |
| `python list_checkpoints.py -d` | Detailed checkpoint info |

---

## 🔬 Advanced: Checkpoint Analysis

### Extract Metrics from All Checkpoints

```python
import json
from pathlib import Path

checkpoint_dir = Path("./checkpoints")

rewards = []
for cp in sorted(checkpoint_dir.glob("checkpoint_*")):
    metadata_file = cp / "metadata.json"
    if metadata_file.exists():
        with open(metadata_file) as f:
            data = json.load(f)
            rewards.append({
                'iteration': data['iteration'],
                'reward': data['reward_mean']
            })

# Find best checkpoint
best = max(rewards, key=lambda x: x['reward'])
print(f"Best checkpoint: Iteration {best['iteration']} with reward {best['reward']:.2f}")
```

### Compare Two Checkpoints

```bash
# Demo checkpoint 20
python demo_model.py
# Select checkpoint 20, note average reward

# Demo checkpoint 50
python demo_model.py  
# Select checkpoint 50, compare performance
```

---

## 🎓 Summary

The checkpoint system is designed to be **automatic and robust**:

1. **Training automatically saves** every N iterations
2. **Old checkpoints are automatically cleaned** (keeps last 10)
3. **Metadata is automatically stored** (rewards, timestamps, etc.)
4. **Resuming is easy** - just point to any checkpoint
5. **No manual management needed** - the system handles everything

Just run `python main.py` and let it train! 🚀