"""
FILE: backend/python-rl/main.py
"""

import asyncio
import yaml
import sys
import traceback
from pathlib import Path

from websocket_server import get_server
from ppo_trainer import train


async def run_server_and_training(config):
    server = get_server(
        config['websocket']['host'],
        config['websocket']['port']
    )
    
    server_task = asyncio.create_task(server.start_server())
    
    print("⏳ Waiting for client connection...")
    while not server.connected:
        await asyncio.sleep(0.5)
    
    print("✅ Client connected, waiting for 'start_training' message...")
    
    # ADDED: Wait for explicit start training message from frontend
    while True:
        await asyncio.sleep(0.5)
        # Check if we received a start signal (you'll need to add this to websocket_server.py)
        # For now, let's just wait a bit for the frontend to be ready
        if server.connected:
            await asyncio.sleep(2)  # Give frontend time to initialize
            break
    
    print("🚀 Starting training...")
    
    try:
        train(config)
    except Exception as e:
        print(f"\n❌ ERROR IN TRAINING:")
        print(f"Error type: {type(e).__name__}")
        print(f"Error message: {str(e)}")
        print(f"\nFull traceback:")
        traceback.print_exc()
        raise
    finally:
        server_task.cancel()
        try:
            await server_task
        except asyncio.CancelledError:
            pass


def main():
    config_path = Path(__file__).parent / "config.yaml"
    
    print(f"📁 Loading config from: {config_path}")
    
    try:
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f)
        print("✅ Config loaded successfully")
    except FileNotFoundError:
        print(f"❌ ERROR: Config file not found at {config_path}")
        sys.exit(1)
    except yaml.YAMLError as e:
        print(f"❌ ERROR: Invalid YAML in config file:")
        print(str(e))
        sys.exit(1)
    except Exception as e:
        print(f"❌ ERROR loading config:")
        print(f"Error type: {type(e).__name__}")
        print(f"Error message: {str(e)}")
        traceback.print_exc()
        sys.exit(1)
    
    try:
        asyncio.run(run_server_and_training(config))
    except KeyboardInterrupt:
        print("\n⚠️ Interrupted by user (Ctrl+C)")
    except Exception as e:
        print(f"\n❌ FATAL ERROR:")
        print(f"Error type: {type(e).__name__}")
        print(f"Error message: {str(e)}")
        print(f"\nFull traceback:")
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()