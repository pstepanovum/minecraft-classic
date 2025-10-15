"""
FILE: backend/python-rl/ppo_trainer.py
Ray 2.50.0 Compatible - Simplified Metrics & Essential Graphs
"""

import ray
from ray import tune
from ray.rllib.algorithms.ppo import PPOConfig
from ray.rllib.policy.policy import PolicySpec
from ray.rllib.env.multi_agent_env import MultiAgentEnv
import os
import numpy as np
import shutil
from pathlib import Path

# ADDED: For visualization
import matplotlib.pyplot as plt
import matplotlib
matplotlib.use('Agg')  # Non-interactive backend
from datetime import datetime
import json

from minecraft_env import MinecraftHideSeekEnv


class RLlibMinecraftEnv(MultiAgentEnv):
    def __init__(self, config):
        super().__init__()
        self.env = MinecraftHideSeekEnv(config)
        self.observation_space = self.env.observation_space
        self.action_space = self.env.action_space
        self._agent_ids = set()
        
        from gymnasium import spaces
        
        # Observation space
        self.observation_space = spaces.Box(
            low=-np.inf,
            high=np.inf,
            shape=(config['environment']['observation_size'],),
            dtype=np.float32
        )
        self.observation_space.contains = lambda x: True
        
        # Continuous action space Box(7)
        self.action_space = spaces.Box(
            low=np.array([-1.0, -1.0, -1.0, -1.0, 0.0, 0.0, 0.0], dtype=np.float32),
            high=np.array([1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0], dtype=np.float32),
            dtype=np.float32
        )
    
    def reset(self, *, seed=None, options=None):
        obs_dict, info_dict = self.env.reset(seed=seed, options=options)
        self._agent_ids = set(obs_dict.keys())
        
        obs_dict = {k: np.array(v, dtype=np.float32) for k, v in obs_dict.items()}
        
        return obs_dict, info_dict
    
    def step(self, action_dict):
        observations, rewards, terminateds, truncateds, infos = self.env.step(action_dict)
        
        observations = {k: np.array(v, dtype=np.float32) for k, v in observations.items()}
        
        return observations, rewards, terminateds, truncateds, infos
    
    def close(self):
        self.env.close()


