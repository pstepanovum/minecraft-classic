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
        """Start WebSocket server"""
        print(f"🚀 Starting WebSocket server on {self.host}:{self.port}")
        async with websockets.serve(
            self.handle_connection,
            self.host,
            self.port,
            ping_interval=20,
            ping_timeout=20
        ):
            await asyncio.Future()  # Run forever
    
    async def handle_connection(self, websocket):
        """Handle new WebSocket connection"""
        self.websocket = websocket
        self.connected = True
        
        print(f"✅ Client connected from {websocket.remote_address}")
        
        try:
            async for message in websocket:
                await self.handle_message(message)
        
        except websockets.exceptions.ConnectionClosed:
            print("⚠️ Client disconnected")
            self.connected = False
            self.websocket = None
        
        except Exception as e:
            print(f"❌ Error in connection handler: {e}")
            self.connected = False
            self.websocket = None
    
    async def handle_message(self, message_str: str):
        """Process incoming message from browser"""
        try:
            data = json.loads(message_str)
            msg_type = data.get('type', 'unknown')
            
            if msg_type == 'observation':
                # Debug logging
                if 'agents' in data:
                    total_reward = 0
                    reward_details = []
                    for agent in data['agents']:
                        agent_id = agent.get('id', 'unknown')
                        reward = agent.get('reward', 0)
                        total_reward += reward
                        if reward != 0:
                            reward_details.append(f"{agent_id}:{reward:.3f}")
                
                self.pending_observation = data
                self.observation_event.set()
            
            else:
                print(f"📨 Received: {msg_type}")
        
        except json.JSONDecodeError as e:
            print(f"❌ Failed to parse message: {e}")
        except Exception as e:
            print(f"❌ Error handling message: {e}")
            
    async def reset_episode(self, episode: int) -> Dict[str, Any]:
        """Send reset and wait for observations"""
        self.pending_observation = None
        self.observation_event.clear()
        
        await self.send_message({
            'type': 'reset',
            'episode': episode
        })
        
        # Wait for observation response
        await asyncio.wait_for(self.observation_event.wait(), timeout=10.0)
        
        obs_data = self.pending_observation
        self.pending_observation = None
        self.observation_event.clear()
        
        self.episode_active = True
        self.current_episode = episode
        
        return obs_data
    
    async def step(self, actions: Dict[str, Any]) -> Dict[str, Any]:
        """Send step and wait for observations"""
        self.pending_observation = None
        self.observation_event.clear()
        
        await self.send_message({
            'type': 'step',
            'actions': actions
        })
        
        # Wait for observation response
        await asyncio.wait_for(self.observation_event.wait(), timeout=10.0)
        
        step_data = self.pending_observation
        self.pending_observation = None
        self.observation_event.clear()
        
        return step_data
    
    async def send_message(self, message: Dict[str, Any]):
        """Send message to connected browser"""
        if self.connected and self.websocket:
            try:
                await self.websocket.send(json.dumps(message))
            except Exception as e:
                print(f"❌ Error sending message: {e}")
        else:
            print(f"⚠️ Cannot send message - not connected")
    
    async def close(self):
        """Close connection"""
        if self.websocket:
            await self.websocket.close()
        self.connected = False


# Global server instance
_server_instance = None


def get_server(host: str = "localhost", port: int = 8765) -> GameWebSocketServer:
    """Get or create global server instance"""
    global _server_instance
    if _server_instance is None:
        _server_instance = GameWebSocketServer(host, port)
    return _server_instance