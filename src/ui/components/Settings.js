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

  const personalizationLabel = document.createElement("h3");
  personalizationLabel.textContent = "Personalization Data";
  personalizationLabel.style.marginBottom = "10px";

  personalizationSection.appendChild(personalizationLabel);
  
  // Status container for personalization actions
  const personalizationStatus = document.createElement("div");
  personalizationStatus.id = "personalizationStatus";
  personalizationStatus.className = "personalization-status";
  personalizationStatus.style.display = "none";
  personalizationStatus.style.marginBottom = "10px";
  personalizationStatus.style.padding = "8px";
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

  const trainVoiceButton = document.createElement("button");
  trainVoiceButton.type = "button";
  trainVoiceButton.id = "trainVoiceButton";
  trainVoiceButton.textContent = "Train AI Voice (from Posts/Replies)";
  trainVoiceButton.className = "xco-btn";

  trainVoiceButton.addEventListener("click", () => {
    console.log("Train AI Voice button clicked");
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

  personalizationSection.appendChild(trainVoiceButton);

  const updateInterestsButton = document.createElement("button");
  updateInterestsButton.type = "button";
  updateInterestsButton.id = "updateInterestsButton";
  updateInterestsButton.textContent = "Update AI Interests (from Likes)";
  updateInterestsButton.className = "xco-btn";

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

  personalizationSection.appendChild(updateInterestsButton);

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
  
  // Profile Data Section
  const profileDataSection = document.createElement("div");
  profileDataSection.className = "settings-section";
  profileDataSection.style.marginTop = "24px";
  profileDataSection.style.borderTop = "1px solid #eee";
  profileDataSection.style.paddingTop = "16px";

  const profileDataLabel = document.createElement("h3");
  profileDataLabel.textContent = "Your X.com Data";
  profileDataLabel.style.marginBottom = "10px";

  const profileDataDescription = document.createElement("p");
  profileDataDescription.className = "form-description";
  profileDataDescription.textContent = "This is the data collected from your X.com profile to help personalize AI content generation.";

  // Container for profile data stats
  const dataStatsContainer = document.createElement("div");
  dataStatsContainer.className = "data-stats-container";
  dataStatsContainer.style.display = "flex";
  dataStatsContainer.style.flexDirection = "column";
  dataStatsContainer.style.gap = "8px";
  dataStatsContainer.style.marginTop = "16px";
  dataStatsContainer.style.padding = "16px";
  dataStatsContainer.style.backgroundColor = "#1d2226"; // Dark background matching the app theme
  dataStatsContainer.style.color = "#e4e6eb"; // Light text for dark background
  dataStatsContainer.style.borderRadius = "8px";
  dataStatsContainer.style.border = "1px solid #2d3741"; // Subtle border
  
  // Loading indicator for profile data
  const loadingIndicator = document.createElement("div");
  loadingIndicator.textContent = "Loading your profile data...";
  loadingIndicator.style.textAlign = "center";
  loadingIndicator.style.padding = "8px";
  loadingIndicator.style.color = "#e4e6eb"; // Light text color for dark background
  
  dataStatsContainer.appendChild(loadingIndicator);
  
  // Add elements to the profile data section
  profileDataSection.appendChild(profileDataLabel);
  profileDataSection.appendChild(profileDataDescription);
  profileDataSection.appendChild(dataStatsContainer);
  
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
  form.appendChild(saveButton);

  panel.appendChild(form);
  overlay.appendChild(panel);

  return overlay;
}
