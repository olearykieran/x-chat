import { saveSettings, saveApiKey, getUserProfileData } from "../state.js";
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
  panel.style.backgroundColor = "#15202b"; // Dark background like Reply/Compose tabs
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
  apiKeyGroup.style.display = "flex";
  apiKeyGroup.style.flexDirection = "column";
  apiKeyGroup.style.gap = "12px";
  apiKeyGroup.style.backgroundColor = "#192734";
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
  apiKeyToggle.style.display = "flex";
  apiKeyToggle.style.flexDirection = "column";
  apiKeyToggle.style.gap = "8px";
  apiKeyToggle.style.marginBottom = "12px";

  const useOwnKeyInput = document.createElement("input");
  useOwnKeyInput.type = "radio";
  useOwnKeyInput.id = "useOwnKey";
  useOwnKeyInput.name = "keyMode";
  useOwnKeyInput.checked = settings.useOwnKey;

  const useOwnKeyLabel = document.createElement("label");
  useOwnKeyLabel.htmlFor = "useOwnKey";
  useOwnKeyLabel.textContent = "Use my own OpenAI API key (Free)";
  useOwnKeyLabel.style.display = "flex";
  useOwnKeyLabel.style.alignItems = "center";
  useOwnKeyLabel.style.gap = "8px";
  useOwnKeyLabel.style.fontSize = "14px";
  useOwnKeyLabel.style.cursor = "pointer";

  const usePremiumInput = document.createElement("input");
  usePremiumInput.type = "radio";
  usePremiumInput.id = "usePremium";
  usePremiumInput.name = "keyMode";
  usePremiumInput.checked = !settings.useOwnKey;

  const usePremiumLabel = document.createElement("label");
  usePremiumLabel.htmlFor = "usePremium";
  usePremiumLabel.textContent = `Use Premium ($${PREMIUM_MONTHLY_PRICE}/month)`;
  usePremiumLabel.style.display = "flex";
  usePremiumLabel.style.alignItems = "center";
  usePremiumLabel.style.gap = "8px";
  usePremiumLabel.style.fontSize = "14px";
  usePremiumLabel.style.cursor = "pointer";

  apiKeyToggle.appendChild(useOwnKeyInput);
  apiKeyToggle.appendChild(useOwnKeyLabel);
  apiKeyToggle.appendChild(usePremiumInput);
  apiKeyToggle.appendChild(usePremiumLabel);

  const apiKeySectionTitle = document.createElement("h3");
  apiKeySectionTitle.textContent = "OpenAI API Key";
  apiKeySectionTitle.style.fontSize = "16px";
  apiKeySectionTitle.style.fontWeight = "bold";
  apiKeySectionTitle.style.margin = "0 0 8px 0";
  apiKeyGroup.appendChild(apiKeySectionTitle);

  const apiKeyLabel = document.createElement("label");
  apiKeyLabel.htmlFor = "apiKey";
  apiKeyLabel.textContent = "Enter your API Key:";
  apiKeyLabel.style.fontSize = "14px";
  apiKeyLabel.style.display = "block";
  apiKeyLabel.style.marginBottom = "4px";

  const apiKeyDescription = document.createElement("div");
  apiKeyDescription.className = "form-description";
  apiKeyDescription.innerHTML =
    'You can get an OpenAI API key from <a href="https://platform.openai.com/api-keys" target="_blank">platform.openai.com/api-keys</a>';
  apiKeyDescription.style.fontSize = "13px";
  apiKeyDescription.style.color = "#8899a6";
  apiKeyDescription.style.marginTop = "4px";

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
  apiKeyInput.type = "password";
  apiKeyInput.id = "apiKey";
  apiKeyInput.name = "apiKey";
  apiKeyInput.placeholder = "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
  apiKeyInput.value = settings.apiKey || "";
  apiKeyInput.required = settings.useOwnKey;
  apiKeyInput.style.width = "100%";
  apiKeyInput.style.padding = "10px 12px";
  apiKeyInput.style.borderRadius = "4px";
  apiKeyInput.style.border = "1px solid #38444d";
  apiKeyInput.style.backgroundColor = "#253341";
  apiKeyInput.style.color = "#fff";
  apiKeyInput.style.fontSize = "14px";
  apiKeyInput.style.boxSizing = "border-box";

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
  personalizationSection.style.display = "flex";
  personalizationSection.style.flexDirection = "column";
  personalizationSection.style.gap = "12px";
  personalizationSection.style.backgroundColor = "#192734";
  personalizationSection.style.padding = "16px";
  personalizationSection.style.borderRadius = "8px";
  personalizationSection.style.border = "1px solid #38444d";

  const personalizationLabel = document.createElement("h3");
  personalizationLabel.textContent = "Collect X.com Data";
  personalizationLabel.style.margin = "0";
  personalizationLabel.style.fontSize = "16px";
  personalizationLabel.style.fontWeight = "bold";

  const personalizationDesc = document.createElement("p");
  personalizationDesc.textContent = "Use these buttons while on your X.com profile page to collect your data for personalization. Select the appropriate tab on X.com before clicking each button.";
  personalizationDesc.style.fontSize = "13px";
  personalizationDesc.style.color = "#8899a6";
  personalizationDesc.style.margin = "4px 0 8px 0";

  personalizationSection.appendChild(personalizationLabel);
  personalizationSection.appendChild(personalizationDesc);
  
  // Status container for personalization actions
  const personalizationStatus = document.createElement("div");
  personalizationStatus.id = "personalizationStatus";
  personalizationStatus.className = "personalization-status";
  personalizationStatus.style.display = "none";
  personalizationStatus.style.marginBottom = "10px";
  personalizationStatus.style.padding = "10px";
  personalizationStatus.style.borderRadius = "4px";
  personalizationStatus.style.fontSize = "14px";
  personalizationStatus.style.textAlign = "center";
  personalizationSection.appendChild(personalizationStatus);

  // Helper function to show status messages
  const showPersonalizationStatus = (message, isError = false) => {
    personalizationStatus.textContent = message;
    personalizationStatus.style.display = "block";
    if (isError) {
      personalizationStatus.style.backgroundColor = "rgba(220, 53, 69, 0.2)";
      personalizationStatus.style.color = "#ff6b6b";
    } else {
      personalizationStatus.style.backgroundColor = "rgba(40, 167, 69, 0.2)";
      personalizationStatus.style.color = "#9ff0b8";
    }
    
    // Auto-hide the message after 5 seconds
    setTimeout(() => {
      personalizationStatus.style.display = "none";
    }, 5000);
  };

  // Create button container for aligned buttons
  const buttonContainer = document.createElement("div");
  buttonContainer.style.display = "flex";
  buttonContainer.style.flexDirection = "column";
  buttonContainer.style.gap = "12px";
  personalizationSection.appendChild(buttonContainer);
  
  // Create collect posts button
  const collectPostsButton = document.createElement("button");
  collectPostsButton.type = "button";
  collectPostsButton.id = "collectPostsButton";
  collectPostsButton.textContent = "Collect Your Posts";
  collectPostsButton.className = "xco-btn xco-btn-outline";
  collectPostsButton.style.backgroundColor = "#253341";
  collectPostsButton.style.color = "#fff";
  collectPostsButton.style.border = "1px solid #38444d";
  collectPostsButton.style.borderRadius = "4px";
  collectPostsButton.style.padding = "10px 16px";
  collectPostsButton.style.fontSize = "14px";
  collectPostsButton.style.fontWeight = "500";
  collectPostsButton.style.cursor = "pointer";
  collectPostsButton.style.width = "100%";
  collectPostsButton.style.textAlign = "center";
  
  const collectPostsDescription = document.createElement("p");
  collectPostsDescription.textContent = "Navigate to the 'Posts' tab on your X profile, then click this button.";
  collectPostsDescription.style.fontSize = "12px";
  collectPostsDescription.style.color = "#8899a6";
  collectPostsDescription.style.margin = "0";
  
  const postsButtonWrapper = document.createElement("div");
  postsButtonWrapper.appendChild(collectPostsButton);
  postsButtonWrapper.appendChild(collectPostsDescription);
  buttonContainer.appendChild(postsButtonWrapper);

  collectPostsButton.addEventListener("click", () => {
    console.log("Collect Posts button clicked");
    // Show loading message
    showPersonalizationStatus("Collecting your posts for voice training...");
    
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
              showPersonalizationStatus("Error: Could not connect to page. Refresh the page and try again.", true);
            } else if (response && response.error) {
              console.error(
                "Error from content script (voice training):",
                response.error
              );
              showPersonalizationStatus(`Error: ${response.error}`, true);
            } else if (response && response.status) {
              console.log("Success (voice training):", response.status);
              showPersonalizationStatus(response.status);
              
              // Trigger refresh of user profile data section if present
              setTimeout(() => {
                const profileDataSection = document.querySelector(".data-stats-container");
                if (profileDataSection) {
                  const refreshButton = profileDataSection.querySelector("button");
                  if (refreshButton) refreshButton.click();
                }
              }, 1000); // Wait 1 second to ensure background processing is complete
            }
          }
        );
      } else {
        console.error("Could not get active tab URL for voice training.");
        showPersonalizationStatus("Error: Could not identify current tab. Try again.", true);
      }
    });
  });

  // Create collect replies button
  const collectRepliesButton = document.createElement("button");
  collectRepliesButton.type = "button";
  collectRepliesButton.id = "collectRepliesButton";
  collectRepliesButton.textContent = "Collect Your Replies";
  collectRepliesButton.className = "xco-btn xco-btn-outline";
  collectRepliesButton.style.backgroundColor = "#253341";
  collectRepliesButton.style.color = "#fff";
  collectRepliesButton.style.border = "1px solid #38444d";
  collectRepliesButton.style.borderRadius = "4px";
  collectRepliesButton.style.padding = "10px 16px";
  collectRepliesButton.style.fontSize = "14px";
  collectRepliesButton.style.fontWeight = "500";
  collectRepliesButton.style.cursor = "pointer";
  collectRepliesButton.style.width = "100%";
  collectRepliesButton.style.textAlign = "center";
  
  const collectRepliesDescription = document.createElement("p");
  collectRepliesDescription.textContent = "Navigate to the 'Replies' tab on your X profile, then click this button.";
  collectRepliesDescription.style.fontSize = "12px";
  collectRepliesDescription.style.color = "#8899a6";
  collectRepliesDescription.style.margin = "0";
  
  const repliesButtonWrapper = document.createElement("div");
  repliesButtonWrapper.appendChild(collectRepliesButton);
  repliesButtonWrapper.appendChild(collectRepliesDescription);
  buttonContainer.appendChild(repliesButtonWrapper);
  
  collectRepliesButton.addEventListener("click", () => {
    console.log("Collect Replies button clicked");
    // Show loading message
    showPersonalizationStatus("Collecting your replies for voice training...");
    
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
              showPersonalizationStatus("Error: Could not connect to page. Refresh the page and try again.", true);
            } else if (response && response.error) {
              console.error(
                "Error from content script (voice training):",
                response.error
              );
              showPersonalizationStatus(`Error: ${response.error}`, true);
            } else if (response && response.status) {
              console.log("Success (voice training):", response.status);
              showPersonalizationStatus(response.status);
              
              // Trigger refresh of user profile data section if present
              setTimeout(() => {
                const profileDataSection = document.querySelector(".data-stats-container");
                if (profileDataSection) {
                  const refreshButton = profileDataSection.querySelector("button");
                  if (refreshButton) refreshButton.click();
                }
              }, 1000); // Wait 1 second to ensure background processing is complete
            }
          }
        );
      } else {
        console.error("Could not get active tab URL for voice training.");
        showPersonalizationStatus("Error: Could not identify current tab. Try again.", true);
      }
    });
  });
  
  // Create collect likes button
  const updateInterestsButton = document.createElement("button");
  updateInterestsButton.type = "button";
  updateInterestsButton.id = "updateInterestsButton";
  updateInterestsButton.textContent = "Collect Your Likes";
  updateInterestsButton.className = "xco-btn xco-btn-outline";
  updateInterestsButton.style.backgroundColor = "#253341";
  updateInterestsButton.style.color = "#fff";
  updateInterestsButton.style.border = "1px solid #38444d";
  updateInterestsButton.style.borderRadius = "4px";
  updateInterestsButton.style.padding = "10px 16px";
  updateInterestsButton.style.fontSize = "14px";
  updateInterestsButton.style.fontWeight = "500";
  updateInterestsButton.style.cursor = "pointer";
  updateInterestsButton.style.width = "100%";
  updateInterestsButton.style.textAlign = "center";
  
  const likesButtonDescription = document.createElement("p");
  likesButtonDescription.textContent = "Navigate to the 'Likes' tab on your X profile, then click this button.";
  likesButtonDescription.style.fontSize = "12px";
  likesButtonDescription.style.color = "#8899a6";
  likesButtonDescription.style.margin = "0";
  
  const likesButtonWrapper = document.createElement("div");
  likesButtonWrapper.appendChild(updateInterestsButton);
  likesButtonWrapper.appendChild(likesButtonDescription);
  buttonContainer.appendChild(likesButtonWrapper);

  updateInterestsButton.addEventListener("click", () => {
    console.log("Update AI Interests button clicked");
    // Show loading message
    showPersonalizationStatus("Collecting your liked posts for interest analysis...");
    
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
              showPersonalizationStatus("Error: Could not connect to page. Refresh the page and try again.", true);
            } else if (response && response.error) {
              console.error(
                "Error from content script (interest update):",
                response.error
              );
              showPersonalizationStatus(`Error: ${response.error}`, true);
            } else if (response && response.status) {
              console.log("Success (interest update):", response.status);
              showPersonalizationStatus(response.status);
              
              // Trigger refresh of user profile data section if present
              setTimeout(() => {
                const profileDataSection = document.querySelector(".data-stats-container");
                if (profileDataSection) {
                  const refreshButton = profileDataSection.querySelector("button");
                  if (refreshButton) refreshButton.click();
                }
              }, 1000); // Wait 1 second to ensure background processing is complete
            }
          }
        );
      } else {
        console.error("Could not get active tab URL for interest update.");
        showPersonalizationStatus("Error: Could not identify current tab. Try again.", true);
      }
    });
  });

  // Don't need this line anymore as we're using buttonContainer
  // personalizationSection.appendChild(updateInterestsButton);

  form.appendChild(personalizationSection);

  // Profile Data Section - Move this up in the flow as requested
  const profileDataSection = document.createElement("div");
  profileDataSection.className = "settings-section";
  profileDataSection.style.display = "flex";
  profileDataSection.style.flexDirection = "column";
  profileDataSection.style.gap = "12px";
  profileDataSection.style.backgroundColor = "#192734";
  profileDataSection.style.padding = "16px";
  profileDataSection.style.borderRadius = "8px";
  profileDataSection.style.border = "1px solid #38444d";

  const profileDataLabel = document.createElement("h3");
  profileDataLabel.textContent = "Your X.com Data";
  profileDataLabel.style.margin = "0";
  profileDataLabel.style.fontSize = "16px";
  profileDataLabel.style.fontWeight = "bold";

  const profileDataDescription = document.createElement("p");
  profileDataDescription.className = "form-description";
  profileDataDescription.textContent = "This is the data collected from your X.com profile to help personalize AI content generation.";
  profileDataDescription.style.fontSize = "13px";
  profileDataDescription.style.color = "#8899a6";
  profileDataDescription.style.margin = "4px 0 8px 0";

  // Container for profile data stats
  const dataStatsContainer = document.createElement("div");
  dataStatsContainer.className = "data-stats-container";
  dataStatsContainer.style.display = "flex";
  dataStatsContainer.style.flexDirection = "column";
  dataStatsContainer.style.gap = "12px";
  dataStatsContainer.style.padding = "16px";
  dataStatsContainer.style.backgroundColor = "#253341";
  dataStatsContainer.style.color = "#e4e6eb";
  dataStatsContainer.style.borderRadius = "8px";
  dataStatsContainer.style.border = "1px solid #38444d";
  
  // Loading indicator for profile data
  const loadingIndicator = document.createElement("div");
  loadingIndicator.textContent = "Loading your profile data...";
  loadingIndicator.style.textAlign = "center";
  loadingIndicator.style.padding = "12px";
  loadingIndicator.style.color = "#e4e6eb";
  
  dataStatsContainer.appendChild(loadingIndicator);
  
  // Add elements to the profile data section
  profileDataSection.appendChild(profileDataLabel);
  profileDataSection.appendChild(profileDataDescription);
  profileDataSection.appendChild(dataStatsContainer);
  
  form.appendChild(profileDataSection);

  // Profile Bio Section
  const profileBioSection = document.createElement("div");
  profileBioSection.className = "settings-section";
  profileBioSection.style.display = "flex";
  profileBioSection.style.flexDirection = "column";
  profileBioSection.style.gap = "12px";
  profileBioSection.style.backgroundColor = "#192734";
  profileBioSection.style.padding = "16px";
  profileBioSection.style.borderRadius = "8px";
  profileBioSection.style.border = "1px solid #38444d";

  const profileBioLabel = document.createElement("h3");
  profileBioLabel.htmlFor = "profileBio";
  profileBioLabel.textContent = "Additional Bio Information";
  profileBioLabel.style.margin = "0";
  profileBioLabel.style.fontSize = "16px";
  profileBioLabel.style.fontWeight = "bold";

  const profileBioTextarea = document.createElement("textarea");
  profileBioTextarea.id = "profileBio";
  profileBioTextarea.name = "profileBio";
  profileBioTextarea.rows = 3;
  profileBioTextarea.placeholder = "Describe yourself and your interests...";
  profileBioTextarea.value = settings.profileBio || "";
  profileBioTextarea.style.width = "100%";
  profileBioTextarea.style.padding = "10px 12px";
  profileBioTextarea.style.borderRadius = "4px";
  profileBioTextarea.style.border = "1px solid #38444d";
  profileBioTextarea.style.backgroundColor = "#253341";
  profileBioTextarea.style.color = "#fff";
  profileBioTextarea.style.fontSize = "14px";
  profileBioTextarea.style.boxSizing = "border-box";
  profileBioTextarea.style.resize = "vertical";

  const profileBioDescription = document.createElement("p");
  profileBioDescription.className = "form-description";
  profileBioDescription.textContent = "This helps personalize content generation to match your voice.";
  profileBioDescription.style.fontSize = "13px";
  profileBioDescription.style.color = "#8899a6";
  profileBioDescription.style.margin = "0";

  profileBioSection.appendChild(profileBioLabel);
  profileBioSection.appendChild(profileBioTextarea);
  profileBioSection.appendChild(profileBioDescription);
  form.appendChild(profileBioSection);

  // We've been asked to remove the hashtags section, so we'll skip it entirely

  // Default Tone Section (disabled as requested)
  const toneSection = document.createElement("div");
  toneSection.className = "settings-section";
  toneSection.style.display = "flex";
  toneSection.style.flexDirection = "column";
  toneSection.style.gap = "12px";
  toneSection.style.backgroundColor = "#192734";
  toneSection.style.padding = "16px";
  toneSection.style.borderRadius = "8px";
  toneSection.style.border = "1px solid #38444d";
  toneSection.style.opacity = "0.7"; // Visually indicate it's disabled

  const toneLabel = document.createElement("h3");
  toneLabel.htmlFor = "defaultTone";
  toneLabel.textContent = "Default Tone";
  toneLabel.style.margin = "0";
  toneLabel.style.fontSize = "16px";
  toneLabel.style.fontWeight = "bold";
  
  const toneDescription = document.createElement("p");
  toneDescription.className = "form-description";
  toneDescription.textContent = "Additional tone options coming soon.";
  toneDescription.style.fontSize = "13px";
  toneDescription.style.color = "#8899a6";
  toneDescription.style.margin = "4px 0 8px 0";

  const toneValue = document.createElement("div");
  toneValue.className = "static-value";
  toneValue.textContent = "Neutral";
  toneValue.style.padding = "10px 12px";
  toneValue.style.backgroundColor = "#253341";
  toneValue.style.borderRadius = "4px";
  toneValue.style.color = "#E4E6EB";
  toneValue.style.border = "1px solid #38444d";
  toneValue.style.fontSize = "14px";
  toneValue.style.pointerEvents = "none"; // Make it unclickable
  
  // Hidden input to maintain the form value
  const toneInput = document.createElement("input");
  toneInput.type = "hidden";
  toneInput.id = "defaultTone";
  toneInput.name = "defaultTone";
  toneInput.value = "neutral";

  toneSection.appendChild(toneLabel);
  toneSection.appendChild(toneDescription);
  toneSection.appendChild(toneValue);
  toneSection.appendChild(toneInput);
  form.appendChild(toneSection);

  // Permissions Settings Section
  const permissionsSection = document.createElement("div");
  permissionsSection.className = "settings-section";
  permissionsSection.style.display = "flex";
  permissionsSection.style.flexDirection = "column";
  permissionsSection.style.gap = "12px";
  permissionsSection.style.backgroundColor = "#192734";
  permissionsSection.style.padding = "16px";
  permissionsSection.style.borderRadius = "8px";
  permissionsSection.style.border = "1px solid #38444d";

  const permissionsLabel = document.createElement("h3");
  permissionsLabel.textContent = "Notifications & Permissions";
  permissionsLabel.style.margin = "0";
  permissionsLabel.style.fontSize = "16px";
  permissionsLabel.style.fontWeight = "bold";

  const managePermissionsButton = document.createElement("button");
  managePermissionsButton.type = "button"; // Important: type="button" to prevent form submission
  managePermissionsButton.textContent = "Manage Extension Site Permissions (e.g., Microphone)";
  managePermissionsButton.className = "xco-btn xco-btn-outline";
  managePermissionsButton.style.backgroundColor = "#253341";
  managePermissionsButton.style.color = "#fff";
  managePermissionsButton.style.border = "1px solid #38444d";
  managePermissionsButton.style.borderRadius = "4px";
  managePermissionsButton.style.padding = "10px 16px";
  managePermissionsButton.style.fontSize = "14px";
  managePermissionsButton.style.fontWeight = "500";
  managePermissionsButton.style.cursor = "pointer";
  managePermissionsButton.style.width = "100%";
  managePermissionsButton.style.textAlign = "center";
  managePermissionsButton.addEventListener("click", () => {
    const extensionId = chrome.runtime.id;
    const settingsUrl = `chrome://settings/content/siteDetails?site=chrome-extension://${extensionId}`;
    chrome.tabs.create({ url: settingsUrl });
  });

  const permissionsDescription = document.createElement("p");
  permissionsDescription.className = "form-description";
  permissionsDescription.innerHTML = 
    'If you encounter issues with microphone access, ensure it is set to <strong>Allow</strong> for this extension. <br/>Chrome may not prompt for permission if set to "Ask".'; 
  permissionsDescription.style.fontSize = "13px";
  permissionsDescription.style.color = "#8899a6";
  permissionsDescription.style.margin = "8px 0 0 0";

  permissionsSection.appendChild(permissionsLabel);
  permissionsSection.appendChild(managePermissionsButton);
  permissionsSection.appendChild(permissionsDescription);
  form.appendChild(permissionsSection);
  
  // This section has been moved up as requested - we already created and positioned it earlier
  
  // Fetch user profile data and update the UI
  getUserProfileData()
    .then(profileData => {
      // Remove loading indicator
      dataStatsContainer.removeChild(loadingIndicator);
      
      // Create and add stats elements
      const createStatElement = (label, value, icon) => {
        const statElement = document.createElement("div");
        statElement.style.display = "flex";
        statElement.style.alignItems = "center";
        statElement.style.gap = "8px";
        
        const iconElement = document.createElement("span");
        iconElement.innerHTML = icon;
        iconElement.style.fontSize = "18px";
        
        const statLabel = document.createElement("span");
        statLabel.textContent = `${label}: `;
        statLabel.style.fontWeight = "500";
        
        const statValue = document.createElement("span");
        statValue.textContent = value;
        
        statElement.appendChild(iconElement);
        statElement.appendChild(statLabel);
        statElement.appendChild(statValue);
        
        return statElement;
      };
      
      // Add original posts stat
      const postsCount = profileData.posts?.length || 0;
      dataStatsContainer.appendChild(
        createStatElement(
          "Your Original Posts", 
          `${postsCount} collected for voice training`,
          "📝"
        )
      );
      
      // Add replies stat (new item)
      const repliesCount = profileData.replies?.length || 0;
      dataStatsContainer.appendChild(
        createStatElement(
          "Your Replies", 
          `${repliesCount} collected for voice training`,
          "💬"
        )
      );
      
      // Add liked posts stat
      const likedPostsCount = profileData.likedPosts?.length || 0;
      dataStatsContainer.appendChild(
        createStatElement(
          "Liked Content", 
          `${likedPostsCount} posts analyzed for topic preferences`,
          "❤️"
        )
      );
      
      // Button to refresh profile data
      const refreshButton = document.createElement("button");
      refreshButton.type = "button";
      refreshButton.textContent = "Refresh Profile Data";
      refreshButton.className = "xco-btn xco-btn-outline";
      refreshButton.style.marginTop = "16px";
      refreshButton.style.alignSelf = "center";
      refreshButton.style.backgroundColor = "#1a1d21";
      refreshButton.style.color = "#e4e6eb";
      refreshButton.style.border = "1px solid #3a3f48";
      refreshButton.addEventListener("click", () => {
        // Show refreshing status
        refreshButton.textContent = "Refreshing...";
        refreshButton.disabled = true;
        
        // Re-fetch profile data
        getUserProfileData()
          .then(updatedData => {
            // Show success message temporarily
            refreshButton.textContent = "Data Refreshed!";
            
            // Update the stats
            const statsElements = dataStatsContainer.querySelectorAll("div");
            // Update posts count
            if (statsElements[0]) {
              statsElements[0].querySelector("span:last-child").textContent = 
                `${updatedData.posts?.length || 0} collected for voice training`;
            }
            // Update replies count 
            if (statsElements[1]) {
              statsElements[1].querySelector("span:last-child").textContent = 
                `${updatedData.replies?.length || 0} collected for voice training`;
            }
            // Update likes count
            if (statsElements[2]) {
              statsElements[2].querySelector("span:last-child").textContent = 
                `${updatedData.likedPosts?.length || 0} posts analyzed for topic preferences`;
            }
            
            // Reset button after a delay
            setTimeout(() => {
              refreshButton.textContent = "Refresh Profile Data";
              refreshButton.disabled = false;
            }, 2000);
          })
          .catch(error => {
            console.error("[Settings] Error refreshing profile data:", error);
            refreshButton.textContent = "Refresh Failed";
            setTimeout(() => {
              refreshButton.textContent = "Refresh Profile Data";
              refreshButton.disabled = false;
            }, 2000);
          });
      });
      
      dataStatsContainer.appendChild(refreshButton);
    })
    .catch(error => {
      console.error("[Settings] Error fetching profile data:", error);
      dataStatsContainer.removeChild(loadingIndicator);
      
      const errorElement = document.createElement("div");
      errorElement.textContent = "⚠️ Could not load profile data. Please try again later.";
      errorElement.style.color = "#ff6b6b"; // Brighter red that's visible on dark background
      errorElement.style.textAlign = "center";
      errorElement.style.padding = "10px";
      errorElement.style.backgroundColor = "rgba(220, 53, 69, 0.2)"; // Semi-transparent red background
      dataStatsContainer.appendChild(errorElement);
    });

  form.appendChild(profileDataSection);

  // Save Settings Button
  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.id = "saveSettingsButton";
  saveButton.textContent = "Save Settings";
  saveButton.className = "xco-btn";
  saveButton.style.marginTop = "24px";
  saveButton.style.backgroundColor = "#1d9bf0"; // Twitter blue
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
    saveButton.style.backgroundColor = "#1a91da"; // Slightly darker on hover
  });
  
  saveButton.addEventListener("mouseout", () => {
    saveButton.style.backgroundColor = "#1d9bf0";
  });
  form.appendChild(saveButton);

  panel.appendChild(form);
  overlay.appendChild(panel);

  return overlay;
}
