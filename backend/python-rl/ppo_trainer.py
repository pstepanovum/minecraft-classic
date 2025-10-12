"""
FILE: backend/python-rl/ppo_trainer.py
"""

import ray
from ray import tune
from ray.rllib.algorithms.ppo import PPOConfig
from ray.rllib.policy.policy import PolicySpec
from ray.rllib.env.multi_agent_env import MultiAgentEnv
import os
import numpy as np

from minecraft_env import MinecraftHideSeekEnv

class RLlibMinecraftEnv(MultiAgentEnv):
    def __init__(self, config):
        super().__init__()
        self.env = MinecraftHideSeekEnv(config)
        self.observation_space = self.env.observation_space
        self.action_space = self.env.action_space
        self._agent_ids = set()
        
        from gymnasium import spaces
        
        # CHANGED: Observation size 91 (from 143)
        self.observation_space = spaces.Box(
            low=-np.inf,
            high=np.inf,
            shape=(config['environment']['observation_size'],),
            dtype=np.float32
        )
        self.observation_space.contains = lambda x: True
        
        # CHANGED: Continuous action space Box(7)
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

def create_ppo_trainer(config):
    ppo_config = config['ppo']
    
    def policy_mapping_fn(agent_id, episode, worker, **kwargs):
        if 'seeker' in agent_id:
            return "seeker_policy"
        else:
            return "hider_policy"
    
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
            lr=ppo_config['lr_seeker'],
            gamma=ppo_config['gamma'],
            lambda_=ppo_config['lambda'],
            clip_param=ppo_config['clip_param'],
            vf_loss_coeff=ppo_config['vf_loss_coeff'],
            entropy_coeff=ppo_config['entropy_coeff'],
            train_batch_size=ppo_config['train_batch_size'],
            minibatch_size=ppo_config['minibatch_size'],
            num_epochs=ppo_config['num_epochs'],
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
    
    trainer = trainer_config.build_algo()
    
    return trainer

def train(config):
    if not ray.is_initialized():
        ray.init(ignore_reinit_error=True)
    
    trainer = create_ppo_trainer(config)
    
    total_episodes = config['training']['total_episodes']
    eval_freq = config['training']['eval_frequency']
    log_freq = config['training']['log_frequency']
    checkpoint_freq = config['ppo']['checkpoint_freq']
    checkpoint_dir = config['ppo']['checkpoint_dir']
    
    os.makedirs(checkpoint_dir, exist_ok=True)
    
    try:
        for episode in range(1, total_episodes + 1):
            result = trainer.train()
            
            if episode % log_freq == 0:
                print(f"\nEpisode {episode}/{total_episodes}")
                print(f"  Reward mean: {result.get('env_runners', {}).get('episode_reward_mean', 0):.2f}")
                print(f"  Episode length mean: {result.get('env_runners', {}).get('episode_len_mean', 0):.1f}")
            
            if episode % checkpoint_freq == 0:
                checkpoint_path = trainer.save(checkpoint_dir)
                print(f"  Checkpoint saved: {checkpoint_path}")
        
        final_checkpoint = trainer.save(checkpoint_dir)
        print(f"\nTraining complete! Final checkpoint: {final_checkpoint}")
        
    except KeyboardInterrupt:
        print("\nTraining interrupted by user")
        checkpoint_path = trainer.save(checkpoint_dir)
        print(f"Checkpoint saved: {checkpoint_path}")
    
    except Exception as e:
        print(f"\nError during training: {e}")
        raise
    
    finally:
        trainer.stop()
        ray.shutdown()