"""
FILE: backend/python-rl/main.py
"""

import asyncio
import yaml
import sys
from pathlib import Path

from websocket_server import get_server
from ppo_trainer import train


async def run_server_and_training(config):
    server = get_server(
        config['websocket']['host'],
        config['websocket']['port']
    )
    
    server_task = asyncio.create_task(server.start_server())
    
    while not server.connected:
        await asyncio.sleep(0.5)
    
    try:
        train(config)
    except Exception:
        raise
    finally:
        server_task.cancel()

def main():
    config_path = Path(__file__).parent / "config.yaml"
    
    try:
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f)
    except Exception:
        sys.exit(1)
    
    try:
        asyncio.run(run_server_and_training(config))
    except KeyboardInterrupt:
        pass
    except Exception:
        sys.exit(1)


if __name__ == "__main__":
    main()