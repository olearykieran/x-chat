import { TONE_OPTIONS } from '../../../lib/constants.js';

/**
 * Render the input area component
 * @param {Object} props - Component props
 * @returns {HTMLElement} - Input area element
 */
export function renderInputArea({ currentInput, selectedTone, inputPlaceholder, onInputChange, onSendClick, onToneChange, onMicClick, isRecording }) {
  const container = document.createElement('div');
  container.className = 'input-area';
  
  // Tone selector
  const toneSelector = document.createElement('div');
  toneSelector.className = 'tone-selector';
  
  TONE_OPTIONS.forEach(tone => {
    const toneButton = document.createElement('button');
    toneButton.className = `tone-option ${selectedTone === tone.id ? 'active' : ''}`;
    toneButton.textContent = tone.label;
    toneButton.title = tone.description;
    toneButton.addEventListener('click', () => onToneChange(tone.id));
    
    toneSelector.appendChild(toneButton);
  });
  
  container.appendChild(toneSelector);
  
  // Input container
  const inputContainer = document.createElement('div');
  inputContainer.className = 'input-container';
  
  const textarea = document.createElement('textarea');
  textarea.className = 'input-box';
  textarea.value = currentInput || '';
  textarea.placeholder = inputPlaceholder || 'Type your instructions...';
  
  // Auto-resize textarea
  textarea.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
    // Call onInputChange for live updates of state.currentInput
    if (onInputChange) {
      onInputChange(this.value);
    }
  });
  
  inputContainer.appendChild(textarea);

  const micButton = document.createElement('button');
  micButton.className = 'mic-button';
  // SVG for microphone icon - explicitly set fill to white
  micButton.innerHTML = '<svg fill="white" viewBox="0 0 24 24" width="24" height="24"><path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"></path></svg>';
  
  // Styling for the mic button to match a typical circular icon button
  micButton.style.width = '40px'; 
  micButton.style.height = '40px'; 
  micButton.style.borderRadius = '50%'; // Circular
  micButton.style.padding = '8px';      // To center the 24x24 SVG in a 40x40 button
  micButton.style.display = 'flex';
  micButton.style.alignItems = 'center';
  micButton.style.justifyContent = 'center';
  micButton.style.border = '1px solid #4A4A4A'; // Default border, similar to tone buttons
  micButton.style.backgroundColor = '#2C2C2C'; // Default background, similar to tone buttons
  micButton.style.marginLeft = '8px'; 
  micButton.style.cursor = 'pointer';
  micButton.style.flexShrink = '0'; // Prevent shrinking

  if (isRecording) {
    micButton.style.backgroundColor = 'rgba(255, 82, 82, 0.3)'; // Light red background
    micButton.style.borderColor = '#FF5252'; // Red border
  } else {
    // Ensure default styles are reapplied if not recording
    micButton.style.backgroundColor = '#2C2C2C';
    micButton.style.borderColor = '#4A4A4A';
  }
  
  micButton.addEventListener('click', onMicClick);
  inputContainer.appendChild(micButton);

  const sendButton = document.createElement('button');
  sendButton.className = 'send-button';
  sendButton.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"></line>
      <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
    </svg>
  `;
  
  sendButton.addEventListener('click', () => {
    if (textarea.value.trim()) {
      if (onSendClick) {
        onSendClick(textarea.value);
      }
      // Optionally clear textarea here or let the calling component manage it
      textarea.value = '';
      textarea.style.height = 'auto';
    }
  });
  
  // Handle enter key
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (textarea.value.trim()) {
        if (onSendClick) {
          onSendClick(textarea.value);
        }
        textarea.value = '';
        textarea.style.height = 'auto';
      }
    }
  });
  
  inputContainer.appendChild(sendButton);
  container.appendChild(inputContainer);
  
  return container;
}