import { TONE_OPTIONS } from '../../../lib/constants.js';

/**
 * Render the input area component
 * @param {Object} props - Component props
 * @returns {HTMLElement} - Input area element
 */
export function renderInputArea({ currentInput, selectedTone, onInputChange, onToneChange, onMicClick, isRecording }) {
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
  textarea.placeholder = 'Type your instructions...';
  textarea.value = currentInput || '';
  
  // Auto-resize textarea
  textarea.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
  });
  
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
      onInputChange(textarea.value);
      textarea.value = '';
      textarea.style.height = 'auto';
    }
  });
  
  // Handle enter key
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (textarea.value.trim()) {
        onInputChange(textarea.value);
        textarea.value = '';
        textarea.style.height = 'auto';
      }
    }
  });
  
  inputContainer.appendChild(textarea);

  // Microphone button
  const micButton = document.createElement('button');
  micButton.className = 'mic-button xco-btn';
  micButton.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
      <line x1="12" y1="19" x2="12" y2="22"></line>
    </svg>
  `;
  micButton.title = 'Record voice input';
  micButton.style.padding = '8px';
  micButton.style.marginLeft = '4px'; 
  micButton.style.backgroundColor = isRecording ? '#ffdddd' : 'transparent'; 
  micButton.style.border = `1px solid ${isRecording ? 'red' : '#ccc'}`;
  micButton.style.borderRadius = '50%'; 
  micButton.style.cursor = 'pointer';
  micButton.style.transition = 'background-color 0.3s, border-color 0.3s'; 

  micButton.addEventListener('click', () => {
    if (typeof onMicClick === 'function') {
      onMicClick();
    } else {
      console.warn('[InputArea] onMicClick handler not provided.');
    }
  });
  inputContainer.appendChild(micButton);

  inputContainer.appendChild(sendButton);
  container.appendChild(inputContainer);
  
  return container;
}