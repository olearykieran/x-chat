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
  
  // Set appropriate placeholder text based on the active tab
  if (activeTab === "reply") {
    textarea.placeholder = inputPlaceholder || 'Type instructions for a reply or your draft to polish...';
  } else {
    textarea.placeholder = inputPlaceholder || "Type your idea to get 5 polished posts...";
  }
  
  // Mode selection state - persist between renders using sessionStorage
  let selectedMode = sessionStorage.getItem('xco_selected_mode') || "write"; // "write", "polish", or "post"
  
  // Action buttons container with better styling
  const actionButtonsContainer = document.createElement("div");
  actionButtonsContainer.className = "action-buttons-container";
  actionButtonsContainer.style.display = "flex";
  actionButtonsContainer.style.marginBottom = "10px";
  actionButtonsContainer.style.borderRadius = "4px";
  actionButtonsContainer.style.overflow = "hidden";
  actionButtonsContainer.style.border = "1px solid #2F3336";
  actionButtonsContainer.style.flexWrap = "wrap"; // Allow buttons to wrap on smaller screens
  
  // Write Reply button
  const writeReplyButton = document.createElement("button");
  writeReplyButton.className = "action-button" + (selectedMode === "write" ? " selected" : "");
  writeReplyButton.textContent = "Write Reply";
  writeReplyButton.style.flex = "1";
  writeReplyButton.style.padding = "8px 12px";
  writeReplyButton.style.border = "none";
  writeReplyButton.style.background = selectedMode === "write" ? "#1DA1F2" : "#15181C";
  writeReplyButton.style.color = selectedMode === "write" ? "white" : "#8899A6";
  writeReplyButton.style.fontWeight = selectedMode === "write" ? "bold" : "normal";
  writeReplyButton.style.cursor = "pointer";
  writeReplyButton.style.transition = "all 0.2s ease";
  
  writeReplyButton.addEventListener("click", () => {
    selectedMode = "write";
    sessionStorage.setItem('xco_selected_mode', selectedMode);
    writeReplyButton.classList.add("selected");
    writeReplyButton.style.background = "#1DA1F2";
    writeReplyButton.style.color = "white";
    writeReplyButton.style.fontWeight = "bold";
    
    polishReplyButton.classList.remove("selected");
    polishReplyButton.style.background = "#15181C";
    polishReplyButton.style.color = "#8899A6";
    polishReplyButton.style.fontWeight = "normal";
    
    makePostButton.classList.remove("selected");
    makePostButton.style.background = "#15181C";
    makePostButton.style.color = "#8899A6";
    makePostButton.style.fontWeight = "normal";
    
    textarea.placeholder = 'Type instructions for a reply (e.g., "make it funny")...';
  });
  
  // Polish Reply button
  const polishReplyButton = document.createElement("button");
  polishReplyButton.className = "action-button" + (selectedMode === "polish" ? " selected" : "");
  polishReplyButton.textContent = "Polish Reply";
  polishReplyButton.style.flex = "1";
  polishReplyButton.style.padding = "8px 12px";
  polishReplyButton.style.border = "none";
  polishReplyButton.style.background = selectedMode === "polish" ? "#1DA1F2" : "#15181C";
  polishReplyButton.style.color = selectedMode === "polish" ? "white" : "#8899A6";
  polishReplyButton.style.fontWeight = selectedMode === "polish" ? "bold" : "normal";
  polishReplyButton.style.cursor = "pointer";
  polishReplyButton.style.transition = "all 0.2s ease";
  
  polishReplyButton.addEventListener("click", () => {
    selectedMode = "polish";
    sessionStorage.setItem('xco_selected_mode', selectedMode);
    // Deselect all buttons
    writeReplyButton.classList.remove("selected");
    writeReplyButton.style.background = "#15181C";
    writeReplyButton.style.color = "#8899A6";
    writeReplyButton.style.fontWeight = "normal";
    
    makePostButton.classList.remove("selected");
    makePostButton.style.background = "#15181C";
    makePostButton.style.color = "#8899A6";
    makePostButton.style.fontWeight = "normal";
    
    // Select polish button
    polishReplyButton.classList.add("selected");
    polishReplyButton.style.background = "#1DA1F2";
    polishReplyButton.style.color = "white";
    polishReplyButton.style.fontWeight = "bold";
    
    textarea.placeholder = 'Type your draft reply to polish...';
  });
  
  // Make New Post button
  const makePostButton = document.createElement("button");
  makePostButton.className = "action-button" + (selectedMode === "post" ? " selected" : "");
  makePostButton.textContent = "Make New Post";
  makePostButton.style.flex = "1";
  makePostButton.style.padding = "8px 12px";
  makePostButton.style.border = "none";
  makePostButton.style.background = selectedMode === "post" ? "#1DA1F2" : "#15181C";
  makePostButton.style.color = selectedMode === "post" ? "white" : "#8899A6";
  makePostButton.style.fontWeight = selectedMode === "post" ? "bold" : "normal";
  makePostButton.style.cursor = "pointer";
  makePostButton.style.transition = "all 0.2s ease";
  
  makePostButton.addEventListener("click", () => {
    selectedMode = "post";
    sessionStorage.setItem('xco_selected_mode', selectedMode);
    
    // Deselect other buttons
    writeReplyButton.classList.remove("selected");
    writeReplyButton.style.background = "#15181C";
    writeReplyButton.style.color = "#8899A6";
    writeReplyButton.style.fontWeight = "normal";
    
    polishReplyButton.classList.remove("selected");
    polishReplyButton.style.background = "#15181C";
    polishReplyButton.style.color = "#8899A6";
    polishReplyButton.style.fontWeight = "normal";
    
    // Select post button
    makePostButton.classList.add("selected");
    makePostButton.style.background = "#1DA1F2";
    makePostButton.style.color = "white";
    makePostButton.style.fontWeight = "bold";
    
    textarea.placeholder = 'Describe what you want to post about...';
  });
  
  // Set initial placeholder based on selected mode
  if (selectedMode === "polish") {
    textarea.placeholder = 'Type your draft reply to polish...';
  } else if (selectedMode === "post") {
    textarea.placeholder = 'Describe what you want to post about...';
  } else {
    textarea.placeholder = 'Type instructions for a reply (e.g., "make it funny")...';
  }
  
  actionButtonsContainer.appendChild(writeReplyButton);
  actionButtonsContainer.appendChild(polishReplyButton);
  actionButtonsContainer.appendChild(makePostButton);
  container.appendChild(actionButtonsContainer);
  
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
  sendButton.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"></line>
      <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
    </svg>
  `;
  
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
