// Updates to server.js

const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

// Store active game rooms
const gameRooms = new Map();

// Add configuration for domain
const config = {
  domain: process.env.DOMAIN || 'putt.futurepr0n.com',
  protocol: process.env.PROTOCOL || 'https',
  port: process.env.PORT || 3002,
  maxRooms: 100,
  roomExpiryHours: 2
};

// Create public directory if it doesn't exist
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir);
}

// Serve static files
app.use(express.static('public'));

// Add middleware for handling the domain
app.use((req, res, next) => {
  // Set CORS headers to allow controllers from other origins
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  
  // Allow websocket connections
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  
  // Add cache control for static assets
  if (req.path.match(/\.(js|css|html)$/)) {
    res.header('Cache-Control', 'public, max-age=3600'); // 1 hour
  }
  
  next();
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/create-room', (req, res) => {
  // Check if we've reached the maximum number of rooms
  if (gameRooms.size >= config.maxRooms) {
    // Clean up expired rooms first
    cleanupExpiredRooms();
    
    // If still too many rooms, show error
    if (gameRooms.size >= config.maxRooms) {
      return res.status(503).send('Server is currently at capacity. Please try again later.');
    }
  }
  
  const roomId = uuidv4().substring(0, 8); // Create a shorter room ID
  gameRooms.set(roomId, { 
    createdAt: Date.now(),
    connections: 0,
    roster: new Map(),
    activePlayerId: null,
    lastTurn: null,
    gameType: 'minigolf',
    lastActivity: Date.now()
  });
  
  res.redirect(`/game.html?room=${roomId}`);
});

app.get('/rooms', (req, res) => {
  // Clean up rooms that have expired
  cleanupExpiredRooms();
  
  // Return list of active rooms
  const rooms = Array.from(gameRooms.keys());
  res.json({ rooms });
});

// Game health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    activeRooms: gameRooms.size,
    uptime: process.uptime()
  });
});

// Clean up expired rooms
function cleanupExpiredRooms() {
  const expiryTime = Date.now() - (config.roomExpiryHours * 60 * 60 * 1000);
  
  for (const [roomId, roomData] of gameRooms.entries()) {
    if (roomData.lastActivity < expiryTime && roomData.connections <= 0) {
      gameRooms.delete(roomId);
    }
  }
}

// Socket.io rooms: `${roomId}:game` holds game screens, `${roomId}:ctrl` holds player controllers
const gameChannel = (roomId) => `${roomId}:game`;
const ctrlChannel = (roomId) => `${roomId}:ctrl`;

