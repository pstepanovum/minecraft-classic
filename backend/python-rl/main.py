"""
FILE: backend/python-rl/main.py
Main training entry point with optional checkpoint restoration
"""

import asyncio
import yaml
import sys
import traceback
from pathlib import Path

from websocket_server import get_server
from ppo_trainer import train


async def run_server_and_training(config, restore_checkpoint=None):
    server = get_server(
        config['websocket']['host'],
        config['websocket']['port']
    )
    
    server_task = asyncio.create_task(server.start_server())
    
    print("⏳ Waiting for client connection...")
    while not server.connected:
        await asyncio.sleep(0.5)
    
    print("✅ Client connected!")
    
    # Give frontend time to initialize
    await asyncio.sleep(2)
    
    if restore_checkpoint:
        print(f"🔄 Continuing training from checkpoint: {restore_checkpoint}")
    else:
        print("🚀 Starting new training session...")
    
    try:
        train(config, restore_checkpoint=restore_checkpoint)
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
    
    # Check for checkpoint restoration argument
    restore_checkpoint = None
    
    if len(sys.argv) > 1:
        if sys.argv[1] == '--help' or sys.argv[1] == '-h':
            print("\n" + "="*60)
            print("PPO Training - Minecraft Hide and Seek")
            print("="*60)
            print("\nUsage:")
            print("  python main.py                    # Start new training")
            print("  python main.py <checkpoint_path>  # Continue from checkpoint")
            print("\nExamples:")
            print("  python main.py")
            print("  python main.py ./checkpoints/checkpoint_000050")
            print("\nUtility Scripts:")
            print("  python list_checkpoints.py        # View all checkpoints")
            print("  python continue_training.py <checkpoint>  # Continue training")
            print("  python demo_model.py              # Watch trained agents play")
            print("="*60 + "\n")
            sys.exit(0)
        
        # Assume it's a checkpoint path
        checkpoint_arg = sys.argv[1]
        checkpoint_path = Path(checkpoint_arg)
        
        if not checkpoint_path.exists():
            print(f"❌ ERROR: Checkpoint not found: {checkpoint_path}")
            sys.exit(1)
        
        restore_checkpoint = str(checkpoint_path)
        print(f"📂 Will restore from: {restore_checkpoint}")
    
    try:
        asyncio.run(run_server_and_training(config, restore_checkpoint))
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