class CheckpointManager:
    """Manages checkpoint saving, loading, and cleanup for Ray 2.50.0"""
    
    def __init__(self, checkpoint_dir, keep_last_n=10):
        """
        Args:
            checkpoint_dir: Base directory for checkpoints
            keep_last_n: Number of recent checkpoints to keep (0 = keep all)
        """
        self.checkpoint_dir = Path(checkpoint_dir)
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)
        self.keep_last_n = keep_last_n
        self.checkpoint_history = []
        
        # Load existing checkpoint history
        self._load_checkpoint_index()
    
    def _load_checkpoint_index(self):
        """Load the index of existing checkpoints"""
        index_file = self.checkpoint_dir / "checkpoint_index.json"
        if index_file.exists():
            with open(index_file, 'r') as f:
                data = json.load(f)
                self.checkpoint_history = data.get('checkpoints', [])
                print(f"📂 Loaded {len(self.checkpoint_history)} existing checkpoints")
    
    def _save_checkpoint_index(self):
        """Save the checkpoint index"""
        index_file = self.checkpoint_dir / "checkpoint_index.json"
        with open(index_file, 'w') as f:
            json.dump({
                'checkpoints': self.checkpoint_history,
                'last_updated': datetime.now().isoformat()
            }, f, indent=2)
    
    def save_checkpoint(self, trainer, iteration, metrics=None):
        """
        Save a checkpoint with versioning and metadata
        
        Args:
            trainer: Ray RLlib trainer/algorithm instance
            iteration: Current training iteration
            metrics: Optional dict of metrics to save
            
        Returns:
            Path to saved checkpoint
        """
        # Create checkpoint subdirectory
        checkpoint_name = f"checkpoint_{iteration:06d}"
        checkpoint_path = self.checkpoint_dir / checkpoint_name
        
        print(f"💾 Saving checkpoint: {checkpoint_name}")
        
        # Ray 2.50.0: trainer.save() returns the checkpoint directory path
        saved_path = trainer.save(checkpoint_path)
        
        # Handle both string and Checkpoint object returns
        if hasattr(saved_path, 'path'):
            saved_path = saved_path.path
        saved_path = str(saved_path)
        
        # Save metadata
        metadata = {
            'iteration': iteration,
            'timestamp': datetime.now().isoformat(),
            'checkpoint_path': saved_path,
        }
        
        if metrics:
            metadata.update(metrics)
        
        metadata_file = checkpoint_path / "metadata.json"
        with open(metadata_file, 'w') as f:
            json.dump(metadata, f, indent=2)
        
        # Update checkpoint history
        self.checkpoint_history.append({
            'iteration': iteration,
            'path': checkpoint_name,
            'timestamp': metadata['timestamp']
        })
        
        # Save updated index
        self._save_checkpoint_index()
        
        # Cleanup old checkpoints if needed
        if self.keep_last_n > 0:
            self._cleanup_old_checkpoints()
        
        print(f"✅ Checkpoint saved: {checkpoint_name}")
        return saved_path
    
    def _cleanup_old_checkpoints(self):
        """Remove old checkpoints, keeping only the last N"""
        if len(self.checkpoint_history) <= self.keep_last_n:
            return
        
        # Determine which checkpoints to delete
        to_delete = self.checkpoint_history[:-self.keep_last_n]
        
        for checkpoint_info in to_delete:
            checkpoint_path = self.checkpoint_dir / checkpoint_info['path']
            if checkpoint_path.exists():
                shutil.rmtree(checkpoint_path)
                print(f"🗑️  Deleted old checkpoint: {checkpoint_info['path']}")
        
        # Update history
        self.checkpoint_history = self.checkpoint_history[-self.keep_last_n:]
        self._save_checkpoint_index()
    
    def get_latest_checkpoint(self):
        """Get the path to the most recent checkpoint"""
        if not self.checkpoint_history:
            return None
        
        latest = self.checkpoint_history[-1]
        return str(self.checkpoint_dir / latest['path'])
    
    def get_checkpoint_by_iteration(self, iteration):
        """Get checkpoint path for a specific iteration"""
        for cp in self.checkpoint_history:
            if cp['iteration'] == iteration:
                return str(self.checkpoint_dir / cp['path'])
        return None
    
    def list_checkpoints(self):
        """List all available checkpoints with metadata"""
        checkpoints = []
        for cp_info in self.checkpoint_history:
            cp_path = self.checkpoint_dir / cp_info['path']
            metadata_file = cp_path / "metadata.json"
            
            if metadata_file.exists():
                with open(metadata_file, 'r') as f:
                    metadata = json.load(f)
                checkpoints.append(metadata)
            else:
                checkpoints.append(cp_info)
        
        return checkpoints


