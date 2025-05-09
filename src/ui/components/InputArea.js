import { TONE_OPTIONS } from '../../../lib/constants.js';

/**
 * Debounce function to limit how often a function is called
 * @param {Function} func - Function to debounce
 * @param {number} wait - Milliseconds to wait
 * @returns {Function} - Debounced function
 */
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Render the input area component
 * @param {Object} props - Component props
 * @returns {HTMLElement} - Input area element
 */
export function renderInputArea({ currentInput, selectedTone, inputPlaceholder, onInputChange, onSendClick, onToneChange, onMicClick, isRecording }) {
  // Store a local copy of the current input to avoid re-renders disrupting typing
  let localInputValue = currentInput || '';
  
  const container = document.createElement('div');
  container.className = 'input-area';
  
  // Tone selector - only showing Neutral option
  const toneSelector = document.createElement('div');
  toneSelector.className = 'tone-selector';
  
  // Only create the Neutral button
  const neutralTone = TONE_OPTIONS.find(tone => tone.id === 'neutral');
  if (neutralTone) {
    const toneButton = document.createElement('button');
    toneButton.className = 'tone-option active'; // Always active
    toneButton.textContent = neutralTone.label;
    toneButton.title = neutralTone.description;
    toneSelector.appendChild(toneButton);
  }
  
  container.appendChild(toneSelector);
  
  // Input container
  const inputContainer = document.createElement('div');
  inputContainer.className = 'input-container';
  
  // Create textarea element with a unique id to help with focus management
  const textarea = document.createElement('textarea');
  textarea.className = 'input-box';
  textarea.id = 'compose-input-' + Date.now();
  textarea.value = localInputValue;
  textarea.placeholder = inputPlaceholder || 'Type your idea to get 5 polished posts...';
  
  // Auto-resize function
  function resizeTextarea() {
    textarea.style.height = 'auto';
    textarea.style.height = (textarea.scrollHeight) + 'px';
  }
  
  // Set initial height
  setTimeout(resizeTextarea, 0);
  
  // Create a debounced version of the state update function
  // Only update the app state every 300ms instead of on every keystroke
  const debouncedStateUpdate = debounce((text) => {
    if (onInputChange) {
      onInputChange(text);
    }
  }, 300);
  
  // Handle input changes locally without always triggering state updates
  textarea.addEventListener('input', function() {
    // Always resize the textarea
    resizeTextarea();
    
    // Store input locally
    localInputValue = this.value;
    
    // Update state with debouncing to avoid too many re-renders
    debouncedStateUpdate(localInputValue);
  });
  
  // Focus management - maintain focus after renders
  textarea.addEventListener('blur', function() {
    // Store current selection position
    const selectionStart = this.selectionStart;
    const selectionEnd = this.selectionEnd;
    
    // Restore focus on next tick if the field still exists
    setTimeout(() => {
      if (document.getElementById(textarea.id)) {
        textarea.focus();
        // Restore selection if needed
        textarea.selectionStart = selectionStart;
        textarea.selectionEnd = selectionEnd;
      }
    }, 0);
  });
  
  inputContainer.appendChild(textarea);

  // Mic button for voice input
  const micButton = document.createElement('button');
  micButton.className = 'mic-button';
  micButton.innerHTML = '<svg fill="white" viewBox="0 0 24 24" width="24" height="24"><path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"></path></svg>';
  
  // Style the mic button
  micButton.style.width = '40px'; 
  micButton.style.height = '40px'; 
  micButton.style.borderRadius = '50%';
  micButton.style.padding = '8px';
  micButton.style.display = 'flex';
  micButton.style.alignItems = 'center';
  micButton.style.justifyContent = 'center';
  micButton.style.border = '1px solid #4A4A4A';
  micButton.style.backgroundColor = '#2C2C2C';
  micButton.style.marginLeft = '8px';
  micButton.style.cursor = 'pointer';
  micButton.style.flexShrink = '0';

  // Style mic button based on recording state
  if (isRecording) {
    micButton.style.backgroundColor = 'rgba(255, 82, 82, 0.3)';
    micButton.style.borderColor = '#FF5252';
  }
  
  micButton.addEventListener('click', () => {
    if (onMicClick) {
      onMicClick();
      // Return focus to textarea after clicking mic
      setTimeout(() => textarea.focus(), 0);
    }
  });
  
  inputContainer.appendChild(micButton);

  // Send button
  const sendButton = document.createElement('button');
  sendButton.className = 'send-button';
  sendButton.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"></line>
      <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
    </svg>
  `;
  
  // Send message function
  function sendMessage() {
    if (localInputValue.trim()) {
      if (onSendClick) {
        onSendClick(localInputValue);
      }
      // Clear local value and textarea
      localInputValue = '';
      textarea.value = '';
      resizeTextarea();
      // Return focus to textarea
      setTimeout(() => textarea.focus(), 0);
    }
  }
  
  sendButton.addEventListener('click', sendMessage);
  
  // Handle enter key to send
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  
  inputContainer.appendChild(sendButton);
  container.appendChild(inputContainer);
  
  // Force focus on the textarea when the component is created
  setTimeout(() => textarea.focus(), 0);
  
  return container;
}