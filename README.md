# Minecraft Classic Clone

A browser-based Minecraft-like game built with Three.js for rendering and Socket.IO for multiplayer functionality. This project features a voxel-based world with terrain generation, player movement, and basic block manipulation.

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage](#usage)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

## Features

- Procedurally generated terrain using Simplex Noise
- Multiplayer functionality with real-time updates
- Block placement and removal
- Day/night cycle
- Player movement and collision detection
- Minimap for navigation

## Prerequisites

Before you begin, ensure you have met the following requirements:

- Node.js (v14 or higher)
- npm (usually comes with Node.js)
- Git

## Installation

To install the Minecraft Classic Clone, follow these steps:

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/minecraft-classic-clone.git
   cd minecraft-classic-clone
   ```

2. Install backend dependencies:
   ```
   cd backend
   npm install
   ```

3. Install frontend dependencies:
   ```
   cd ../frontend
   npm install
   ```

## Usage

To run the game locally:

1. Start the backend server:
   ```
   cd backend
   npm start
   ```
   The server will start on `http://localhost:3000`.

2. In a new terminal, start the frontend server:
   ```
   cd frontend
   npm start
   ```
   The frontend will be available on `http://localhost:8080`.

3. Open your web browser and navigate to `http://localhost:8080` to play the game.

## Deployment

This project is set up for deployment to Vercel (frontend) and Railway (backend).

### Backend Deployment (Railway)

1. Create a new project on Railway and connect it to your GitHub repository.
2. Set the following environment variables:
   - `PORT`: 3000
   - `FRONTEND_URL`: Your Vercel frontend URL (after deploying frontend)

3. Deploy the backend by pushing to the connected GitHub repository.

### Frontend Deployment (Vercel)

1. Create a new project on Vercel and connect it to your GitHub repository.
2. Set the following environment variables:
   - `NEXT_PUBLIC_BACKEND_URL`: Your Railway backend URL

3. Deploy the frontend by pushing to the connected GitHub repository.

After deployment, update the `serverUrl` in `frontend/public/script.js` with your actual Railway backend URL and redeploy the frontend.

## Contributing

Contributions to the Minecraft Classic Clone are welcome. To contribute:

1. Fork the repository.
2. Create a new branch: `git checkout -b feature-branch-name`.
3. Make your changes and commit them: `git commit -m 'Add some feature'`.
4. Push to the original branch: `git push origin feature-branch-name`.
5. Create the pull request.

Alternatively, see the GitHub documentation on [creating a pull request](https://help.github.com/articles/creating-a-pull-request/).

## License

This project is licensed under the [MIT License](LICENSE).