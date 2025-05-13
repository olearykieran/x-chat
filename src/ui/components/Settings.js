import { saveSettings, saveApiKey } from "../state.js";

/**
 * Render the settings panel
 * @param {Object} props - Component props
 * @returns {HTMLElement} - Settings panel element
 */
export function renderSettingsPanel({ settings, onClose, error, message, loading }) {
  const overlay = document.createElement("div");
  overlay.className = "settings-overlay fade-in";

  const panel = document.createElement("div");
  panel.className = "settings-panel slide-in";
  panel.style.backgroundColor = "#000000"; // Dark background matching X.com dark mode
  panel.style.color = "#fff";

  // Header
  const header = document.createElement("div");
  header.className = "settings-header";
  header.style.borderBottom = "1px solid #38444d";
  header.style.padding = "12px 16px";
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";

  const title = document.createElement("div");
  title.className = "settings-title";
  title.textContent = "Settings";
  title.style.fontSize = "18px";
  title.style.fontWeight = "bold";

  const closeButton = document.createElement("button");
  closeButton.className = "close-button";
  closeButton.innerHTML = "&times;";
  closeButton.style.background = "none";
  closeButton.style.border = "none";
  closeButton.style.fontSize = "24px";
  closeButton.style.color = "#fff";
  closeButton.style.cursor = "pointer";
  closeButton.addEventListener("click", onClose);

  header.appendChild(title);
  header.appendChild(closeButton);
  panel.appendChild(header);

  // Form
  const form = document.createElement("form");
  form.style.padding = "16px";
  form.style.display = "flex";
  form.style.flexDirection = "column";
  form.style.gap = "24px";
  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const formData = new FormData(form);
    const newProfileSettings = {};

    // API Key - Handled by saveApiKey, not included in newProfileSettings for saveSettings
    const apiKeyFromForm = formData.get("apiKey");
    if (apiKeyFromForm !== settings.apiKey) {
      saveApiKey(apiKeyFromForm);
    }

    // Determine useOwnKey status from radio buttons AND API key state
    // If an API key is provided, we MUST set useOwnKey to true regardless of radio selection
    // This ensures consistency between UI intent (entering a key) and saved settings
    let useOwnKey = formData.get("keyMode") === "useOwnKey";
    
    // Force useOwnKey to true if API key is present
    if (apiKeyFromForm && apiKeyFromForm.trim().length > 0) {
      useOwnKey = true;
      console.log("[Settings] API key provided in form submission. Forcing useOwnKey to true.");
    }
    
    newProfileSettings.useOwnKey = useOwnKey;

    // Save other settings (excluding apiKey)
    saveSettings(newProfileSettings);
  });

  // API Key
  const apiKeyGroup = document.createElement("div");
  apiKeyGroup.className = "form-group settings-section";
  apiKeyGroup.style.display = "flex";
  apiKeyGroup.style.flexDirection = "column";
  apiKeyGroup.style.gap = "12px";
  apiKeyGroup.style.backgroundColor = "#16181c";
  apiKeyGroup.style.padding = "16px";
  apiKeyGroup.style.borderRadius = "8px";
  apiKeyGroup.style.border = "1px solid #38444d";

  // Status message container
  const statusContainer = document.createElement("div");
  statusContainer.className = "status-container";
  statusContainer.style.marginTop = "8px";

  // Success message
  if (message) {
    const successMessage = document.createElement("div");
    successMessage.className = "success-message";
    successMessage.textContent = message;
    successMessage.style.padding = "8px 12px";
    successMessage.style.borderRadius = "4px";
    successMessage.style.backgroundColor = "rgba(40, 167, 69, 0.2)";
    successMessage.style.color = "#9ff0b8";
    successMessage.style.fontSize = "14px";
    statusContainer.appendChild(successMessage);
  }

  // Error message
  if (error) {
    const errorMessage = document.createElement("div");
    errorMessage.className = "error-message";
    errorMessage.textContent = error;
    errorMessage.style.padding = "8px 12px";
    errorMessage.style.borderRadius = "4px";
    errorMessage.style.backgroundColor = "rgba(220, 53, 69, 0.2)";
    errorMessage.style.color = "#ff8d8d";
    errorMessage.style.fontSize = "14px";
    statusContainer.appendChild(errorMessage);
  }

  // Loading indicator
  if (loading) {
    const loadingIndicator = document.createElement("div");
    loadingIndicator.className = "loading-indicator";
    loadingIndicator.textContent = "Loading...";
    loadingIndicator.style.padding = "8px 12px";
    loadingIndicator.style.borderRadius = "4px";
    loadingIndicator.style.backgroundColor = "rgba(0, 123, 255, 0.2)";
    loadingIndicator.style.color = "#90caf9";
    loadingIndicator.style.fontSize = "14px";
    statusContainer.appendChild(loadingIndicator);
  }

  // API Key section label
  const apiKeyLabel = document.createElement("div");
  apiKeyLabel.className = "settings-label";
  apiKeyLabel.textContent = "OpenAI API Key";
  apiKeyLabel.style.fontSize = "16px";
  apiKeyLabel.style.fontWeight = "600";
  apiKeyLabel.style.color = "#e4e6eb";
  apiKeyGroup.appendChild(apiKeyLabel);

  // API Key description
  const apiKeyDescription = document.createElement("div");
  apiKeyDescription.className = "settings-description";
  apiKeyDescription.textContent = "Enter your OpenAI API key to use your own account for AI responses.";
  apiKeyDescription.style.fontSize = "14px";
  apiKeyDescription.style.color = "#8899a6";
  apiKeyDescription.style.marginBottom = "12px";
  apiKeyGroup.appendChild(apiKeyDescription);

  // API Key input group
  const apiKeyInputGroup = document.createElement("div");
  apiKeyInputGroup.className = "api-key-input-group";
  apiKeyInputGroup.style.display = "flex";
  apiKeyInputGroup.style.flexDirection = "column";
  apiKeyInputGroup.style.gap = "8px";

  // API Key radio options
  const radioGroup = document.createElement("div");
  radioGroup.className = "radio-group";
  radioGroup.style.display = "flex";
  radioGroup.style.flexDirection = "column";
  radioGroup.style.gap = "8px";
  radioGroup.style.marginBottom = "12px";

  // Use own key option
  const useOwnKeyLabel = document.createElement("label");
  useOwnKeyLabel.className = "radio-label";
  useOwnKeyLabel.style.display = "flex";
  useOwnKeyLabel.style.alignItems = "center";
  useOwnKeyLabel.style.gap = "8px";
  useOwnKeyLabel.style.cursor = "pointer";

  const useOwnKeyRadio = document.createElement("input");
  useOwnKeyRadio.type = "radio";
  useOwnKeyRadio.name = "keyMode";
  useOwnKeyRadio.value = "useOwnKey";
  useOwnKeyRadio.id = "useOwnKey";
  useOwnKeyRadio.checked = settings.useOwnKey || (settings.apiKey && settings.apiKey.length > 0);
  useOwnKeyRadio.style.cursor = "pointer";

  const useOwnKeyText = document.createElement("span");
  useOwnKeyText.textContent = "Use my own OpenAI API key";
  useOwnKeyText.style.fontSize = "14px";
  useOwnKeyText.style.color = "#e4e6eb";

  useOwnKeyLabel.appendChild(useOwnKeyRadio);
  useOwnKeyLabel.appendChild(useOwnKeyText);
  radioGroup.appendChild(useOwnKeyLabel);

  // Use default key option
  const useDefaultKeyLabel = document.createElement("label");
  useDefaultKeyLabel.className = "radio-label";
  useDefaultKeyLabel.style.display = "flex";
  useDefaultKeyLabel.style.alignItems = "center";
  useDefaultKeyLabel.style.gap = "8px";
  useDefaultKeyLabel.style.cursor = "pointer";

  const useDefaultKeyRadio = document.createElement("input");
  useDefaultKeyRadio.type = "radio";
  useDefaultKeyRadio.name = "keyMode";
  useDefaultKeyRadio.value = "useDefaultKey";
  useDefaultKeyRadio.id = "useDefaultKey";
  useDefaultKeyRadio.checked = !settings.useOwnKey && (!settings.apiKey || settings.apiKey.length === 0);
  useDefaultKeyRadio.style.cursor = "pointer";

  const useDefaultKeyText = document.createElement("span");
  useDefaultKeyText.textContent = "Use default key (limited usage)";
  useDefaultKeyText.style.fontSize = "14px";
  useDefaultKeyText.style.color = "#e4e6eb";

  useDefaultKeyLabel.appendChild(useDefaultKeyRadio);
  useDefaultKeyLabel.appendChild(useDefaultKeyText);
  radioGroup.appendChild(useDefaultKeyLabel);

  apiKeyInputGroup.appendChild(radioGroup);

  // API Key input
  const apiKeyInput = document.createElement("input");
  apiKeyInput.type = "password";
  apiKeyInput.name = "apiKey";
  apiKeyInput.id = "apiKey";
  apiKeyInput.className = "settings-input";
  apiKeyInput.placeholder = "sk-...";
  apiKeyInput.value = settings.apiKey || "";
  apiKeyInput.style.backgroundColor = "#2c3035";
  apiKeyInput.style.border = "1px solid #38444d";
  apiKeyInput.style.borderRadius = "4px";
  apiKeyInput.style.padding = "8px 12px";
  apiKeyInput.style.color = "#e4e6eb";
  apiKeyInput.style.fontSize = "14px";
  apiKeyInput.style.width = "100%";
  apiKeyInput.style.boxSizing = "border-box";

  // Toggle API key visibility
  const toggleVisibilityButton = document.createElement("button");
  toggleVisibilityButton.type = "button";
  toggleVisibilityButton.className = "toggle-visibility-button";
  toggleVisibilityButton.textContent = "Show";
  toggleVisibilityButton.style.backgroundColor = "transparent";
  toggleVisibilityButton.style.border = "1px solid #38444d";
  toggleVisibilityButton.style.borderRadius = "4px";
  toggleVisibilityButton.style.padding = "4px 8px";
  toggleVisibilityButton.style.color = "#8899a6";
  toggleVisibilityButton.style.fontSize = "12px";
  toggleVisibilityButton.style.cursor = "pointer";
  toggleVisibilityButton.style.marginTop = "4px";
  toggleVisibilityButton.style.alignSelf = "flex-end";

  toggleVisibilityButton.addEventListener("click", () => {
    if (apiKeyInput.type === "password") {
      apiKeyInput.type = "text";
      toggleVisibilityButton.textContent = "Hide";
    } else {
      apiKeyInput.type = "password";
      toggleVisibilityButton.textContent = "Show";
    }
  });

  apiKeyInputGroup.appendChild(apiKeyInput);
  apiKeyInputGroup.appendChild(toggleVisibilityButton);

  // API Key help text
  const apiKeyHelp = document.createElement("div");
  apiKeyHelp.className = "settings-help";
  apiKeyHelp.innerHTML = "Get your API key from <a href='https://platform.openai.com/api-keys' target='_blank' rel='noopener noreferrer'>OpenAI</a>";
  apiKeyHelp.style.fontSize = "12px";
  apiKeyHelp.style.color = "#8899a6";
  apiKeyHelp.style.marginTop = "8px";
  apiKeyHelp.querySelector("a").style.color = "#1da1f2";
  apiKeyHelp.querySelector("a").style.textDecoration = "none";

  apiKeyInputGroup.appendChild(apiKeyHelp);
  apiKeyGroup.appendChild(apiKeyInputGroup);
  apiKeyGroup.appendChild(statusContainer);

  form.appendChild(apiKeyGroup);

  // Notifications & Permissions Section
  const permissionsSection = document.createElement("div");
  permissionsSection.className = "settings-section";
  permissionsSection.style.display = "flex";
  permissionsSection.style.flexDirection = "column";
  permissionsSection.style.gap = "12px";
  permissionsSection.style.backgroundColor = "#16181c";
  permissionsSection.style.padding = "16px";
  permissionsSection.style.borderRadius = "8px";
  permissionsSection.style.border = "1px solid #38444d";

  // Section label
  const permissionsLabel = document.createElement("div");
  permissionsLabel.className = "settings-label";
  permissionsLabel.textContent = "Notifications & Permissions";
  permissionsLabel.style.fontSize = "16px";
  permissionsLabel.style.fontWeight = "600";
  permissionsLabel.style.color = "#e4e6eb";
  permissionsSection.appendChild(permissionsLabel);

  // Section description
  const permissionsDescription = document.createElement("div");
  permissionsDescription.className = "settings-description";
  permissionsDescription.textContent = "Manage notification and permission settings for the extension.";
  permissionsDescription.style.fontSize = "14px";
  permissionsDescription.style.color = "#8899a6";
  permissionsDescription.style.marginBottom = "12px";
  permissionsSection.appendChild(permissionsDescription);

  // Microphone permission
  const micPermission = document.createElement("div");
  micPermission.className = "permission-item";
  micPermission.style.display = "flex";
  micPermission.style.flexDirection = "column";
  micPermission.style.gap = "8px";
  micPermission.style.marginBottom = "12px";

  const micLabel = document.createElement("div");
  micLabel.className = "permission-label";
  micLabel.textContent = "Microphone Access";
  micLabel.style.fontSize = "14px";
  micLabel.style.fontWeight = "600";
  micLabel.style.color = "#e4e6eb";
  micPermission.appendChild(micLabel);

  const micDescription = document.createElement("div");
  micDescription.className = "permission-description";
  micDescription.textContent = "Required for voice input. You can manage this permission in your browser settings.";
  micDescription.style.fontSize = "13px";
  micDescription.style.color = "#8899a6";
  micPermission.appendChild(micDescription);

  const micButton = document.createElement("button");
  micButton.type = "button";
  micButton.className = "permission-button";
  micButton.textContent = "Open Chrome Settings";
  micButton.style.backgroundColor = "#2c3035";
  micButton.style.border = "1px solid #38444d";
  micButton.style.borderRadius = "4px";
  micButton.style.padding = "6px 12px";
  micButton.style.color = "#e4e6eb";
  micButton.style.fontSize = "13px";
  micButton.style.cursor = "pointer";
  micButton.style.marginTop = "4px";
  micButton.style.alignSelf = "flex-start";

  micButton.addEventListener("click", () => {
    chrome.tabs.create({ url: "chrome://settings/content/microphone" });
  });

  micPermission.appendChild(micButton);
  permissionsSection.appendChild(micPermission);

  form.appendChild(permissionsSection);

  // Save Settings Button
  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.id = "saveSettingsButton";
  saveButton.textContent = "Save Settings";
  saveButton.className = "xco-btn";
  saveButton.style.marginTop = "24px";
  saveButton.style.backgroundColor = "#202327"; // Dark gray matching X.com dark mode
  saveButton.style.color = "#fff";
  saveButton.style.border = "none";
  saveButton.style.borderRadius = "4px";
  saveButton.style.padding = "12px 16px";
  saveButton.style.fontSize = "15px";
  saveButton.style.fontWeight = "600";
  saveButton.style.cursor = "pointer";
  saveButton.style.width = "100%";
  saveButton.style.textAlign = "center";
  
  saveButton.addEventListener("mouseover", () => {
    saveButton.style.backgroundColor = "#2c3035"; // Slightly lighter on hover
  });
  
  saveButton.addEventListener("mouseout", () => {
    saveButton.style.backgroundColor = "#202327";
  });
  form.appendChild(saveButton);

  panel.appendChild(form);
  overlay.appendChild(panel);

  return overlay;
}