function cleanName(name) {
  const s = typeof name === 'string' ? name.replace(/[<>&"'`]/g, '').trim().slice(0, 16) : '';
  return s || 'Player';
}

function cleanId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(id) ? id : null;
}

function rosterOf(roomData) {
  return Array.from(roomData.roster.entries()).map(([playerId, p]) => ({
    playerId, name: p.name, connected: p.connected
  }));
}

io.on('connection', (socket) => {
  let currentRoom = null;
  let role = null;
  let playerId = null;

  console.log('A client connected:', socket.id);

  socket.on('joinRoom', (payload) => {
    // Legacy form: joinRoom(roomId) from the game screen
    const req = typeof payload === 'string' ? { roomId: payload, role: 'game' } : (payload || {});
    const roomId = req.roomId;

    if (typeof roomId !== 'string' || !gameRooms.has(roomId)) {
      socket.emit('roomError', { message: 'Room does not exist' });
      return;
    }
    if (currentRoom) {
      socket.emit('roomError', { message: 'Already joined a room' });
      return;
    }

    const roomData = gameRooms.get(roomId);
    currentRoom = roomId;
    roomData.connections++;
    roomData.lastActivity = Date.now();

    if (req.role === 'controller') {
      playerId = cleanId(req.clientId) || uuidv4();
      role = 'controller';
      const existing = roomData.roster.get(playerId);
      if (existing && existing.connected && existing.socketId !== socket.id) {
        // Same phone reconnecting (or a duplicate tab): newest connection wins
        io.to(existing.socketId).emit('roomError', { message: 'This player connected from another tab' });
      }
      roomData.roster.set(playerId, { name: cleanName(req.name), socketId: socket.id, connected: true });
      socket.join(ctrlChannel(roomId));
      socket.to(gameChannel(roomId)).emit('player_joined', { playerId, name: roomData.roster.get(playerId).name });
    } else {
      role = 'game';
      socket.join(gameChannel(roomId));
      socket.emit('roster', rosterOf(roomData));
    }

    console.log(`Client ${socket.id} joined room ${roomId} as ${role}`);
    socket.emit('roomJoined', {
      roomId,
      playerId,
      gameType: roomData.gameType || 'minigolf',
      domain: config.domain,
      protocol: config.protocol
    });
    if (role === 'controller' && roomData.lastTurn) socket.emit('turn', roomData.lastTurn);
  });

  // Controller input is tagged with the sender and only accepted from the player whose turn it is
  function forwardInput(eventName, data) {
    if (role !== 'controller' || !currentRoom) return;
    const roomData = gameRooms.get(currentRoom);
    if (!roomData) return;
    if (roomData.activePlayerId !== playerId) {
      if (eventName === 'throw' || eventName === 'aim_start') {
        socket.emit('game_status', { state: 'not_your_turn', message: 'Not your turn yet' });
      }
      return;
    }
    roomData.lastActivity = Date.now();
    socket.to(gameChannel(currentRoom)).emit(eventName, { ...data, playerId });
  }

  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

  socket.on('orientation', (data) => {
    if (data && isNum(data.x) && isNum(data.y) && isNum(data.z)) {
      forwardInput('orientation', { x: data.x, y: data.y, z: data.z });
    }
  });

  socket.on('aim_start', () => forwardInput('aim_start', {}));
  socket.on('aim_end', () => forwardInput('aim_end', {}));

  socket.on('swing_data', (data) => {
    if (data && isNum(data.deviation) && isNum(data.power)) {
      forwardInput('swing_data', { deviation: data.deviation, power: data.power });
    }
  });

  socket.on('throw', (data) => {
    if (data && isNum(data.power)) {
      forwardInput('throw', { power: data.power, deviation: isNum(data.deviation) ? data.deviation : 0 });
    }
  });

  // Per-stroke sensor summary for tuning the swing model from production logs
  let lastSwingLog = 0;
  socket.on('swing_log', (data) => {
    if (role !== 'controller' || !currentRoom || !data || typeof data !== 'object') return;
    const now = Date.now();
    if (now - lastSwingLog < 1500) return;
    lastSwingLog = now;
    const line = JSON.stringify({ room: currentRoom, player: playerId, ...data });
    if (line.length <= 4096) console.log('[swing]', line);
  });

  // --- Game screen -> controllers ---

  socket.on('turn', (data) => {
    if (role !== 'game' || !currentRoom || !data || typeof data !== 'object') return;
    const roomData = gameRooms.get(currentRoom);
    if (!roomData) return;
    roomData.activePlayerId = typeof data.playerId === 'string' ? data.playerId : null;
    roomData.lastTurn = data;
    roomData.lastActivity = Date.now();
    socket.to(ctrlChannel(currentRoom)).emit('turn', data);
  });

  socket.on('game_status', (data) => {
    if (role !== 'game' || !currentRoom || !data || typeof data.state !== 'string') return;
    const msg = {
      state: data.state.slice(0, 32),
      message: typeof data.message === 'string' ? data.message.slice(0, 120) : ''
    };
    const roomData = gameRooms.get(currentRoom);
    const target = data.to && roomData && roomData.roster.get(data.to);
    if (target) {
      if (target.connected) io.to(target.socketId).emit('game_status', msg);
    } else {
      socket.to(ctrlChannel(currentRoom)).emit('game_status', msg);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    if (!currentRoom || !gameRooms.has(currentRoom)) return;

    const roomData = gameRooms.get(currentRoom);
    roomData.connections--;
    roomData.lastActivity = Date.now();

    if (role === 'controller') {
      const player = roomData.roster.get(playerId);
      // Ignore if this player already reconnected on a newer socket
      if (player && player.socketId === socket.id) {
        player.connected = false;
        socket.to(gameChannel(currentRoom)).emit('player_left', { playerId });
      }
    }
  });
});


// Schedule cleanup every hour
setInterval(cleanupExpiredRooms, 60 * 60 * 1000);

// Start the server
const PORT = config.port;
http.listen(PORT, () => {
  console.log(`Mini Golf Server running on http://localhost:${PORT}`);
  console.log(`Game configured for domain: ${config.protocol}://${config.domain}`);
});