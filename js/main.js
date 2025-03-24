import { Game } from './core/Game.js';

// Entry point for the application
document.addEventListener('DOMContentLoaded', () => {
  // Get room ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  const roomId = urlParams.get('room');
  
  if (!roomId) {
    alert('Room ID is missing. Redirecting to home page...');
    window.location.href = '/';
    return;
  }
  
  // Create and initialize the game
  const game = new Game(roomId);
  game.init();
  
  // Store game instance globally for debugging
  window.gameInstance = game;
});