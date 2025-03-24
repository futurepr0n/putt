const THREE = window.THREE;
const CANNON = window.CANNON;
const io = window.io;

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
  
  // Create game instance
  const game = new Game(roomId);
  
  // Initialize the game after a slight delay to ensure DOM is ready
  setTimeout(() => {
    game.init();
  }, 100);
  
  // Store game instance globally for debugging
  window.gameInstance = game;
});