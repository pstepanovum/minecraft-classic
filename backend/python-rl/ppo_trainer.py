"""
FILE: backend/python-rl/ppo_trainer.py
Ray 2.50.0 Compatible
"""

import ray
from ray import tune
from ray.rllib.algorithms.ppo import PPOConfig
from ray.rllib.policy.policy import PolicySpec
from ray.rllib.env.multi_agent_env import MultiAgentEnv
import os
import numpy as np

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


def plot_training_metrics(metrics_history, checkpoint_dir, iteration):
    """Generate and save training plots"""
    
    # Create figure with subplots
    fig, axes = plt.subplots(3, 2, figsize=(15, 12))
    fig.suptitle(f'Training Metrics - Iteration {iteration}', fontsize=16, fontweight='bold')
    
    iterations = list(range(1, len(metrics_history) + 1))
    
    # 1. Episode Rewards
    ax = axes[0, 0]
    if any('reward_mean' in m for m in metrics_history):
        rewards = [m.get('reward_mean', 0) for m in metrics_history]
        ax.plot(iterations, rewards, 'b-', linewidth=2, label='Mean Reward')
        ax.fill_between(iterations, rewards, alpha=0.3)
        ax.set_xlabel('Iteration')
        ax.set_ylabel('Mean Reward')
        ax.set_title('Episode Reward Over Time')
        ax.grid(True, alpha=0.3)
        ax.legend()
    
    # 2. Seeker vs Hider Rewards
    ax = axes[0, 1]
    seeker_rewards = [m.get('seeker_reward', 0) for m in metrics_history]
    hider_rewards = [m.get('hider_reward', 0) for m in metrics_history]
    if seeker_rewards or hider_rewards:
        ax.plot(iterations, seeker_rewards, 'r-', linewidth=2, label='Seeker')
        ax.plot(iterations, hider_rewards, 'g-', linewidth=2, label='Hider')
        ax.set_xlabel('Iteration')
        ax.set_ylabel('Mean Reward')
        ax.set_title('Seeker vs Hider Rewards')
        ax.grid(True, alpha=0.3)
        ax.legend()
    
    # 3. Episode Length
    ax = axes[1, 0]
    if any('episode_len_mean' in m for m in metrics_history):
        lengths = [m.get('episode_len_mean', 0) for m in metrics_history]
        ax.plot(iterations, lengths, 'purple', linewidth=2)
        ax.set_xlabel('Iteration')
        ax.set_ylabel('Steps')
        ax.set_title('Episode Length Over Time')
        ax.grid(True, alpha=0.3)
    
    # 4. KL Divergence
    ax = axes[1, 1]
    seeker_kl = [m.get('seeker_kl', 0) for m in metrics_history]
    hider_kl = [m.get('hider_kl', 0) for m in metrics_history]
    if seeker_kl or hider_kl:
        ax.plot(iterations, seeker_kl, 'r--', linewidth=2, label='Seeker KL')
        ax.plot(iterations, hider_kl, 'g--', linewidth=2, label='Hider KL')
        ax.axhline(y=0.01, color='orange', linestyle=':', label='Target KL')
        ax.set_xlabel('Iteration')
        ax.set_ylabel('KL Divergence')
        ax.set_title('KL Divergence (Policy Stability)')
        ax.grid(True, alpha=0.3)
        ax.legend()
        ax.set_yscale('log')
    
    # 5. Entropy
    ax = axes[2, 0]
    seeker_entropy = [m.get('seeker_entropy', 0) for m in metrics_history]
    hider_entropy = [m.get('hider_entropy', 0) for m in metrics_history]
    if seeker_entropy or hider_entropy:
        ax.plot(iterations, seeker_entropy, 'r-', linewidth=2, label='Seeker')
        ax.plot(iterations, hider_entropy, 'g-', linewidth=2, label='Hider')
        ax.set_xlabel('Iteration')
        ax.set_ylabel('Entropy')
        ax.set_title('Policy Entropy (Exploration)')
        ax.grid(True, alpha=0.3)
        ax.legend()
    
    # 6. Learning Progress Summary
    ax = axes[2, 1]
    ax.axis('off')
    
    # Calculate summary stats
    if metrics_history:
        latest = metrics_history[-1]
        summary_text = f"""
        Latest Metrics (Iteration {iteration})
        ═══════════════════════════════
        
        Episode Reward: {latest.get('reward_mean', 0):.2f}
        Seeker Reward: {latest.get('seeker_reward', 0):.2f}
        Hider Reward: {latest.get('hider_reward', 0):.2f}
        
        Episode Length: {latest.get('episode_len_mean', 0):.1f} steps
        Episodes This Iter: {latest.get('episodes_this_iter', 0)}
        
        Seeker KL: {latest.get('seeker_kl', 0):.6f}
        Hider KL: {latest.get('hider_kl', 0):.6f}
        
        Seeker Entropy: {latest.get('seeker_entropy', 0):.4f}
        Hider Entropy: {latest.get('hider_entropy', 0):.4f}
        """
        ax.text(0.1, 0.5, summary_text, fontsize=11, family='monospace',
                verticalalignment='center', bbox=dict(boxstyle='round', 
                facecolor='wheat', alpha=0.5))
    
    plt.tight_layout()
    
    # Save plot
    plot_path = os.path.join(checkpoint_dir, f'training_metrics_iter_{iteration}.png')
    plt.savefig(plot_path, dpi=150, bbox_inches='tight')
    plt.close()
    
    print(f"📊 Plot saved: {plot_path}")


