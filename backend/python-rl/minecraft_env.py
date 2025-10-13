"""
FILE: backend/python-rl/minecraft_env.py
DESCRIPTION: Multi-agent Gymnasium environment for Minecraft hide and seek.
"""

import gymnasium as gym
from gymnasium import spaces
import numpy as np
from typing import Dict, Any, Tuple
import asyncio
import nest_asyncio

from websocket_server import get_server

nest_asyncio.apply()


class NoValidationBox(spaces.Box):
    """Box space that skips validation for performance and compatibility."""
    
    def contains(self, x):
        """Always return True - skip validation."""
        if not isinstance(x, np.ndarray):
            return False
        if x.shape != self.shape:
            return False
        if x.dtype != self.dtype:
            return False
        return True


class MinecraftHideSeekEnv(gym.Env):
    """
    Multi-agent Gymnasium environment for Minecraft hide and seek.
    
    Manages both seeker and hider agents, communicating with browser via WebSocket.
    """
    
    def __init__(self, config: Dict[str, Any]):
        super().__init__()
        
        self.config = config
        self.env_config = config['environment']
        
        self.server = get_server(
            config['websocket']['host'],
            config['websocket']['port']
        )
        
        # CHANGED: Observation space size 91 (from 143)
        obs_size = self.env_config['observation_size']
        self.observation_space = NoValidationBox(
            low=-np.inf,
            high=np.inf,
            shape=(obs_size,),
            dtype=np.float32
        )
        
        # CHANGED: Continuous action space Box(7)
        # [forward/back, strafe, rotation, look, jump, place_block, remove_block]
        self.action_space = spaces.Box(
            low=np.array([-1.0, -1.0, -1.0, -1.0, 0.0, 0.0, 0.0], dtype=np.float32),
            high=np.array([1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0], dtype=np.float32),
            dtype=np.float32
        )
        
        self.current_episode = 0
        self.current_step = 0
        self.max_steps = self.env_config['max_steps']
        
        self.agent_ids = []
        self.seeker_ids = []
        self.hider_ids = []
    
    def reset(self, seed=None, options=None):
        super().reset(seed=seed)
        
        self.current_episode += 1
        self.current_step = 0
        
        loop = asyncio.get_event_loop()
        obs_data = loop.run_until_complete(
            self.server.reset_episode(self.current_episode)
        )
        
        observations = {}
        infos = {}
        
        if 'agents' in obs_data:
            for agent_data in obs_data['agents']:
                agent_id = agent_data['id']
                role = agent_data['role']
                
                if agent_id not in self.agent_ids:
                    self.agent_ids.append(agent_id)
                    if role == 'seeker':
                        self.seeker_ids.append(agent_id)
                    else:
                        self.hider_ids.append(agent_id)
                
                obs = np.array(agent_data['observation'], dtype=np.float32)
                observations[agent_id] = obs
                
                infos[agent_id] = {
                    'role': role,
                    'episode': self.current_episode
                }
        
        return observations, infos
    
    def step(self, action_dict: Dict[str, np.ndarray]):
        self.current_step += 1
        
        # CHANGED: Convert continuous actions to browser format
        browser_actions = {}
        for agent_id, action in action_dict.items():
            browser_actions[agent_id] = {
                'movement_forward': float(action[0]),      # -1 to 1
                'movement_strafe': float(action[1]),       # -1 to 1
                'rotation': float(action[2]),              # -1 to 1
                'look': float(action[3]),                  # -1 to 1
                'jump': bool(float(action[4]) > 0.5),      # threshold
                'place_block': bool(float(action[5]) > 0.5),  # threshold
                'remove_block': bool(float(action[6]) > 0.5), # threshold
            }
        
        loop = asyncio.get_event_loop()
        step_data = loop.run_until_complete(
            self.server.step(browser_actions)
        )
        
        observations = {}
        rewards = {}
        terminateds = {}
        truncateds = {}
        infos = {}
        
        if 'agents' in step_data:
            for agent_data in step_data['agents']:
                agent_id = agent_data['id']
                
                observations[agent_id] = np.array(
                    agent_data['observation'],
                    dtype=np.float32
                )
                rewards[agent_id] = float(agent_data.get('reward', 0.0))
                terminateds[agent_id] = bool(agent_data.get('done', False))
                truncateds[agent_id] = self.current_step >= self.max_steps
                
                infos[agent_id] = {
                    'step': self.current_step,
                    'role': agent_data.get('role', 'unknown')
                }
        
        all_done = step_data.get('episode_done', False)
        terminateds['__all__'] = all_done
        truncateds['__all__'] = self.current_step >= self.max_steps
        
        return observations, rewards, terminateds, truncateds, infos
    
    def close(self):
        pass