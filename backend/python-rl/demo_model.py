"""
FILE: backend/python-rl/demo_model.py
Demo mode - watch trained agents play with checkpoint selection
"""

import asyncio
import yaml
import sys
from pathlib import Path
import json

from websocket_server import get_server
from ppo_trainer import create_ppo_trainer


def select_checkpoint(checkpoint_base_dir):
    """
    Interactive checkpoint selection
    
    Returns:
        Path to selected checkpoint or None
    """
    checkpoint_base = Path(checkpoint_base_dir)
    
    if not checkpoint_base.exists():
        print(f"❌ Checkpoint directory not found: {checkpoint_base}")
        return None
    
    # Load checkpoint index
    index_file = checkpoint_base / "checkpoint_index.json"
    
    if index_file.exists():
        with open(index_file, 'r') as f:
            data = json.load(f)
            checkpoints = data.get('checkpoints', [])
    else:
        # Fallback: scan directory
        checkpoints = []
        for cp_dir in sorted(checkpoint_base.glob("checkpoint_*")):
            if cp_dir.is_dir():
                # Try to extract iteration
                try:
                    iteration = int(cp_dir.name.split('_')[1])
                    checkpoints.append({
                        'iteration': iteration,
                        'path': cp_dir.name
                    })
                except:
                    pass
    
    if not checkpoints:
        print(f"❌ No checkpoints found in {checkpoint_base}")
        return None
    
    # Display available checkpoints
    print(f"\n{'='*60}")
    print(f"📂 Available Checkpoints ({len(checkpoints)} found)")
    print(f"{'='*60}")
    
    # Show last 15 checkpoints
    display_checkpoints = checkpoints[-15:]
    
    for i, cp in enumerate(display_checkpoints, 1):
        iteration = cp.get('iteration', '?')
        cp_path = checkpoint_base / cp['path']
        
        # Try to load metadata
        metadata_file = cp_path / "metadata.json"
        extra_info = ""
        
        if metadata_file.exists():
            try:
                with open(metadata_file, 'r') as f:
                    metadata = json.load(f)
                    reward = metadata.get('reward_mean', 0)
                    timestamp = metadata.get('timestamp', '')
                    if timestamp:
                        timestamp = timestamp.split('T')[0]  # Just date
                    extra_info = f" | Reward: {reward:.2f} | {timestamp}"
            except:
                pass
        
        print(f"  {i:2d}. Iteration {iteration:6d} {extra_info}")
    
    print(f"\nOptions:")
    print(f"  • Enter number (1-{len(display_checkpoints)}) to select checkpoint")
    print(f"  • Press Enter to use latest checkpoint")
    print(f"  • Type 'q' to quit")
    
    choice = input(f"\nSelect checkpoint: ").strip()
    
    if choice.lower() == 'q':
        return None
    
    if choice == '':
        # Use latest
        latest = checkpoints[-1]
        checkpoint_path = checkpoint_base / latest['path']
        print(f"\n✅ Using latest checkpoint: {latest['path']}")
        return str(checkpoint_path)
    
    try:
        idx = int(choice) - 1
        if 0 <= idx < len(display_checkpoints):
            # Adjust for display offset
            actual_idx = len(checkpoints) - len(display_checkpoints) + idx
            selected = checkpoints[actual_idx]
            checkpoint_path = checkpoint_base / selected['path']
            print(f"\n✅ Selected: {selected['path']}")
            return str(checkpoint_path)
        else:
            print(f"❌ Invalid selection")
            return None
    except ValueError:
        print(f"❌ Invalid input")
        return None


