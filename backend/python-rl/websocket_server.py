"""
FILE: backend/python-rl/websocket_server.py
"""

import asyncio
import websockets
import json
from typing import Dict, Any

class GameWebSocketServer:
    def __init__(self, host: str = "localhost", port: int = 8765):
        self.host = host
        self.port = port
        self.websocket = None
        self.connected = False
        self.current_episode = 0
        self.episode_active = False
        self.pending_observation = None
        self.observation_event = asyncio.Event()
    
    async def start_server(self):
        async with websockets.serve(
            self.handle_connection,
            self.host,
            self.port,
            ping_interval=20,
            ping_timeout=20
        ):
            await asyncio.Future()
    
    async def handle_connection(self, websocket):
        self.websocket = websocket
        self.connected = True
        
        try:
            async for message in websocket:
                await self.handle_message(message)
        except websockets.exceptions.ConnectionClosed:
            self.connected = False
            self.websocket = None
        except Exception:
            self.connected = False
            self.websocket = None
    
    async def handle_message(self, message: str):
        try:
            data = json.loads(message)
            msg_type = data.get('type')
            
            if msg_type == 'observation':
                self.pending_observation = data
                self.observation_event.set()
            elif msg_type == 'error':
                pass
        except (json.JSONDecodeError, Exception):
            pass
    
    async def send_message(self, data: Dict[str, Any]):
        if not self.connected or not self.websocket:
            raise ConnectionError("Browser not connected")
        
        try:
            message = json.dumps(data)
            await self.websocket.send(message)
        except Exception as e:
            raise
    
    async def reset_episode(self, episode: int) -> Dict[str, Any]:
        self.pending_observation = None
        self.observation_event.clear()
        
        await self.send_message({
            'type': 'reset',
            'episode': episode
        })
        
        await asyncio.wait_for(self.observation_event.wait(), timeout=10.0)
        
        obs_data = self.pending_observation
        self.pending_observation = None
        self.observation_event.clear()
        
        self.episode_active = True
        self.current_episode = episode
        
        return obs_data
    
    async def step(self, actions):
        self.pending_observation = None
        self.observation_event.clear()
        
        await self.send_message({
            'type': 'step',
            'actions': actions
        })
        
        await asyncio.wait_for(self.observation_event.wait(), timeout=10.0)
        
        step_data = self.pending_observation
        self.pending_observation = None
        self.observation_event.clear()
        
        return step_data
    
    async def close(self):
        if self.websocket:
            await self.websocket.close()
        self.connected = False

_server_instance = None

def get_server(host: str = "localhost", port: int = 8765) -> GameWebSocketServer:
    global _server_instance
    if _server_instance is None:
        _server_instance = GameWebSocketServer(host, port)
    return _server_instance