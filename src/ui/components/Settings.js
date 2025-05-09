import { saveSettings, saveApiKey } from "../state.js";
import { PREMIUM_MONTHLY_PRICE } from "../../../lib/constants.js";

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

  // Header
  const header = document.createElement("div");
  header.className = "settings-header";

  const title = document.createElement("div");
  title.className = "settings-title";
  title.textContent = "Settings";

  const closeButton = document.createElement("button");
  closeButton.className = "close-button";
  closeButton.innerHTML = "&times;";
  closeButton.addEventListener("click", onClose);

  header.appendChild(title);
  header.appendChild(closeButton);
  panel.appendChild(header);

  // Form
  const form = document.createElement("form");
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

    // Profile Bio
    newProfileSettings.profileBio = formData.get("profileBio");

    // Hashtags
    const hashtags = formData
      .get("hashtags")
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag)
      .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));
    newProfileSettings.hashtags = hashtags;

    // Default tone
    newProfileSettings.defaultTone = formData.get("defaultTone");

    // Save other settings (excluding apiKey)
    saveSettings(newProfileSettings);
  });

  // API Key
  const apiKeyGroup = document.createElement("div");
  apiKeyGroup.className = "form-group settings-section";

  // Status message container
  const statusContainer = document.createElement("div");
  statusContainer.className = "status-container";

  // Success message
  if (message) {
    const successMessage = document.createElement("div");
    successMessage.className = "success-message";
    successMessage.textContent = message;
    statusContainer.appendChild(successMessage);
  }

  // Error message
  if (error) {
    const errorMessage = document.createElement("div");
    errorMessage.className = "error-message";
    errorMessage.textContent = error;
    statusContainer.appendChild(errorMessage);
  }

  // Loading indicator
  if (loading) {
    const loadingIndicator = document.createElement("div");
    loadingIndicator.className = "loading-indicator";
    loadingIndicator.textContent = "Saving...";
    statusContainer.appendChild(loadingIndicator);
  }

  const apiKeyToggle = document.createElement("div");
  apiKeyToggle.className = "api-key-toggle";

  const useOwnKeyInput = document.createElement("input");
  useOwnKeyInput.type = "radio";
  useOwnKeyInput.id = "useOwnKey";
  useOwnKeyInput.name = "keyMode";
  useOwnKeyInput.checked = settings.useOwnKey;

  const useOwnKeyLabel = document.createElement("label");
  useOwnKeyLabel.htmlFor = "useOwnKey";
  useOwnKeyLabel.textContent = "Use my own OpenAI API key (Free)";

  const usePremiumInput = document.createElement("input");
  usePremiumInput.type = "radio";
  usePremiumInput.id = "usePremium";
  usePremiumInput.name = "keyMode";
  usePremiumInput.checked = !settings.useOwnKey;

  const usePremiumLabel = document.createElement("label");
  usePremiumLabel.htmlFor = "usePremium";
  usePremiumLabel.textContent = `Use Premium ($${PREMIUM_MONTHLY_PRICE}/month)`;

  apiKeyToggle.appendChild(useOwnKeyInput);
  apiKeyToggle.appendChild(useOwnKeyLabel);
  apiKeyToggle.appendChild(usePremiumInput);
  apiKeyToggle.appendChild(usePremiumLabel);

  const apiKeyLabel = document.createElement("label");
  apiKeyLabel.className = "form-label";
  apiKeyLabel.htmlFor = "apiKey";
  apiKeyLabel.textContent = "Your OpenAI API Key";

  const apiKeyDescription = document.createElement("div");
  apiKeyDescription.className = "form-description";
  apiKeyDescription.textContent = "Your key is stored locally and never shared.";

  const premiumDescription = document.createElement("div");
  premiumDescription.className = "premium-description";
  premiumDescription.innerHTML = `
    <p>Premium includes:</p>
    <ul>
      <li>Access to GPT agent</li>
      <li>No API key required</li>
      <li>Priority support</li>
    </ul>
  `;

  const apiKeyInput = document.createElement("input");
  apiKeyInput.className = "form-input";
  apiKeyInput.type = "password";
  apiKeyInput.id = "apiKey";
  apiKeyInput.name = "apiKey";
  apiKeyInput.value = settings.apiKey || "";
  apiKeyInput.placeholder = "sk-...";
  apiKeyInput.required = settings.useOwnKey;

  // Auto-select "Use my own OpenAI API key" option when API key input field is used
  apiKeyInput.addEventListener("input", (e) => {
    // If user is typing/pasting a key, automatically select "Use my own API key" option
    if (e.target.value.trim().length > 0) {
      useOwnKeyInput.checked = true;
      usePremiumInput.checked = false;
      
      // Apply the UI updates that normally happen when clicking the "Use my own API key" radio
      apiKeyInput.required = true;
      apiKeyInput.disabled = false;
      premiumDescription.style.display = "none";
      apiKeyInput.parentElement.style.display = ""; // Show API key input section
      
      console.log("[Settings] API key input detected. Auto-selected 'Use my own OpenAI API key' option.");
    }
  });

  // Toggle API key input based on mode
  useOwnKeyInput.addEventListener("change", () => {
    apiKeyInput.required = true;
    apiKeyInput.disabled = false;
    premiumDescription.style.display = "none";
    apiKeyInput.parentElement.style.display = ""; // Show API key input section
  });

  usePremiumInput.addEventListener("change", () => {
    apiKeyInput.required = false;
    apiKeyInput.disabled = true;
    premiumDescription.style.display = "block";
    apiKeyInput.parentElement.style.display = "none"; // Hide API key input section
  });

  // Initial state based on settings
  if (settings.useOwnKey) {
    useOwnKeyInput.checked = true;
    premiumDescription.style.display = "none";
    // Ensure apiKeyInput.parentElement exists before accessing style
    if (apiKeyInput.parentElement) apiKeyInput.parentElement.style.display = "";
  } else {
    usePremiumInput.checked = true;
    apiKeyInput.required = false;
    apiKeyInput.disabled = true;
    premiumDescription.style.display = "block";
    // Ensure apiKeyInput.parentElement exists before accessing style
    if (apiKeyInput.parentElement) apiKeyInput.parentElement.style.display = "none";
  }

  // Append elements to apiKeyGroup
  apiKeyGroup.appendChild(apiKeyToggle);
  apiKeyGroup.appendChild(apiKeyLabel);
  apiKeyGroup.appendChild(apiKeyDescription);
  apiKeyGroup.appendChild(premiumDescription);
  apiKeyGroup.appendChild(apiKeyInput);
  apiKeyGroup.appendChild(statusContainer);

  form.appendChild(apiKeyGroup);

  // --- Personalization Actions Section ---
  const personalizationSection = document.createElement("div");
  personalizationSection.className = "settings-section";

  const personalizationTitle = document.createElement("h3");
  personalizationTitle.textContent = "Personalization Data";

  personalizationSection.appendChild(personalizationTitle);

  const trainVoiceButton = document.createElement("button");
  trainVoiceButton.type = "button";
  trainVoiceButton.id = "trainVoiceButton";
  trainVoiceButton.textContent = "Train AI Voice (from Posts/Replies)";
  trainVoiceButton.className = "xco-btn";

  trainVoiceButton.addEventListener("click", () => {
    console.log("Train AI Voice button clicked");
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url) {
        chrome.runtime.sendMessage(
          { action: "collectVoiceTrainingData", activeTabUrl: tabs[0].url },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error(
                "Error sending message for voice training:",
                chrome.runtime.lastError.message
              );
              // Update UI with error
            } else if (response && response.error) {
              console.error(
                "Error from content script (voice training):",
                response.error
              );
              // Update UI with error from content script
            } else if (response && response.status) {
              console.log("Success (voice training):", response.status);
              // Update UI with success message
              const statusEl = document.getElementById("personalizationStatus"); // Assuming an element to show status
              if (statusEl) statusEl.textContent = response.status;
            }
          }
        );
      } else {
        console.error("Could not get active tab URL for voice training.");
      }
    });
  });

  personalizationSection.appendChild(trainVoiceButton);

  const updateInterestsButton = document.createElement("button");
  updateInterestsButton.type = "button";
  updateInterestsButton.id = "updateInterestsButton";
  updateInterestsButton.textContent = "Update AI Interests (from Likes)";
  updateInterestsButton.className = "xco-btn";

  updateInterestsButton.addEventListener("click", () => {
    console.log("Update AI Interests button clicked");
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url) {
        chrome.runtime.sendMessage(
          { action: "collectInterestData", activeTabUrl: tabs[0].url },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error(
                "Error sending message for interest update:",
                chrome.runtime.lastError.message
              );
              // Update UI with error
            } else if (response && response.error) {
              console.error(
                "Error from content script (interest update):",
                response.error
              );
              // Update UI with error from content script
            } else if (response && response.status) {
              console.log("Success (interest update):", response.status);
              // Update UI with success message
              const statusEl = document.getElementById("personalizationStatus"); // Assuming an element to show status
              if (statusEl) statusEl.textContent = response.status;
            }
          }
        );
      } else {
        console.error("Could not get active tab URL for interest update.");
      }
    });
  });

  personalizationSection.appendChild(updateInterestsButton);

  const personalizationStatus = document.createElement("div");
  personalizationStatus.id = "personalizationStatus";
  personalizationStatus.className = "status-message";
  personalizationStatus.style.marginTop = "10px";
  personalizationSection.appendChild(personalizationStatus);

  form.appendChild(personalizationSection);

  // Profile Bio Section
  const profileBioSection = document.createElement("div");
  profileBioSection.className = "settings-section";

  const profileBioLabel = document.createElement("label");
  profileBioLabel.htmlFor = "profileBio";
  profileBioLabel.textContent = "Profile Bio";

  const profileBioTextarea = document.createElement("textarea");
  profileBioTextarea.id = "profileBio";
  profileBioTextarea.name = "profileBio";
  profileBioTextarea.rows = 3;
  profileBioTextarea.placeholder = "Describe yourself and your interests...";
  profileBioTextarea.value = settings.profileBio || "";

  const profileBioDescription = document.createElement("p");
  profileBioDescription.className = "form-description";
  profileBioDescription.textContent =
    "This helps personalize content generation to match your voice.";

  profileBioSection.appendChild(profileBioLabel);
  profileBioSection.appendChild(profileBioTextarea);
  profileBioSection.appendChild(profileBioDescription);
  form.appendChild(profileBioSection);

  // Favorite Hashtags Section
  const hashtagsSection = document.createElement("div");
  hashtagsSection.className = "settings-section";

  const hashtagsLabel = document.createElement("label");
  hashtagsLabel.htmlFor = "hashtags";
  hashtagsLabel.textContent = "Favorite Hashtags";

  const hashtagsInput = document.createElement("input");
  hashtagsInput.type = "text";
  hashtagsInput.id = "hashtags";
  hashtagsInput.name = "hashtags";
  hashtagsInput.placeholder = "#tech, #AI, #webdev";
  hashtagsInput.value = (settings.hashtags || []).join(", ");

  const hashtagsDescription = document.createElement("p");
  hashtagsDescription.className = "form-description";
  hashtagsDescription.textContent = "Comma-separated list of hashtags you commonly use.";

  hashtagsSection.appendChild(hashtagsLabel);
  hashtagsSection.appendChild(hashtagsInput);
  hashtagsSection.appendChild(hashtagsDescription);
  form.appendChild(hashtagsSection);

  // Default Tone Section
  const toneSection = document.createElement("div");
  toneSection.className = "settings-section";

  const toneLabel = document.createElement("label");
  toneLabel.htmlFor = "defaultTone";
  toneLabel.textContent = "Default Tone";

  const toneSelect = document.createElement("select");
  toneSelect.id = "defaultTone";
  toneSelect.name = "defaultTone";

  const toneOptions = [
    { value: "neutral", label: "Neutral" },
    { value: "fun", label: "Fun" },
    { value: "hot-take", label: "Hot Take" },
    { value: "heartfelt", label: "Heartfelt" },
  ];

  toneOptions.forEach((option) => {
    const optionEl = document.createElement("option");
    optionEl.value = option.value;
    optionEl.textContent = option.label;
    if (settings.defaultTone === option.value) {
      optionEl.selected = true;
    }
    toneSelect.appendChild(optionEl);
  });

  toneSection.appendChild(toneLabel);
  toneSection.appendChild(toneSelect);
  form.appendChild(toneSection);

  // Permissions Settings Section
  const permissionsSection = document.createElement("div");
  permissionsSection.className = "settings-section";

  const permissionsLabel = document.createElement("h3"); // Using h3 for section title
  permissionsLabel.textContent = "Permission Settings";
  permissionsLabel.style.marginBottom = "10px";

  const managePermissionsButton = document.createElement("button");
  managePermissionsButton.type = "button"; // Important: type="button" to prevent form submission
  managePermissionsButton.textContent = "Manage Extension Site Permissions (e.g., Microphone)";
  managePermissionsButton.className = "xco-btn xco-btn-outline"; // Using existing button styles
  managePermissionsButton.style.width = "100%";
  managePermissionsButton.addEventListener("click", () => {
    const extensionId = chrome.runtime.id;
    const settingsUrl = `chrome://settings/content/siteDetails?site=chrome-extension://${extensionId}`;
    chrome.tabs.create({ url: settingsUrl });
  });

  const permissionsDescription = document.createElement("p");
  permissionsDescription.className = "form-description";
  permissionsDescription.innerHTML = 
    'If you encounter issues with microphone access, ensure it is set to <strong>Allow</strong> for this extension. <br/>Chrome may not prompt for permission if set to "Ask".';

  permissionsSection.appendChild(permissionsLabel);
  permissionsSection.appendChild(managePermissionsButton);
  permissionsSection.appendChild(permissionsDescription);
  form.appendChild(permissionsSection);

  // Save Settings Button
  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.id = "saveSettingsButton";
  saveButton.textContent = "Save Settings";
  saveButton.className = "xco-btn";
  saveButton.style.marginTop = "24px";
  form.appendChild(saveButton);

  panel.appendChild(form);
  overlay.appendChild(panel);

  return overlay;
}
