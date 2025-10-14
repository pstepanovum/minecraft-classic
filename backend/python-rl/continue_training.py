"""
FILE: backend/python-rl/continue_training.py
Continue training from a saved checkpoint
"""

import sys
import yaml
from pathlib import Path

from ppo_trainer import train


def main():
    if len(sys.argv) < 2:
        print("=" * 60)
        print("🔄 Continue Training from Checkpoint")
        print("=" * 60)
        print("\nUsage:")
        print("  python continue_training.py <checkpoint_path>")
        print("\nExamples:")
        print("  python continue_training.py ./checkpoints/checkpoint_000050")
        print("  python continue_training.py ./checkpoints/checkpoint_000100")
        print("\nThe script will:")
        print("  • Load the specified checkpoint")
        print("  • Continue training for the remaining iterations")
        print("  • Save new checkpoints alongside existing ones")
        print("=" * 60)
        sys.exit(1)
    
    checkpoint_path = sys.argv[1]
    
    # Validate checkpoint exists
    if not Path(checkpoint_path).exists():
        print(f"❌ Checkpoint not found: {checkpoint_path}")
        sys.exit(1)
    
    # Load config
    config_path = Path(__file__).parent / "config.yaml"
    
    try:
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f)
    except Exception as e:
        print(f"❌ Failed to load config: {e}")
        sys.exit(1)
    
    print(f"\n{'='*60}")
    print(f"🔄 CONTINUE TRAINING")
    print(f"{'='*60}")
    print(f"Checkpoint: {checkpoint_path}")
    print(f"Config: {config_path}")
    print(f"{'='*60}\n")
    
    # Ask for confirmation
    response = input("Continue training from this checkpoint? [y/N]: ")
    
    if response.lower() != 'y':
        print("Cancelled.")
        sys.exit(0)
    
    try:
        # Call train with restore_checkpoint parameter
        train(config, restore_checkpoint=checkpoint_path)
    except KeyboardInterrupt:
        print("\n👋 Training interrupted")
    except Exception as e:
        print(f"\n❌ Fatal error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()