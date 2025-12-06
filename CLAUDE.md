# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **mobile-controlled mini golf game** that uses motion controls from mobile devices to putt a ball in a 3D environment. The architecture follows a client-server pattern where:

- **Server** (`server.js`): Node.js/Express server with Socket.io for real-time communication
- **Game Client** (`game.html`): 3D mini golf game using Three.js and Cannon.js physics
- **Controller Client** (`controller.html`): Mobile web interface that captures device motion

## Development Commands

```bash
# Start development server with auto-reload
npm run dev

# Start production server
npm start

# Install dependencies
npm install
```

## Architecture & Core Systems

### Room-Based Multiplayer
- Each game session has a unique room ID generated via UUID
- Players join rooms via `/create-room` endpoint which redirects to game with room parameter
- Socket.io manages real-time communication between controller and game clients
- Room cleanup occurs automatically after 2 hours of inactivity

### Motion Control Flow
1. Mobile controller captures device orientation via DeviceOrientationEvent
2. Controller sends orientation data via Socket.io to server
3. Server broadcasts orientation to all clients in the same room
4. Game client receives orientation and updates direction indicator
5. When "putt" action is triggered, velocity data is sent and applied to physics ball

### 3D Game Engine Structure
- **SceneManager**: Three.js scene setup, lighting, camera controls
- **PhysicsManager**: Cannon.js physics world, collision detection
- **CourseManager**: Golf course generation, obstacles, hole mechanics
- **UIManager**: HUD, scoring, messages, direction indicators
- **SocketManager**: WebSocket communication handling

### Key Configuration
- Game settings in `public/js/config/gameConfig.js`
- Physics tuning (gravity, friction, ball properties)
- Course layout parameters (size, obstacles)
- Debug flags for development

## File Structure Patterns

```
server.js                     # Express server + Socket.io
public/
├── game.html                 # 3D game client
├── controller.html           # Mobile controller interface  
├── js/
│   ├── core/                 # Core game systems (Game, Scene, Physics, Socket)
│   ├── course/               # Golf course elements (Ball, Hole, obstacles)
│   ├── ui/                   # User interface components
│   ├── utils/                # Utility functions
│   └── config/               # Game configuration
```

## Development Notes

### Testing Motion Controls
- Use mobile device or browser dev tools device emulation
- iOS requires user gesture to enable DeviceOrientationEvent
- Test room creation and joining flow with multiple browser tabs

### Physics Debugging
- Enable debug visualization in `gameConfig.js` debug section
- Physics simulation runs at 120 FPS (configurable timeStep)
- Ball reset triggers on out-of-bounds or velocity < 0.1 after 2 seconds

### Socket Events
- `joinRoom`: Client joins game room
- `orientation`: Real-time device orientation from controller
- `throw`: Putt action with velocity data
- `holeComplete`/`gameComplete`: Game state events

### SSL Configuration
- SSL certificates in `/ssl/` directory (gitignored)
- Server configured for HTTPS in production
- Domain configuration via environment variables

## Common Development Tasks

### Adding New Obstacles
1. Create obstacle class in `public/js/course/obstacles/`
2. Import in `CourseManager.js`
3. Add to course generation logic
4. Define physics properties and visual mesh

### Modifying Physics
- Adjust parameters in `gameConfig.js`
- Ball physics: mass, friction, restitution
- Course physics: ground friction, gravity
- Putt mechanics: force limits, upward component

### Room Management
- Rooms auto-expire after `config.roomExpiryHours`
- Maximum rooms limited by `config.maxRooms`
- Health check endpoint at `/health` shows active room count