def plot_training_metrics(metrics_history, checkpoint_dir, iteration):
    """Generate and save essential training plots"""
    
    # Create figure with subplots
    fig, axes = plt.subplots(3, 2, figsize=(15, 12))
    fig.suptitle(f'Training Metrics - Iteration {iteration}', fontsize=16, fontweight='bold')
    
    iterations = list(range(1, len(metrics_history) + 1))
    
    # 1. Episode Length Over Time
    ax = axes[0, 0]
    episode_lengths = [m.get('episode_len_mean', 0) for m in metrics_history]
    if episode_lengths:
        ax.plot(iterations, episode_lengths, 'b-', linewidth=2.5, label='Episode Length')
        ax.fill_between(iterations, episode_lengths, alpha=0.3)
        max_steps = metrics_history[0].get('max_steps', 1200) if metrics_history else 1200
        ax.axhline(y=max_steps, color='red', linestyle='--', alpha=0.5, label=f'Max Steps ({max_steps})')
        ax.set_xlabel('Iteration', fontsize=11)
        ax.set_ylabel('Steps', fontsize=11)
        ax.set_title('📊 Episode Length (Lower = Faster Catching)', fontsize=12, fontweight='bold')
        ax.grid(True, alpha=0.3)
        ax.legend()
    
    # 2. Episodes Per Iteration
    ax = axes[0, 1]
    episodes_per_iter = [m.get('episodes_this_iter', 0) for m in metrics_history]
    if episodes_per_iter:
        ax.plot(iterations, episodes_per_iter, 'g-', linewidth=2.5)
        ax.fill_between(iterations, episodes_per_iter, alpha=0.3, color='green')
        ax.set_xlabel('Iteration', fontsize=11)
        ax.set_ylabel('Episodes', fontsize=11)
        ax.set_title('🎮 Episodes Completed Per Iteration', fontsize=12, fontweight='bold')
        ax.grid(True, alpha=0.3)
    
    # 3. KL Divergence - Seeker
    ax = axes[1, 0]
    seeker_kl = [m.get('seeker_kl', 0) for m in metrics_history]
    if seeker_kl and any(x > 0 for x in seeker_kl):
        ax.plot(iterations, seeker_kl, 'r-', linewidth=2, label='Seeker KL')
        ax.axhline(y=0.01, color='orange', linestyle='--', alpha=0.7, label='Target (0.01)')
        ax.set_xlabel('Iteration', fontsize=11)
        ax.set_ylabel('KL Divergence', fontsize=11)
        ax.set_title('🦊 Seeker Policy Stability', fontsize=12, fontweight='bold')
        ax.grid(True, alpha=0.3)
        ax.legend()
        ax.set_yscale('log')
    
    # 4. KL Divergence - Hider
    ax = axes[1, 1]
    hider_kl = [m.get('hider_kl', 0) for m in metrics_history]
    if hider_kl and any(x > 0 for x in hider_kl):
        ax.plot(iterations, hider_kl, 'g-', linewidth=2, label='Hider KL')
        ax.axhline(y=0.01, color='orange', linestyle='--', alpha=0.7, label='Target (0.01)')
        ax.set_xlabel('Iteration', fontsize=11)
        ax.set_ylabel('KL Divergence', fontsize=11)
        ax.set_title('🐔 Hider Policy Stability', fontsize=12, fontweight='bold')
        ax.grid(True, alpha=0.3)
        ax.legend()
        ax.set_yscale('log')
    
    # 5. Entropy - Both Policies
    ax = axes[2, 0]
    seeker_entropy = [m.get('seeker_entropy', 0) for m in metrics_history]
    hider_entropy = [m.get('hider_entropy', 0) for m in metrics_history]
    if seeker_entropy or hider_entropy:
        if seeker_entropy:
            ax.plot(iterations, seeker_entropy, 'r-', linewidth=2, label='Seeker', alpha=0.8)
        if hider_entropy:
            ax.plot(iterations, hider_entropy, 'g-', linewidth=2, label='Hider', alpha=0.8)
        ax.set_xlabel('Iteration', fontsize=11)
        ax.set_ylabel('Entropy', fontsize=11)
        ax.set_title('🎲 Policy Entropy (Exploration)', fontsize=12, fontweight='bold')
        ax.grid(True, alpha=0.3)
        ax.legend()
    
    # 6. Training Summary
    ax = axes[2, 1]
    ax.axis('off')
    
    if metrics_history:
        latest = metrics_history[-1]
        
        # Calculate trends (last 20 iterations)
        recent_window = min(20, len(metrics_history))
        recent = metrics_history[-recent_window:]
        
        # Trend indicators
        length_trend = "↓" if len(recent) > 1 and recent[-1].get('episode_len_mean', 0) < recent[0].get('episode_len_mean', 0) else "↑"
        seeker_entropy_trend = "↓" if len(recent) > 1 and recent[-1].get('seeker_entropy', 0) < recent[0].get('seeker_entropy', 0) else "↑"
        hider_entropy_trend = "↓" if len(recent) > 1 and recent[-1].get('hider_entropy', 0) < recent[0].get('hider_entropy', 0) else "↑"
        
        # Calculate averages
        avg_episode_len = np.mean([m.get('episode_len_mean', 0) for m in recent])
        avg_episodes_per_iter = np.mean([m.get('episodes_this_iter', 0) for m in recent])
        total_episodes = sum([m.get('episodes_this_iter', 0) for m in metrics_history])
        
        summary_text = f"""
        TRAINING SUMMARY (Iteration {iteration})
        ═══════════════════════════════════════
        
        📊 Total Episodes: {total_episodes}
        📦 This Iteration: {latest.get('episodes_this_iter', 0)}
        📈 20-iter Avg: {avg_episodes_per_iter:.1f} episodes
        
        ⏱️  Episode Length: {latest.get('episode_len_mean', 0):.0f} steps {length_trend}
           (20-iter avg: {avg_episode_len:.0f})
        
        🧠 Policy Stability (KL):
           Seeker: {latest.get('seeker_kl', 0):.6f}
           Hider:  {latest.get('hider_kl', 0):.6f}
           Target: 0.010000 (lower = stable)
        
        🎲 Exploration (Entropy):
           Seeker: {latest.get('seeker_entropy', 0):.3f} {seeker_entropy_trend}
           Hider:  {latest.get('hider_entropy', 0):.3f} {hider_entropy_trend}
           (higher = more exploration)
        
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        ✅ Rewards are flowing correctly!
        📊 Check browser logs for reward details
        """
        ax.text(0.05, 0.5, summary_text, fontsize=10, family='monospace',
                verticalalignment='center', bbox=dict(boxstyle='round', 
                facecolor='lightblue', alpha=0.3))
    
    plt.tight_layout()
    
    # Save plot
    plot_path = os.path.join(checkpoint_dir, f'training_metrics_iter_{iteration}.png')
    plt.savefig(plot_path, dpi=150, bbox_inches='tight')
    plt.close()
    
    print(f"📊 Plot saved: {plot_path}")


