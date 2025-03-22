const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Store active game rooms
const gameRooms = new Map();

// Serve static files
app.use(express.static('public'));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/create-room', (req, res) => {
  const roomId = uuidv4().substring(0, 8); // Create a shorter room ID
  gameRooms.set(roomId, { 
    createdAt: Date.now(),
    players: 0,
    gameType: 'minigolf'
  });
  
  res.redirect(`/game.html?room=${roomId}`);
});

app.get('/rooms', (req, res) => {
  // Clean up rooms that haven't been used for more than 2 hours
  const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
  
  for (const [roomId, roomData] of gameRooms.entries()) {
    if (roomData.createdAt < twoHoursAgo && roomData.players === 0) {
      gameRooms.delete(roomId);
    }
  }
  
  // Return list of active rooms
  const rooms = Array.from(gameRooms.keys());
  res.json({ rooms });
});

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
    gameRooms.set(roomId, roomData);
    
    console.log(`Client ${socket.id} joined room ${roomId}`);
    socket.emit('roomJoined', { 
      roomId, 
      gameType: roomData.gameType || 'minigolf'  
    });
  });

  // When the controller sends a putt (still using 'throw' event for compatibility)
  socket.on('throw', (data) => {
    if (!currentRoom) {
      console.error('Putt received but client is not in a room');
      return;
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
      // Broadcast to everyone in the room except sender
      socket.to(currentRoom).emit('holeComplete', data);
    }
  });

  socket.on('gameComplete', (data) => {
    if (currentRoom) {
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
      gameRooms.set(currentRoom, roomData);
    }
  });
});

// Start the server
const PORT = process.env.PORT || 3001;
http.listen(PORT, () => {
  console.log(`Mini Golf Server running on http://localhost:${PORT}`);
});
