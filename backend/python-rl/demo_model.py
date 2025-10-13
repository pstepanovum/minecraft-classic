"""
FILE: backend/python-rl/demo_model.py
Demo mode - watch trained agents play
"""

import asyncio
import yaml
import sys
from pathlib import Path

from websocket_server import get_server
from ppo_trainer import create_ppo_trainer


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
    trainer = create_ppo_trainer(config)
    trainer.restore(checkpoint_path)
    
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
                        total_reward += agent_data.get('reward', 0)
                
                # Check if done
                done = obs_data.get('episode_done', False)
                
                # Log progress
                if step % 10 == 0:
                    print(f"   Step {step}...")
            
            print(f"✅ Episode {episode} complete!")
            print(f"   Total steps: {step}")
            print(f"   Total reward: {total_reward:.2f}")
            
            # Short pause before next episode
            await asyncio.sleep(1)
    
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
    
    checkpoint_path = str(Path(__file__).parent / "checkpoints")
    
    print(f"\n{'='*60}")
    print(f"🎮 DEMO MODE - Trained Model Playback")
    print(f"{'='*60}")
    print(f"Checkpoint: {checkpoint_path}")
    print(f"WebSocket: {config['websocket']['host']}:{config['websocket']['port']}")
    print(f"{'='*60}\n")
    
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