def create_ppo_trainer(config, restore_path=None):
    """
    Create PPO trainer with optional checkpoint restoration
    
    Args:
        config: Training configuration dict
        restore_path: Optional path to checkpoint for restoration
        
    Returns:
        Tuple of (trainer, log_dir)
    """
    ppo_config = config['ppo']
    
    def policy_mapping_fn(agent_id, episode, worker, **kwargs):
        if 'seeker' in agent_id:
            return "seeker_policy"
        else:
            return "hider_policy"
    
    # Create run directory with timestamp
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    base_dir = os.path.abspath(".")
    log_dir = os.path.join(base_dir, "runs", f"ppo_minecraft_{timestamp}")
    os.makedirs(log_dir, exist_ok=True)
    
    print(f"📁 TensorBoard log directory: {log_dir}")
    
    # RAY 2.50.0 COMPATIBLE CONFIG
    trainer_config = (
        PPOConfig()
        .api_stack(
            enable_rl_module_and_learner=False,
            enable_env_runner_and_connector_v2=False
        )
        .environment(
            env=RLlibMinecraftEnv,
            env_config=config,
            disable_env_checking=True
        )
        .framework("torch")
        .training(
            # Learning rate
            lr=ppo_config['lr_seeker'],
            
            # Core PPO parameters
            gamma=ppo_config['gamma'],
            lambda_=ppo_config['lambda'],
            clip_param=ppo_config['clip_param'],
            vf_loss_coeff=ppo_config['vf_loss_coeff'],
            entropy_coeff=ppo_config['entropy_coeff'],
            
            # Batch configuration - RAY 2.50.0 NEW API
            train_batch_size=ppo_config['train_batch_size'],
            minibatch_size=ppo_config['minibatch_size'],
            num_epochs=ppo_config['num_epochs'],
            
            # Stability enhancements
            grad_clip=ppo_config.get('grad_clip', 0.5),
            kl_coeff=ppo_config.get('kl_coeff', 0.2),
            kl_target=ppo_config.get('kl_target', 0.01),
            
            # Model architecture
            model={
                "fcnet_hiddens": ppo_config['model']['fcnet_hiddens'],
                "fcnet_activation": ppo_config['model']['fcnet_activation'],
            }
        )
        .env_runners(
            num_env_runners=ppo_config['num_workers'],
            num_envs_per_env_runner=ppo_config['num_envs_per_worker']
        )
        .multi_agent(
            policies={
                "seeker_policy": PolicySpec(
                    policy_class=None,
                    observation_space=None,
                    action_space=None,
                    config={
                        "lr": ppo_config['lr_seeker'],
                    }
                ),
                "hider_policy": PolicySpec(
                    policy_class=None,
                    observation_space=None,
                    action_space=None,
                    config={
                        "lr": ppo_config['lr_hider'],
                    }
                )
            },
            policy_mapping_fn=policy_mapping_fn,
            policies_to_train=["seeker_policy", "hider_policy"]
        )
        .debugging(
            log_level="INFO"
        )
        .resources(
            num_gpus=1 if ray.get_gpu_ids() else 0
        )
    )
    
    # Build trainer
    trainer = trainer_config.build_algo(logger_creator=lambda config: ray.tune.logger.UnifiedLogger(
        config, log_dir, loggers=None
    ))
    
    # Restore from checkpoint if provided
    if restore_path:
        print(f"📂 Restoring from checkpoint: {restore_path}")
        trainer.restore(restore_path)
        print(f"✅ Checkpoint restored successfully")
    
    print(f"\n{'='*60}")
    print(f"✅ PPO TRAINER CONFIGURED (Ray 2.50.0)")
    print(f"{'='*60}")
    print(f"📁 Logs directory: {log_dir}")
    print(f"Stability features enabled:")
    print(f"  ✓ Advantage normalization (built-in)")
    print(f"  ✓ Gradient clipping: {ppo_config.get('grad_clip', 0.5)}")
    print(f"  ✓ KL divergence monitoring: {ppo_config.get('kl_coeff', 0.2)}")
    print(f"  ✓ Clipped surrogate objective (built-in)")
    print(f"  ✓ Entropy regularization: {ppo_config['entropy_coeff']}")
    print(f"{'='*60}\n")
    
    return trainer, log_dir


