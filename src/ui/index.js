import { renderApp } from './components/App.js';
import { initializeState } from './state.js';

// Initialize the app
document.addEventListener('DOMContentLoaded', async () => {
  await initializeState();
  renderApp();
});