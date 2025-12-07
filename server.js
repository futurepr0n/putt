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
    // DISABLE CACHING for development to ensure reverts take effect immediately
    res.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.header('Pragma', 'no-cache');
    res.header('Expires', '0');
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
    players: 0,
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
    if (roomData.lastActivity < expiryTime && roomData.players === 0) {
      gameRooms.delete(roomId);
    }
  }
}

// Socket.io connection handling
io.on('connection', (socket) => {
  let currentRoom = null;

  console.log('A client connected:', socket.id);

  // Join a specific room
  socket.on('joinRoom', (roomId) => {
    // Validate if room exists
    if (!gameRooms.has(roomId)) {
      socket.emit('roomError', { message: 'Room does not exist' });
      return;
    }

    // Leave previous room if any
    if (currentRoom) {
      socket.leave(currentRoom);
      const roomData = gameRooms.get(currentRoom);
      if (roomData) {
        roomData.players--;
        gameRooms.set(currentRoom, roomData);
      }
    }

    // Join new room
    socket.join(roomId);
    currentRoom = roomId;

    // Update room data
    const roomData = gameRooms.get(roomId);
    roomData.players++;
    roomData.lastActivity = Date.now();
    gameRooms.set(roomId, roomData);

    console.log(`Client ${socket.id} joined room ${roomId}`);
    socket.emit('roomJoined', {
      roomId,
      gameType: roomData.gameType || 'minigolf',
      domain: config.domain,
      protocol: config.protocol
    });
  });

  socket.on('orientation', (data) => {
    if (!currentRoom) {
      return;
    }

    // Validate the orientation data
    if (data && typeof data === 'object' &&
      'x' in data && 'y' in data && 'z' in data &&
      !isNaN(data.x) && !isNaN(data.y) && !isNaN(data.z)) {

      // Forward the orientation data to all clients in the room
      // Use socket.to() to only send to others (not back to sender)
      io.to(currentRoom).emit('orientation', data);
    }
  });



  // When the controller sends a putt (still using 'throw' event for compatibility)
  socket.on('throw', (data) => {
    if (!currentRoom) {
      console.error('Putt received but client is not in a room');
      return;
    }

    // Update room activity
    const roomData = gameRooms.get(currentRoom);
    if (roomData) {
      roomData.lastActivity = Date.now();
      gameRooms.set(currentRoom, roomData);
    }

    console.log(`Received putt data in room ${currentRoom}:`, data);

    // Validate the putt data
    if (data && typeof data === 'object' &&
      'x' in data && 'y' in data && 'z' in data &&
      !isNaN(data.x) && !isNaN(data.y) && !isNaN(data.z)) {

      // Send the putt data only to clients in this room
      io.to(currentRoom).emit('throw', data);
    } else {
      console.error('Invalid putt data received:', data);
    }
  });

  // Game events
  socket.on('holeComplete', (data) => {
    if (currentRoom) {
      // Update room activity
      updateRoomActivity(currentRoom);

      // Broadcast to everyone in the room except sender
      socket.to(currentRoom).emit('holeComplete', data);
    }
  });

  socket.on('gameComplete', (data) => {
    if (currentRoom) {
      // Update room activity
      updateRoomActivity(currentRoom);

      // Broadcast to everyone in the room except sender
      socket.to(currentRoom).emit('gameComplete', data);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);

    // Update room players count
    if (currentRoom && gameRooms.has(currentRoom)) {
      const roomData = gameRooms.get(currentRoom);
      roomData.players--;
      roomData.lastActivity = Date.now();
      gameRooms.set(currentRoom, roomData);
    }
  });

  // Helper to update room activity timestamp
  function updateRoomActivity(roomId) {
    const roomData = gameRooms.get(roomId);
    if (roomData) {
      roomData.lastActivity = Date.now();
      gameRooms.set(roomId, roomData);
    }
  }
});



// Schedule cleanup every hour
setInterval(cleanupExpiredRooms, 60 * 60 * 1000);

// Start the server
const PORT = config.port;
http.listen(PORT, () => {
  console.log(`Mini Golf Server running on http://localhost:${PORT}`);
  console.log(`Game configured for domain: ${config.protocol}://${config.domain}`);
});