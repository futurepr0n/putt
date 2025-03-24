const io = window.io;

export class SocketManager {
  constructor(roomId, game) {
    this.socket = null;
    this.roomId = roomId;
    this.game = game;
    this.eventHandlers = new Map();
  }
  
  init() {
    // Initialize socket.io connection
    this.socket = io();
    
    // Set up connection event handlers
    this.setupConnectionEvents();
    
    // Join room
    if (this.roomId) {
      this.joinRoom(this.roomId);
    }
  }
  
  setupConnectionEvents() {
    this.socket.on('connect', () => {
      console.log('Connected to server');
      this.updateConnectionStatus('Connected', true);
      
      // Join room if roomId exists
      if (this.roomId) {
        this.joinRoom(this.roomId);
      }
    });
    
    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
      this.updateConnectionStatus('Disconnected', false);
    });
    
    this.socket.on('roomJoined', (data) => {
      console.log('Joined room:', data.roomId);
      this.handleRoomJoined(data);
    });
    
    this.socket.on('roomError', (data) => {
      console.error('Room error:', data.message);
      this.handleRoomError(data);
    });
    
    // Set up custom event handlers
    this.socket.on('orientation', (data) => {
      this.trigger('orientation', data);
    });
    
    this.socket.on('throw', (data) => {
      this.trigger('throw', data);
    });
  }
  
  joinRoom(roomId) {
    if (!this.socket) return;
    
    console.log('Joining room:', roomId);
    this.socket.emit('joinRoom', roomId);
  }
  
  updateConnectionStatus(text, connected) {
    const connectionStatus = document.getElementById('connectionStatus');
    if (connectionStatus) {
      connectionStatus.textContent = text;
      connectionStatus.className = connected ? 'connected' : 'disconnected';
    }
  }
  
  handleRoomJoined(data) {
    const roomIdElement = document.getElementById('roomId');
    if (roomIdElement) {
      roomIdElement.textContent = data.roomId;
    }
    
    // Generate controller URL and QR code
    this.generateControllerLink(data);
  }
  
  handleRoomError(data) {
    alert(`Error: ${data.message}. Redirecting to home page...`);
    window.location.href = '/';
  }
  
  generateControllerLink(data) {
    // Get domain from data or use default
    const domain = data.domain || window.location.hostname;
    const protocol = data.protocol || window.location.protocol.replace(':', '');
    
    // Generate controller URL
    const controllerUrl = `${protocol}://${domain}/controller.html?room=${data.roomId}`;
    
    // Display controller link
    const controllerLinkElement = document.getElementById('controllerLink');
    if (controllerLinkElement) {
      controllerLinkElement.textContent = controllerUrl;
    }
    
    // Generate QR Code
    const qrCodeContainer = document.getElementById('qrCodeContainer');
    if (qrCodeContainer && window.QRCode) {
      qrCodeContainer.innerHTML = '';
      new QRCode(qrCodeContainer, {
        text: controllerUrl,
        width: 128,
        height: 128,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
      });
    }
  }
  
  // Event handling system
  on(eventName, callback) {
    if (!this.eventHandlers.has(eventName)) {
      this.eventHandlers.set(eventName, []);
    }
    
    this.eventHandlers.get(eventName).push(callback);
  }
  
  off(eventName, callback) {
    if (!this.eventHandlers.has(eventName)) return;
    
    const handlers = this.eventHandlers.get(eventName);
    const index = handlers.indexOf(callback);
    
    if (index !== -1) {
      handlers.splice(index, 1);
    }
  }
  
  trigger(eventName, data) {
    if (!this.eventHandlers.has(eventName)) return;
    
    const handlers = this.eventHandlers.get(eventName);
    handlers.forEach(callback => callback(data));
  }
  
  // Send events to server
  emitHoleComplete(data) {
    if (this.socket) {
      this.socket.emit('holeComplete', data);
    }
  }
  
  emitGameComplete(data) {
    if (this.socket) {
      this.socket.emit('gameComplete', data);
    }
  }
}