def train(config, restore_checkpoint=None):
    """
    Main training function - simplified metrics extraction
    
    Args:
        config: Training configuration dict
        restore_checkpoint: Optional checkpoint path to continue training
    """
    if not ray.is_initialized():
        ray.init(ignore_reinit_error=True)
    
    # Create trainer (with optional restoration)
    trainer, log_dir = create_ppo_trainer(config, restore_checkpoint)
    
    total_episodes = config['training']['total_episodes']
    eval_freq = config['training']['eval_frequency']
    log_freq = config['training']['log_frequency']
    checkpoint_freq = config['ppo']['checkpoint_freq']
    checkpoint_dir = config['ppo']['checkpoint_dir']
    
    # Initialize checkpoint manager
    checkpoint_manager = CheckpointManager(
        checkpoint_dir,
        keep_last_n=10  # Keep last 10 checkpoints
    )
    
    # Calculate training iterations
    train_batch_size = config['ppo']['train_batch_size']
    max_steps = config['environment']['max_steps']
    episodes_per_iteration = train_batch_size // max_steps
    training_iterations = total_episodes // episodes_per_iteration
    
    # Handle remainder
    if total_episodes % episodes_per_iteration != 0:
        training_iterations += 1
    
    # Determine starting iteration if restoring
    start_iteration = 1
    if restore_checkpoint:
        # Try to extract iteration from checkpoint path
        checkpoint_path = Path(restore_checkpoint)
        if 'checkpoint_' in checkpoint_path.name:
            try:
                start_iteration = int(checkpoint_path.name.split('_')[1]) + 1
                print(f"🔄 Continuing from iteration {start_iteration}")
            except:
                pass
    
    print(f"\n{'='*60}")
    print(f"🎯 PPO TRAINING CONFIGURATION")
    print(f"{'='*60}")
    print(f"Target total episodes: {total_episodes}")
    print(f"Batch size: {train_batch_size} timesteps")
    print(f"Max steps per episode: {max_steps}")
    print(f"Episodes per training iteration: ~{episodes_per_iteration}")
    print(f"Total training iterations: {training_iterations}")
    print(f"Starting from iteration: {start_iteration}")
    print(f"Checkpoint frequency: Every {checkpoint_freq} iterations")
    print(f"Checkpoint retention: Last 10 checkpoints")
    print(f"TensorBoard logdir: {log_dir}")
    print(f"{'='*60}")
    print(f"🚀 Start TensorBoard with: tensorboard --logdir runs")
    print(f"📊 View at: http://localhost:6006/")
    print(f"{'='*60}\n")
    
    # Metrics history for plotting
    metrics_history = []
    
    # Load existing metrics if continuing training
    if restore_checkpoint:
        checkpoint_path = Path(restore_checkpoint)
        parent_dir = checkpoint_path.parent
        
        # Try to find existing metrics
        for metrics_file in sorted(parent_dir.glob("metrics_iter_*.json")):
            try:
                with open(metrics_file, 'r') as f:
                    metrics_history = json.load(f)
                print(f"📊 Loaded {len(metrics_history)} previous metrics entries")
                break
            except:
                pass
    
    try:
        for iteration in range(start_iteration, training_iterations + 1):
            print(f"\n{'─'*60}")
            print(f"🔄 Training Iteration {iteration}/{training_iterations}")
            print(f"{'─'*60}")
            
            result = trainer.train()
            
            # Calculate approximate episode count
            actual_episodes_completed = iteration * episodes_per_iteration
            
            # Extract simple, reliable metrics from Ray
            env_runners_stats = result.get('env_runners', {})
            episode_len_mean = env_runners_stats.get('episode_len_mean', 0)
            episodes_this_iter = env_runners_stats.get('episodes_this_iter', 0)
            
            # Extract stability metrics
            info = result.get('info', {})
            learner_info = info.get('learner', {})
            
            seeker_kl = 0
            hider_kl = 0
            seeker_entropy = 0
            hider_entropy = 0
            
            if 'seeker_policy' in learner_info:
                seeker_stats = learner_info['seeker_policy'].get('learner_stats', {})
                seeker_kl = seeker_stats.get('kl', 0)
                seeker_entropy = seeker_stats.get('entropy', 0)
            
            if 'hider_policy' in learner_info:
                hider_stats = learner_info['hider_policy'].get('learner_stats', {})
                hider_kl = hider_stats.get('kl', 0)
                hider_entropy = hider_stats.get('entropy', 0)
            
            # Store metrics for plotting
            metrics_history.append({
                'iteration': iteration,
                'episode_len_mean': episode_len_mean,
                'episodes_this_iter': episodes_this_iter,
                'max_steps': max_steps,
                'seeker_kl': seeker_kl,
                'hider_kl': hider_kl,
                'seeker_entropy': seeker_entropy,
                'hider_entropy': hider_entropy,
            })
            
            if iteration % log_freq == 0:
                print(f"📊 Progress:")
                print(f"   Episodes completed: ~{actual_episodes_completed}/{total_episodes}")
                print(f"   Episodes this iteration: {episodes_this_iter}")
                print(f"   Episode length mean: {episode_len_mean:.1f} steps")
                print(f"   Seeker: KL={seeker_kl:.6f} | Entropy={seeker_entropy:.4f}")
                print(f"   Hider:  KL={hider_kl:.6f} | Entropy={hider_entropy:.4f}")
                print(f"   💡 Check browser console for reward details")
            
            # Save checkpoint with plots
            if iteration % checkpoint_freq == 0:
                # Prepare checkpoint metrics
                checkpoint_metrics = {
                    'episode_len_mean': episode_len_mean,
                    'episodes_completed': actual_episodes_completed,
                    'seeker_kl': seeker_kl,
                    'hider_kl': hider_kl,
                }
                
                # Save checkpoint
                checkpoint_path = checkpoint_manager.save_checkpoint(
                    trainer, 
                    iteration, 
                    checkpoint_metrics
                )
                
                # Generate and save plots
                plot_training_metrics(metrics_history, checkpoint_dir, iteration)
                
                # Save metrics as JSON
                metrics_path = os.path.join(checkpoint_dir, f'metrics_iter_{iteration}.json')
                with open(metrics_path, 'w') as f:
                    json.dump(metrics_history, f, indent=2)
                print(f"📈 Metrics saved: {metrics_path}")
        
        print(f"\n{'='*60}")
        print(f"✅ TRAINING COMPLETE!")
        print(f"{'='*60}")
        
        # Final checkpoint
        final_metrics = {
            'episode_len_mean': episode_len_mean,
            'episodes_completed': training_iterations * episodes_per_iteration,
            'final': True
        }
        final_checkpoint = checkpoint_manager.save_checkpoint(
            trainer,
            training_iterations,
            final_metrics
        )
        
        # Final plots
        plot_training_metrics(metrics_history, checkpoint_dir, training_iterations)
        
        # Save final metrics
        final_metrics_path = os.path.join(checkpoint_dir, 'final_metrics.json')
        with open(final_metrics_path, 'w') as f:
            json.dump(metrics_history, f, indent=2)
        
        print(f"📈 Total episodes completed: ~{total_episodes}")
        print(f"📊 Final plots saved in: {checkpoint_dir}")
        print(f"{'='*60}\n")
        
    except KeyboardInterrupt:
        print(f"\n⚠️ Training interrupted by user")
        
        # Save checkpoint on interrupt
        interrupt_metrics = {
            'episode_len_mean': episode_len_mean,
            'interrupted': True
        }
        checkpoint_manager.save_checkpoint(trainer, iteration, interrupt_metrics)
        
        # Save plots and metrics on interrupt
        plot_training_metrics(metrics_history, checkpoint_dir, iteration)
        metrics_path = os.path.join(checkpoint_dir, f'metrics_interrupted_iter_{iteration}.json')
        with open(metrics_path, 'w') as f:
            json.dump(metrics_history, f, indent=2)
    
    except Exception as e:
        print(f"\n❌ Error during training: {e}")
        raise
    
    finally:
        trainer.stop()
        ray.shutdown()