import { TONE_OPTIONS } from "../../../lib/constants.js";

/**
 * Render the input area component
 * @param {Object} props - Component props
 * @returns {HTMLElement} - Input area element
 */
export function renderInputArea({
  currentInput,
  selectedTone,
  inputPlaceholder,
  onInputChange,
  onSendClick,
  onToneChange,
  onMicClick,
  isRecording,
  activeTab,
  tweet, // <-- Accept tweet context as a prop
}) {
  // Create main container
  const container = document.createElement("div");
  container.className = "input-area";
  
  // Create textarea element FIRST so we can reference it later
  const textarea = document.createElement("textarea");
  textarea.className = "input-box";
  textarea.id = "compose-input-" + Date.now();
  textarea.value = currentInput || "";
  
  // Set placeholder text - always use polish mode
  textarea.placeholder = inputPlaceholder || 'Type your draft reply to polish...';
  
  // Always use polish mode
  const selectedMode = "polish";
  sessionStorage.setItem('xco_selected_mode', selectedMode);
  
  // Input container
  const inputContainer = document.createElement("div");
  inputContainer.className = "input-container";
  inputContainer.style.position = "relative"; // For consistent styling
  
  // Auto-resize function
  function resizeTextarea() {
    textarea.style.height = "auto";
    textarea.style.height = textarea.scrollHeight + "px";
  }
  
  // Simple, direct input handler with no state resets or focus management
  textarea.addEventListener("input", function() {
    // Track the cursor position
    const cursorPosition = this.selectionStart;
    
    // Resize the textarea
    resizeTextarea();
    
    // Update parent component state only
    if (onInputChange) {
      onInputChange(this.value);
    }
    
    // Restore cursor position if needed
    if (this.selectionStart !== cursorPosition) {
      this.selectionStart = cursorPosition;
      this.selectionEnd = cursorPosition;
    }
  });

  // Resize once at the beginning
  setTimeout(resizeTextarea, 0);
  
  // Add textarea to container
  inputContainer.appendChild(textarea);
  
  // Mic button
  const micButton = document.createElement("button");
  micButton.className = "mic-button";
  micButton.innerHTML = 
    '<svg fill="white" viewBox="0 0 24 24" width="24" height="24"><path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"></path></svg>';
  
  // Style the mic button
  micButton.style.width = "40px";
  micButton.style.height = "40px";
  micButton.style.borderRadius = "50%";
  micButton.style.padding = "8px";
  micButton.style.display = "flex";
  micButton.style.alignItems = "center";
  micButton.style.justifyContent = "center";
  micButton.style.border = "1px solid #4A4A4A";
  micButton.style.backgroundColor = "#2C2C2C";
  micButton.style.marginLeft = "8px";
  micButton.style.cursor = "pointer";
  micButton.style.flexShrink = "0";
  
  // Style mic button based on recording state
  if (isRecording) {
    micButton.style.backgroundColor = "rgba(255, 82, 82, 0.3)";
    micButton.style.borderColor = "#FF5252";
  }
  
  micButton.addEventListener("click", () => {
    if (onMicClick) {
      onMicClick();
      // The only focus reset we'll keep is after clicking the mic
      if (!isRecording) {
        setTimeout(() => textarea.focus(), 0);
      }
    }
  });
  
  inputContainer.appendChild(micButton);
  
  // Send button
  const sendButton = document.createElement("button");
  sendButton.className = "send-button";
  sendButton.textContent = "Polish";
  sendButton.style.padding = "8px 16px";
  
  // Send message function
  function sendMessage() {
    const inputText = textarea.value || "";
    if (!inputText.trim()) return;
    
    // Use the onSendClick handler from props
    if (onSendClick) {
      onSendClick(inputText, selectedMode);
    }
    
    // Clear textarea
    textarea.value = "";
    resizeTextarea();
    
    // Do NOT force focus here to avoid disrupting user's focus
  }
  
  sendButton.addEventListener("click", sendMessage);
  
  // Handle enter key to send
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  
  inputContainer.appendChild(sendButton);
  container.appendChild(inputContainer);
  
  // Return the complete component
  return container;
}