def create_ppo_trainer(config):
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


def train(config):
    if not ray.is_initialized():
        ray.init(ignore_reinit_error=True)
    
    trainer, log_dir = create_ppo_trainer(config)
    
    total_episodes = config['training']['total_episodes']
    eval_freq = config['training']['eval_frequency']
    log_freq = config['training']['log_frequency']
    checkpoint_freq = config['ppo']['checkpoint_freq']
    checkpoint_dir = config['ppo']['checkpoint_dir']
    
    # Calculate training iterations
    train_batch_size = config['ppo']['train_batch_size']
    max_steps = config['environment']['max_steps']
    episodes_per_iteration = train_batch_size // max_steps
    training_iterations = total_episodes // episodes_per_iteration
    
    # Handle remainder
    if total_episodes % episodes_per_iteration != 0:
        training_iterations += 1
    
    print(f"\n{'='*60}")
    print(f"🎯 PPO TRAINING CONFIGURATION")
    print(f"{'='*60}")
    print(f"Target total episodes: {total_episodes}")
    print(f"Batch size: {train_batch_size} timesteps")
    print(f"Max steps per episode: {max_steps}")
    print(f"Episodes per training iteration: ~{episodes_per_iteration}")
    print(f"Total training iterations: {training_iterations}")
    print(f"Checkpoint frequency: Every {checkpoint_freq} iterations")
    print(f"TensorBoard logdir: {log_dir}")
    print(f"{'='*60}")
    print(f"🚀 Start TensorBoard with: tensorboard --logdir runs")
    print(f"📊 View at: http://localhost:6006/")
    print(f"{'='*60}\n")
    
    os.makedirs(checkpoint_dir, exist_ok=True)
    
    # Metrics history for plotting
    metrics_history = []
    
    try:
        for iteration in range(1, training_iterations + 1):
            print(f"\n{'─'*60}")
            print(f"🔄 Training Iteration {iteration}/{training_iterations}")
            print(f"{'─'*60}")
            
            result = trainer.train()
            
            # Calculate approximate episode count
            actual_episodes_completed = iteration * episodes_per_iteration
            
            # Extract metrics
            episode_reward_mean = result.get('env_runners', {}).get('episode_reward_mean', 0)
            episode_len_mean = result.get('env_runners', {}).get('episode_len_mean', 0)
            episodes_this_iter = result.get('env_runners', {}).get('episodes_this_iter', 0)
            
            # Extract stability metrics
            info = result.get('info', {})
            learner_info = info.get('learner', {})
            
            seeker_kl = 0
            hider_kl = 0
            seeker_entropy = 0
            hider_entropy = 0
            seeker_reward = 0
            hider_reward = 0
            
            if 'seeker_policy' in learner_info:
                seeker_stats = learner_info['seeker_policy'].get('learner_stats', {})
                seeker_kl = seeker_stats.get('kl', 0)
                seeker_entropy = seeker_stats.get('entropy', 0)
            
            if 'hider_policy' in learner_info:
                hider_stats = learner_info['hider_policy'].get('learner_stats', {})
                hider_kl = hider_stats.get('kl', 0)
                hider_entropy = hider_stats.get('entropy', 0)
            
            policy_reward_mean = result.get('policy_reward_mean', {})
            if policy_reward_mean:
                seeker_reward = policy_reward_mean.get('seeker_policy', 0)
                hider_reward = policy_reward_mean.get('hider_policy', 0)
            
            # Store metrics for plotting
            metrics_history.append({
                'iteration': iteration,
                'reward_mean': episode_reward_mean,
                'episode_len_mean': episode_len_mean,
                'episodes_this_iter': episodes_this_iter,
                'seeker_reward': seeker_reward,
                'hider_reward': hider_reward,
                'seeker_kl': seeker_kl,
                'hider_kl': hider_kl,
                'seeker_entropy': seeker_entropy,
                'hider_entropy': hider_entropy,
            })
            
            if iteration % log_freq == 0:
                print(f"📊 Progress:")
                print(f"   Episodes completed: ~{actual_episodes_completed}/{total_episodes}")
                print(f"   Episodes this iteration: {episodes_this_iter}")
                print(f"   Reward mean: {episode_reward_mean:.2f}")
                print(f"   Episode length mean: {episode_len_mean:.1f} steps")
                print(f"   Seeker reward: {seeker_reward:.2f} | KL: {seeker_kl:.6f} | Entropy: {seeker_entropy:.4f}")
                print(f"   Hider reward: {hider_reward:.2f} | KL: {hider_kl:.6f} | Entropy: {hider_entropy:.4f}")
            
            # Save checkpoint with plots
            if iteration % checkpoint_freq == 0:
                checkpoint_path = trainer.save(checkpoint_dir)
                print(f"💾 Checkpoint saved: {checkpoint_path}")
                
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
        
        final_checkpoint = trainer.save(checkpoint_dir)
        print(f"💾 Final checkpoint saved: {final_checkpoint}")
        
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
        checkpoint_path = trainer.save(checkpoint_dir)
        print(f"💾 Checkpoint saved: {checkpoint_path}")
        
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