async def run_demo(config, checkpoint_path):
    """Run demo mode - watch trained agents play"""
    
    server = get_server(
        config['websocket']['host'],
        config['websocket']['port']
    )
    
    # Start server in background
    server_task = asyncio.create_task(server.start_server())
    
    # Wait for browser connection
    print("⏳ Waiting for browser connection...")
    print("   (Click 'DEMO TRAINED MODEL' button in browser)")
    
    while not server.connected:
        await asyncio.sleep(0.5)
    
    print(f"\n✅ Browser connected!")
    print(f"📂 Loading checkpoint: {checkpoint_path}")
    
    # Load trained model
    trainer, _ = create_ppo_trainer(config, restore_path=checkpoint_path)
    
    print(f"✅ Model loaded successfully!")
    print(f"🎮 Demo mode active - watching trained agents\n")
    print(f"{'='*60}")
    
    episode = 0
    
    try:
        while True:
            episode += 1
            
            print(f"\n{'─'*60}")
            print(f"🎮 Demo Episode {episode}")
            print(f"{'─'*60}")
            
            # Use server's reset_episode method (handles messaging automatically)
            try:
                obs_data = await server.reset_episode(episode)
            except asyncio.TimeoutError:
                print("⚠️ Timeout waiting for reset response")
                continue
            except Exception as e:
                print(f"❌ Reset error: {e}")
                continue
            
            # Play episode
            step = 0
            done = False
            total_reward = 0
            seeker_reward = 0
            hider_rewards = []
            
            while not done:
                step += 1
                
                # Get observations
                agents = obs_data.get('agents', [])
                observations = {}
                agent_roles = {}
                
                for agent_data in agents:
                    agent_id = agent_data['id']
                    obs = agent_data['observation']
                    role = agent_data.get('role', 'seeker' if 'seeker' in agent_id else 'hider')
                    
                    observations[agent_id] = obs
                    agent_roles[agent_id] = role
                
                # Compute actions from trained policy
                actions = {}
                for agent_id, obs in observations.items():
                    role = agent_roles[agent_id]
                    policy_id = f"{role}_policy"
                    
                    try:
                        # Get action (deterministic - no exploration)
                        action = trainer.compute_single_action(
                            obs,
                            policy_id=policy_id,
                            explore=False
                        )
                        
                        # Convert to browser format
                        actions[agent_id] = {
                            'movement_forward': float(action[0]),
                            'movement_strafe': float(action[1]),
                            'rotation': float(action[2]),
                            'look': float(action[3]),
                            'jump': bool(float(action[4]) > 0.5),
                            'place_block': bool(float(action[5]) > 0.5),
                            'remove_block': bool(float(action[6]) > 0.5),
                        }
                    except Exception as e:
                        print(f"⚠️ Error computing action for {agent_id}: {e}")
                        # Zero action fallback
                        actions[agent_id] = {
                            'movement_forward': 0.0,
                            'movement_strafe': 0.0,
                            'rotation': 0.0,
                            'look': 0.0,
                            'jump': False,
                            'place_block': False,
                            'remove_block': False,
                        }
                
                # Send step and get response
                try:
                    obs_data = await server.step(actions)
                except asyncio.TimeoutError:
                    print(f"⚠️ Timeout at step {step}")
                    break
                except Exception as e:
                    print(f"❌ Step error: {e}")
                    break
                
                # Update rewards
                if 'agents' in obs_data:
                    for agent_data in obs_data['agents']:
                        reward = agent_data.get('reward', 0)
                        total_reward += reward
                        
                        agent_id = agent_data['id']
                        if 'seeker' in agent_id:
                            seeker_reward += reward
                        else:
                            hider_rewards.append(reward)
                
                # Check if done
                done = obs_data.get('episode_done', False)
                
                # Log progress
                if step % 20 == 0:
                    print(f"   Step {step} | Total Reward: {total_reward:.2f}")
            
            # Episode summary
            hider_avg = sum(hider_rewards) / len(hider_rewards) if hider_rewards else 0
            
            print(f"\n✅ Episode {episode} complete!")
            print(f"   Total steps: {step}")
            print(f"   Total reward: {total_reward:.2f}")
            print(f"   Seeker reward: {seeker_reward:.2f}")
            print(f"   Hider avg reward: {hider_avg:.2f}")
            
            # Short pause before next episode
            await asyncio.sleep(2)
    
    except KeyboardInterrupt:
        print(f"\n\n⚠️ Demo stopped by user")
    
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        print(f"\n👋 Shutting down...")
        trainer.stop()
        server_task.cancel()


def main():
    # Load config
    config_path = Path(__file__).parent / "config.yaml"
    
    try:
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f)
    except Exception as e:
        print(f"❌ Failed to load config: {e}")
        sys.exit(1)
    
    checkpoint_base = Path(__file__).parent / "checkpoints"
    
    print(f"\n{'='*60}")
    print(f"🎮 DEMO MODE - Trained Model Playback")
    print(f"{'='*60}")
    print(f"Checkpoint directory: {checkpoint_base}")
    print(f"WebSocket: {config['websocket']['host']}:{config['websocket']['port']}")
    print(f"{'='*60}")
    
    # Select checkpoint
    checkpoint_path = select_checkpoint(checkpoint_base)
    
    if not checkpoint_path:
        print("\n❌ No checkpoint selected. Exiting.")
        sys.exit(1)
    
    try:
        asyncio.run(run_demo(config, checkpoint_path))
    except KeyboardInterrupt:
        print("\n👋 Goodbye!")
    except Exception as e:
        print(f"\n❌ Fatal error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()