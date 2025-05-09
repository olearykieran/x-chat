import {
  callOpenAI,
  fetchTrendingTopics,
  generateScheduledPosts,
  generatePolishedPosts,
} from "./lib/api.js";
import { DEFAULT_SETTINGS } from "./lib/constants.js";

// Web search function using OpenAI's completions API with system instructions for web search
async function searchWeb(query, userLocation = null, contextSize = "medium") {
  try {
    console.log("[Background] Performing web search for query:", query);

    if (!userSettings.apiKey) {
      throw new Error("API key is not set for web search");
    }

    const systemMessage =
      "You are a highly specialized news summarization engine. Your sole purpose is to find and provide concise, factual summaries of the latest information (within the last 24-48 hours if possible) directly related to the user's query.\n\n" +
      "CRITICAL INSTRUCTIONS FOR THIS TASK:\n" +
      "1. Output: Provide a neutral, factual summary of the information. This could be a short paragraph or 2-3 key bullet points detailing recent developments or core facts.\n" +
      "2. Content: Focus ONLY on verifiable facts and recent news.\n" +
      "3. DO NOT generate opinions, interpretations, or suggestions.\n" +
      "4. DO NOT format the output as a tweet, social media post, or any form of content suggestion.\n" +
      "5. DO NOT engage in conversation or provide any text beyond the factual summary.\n" +
      "6. If multiple distinct pieces of information are found for the query, summarize each briefly. Aim for diversity in the information presented if the query is broad.\n\n" +
      "The user's query will follow. Provide only the summary.";

    const response = await callOpenAI(
      userSettings.apiKey,
      query,
      "informative", // tone
      null, // user instruction
      null, // profile bio
      [], // writing samples
      [], // liked tweets
      systemMessage, // custom system message
      "gpt-4.1-nano", // Use gpt-4.1-mini for web search as per OpenAI docs
      0.7 // Lower temperature for more factual responses in web search
    );

    console.log("[Background] Web search results:", response);

    // Since we're using the existing callOpenAI function, the response is just text
    return {
      text: response,
      annotations: [],
      source: "openai",
    };
  } catch (error) {
    console.error("[Background] Error in web search:", error);
    throw error;
  }
}

// Function to check API key and warn if not set
function checkAndWarnApiKey() {
  if (!userSettings.apiKey) {
    console.warn("[Background] API key is not set. Some features may not work.");
    // Potentially send a message to UI or show a notification if desired
  } else {
    console.log(
      "[Background] API key check passed. userSettings.apiKey:",
      userSettings.apiKey
    );
  }
}

// Function to initialize alarms (e.g., for periodic tasks)
function initializeAlarms() {
  // Example: Create an alarm that fires every hour
  // chrome.alarms.create("hourlyPing", { periodInMinutes: 60 });
  // console.log("[Background] Alarms initialized.");

  // Clear any existing 'postTweet' alarm to avoid duplicates if script reloads
  chrome.alarms.clear("postTweet", (wasCleared) => {
    if (wasCleared) {
      console.log("[Background] Cleared existing 'postTweet' alarm.");
    }
  });
  // Clear any existing 'checkQueue' alarm
  chrome.alarms.clear("checkQueue", (wasCleared) => {
    if (wasCleared) {
      console.log("[Background] Cleared existing 'checkQueue' alarm.");
    }
  });

  // Create a new 'checkQueue' alarm to run periodically (e.g., every minute)
  chrome.alarms.create("checkQueue", { delayInMinutes: 1, periodInMinutes: 1 });
  console.log(
    "[Background] 'checkQueue' alarm created to run every minute after a 1-minute delay."
  );
}

// Initialize state
// Ensure userSettings are initialized with defaults from constants.js
let userSettings = {
  apiKey: DEFAULT_SETTINGS.apiKey !== undefined ? DEFAULT_SETTINGS.apiKey : null, // Default is ''
  profileBio:
    DEFAULT_SETTINGS.profileBio !== undefined ? DEFAULT_SETTINGS.profileBio : "",
  hashtags: Array.isArray(DEFAULT_SETTINGS.hashtags)
    ? [...DEFAULT_SETTINGS.hashtags]
    : [],
  tone:
    DEFAULT_SETTINGS.defaultTone !== undefined ? DEFAULT_SETTINGS.defaultTone : "neutral", // Maps from defaultTone
  useOwnKey: DEFAULT_SETTINGS.useOwnKey !== undefined ? DEFAULT_SETTINGS.useOwnKey : true, // Default is true
};
console.log(
  "[Background] Initial userSettings.useOwnKey after DEFAULT_SETTINGS:",
  userSettings.useOwnKey
);

let userWritingSamples = []; // To store scraped user posts for voice training
let userReplies = []; // To store scraped user replies for voice training
let likedPosts = []; // To store scraped user liked posts
let userLikedTopicsRaw = []; // To store scraped liked posts for topic generation

// Load settings and other stored data on startup
console.log(
  "[Background] Initializing script. Current userSettings:",
  JSON.parse(JSON.stringify(userSettings))
);
chrome.runtime.onStartup.addListener(() => {
  console.log("[Background] onStartup triggered. Calling loadDataFromStorage.");
  loadDataFromStorage();
});

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log("[Background] onInstalled triggered. Reason:", details.reason);

  // Only perform full storage clear on fresh install, not on update/reload
  if (details.reason === "install") {
    console.log(
      "[Background] onInstalled: Fresh install detected. Setting default values."
    );
    // For fresh install, we'll set default values rather than clearing everything
    try {
      // Fetch any existing API key and settings before setting defaults
      const existingData = await new Promise((resolve) => {
        chrome.storage.sync.get(["apiKey", "useOwnKey"], (result) => {
          resolve(result);
        });
      });

      // Set default values while preserving any existing API key
      const defaultSettings = {
        useOwnKey: existingData.useOwnKey !== undefined ? existingData.useOwnKey : true,
        apiKey: existingData.apiKey || userSettings.apiKey,
      };

      await new Promise((resolve, reject) => {
        chrome.storage.sync.set(defaultSettings, () => {
          if (chrome.runtime.lastError) {
            console.error(
              "[Background] onInstalled: Error setting default values:",
              chrome.runtime.lastError.message
            );
            reject(chrome.runtime.lastError);
          } else {
            console.log(
              "[Background] onInstalled: Default values set successfully:",
              defaultSettings
            );
            resolve();
          }
        });
      });
    } catch (error) {
      console.error(
        "[Background] onInstalled: Exception during setting defaults:",
        error
      );
    }
  } else {
    console.log(
      "[Background] onInstalled: Update/reload detected. Preserving existing settings."
    );
  }
  // Now, after attempting to clear, load data.
  // This ensures that loadDataFromStorage runs after the clear attempt.
  console.log("[Background] onInstalled: Proceeding to call loadDataFromStorage.");
  await loadDataFromStorage();
  checkAndWarnApiKey(); // Moved from initialize function
  initializeAlarms(); // Moved from initialize function
  // Any other specific onInstalled logic can go here
  console.log("[Background] onInstalled event processing finished.");
});

// Initialize and load data when the extension starts (not just onInstalled)
async function initialize() {
  console.log("[Background] Initializing script. Current userSettings:", userSettings);
  await loadDataFromStorage(); // Ensure settings are loaded on every startup
  // checkAndWarnApiKey(); // Moved to onInstalled and regular startup load
  // initializeAlarms();   // Moved to onInstalled

  // Initial fetch of voice/topic data if not already populated, or if settings indicate it's needed
  if (!userSettings.profileBio || userSettings.profileBio.trim() === "") {
    // Potentially fetch/update these if they are empty or based on some logic
    console.log("[Background] Initial voice/topic data loaded.");
  }
}

// Call initialize on extension startup (when the background script loads)
initialize()
  .then(() => {
    console.log("[Background] Initial script loading and setup complete.");
  })
  .catch((error) => {
    console.error("[Background] Error during initial script loading:", error);
  });

// Helper function to get API key from storage
async function getApiKey() {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(["apiKey"], (result) => {
      if (result.apiKey) {
        resolve(result.apiKey);
      } else {
        reject("API key not found");
      }
    });
  });
}

// Handle messages from content script and side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    // console.log('[Background] Message received inside async IIFE:', message); // For debugging

    // Function to inject and execute content script directly
    async function injectAndExecuteContentScript(tabId, url) {
      console.log(`[Background] Injecting content script directly into tab ${tabId}`);

      try {
        // Check if we need to refresh the page first
        if (!url.includes("x.com") && !url.includes("twitter.com")) {
          console.log("[Background] Tab is not on X.com, cannot inject content script");
          return false;
        }

        // Execute the appropriate scraping function based on the page type
        const result = await chrome.scripting.executeScript({
          target: { tabId },
          function: () => {
            console.log("[XCO-Injected] Direct execution of content scraper");

            // Check what type of page we're on
            const url = window.location.href;
            const isLikesPage = url.includes("/likes");
            const isRepliesTab = url.includes("/with_replies");
            const isProfilePage =
              url.match(/\/[A-Za-z0-9_]+(\/with_replies)?$/) || isLikesPage;

            console.log(
              `[XCO-Injected] Page type - Likes: ${isLikesPage}, Replies: ${isRepliesTab}, Profile: ${isProfilePage}`
            );

            if (!isProfilePage && !isLikesPage) {
              console.error("[XCO-Injected] Not on a valid page");
              return {
                error:
                  "Not on a valid page. Please navigate to your X profile or likes page.",
              };
            }

            // Data containers
            const posts = [];
            const replies = [];
            const likedPosts = [];

            // Scrape tweets based on page type
            document
              .querySelectorAll('article[data-testid="tweet"]')
              .forEach((tweetElement) => {
                const tweetTextElement = tweetElement.querySelector(
                  '[data-testid="tweetText"]'
                );
                if (tweetTextElement && tweetTextElement.textContent) {
                  const tweetText = tweetTextElement.textContent.trim();

                  // Route the tweet text to the appropriate array
                  if (isLikesPage) {
                    likedPosts.push(tweetText);
                    console.log(
                      `[XCO-Injected] Found liked post: ${tweetText.substring(0, 30)}...`
                    );
                  } else if (isRepliesTab) {
                    replies.push(tweetText);
                  } else {
                    posts.push(tweetText);
                  }
                }
              });

            const result = {
              posts: posts,
              replies: replies,
              likedPosts: likedPosts,
              postsCount: posts.length,
              repliesCount: replies.length,
              likedPostsCount: likedPosts.length,
              totalCount: posts.length + replies.length + likedPosts.length,
            };

            console.log(
              `[XCO-Injected] Scraped ${result.postsCount} posts, ${result.repliesCount} replies, and ${result.likedPostsCount} liked posts`
            );
            return result;
          },
        });

        if (!result || !result[0] || result[0].result.error) {
          console.error("[Background] Direct script execution failed:", result);
          return { error: result[0]?.result?.error || "Script execution failed" };
        }

        console.log("[Background] Direct script execution result:", result[0].result);
        return result[0].result;
      } catch (error) {
        console.error("[Background] Error injecting script:", error);
        return { error: `Error injecting script: ${error.message}` };
      }
    }

    // Handle collectVoiceTrainingData action from settings
    if (message.action === "collectVoiceTrainingData") {
      console.log(
        "[Background] Received collectVoiceTrainingData action from settings",
        message
      );

      // Get the active tab
      try {
        // First get all tabs, then find the one with the matching URL
        const tabs = await chrome.tabs.query({});
        console.log(`[Background] Found ${tabs.length} tabs total`);

        // Try to find tab with the matching URL if provided, otherwise use active tab
        let targetTab = null;

        if (message.activeTabUrl) {
          console.log(`[Background] Looking for tab with URL: ${message.activeTabUrl}`);
          // Find tab with the matching URL
          targetTab = tabs.find(
            (tab) => tab.url && tab.url.includes(message.activeTabUrl)
          );
        }

        // Fallback to active tab if no matching URL or no URL provided
        if (!targetTab) {
          console.log("[Background] No matching tab found, using active tab");
          const activeTabs = await chrome.tabs.query({
            active: true,
            currentWindow: true,
          });
          targetTab = activeTabs[0];
        }

        if (!targetTab || !targetTab.id) {
          console.error("[Background] No valid tab found for voice data collection");
          sendResponse({
            error: "No valid tab found. Please refresh the page and try again.",
          });
          return true;
        }

        console.log(
          `[Background] Found target tab with ID: ${targetTab.id}, URL: ${targetTab.url}`
        );

        // First try to send message to content script
        try {
          // Determine what we're scraping based on the dataType parameter
          const contentAction =
            message.dataType === "likes"
              ? "scrapeUserLikesForInterests"
              : "scrapeUserPostsForVoiceTraining";

          console.log(
            `[Background] Sending ${contentAction} to content script based on dataType:`,
            message.dataType
          );

          chrome.tabs.sendMessage(
            targetTab.id,
            { action: contentAction },
            async (response) => {
              if (chrome.runtime.lastError) {
                console.warn(
                  "[Background] Error sending message to content script, falling back to direct injection:",
                  chrome.runtime.lastError
                );

                // Content script not responding, try direct injection instead
                const result = await injectAndExecuteContentScript(
                  targetTab.id,
                  targetTab.url
                );

                if (result.error) {
                  sendResponse({ error: result.error });
                  return;
                }

                // Get existing data from storage first
                const existingData = await chrome.storage.local.get([
                  "userWritingSamples",
                  "userReplies",
                  "likedPosts",
                ]);
                console.log(
                  "[Background] DEBUG: Existing data before direct injection update:",
                  {
                    postsCount: existingData.userWritingSamples
                      ? existingData.userWritingSamples.length
                      : 0,
                    repliesCount: existingData.userReplies
                      ? existingData.userReplies.length
                      : 0,
                  }
                );

                // Only update what's collected in this injection, preserve the rest
                if (message.dataType === "likes") {
                  // Handle liked posts collection
                  if (result.likedPosts && result.likedPosts.length > 0) {
                    // New liked posts provided
                    likedPosts = result.likedPosts;
                    userLikedTopicsRaw = result.likedPosts; // Keep in sync
                    console.log(
                      `[Background] Direct injection updating liked posts with ${likedPosts.length} new items`
                    );
                  } else {
                    // No new liked posts, keep existing ones
                    likedPosts = existingData.likedPosts || [];
                    if (likedPosts.length === 0 && existingData.userLikedTopicsRaw) {
                      likedPosts = existingData.userLikedTopicsRaw;
                    }
                    userLikedTopicsRaw = likedPosts; // Keep in sync
                    console.log(
                      `[Background] Direct injection preserving ${likedPosts.length} existing liked posts`
                    );
                  }

                  // Preserve existing posts and replies
                  userWritingSamples = existingData.userWritingSamples || [];
                  userReplies = existingData.userReplies || [];
                } else {
                  // Handle posts/replies collection
                  if (result.posts && result.posts.length > 0) {
                    // New posts provided, update only posts
                    userWritingSamples = result.posts;
                    console.log(
                      `[Background] Updating posts with ${userWritingSamples.length} new items`
                    );
                  } else {
                    // No new posts, keep existing ones
                    userWritingSamples = existingData.userWritingSamples || [];
                    console.log(
                      `[Background] Preserving ${userWritingSamples.length} existing posts`
                    );
                  }
                }

                if (result.replies && result.replies.length > 0) {
                  // New replies provided, update only replies
                  userReplies = result.replies;
                  console.log(
                    `[Background] Updating replies with ${userReplies.length} new items`
                  );
                } else {
                  // No new replies, keep existing ones
                  userReplies = existingData.userReplies || [];
                  console.log(
                    `[Background] Preserving ${userReplies.length} existing replies`
                  );
                }

                // Handle liked posts separately when dataType is "likes"
                if (message.dataType === "likes") {
                  if (result.likedPosts && result.likedPosts.length > 0) {
                    // New liked posts provided
                    likedPosts = result.likedPosts;
                    // Also update userLikedTopicsRaw to maintain compatibility with existing code
                    userLikedTopicsRaw = result.likedPosts;
                    console.log(
                      `[Background] Direct injection updating liked posts with ${likedPosts.length} new items`
                    );
                  } else {
                    // No new liked posts, keep existing ones
                    likedPosts = existingData.likedPosts || [];
                    // If no existing likedPosts but we have userLikedTopicsRaw, use that
                    if (
                      likedPosts.length === 0 &&
                      existingData.userLikedTopicsRaw &&
                      existingData.userLikedTopicsRaw.length > 0
                    ) {
                      likedPosts = existingData.userLikedTopicsRaw;
                    }
                    console.log(
                      `[Background] Direct injection preserving ${likedPosts.length} existing liked posts`
                    );
                  }
                }

                // Log appropriate message based on dataType
                if (message.dataType === "likes") {
                  console.log(
                    `[Background] Final data for saving: ${
                      likedPosts ? likedPosts.length : 0
                    } liked posts for interest analysis`
                  );
                } else {
                  console.log(
                    `[Background] Final data for saving: ${userWritingSamples.length} posts and ${userReplies.length} replies`
                  );
                }
                console.log("[Background] DEBUG: Final userReplies array:", userReplies);

                // Log the updated global variables
                console.log(
                  "[Background] DEBUG: Global userWritingSamples length:",
                  userWritingSamples.length
                );
                console.log(
                  "[Background] DEBUG: Global userReplies length:",
                  userReplies.length
                );

                // Log liked posts if applicable
                if (message.dataType === "likes" && likedPosts) {
                  console.log(
                    "[Background] DEBUG: Global likedPosts length:",
                    likedPosts.length
                  );
                }

                // Save to local storage
                const storageData = {
                  userWritingSamples: userWritingSamples,
                  userReplies: userReplies,
                };

                // Add likedPosts and update userLikedTopicsRaw to storage if handling likes
                if (message.dataType === "likes" && likedPosts) {
                  storageData.likedPosts = likedPosts;
                  // Also update userLikedTopicsRaw to maintain compatibility
                  storageData.userLikedTopicsRaw = likedPosts;

                  console.log(
                    `[Background] Saving ${likedPosts.length} liked posts to storage under both likedPosts and userLikedTopicsRaw keys`
                  );
                }

                await chrome.storage.local.set(storageData, () => {
                  if (chrome.runtime.lastError) {
                    console.error(
                      "[Background] ERROR saving to storage:",
                      chrome.runtime.lastError
                    );
                  } else {
                    console.log(
                      "[Background] DEBUG: Successfully saved to chrome.storage.local"
                    );
                    // Verify what was saved by reading it back
                    const keysToCheck =
                      message.dataType === "likes"
                        ? [
                            "userReplies",
                            "userWritingSamples",
                            "likedPosts",
                            "userLikedTopicsRaw",
                          ]
                        : ["userReplies", "userWritingSamples"];

                    chrome.storage.local.get(keysToCheck, (result) => {
                      if (message.dataType === "likes") {
                        console.log(
                          "[Background] DEBUG: Verification after save - liked posts:",
                          result.likedPosts ? result.likedPosts.length : "undefined"
                        );
                      } else {
                        console.log(
                          "[Background] DEBUG: Verification after save - posts:",
                          result.userWritingSamples
                            ? result.userWritingSamples.length
                            : "undefined",
                          "replies:",
                          result.userReplies ? result.userReplies.length : "undefined"
                        );
                      }
                    });
                  }
                });

                // Send a response with appropriate counts based on dataType
                if (message.dataType === "likes") {
                  sendResponse({
                    success: true,
                    status: `Successfully collected ${likedPosts.length} liked posts for personalization.`,
                    likedPostsCount: likedPosts.length,
                    postsCount: userWritingSamples.length,
                    repliesCount: userReplies.length,
                  });
                } else {
                  sendResponse({
                    success: true,
                    status: `Successfully collected ${
                      userWritingSamples.length + userReplies.length
                    } items for voice training (${userWritingSamples.length} posts, ${
                      userReplies.length
                    } replies).`,
                    postsCount: userWritingSamples.length,
                    repliesCount: userReplies.length,
                  });
                }
              } else {
                console.log(
                  "[Background] Received response from content script:",
                  response
                );
                sendResponse({ success: true, ...response });
              }
            }
          );
        } catch (msgError) {
          console.error("[Background] Exception trying to send message:", msgError);
          // Try direct injection as fallback
          const result = await injectAndExecuteContentScript(targetTab.id, targetTab.url);
          sendResponse({
            success: result.error ? false : true,
            ...(result.error ? { error: result.error } : result),
          });
        }

        return true; // Async response
      } catch (error) {
        console.error("[Background] Error in collectVoiceTrainingData handler:", error);
        sendResponse({ error: "Internal extension error: " + error.message });
        return true;
      }
    }

    // Handlers that don't need an API key or have special handling first
    if (message.type === "SAVE_SETTINGS") {
      console.log(
        "[Background] SAVE_SETTINGS received. message.settings keys:",
        message.settings ? Object.keys(message.settings) : "null/undefined",
        "Full message.settings:",
        JSON.parse(JSON.stringify(message.settings))
      );
      try {
        if (message.settings && typeof message.settings === "object") {
          // Ensure that what we're saving to sync doesn't inadvertently include apiKey if it's not supposed to be here
          const settingsToSync = { ...message.settings };
          if ("apiKey" in settingsToSync) {
            // This case should ideally not happen if Settings.js correctly omits apiKey from newProfileSettings
            console.warn(
              "[Background] SAVE_SETTINGS: message.settings unexpectedly contained an apiKey property. Value:",
              settingsToSync.apiKey,
              "This should be handled by SAVE_API_KEY only. Not saving apiKey via SAVE_SETTINGS."
            );
            delete settingsToSync.apiKey; // Do not let SAVE_SETTINGS overwrite/save apiKey
          }
          console.log(
            "[Background] SAVE_SETTINGS - message.settings.useOwnKey received:",
            message.settings.useOwnKey
          );
          const tempSettingsToSync = { ...settingsToSync }; // Temp for logging before potential modification
          console.log(
            "[Background] SAVE_SETTINGS - settingsToSync.useOwnKey BEFORE sync.set:",
            tempSettingsToSync.useOwnKey
          );

          console.log(
            "[Background] SAVE_SETTINGS raw message.settings received:",
            JSON.parse(JSON.stringify(message.settings))
          ); // Log the full received settings
          console.log(
            "[Background] SAVE_SETTINGS - Full settingsToSync object BEFORE sync.set:",
            JSON.parse(JSON.stringify(settingsToSync))
          );

          await chrome.storage.sync.set(settingsToSync);
          // Update local userSettings state in bg.js
          Object.assign(userSettings, message.settings);
          // Ensure 'tone' is consistent if 'defaultTone' was passed (again, after Object.assign)
          if (message.settings.defaultTone !== undefined) {
            userSettings.tone = message.settings.defaultTone;
          }
          console.log(
            "[Background] SAVE_SETTINGS - userSettings.useOwnKey AFTER Object.assign:",
            userSettings.useOwnKey
          );

          console.log(
            "[Background] Settings saved and local userSettings updated:",
            JSON.parse(JSON.stringify(userSettings))
          );
          sendResponse({ success: true });
        } else {
          console.error(
            "[Background] SAVE_SETTINGS: message.settings was invalid or not an object.",
            message.settings
          );
          sendResponse({ success: false, error: "Invalid settings data received." });
        }
      } catch (error) {
        console.error("[Background] Error saving settings:", error);
        sendResponse({ success: false, error: error.message });
      }
      return; // Early return for this handler
    }
    if (message.type === "TOGGLE_SIDEPANEL") {
      chrome.sidePanel.open();
      sendResponse({ success: true });
      return; // Does not need API key
    } else if (message.type === "SAVE_API_KEY") {
      // Store API key in chrome.storage.sync
      await chrome.storage.sync.set({ apiKey: message.apiKey });
      // Also update local state
      userSettings.apiKey = message.apiKey;

      // Handle useOwnKey setting that comes with saving an API key
      if (message.useOwnKey !== undefined) {
        console.log(
          "[Background] SAVE_API_KEY: Also received useOwnKey=",
          message.useOwnKey
        );
        await chrome.storage.sync.set({ useOwnKey: message.useOwnKey });
        userSettings.useOwnKey = message.useOwnKey;
        console.log(
          "[Background] SAVE_API_KEY: userSettings.useOwnKey set to:",
          message.useOwnKey,
          "Saved to sync."
        );
      }

      console.log(
        "[Background] SAVE_API_KEY: userSettings.apiKey set to:",
        message.apiKey,
        "Saved to sync."
      );

      sendResponse({ success: true });
    } else if (message.type === "GET_USER_PROFILE_DATA") {
      // Return user profile data (posts, replies, liked posts, etc.)
      console.log("[Background] Received request for user profile data");
      getUserProfileData()
        .then((profileData) => {
          console.log("[Background] Returning user profile data:", {
            postsCount: profileData.posts?.length || 0,
            repliesCount: profileData.replies?.length || 0,
            likedPostsCount: profileData.likedPosts?.length || 0,
          });
          sendResponse(profileData);
        })
        .catch((error) => {
          console.error("[Background] Error getting user profile data:", error);
          sendResponse({ error: error.message });
        });
      return true; // Indicates we'll call sendResponse asynchronously
    } else if (message.type === "COLLECT_USER_DATA_FOR_TRAINING") {
      console.log(
        `[Background] Forwarding ${message.payload.dataType} data to side panel:`,
        message.payload.data
      );
      chrome.runtime
        .sendMessage({
          type: "USER_DATA_COLLECTED",
          payload: message.payload,
        })
        .catch((err) =>
          console.warn(
            "[Background] Error sending USER_DATA_COLLECTED to side panel:",
            err.message
          )
        );
      sendResponse({ success: true, message: "Data forwarded to side panel." });
      return;
    }
    // Add SAVE_USER_POSTS, SAVE_USER_LIKES if they are simple storage operations not needing the general apiKey
    if (message.type === "SAVE_USER_POSTS") {
      console.log(
        "[Background] DEBUG: Received SAVE_USER_POSTS message with data:",
        message.data
      );

      // Check the structure of the data
      if (
        message.data.userPosts === undefined &&
        message.data.userReplies === undefined
      ) {
        console.error(
          "[Background] ERROR: Missing both posts and replies in SAVE_USER_POSTS message"
        );
        sendResponse({ success: false, error: "Missing both posts and replies data" });
        return;
      }

      // First, get existing data from storage to preserve what's already there
      try {
        // Get existing data from storage
        const existingData = await chrome.storage.local.get([
          "userWritingSamples",
          "userReplies",
        ]);
        console.log("[Background] DEBUG: Existing data in storage:", {
          postsCount: existingData.userWritingSamples
            ? existingData.userWritingSamples.length
            : 0,
          repliesCount: existingData.userReplies ? existingData.userReplies.length : 0,
        });

        // Only update what's provided, preserve the rest
        if (message.data.userPosts && message.data.userPosts.length > 0) {
          // New posts provided, update only posts
          userWritingSamples = message.data.userPosts;
          console.log(
            `[Background] Updating posts with ${userWritingSamples.length} new items`
          );
        } else {
          // No new posts, keep existing ones
          userWritingSamples = existingData.userWritingSamples || [];
          console.log(
            `[Background] Preserving ${userWritingSamples.length} existing posts`
          );
        }

        if (message.data.userReplies && message.data.userReplies.length > 0) {
          // New replies provided, update only replies
          userReplies = message.data.userReplies;
          console.log(
            `[Background] Updating replies with ${userReplies.length} new items`
          );
        } else {
          // No new replies, keep existing ones
          userReplies = existingData.userReplies || [];
          console.log(`[Background] Preserving ${userReplies.length} existing replies`);
        }

        console.log(
          `[Background] Final data for saving: ${userWritingSamples.length} posts and ${userReplies.length} replies`
        );
        console.log("[Background] DEBUG: Final userReplies array:", userReplies);

        // Log the updated global variables
        console.log(
          "[Background] DEBUG: Global userWritingSamples length:",
          userWritingSamples.length
        );
        console.log("[Background] DEBUG: Global userReplies length:", userReplies.length);

        // Save both to local storage
        await chrome.storage.local.set(
          {
            userWritingSamples: userWritingSamples,
            userReplies: userReplies,
          },
          () => {
            if (chrome.runtime.lastError) {
              console.error(
                "[Background] ERROR saving to storage:",
                chrome.runtime.lastError
              );
            } else {
              console.log(
                "[Background] DEBUG: Successfully saved to chrome.storage.local"
              );
              // Verify what was saved by reading it back
              chrome.storage.local.get(
                ["userReplies", "userWritingSamples"],
                (result) => {
                  console.log(
                    "[Background] DEBUG: Verification after save - posts:",
                    result.userWritingSamples
                      ? result.userWritingSamples.length
                      : "undefined",
                    "replies:",
                    result.userReplies ? result.userReplies.length : "undefined"
                  );
                }
              );
            }
          }
        );

        sendResponse({
          success: true,
          postsCount: userWritingSamples.length,
          repliesCount: userReplies.length,
          message: "Data saved successfully, preserving existing content",
        });
      } catch (error) {
        console.error("[Background] Error handling SAVE_USER_POSTS:", error);
        sendResponse({ success: false, error: "Error saving data: " + error.message });
      }
      return;
    }
    if (message.type === "SAVE_USER_LIKES") {
      const likes = message.data.likedTweets || [];
      // Update both variables to ensure consistency
      userLikedTopicsRaw = likes;
      likedPosts = likes;

      console.log(`[Background] Saving ${likes.length} liked posts to storage`);

      // Save with both keys for compatibility
      await chrome.storage.local.set({
        userLikedTopicsRaw: userLikedTopicsRaw,
        likedPosts: likedPosts,
      });

      // Verify what was saved
      chrome.storage.local.get(["likedPosts", "userLikedTopicsRaw"], (result) => {
        console.log(
          "[Background] Verification after SAVE_USER_LIKES - likedPosts:",
          result.likedPosts ? result.likedPosts.length : "undefined",
          "userLikedTopicsRaw:",
          result.userLikedTopicsRaw ? result.userLikedTopicsRaw.length : "undefined"
        );
      });

      sendResponse({ success: true, count: likes.length });
      return;
    }

    // Most other handlers will need an API key
    if (!userSettings.apiKey) {
      // Check if we're still initializing before showing an error
      if (globalThis.apiKeyInitialized) {
        console.error(
          "[Background] CRITICAL: API key check failed! userSettings.apiKey is:",
          userSettings.apiKey,
          "Full userSettings:",
          JSON.parse(JSON.stringify(userSettings))
        );
        sendResponse({ error: "API key not found" });
      } else {
        console.log("[Background] API key not loaded yet, attempting to load now...");
        // Try loading API key again
        try {
          const result = await new Promise((resolve) => {
            chrome.storage.sync.get(["apiKey"], resolve);
          });
          if (result.apiKey) {
            userSettings.apiKey = result.apiKey;
            globalThis.apiKeyInitialized = true;
            console.log("[Background] Successfully loaded API key on demand");
          } else {
            console.warn("[Background] API key still not found in storage");
            sendResponse({ error: "API key not found" });
            return;
          }
        } catch (error) {
          console.error("[Background] Error loading API key:", error);
          sendResponse({ error: "Error loading API key" });
          return;
        }
      }

      if (!userSettings.apiKey) {
        // If we still don't have an API key after attempting to load it
        sendResponse({ error: "API key not found" });
        return; // Prevent further execution if no API key
      }
    }

    console.log(
      "[Background] API key check passed. userSettings.apiKey:",
      userSettings.apiKey
    ); // Log before using API key

    // Handlers that require API key (or are fine if it's null for their specific logic, like IS_API_KEY_SET)
    if (message.type === "GET_SETTINGS") {
      const settings = await loadDataFromStorage([
        "apiKey",
        "profileBio",
        "selectedTone",
        "hashtags",
      ]); // loadDataFromStorage is async
      sendResponse(settings);
    } else if (message.type === "IS_API_KEY_SET") {
      sendResponse({ isSet: !!userSettings.apiKey });
    } else if (message.type === "GENERATE_TWEETS") {
      const { tone, userInput } = message;
      if (!userInput || !userInput.trim()) {
        sendResponse({ error: "No input provided for post generation." });
        return;
      }
      try {
        console.log("[Background] Generating polished posts from user input:", userInput);
        // Prepare user profile data
        const userProfile = {
          profileBio: userSettings.profileBio,
          writingSamples: userWritingSamples || [],
          tone: tone || userSettings.tone,
        };

        // Generate polished variations of the user's post idea
        const posts = await generatePolishedPosts(
          userSettings.apiKey,
          userInput,
          userProfile
        );

        console.log("[Background] Generated polished posts:", posts);
        sendResponse({ ideas: posts });
      } catch (error) {
        console.error("[Background] Error generating polished posts:", error);
        sendResponse({ error: error.message });
      }
    } else if (message.type === "GET_TWEET_TEXT") {
      if (!message.payload || !message.payload.prompt) {
        sendResponse({ error: "No prompt provided for GET_TWEET_TEXT." });
        return;
      }
      try {
        console.log(
          "[Background] Generating tweet text for prompt:",
          message.payload.prompt
        );
        const tweetText = await generateTweetText(
          message.payload.prompt,
          message.payload.tone || userSettings.tone
        );
        console.log("[Background] Generated tweet text:", tweetText);
        sendResponse({ tweetText });
      } catch (error) {
        console.error("[Background] Error generating tweet text:", error);
        sendResponse({ error: `Error generating tweet: ${error.message}` });
      }
    } else if (message.type === "PROCESS_VOICE_TRANSCRIPT") {
      // Old flow, to be deprecated
      console.log("[Background] Received PROCESS_VOICE_TRANSCRIPT (old flow)");
      const { transcript, tone } = message.payload;
      try {
        const polishedText = await callOpenAI(
          userSettings.apiKey,
          transcript,
          tone,
          null,
          userSettings.profileBio,
          userSettings.userPosts,
          userSettings.likedTweets,
          "You are a helpful AI assistant. You will be given a raw voice transcript and should polish it into a coherent tweet or reply. IMPORTANT: Do not use hyphens (-) or double hyphens (--) in your output."
        );
        sendResponse({ type: "POLISHED_TEXT_READY", payload: { polishedText } });
      } catch (error) {
        sendResponse({ type: "POLISHING_ERROR", payload: { error: error.message } });
      }
    } else if (message.type === "TRANSCRIBE_AUDIO") {
      console.log("[Background] Received TRANSCRIBE_AUDIO request");
      if (!message.audioDataUrl) {
        sendResponse({ error: "No audio data URL provided for transcription." });
        return;
      }
      try {
        const audioBlob = dataURLtoBlob(message.audioDataUrl);
        if (!audioBlob) {
          sendResponse({ error: "Failed to convert audio data URL to Blob." });
          return;
        }
        const transcriptData = await transcribeAudioWithOpenAI(
          audioBlob,
          userSettings.apiKey
        );
        sendResponse(transcriptData);
      } catch (error) {
        console.error("[Background] Error in TRANSCRIBE_AUDIO handler:", error);
        sendResponse({ error: `Internal error during transcription: ${error.message}` });
      }
    } else if (message.type === "POLISH_RAW_TRANSCRIPT") {
      console.log("[Background] Received POLISH_RAW_TRANSCRIPT request", message.payload);
      if (!message.payload || !message.payload.rawTranscript) {
        sendResponse({ error: "No raw transcript provided for polishing." });
        return;
      }
      const { rawTranscript, tone } = message.payload;
      const systemMessage =
        "You are an AI assistant. Polish the following voice transcript into a coherent and natural-sounding text, suitable for a social media post or reply. Ensure the output is concise, engaging, and ready for posting on X.com. Avoid conversational fillers and make it sound natural for a written post.\n\n" +
        'Voice Transcript: "' +
        rawTranscript +
        '"\n\n' +
        "Polished Text:";
      try {
        // Ensure callOpenAI signature matches: (apiKey, prompt, tone, customInstruction, userBio, userPosts, userLikes, systemMessageOverride, context)
        const polishedText = await callOpenAI(
          userSettings.apiKey,
          rawTranscript,
          tone,
          null,
          userSettings.profileBio,
          userSettings.userPosts,
          userSettings.likedTweets,
          systemMessage
        );
        sendResponse({ polishedText: polishedText });
      } catch (error) {
        console.error("[Background] Error polishing transcript:", error);
        sendResponse({ error: `Error polishing transcript: ${error.message}` });
      }
    } else if (message.type === "GENERATE_REPLY") {
      const { tweetData, tone, userInstruction, forceRegenerate } = message; // Extract all needed params, including forceRegenerate flag
      console.log(
        "[Background] Generating reply for tweet:",
        tweetData,
        forceRegenerate ? "(forced regeneration)" : ""
      );

      if (!tweetData || !tweetData.tweetText) {
        sendResponse({ error: "Invalid tweet data. Cannot generate reply." });
        return;
      }

      // Get user's writing samples for personalization
      let writingSamples = [];
      try {
        const result = await chrome.storage.local.get(["userWritingSamples"]);
        if (result.userWritingSamples && Array.isArray(result.userWritingSamples)) {
          writingSamples = result.userWritingSamples.slice(0, 5); // Take up to 5 samples
        }
      } catch (error) {
        console.error("[Background] Error retrieving user writing samples:", error);
        // Continue without samples
      }

      // Construct prompt with enhanced instructions and questions generation
      const postSeparator = "###POST_SEPARATOR###";
      const questionSeparator = "###QUESTIONS_SEPARATOR###";
      // If forceRegenerate is true, add a randomness factor to ensure different results
      const randomPrompt = forceRegenerate
        ? `Regeneration request #${Math.floor(Math.random() * 10000)}. `
        : "";

      const prompt = `
        ${randomPrompt}Generate 5 distinct reply suggestions and 3 contextual guiding questions for the following tweet by ${
        tweetData.tweetAuthorHandle || "the author"
      }:

        "${tweetData.tweetText}"

        ${
          userSettings.profileBio
            ? `IMPORTANT - Match this bio/style: ${userSettings.profileBio}`
            : ""
        }
        
        ${
          writingSamples.length > 0
            ? `IMPORTANT - Match the style, tone, vocabulary, and sentence structure of these writing samples:
          ${writingSamples.map((sample, i) => `Sample ${i + 1}: "${sample}"`).join("\n")}`
            : ""
        }
        
        ${
          userReplies && userReplies.length > 0 // Check if userReplies exists and has items
            ? `IMPORTANT - ALSO Match the style, tone, and vocabulary of these RECENT USER REPLIES:\n        ${userReplies
                .slice(0, 5) // Take up to 5 recent replies
                .map((reply, i) => `User Reply Example ${i + 1}: "${reply}"`)
                .join("\n")}`
            : ""
        }
        
        ${
          userInstruction
            ? `The user provided this specific instruction for the reply: "${userInstruction}". Prioritize this instruction while maintaining the overall style.
`
            : ""
        }

        STRICT REQUIREMENTS FOR REPLIES:
        1.  Create 5 COMPLETELY DIFFERENT replies that match the user's writing style
        2.  Each reply must have a distinct angle or approach
        3.  DO NOT use ANY hyphens (- or --) in ANY of the replies - this is very important
        4.  Each reply should be 1-3 sentences, concise and engaging
        5.  Match the user's vocabulary level, sentence structure, and conversational style
        6.  Tone should be: ${tone || "neutral"}
        7.  Format each reply separated by "${postSeparator}"
        8.  Each reply must directly answer the tweet's question by providing the specific information or examples requested.
        9.  Guiding questions should help the user brainstorm their own reply by connecting the tweet's content to their unique voice, style, and interests (derived from their bio, past tweets/replies, and liked topics).
        10. **FULFILL EXPLICIT REQUESTS**: When the original tweet asks for specific items (e.g., ideas, names, examples, opinions, answers), your replies MUST attempt to **provide** those items. DO NOT merely comment on the act of asking or the topic of the request without offering actual examples/answers. Fulfilling the request is a top priority.
        11. NO HASHTAGS: Absolutely no hashtags in the tweet suggestions. Do not suggest hashtags.

        AFTER THE REPLIES, INCLUDE "${questionSeparator}" FOLLOWED BY 3 CONTEXTUAL GUIDING QUESTIONS:
        1.  Create 3 thought-provoking questions that directly relate to the specific content of the tweet
        2.  These questions should help the user formulate their own thoughtful response
        3.  Make questions specific to the topic, events, people, or opinions mentioned in the tweet
        4.  Avoid generic questions - they must clearly relate to this specific tweet's content
        5.  Format each question EXACTLY like this: "Question 1: [Your question here]" on its own line
        6.  ENSURE all three questions are properly labeled with 'Question X:' at the start
        `;

      try {
        // Use the main prompt directly instead of the variation flow
        console.log("[Background] Generating replies directly from the main prompt");

        // Use our main prompt to get all replies at once
        const mainResponse = await callOpenAI(userSettings.apiKey, prompt);
        console.log("[Background] Generated response from main prompt:", mainResponse);

        // Process the main response
        let variations = [];

        if (mainResponse) {
          console.log("[Background] Raw main response:", mainResponse);

          // ADVANCED VARIATION EXTRACTION
          // If the API returns variations in a single block, we need to intelligently segment it

          // First, try to identify individual replies by common patterns
          const forcedVariations = [];

          // Extract the first part as a potential main reply if we can find one
          if (mainResponse.includes(postSeparator)) {
            const firstPart = mainResponse.split(postSeparator)[0].trim();
            if (firstPart && firstPart.length > 0) {
              forcedVariations.push(firstPart);
            }
          }

          // Try to extract individual complete thoughts
          // Start with sentences as potential independent replies
          const sentenceMatches = mainResponse.match(/[^.!?]+[.!?]+\s*/g) || [];
          let cleanedSentences = sentenceMatches
            .map((s) => s.trim())
            .filter((s) => s.length >= 10 && s.length <= 280);

          // Get unique sentences only
          cleanedSentences = [...new Set(cleanedSentences)];

          // If we have multiple short sentences, add them as variations
          for (
            let i = 0;
            i < cleanedSentences.length && forcedVariations.length < 4;
            i++
          ) {
            // Only add if it's different from the main reply and other variations
            if (
              !forcedVariations.some(
                (v) =>
                  v.toLowerCase().includes(cleanedSentences[i].toLowerCase()) ||
                  cleanedSentences[i].toLowerCase().includes(v.toLowerCase())
              )
            ) {
              forcedVariations.push(cleanedSentences[i]);
            }
          }

          // If we still need more variations, try a different approach - character counts
          if (forcedVariations.length < 4) {
            // Try to intelligently find break points in the text (e.g., 30-40 words per reply)
            const words = variationsResponse.split(/\s+/);
            let currentVariation = [];
            let variationCount = 0;

            for (let i = 0; i < words.length && forcedVariations.length < 4; i++) {
              currentVariation.push(words[i]);

              // Check if we have a reasonable variation size (about 30-40 words)
              if (
                currentVariation.length >= 12 ||
                (currentVariation.length >= 8 &&
                  (words[i].endsWith(".") ||
                    words[i].endsWith("?") ||
                    words[i].endsWith("!")))
              ) {
                const newVariation = currentVariation.join(" ");

                // Check if this variation is unique enough
                if (
                  !forcedVariations.some(
                    (v) =>
                      v.toLowerCase().includes(newVariation.toLowerCase()) ||
                      newVariation.toLowerCase().includes(v.toLowerCase())
                  )
                ) {
                  forcedVariations.push(newVariation);
                  currentVariation = [];
                  variationCount++;
                }
              }
            }

            // If we have remaining words that haven't formed a variation, add them
            if (currentVariation.length > 5 && forcedVariations.length < 4) {
              const lastVariation = currentVariation.join(" ");
              forcedVariations.push(lastVariation);
            }
          }

          try {
            // Handle numerical splitting with post separators (OpenAI's formatting)
            const postSeparatorPattern = /###POST_SEPARATOR###/g;
            if (mainResponse.includes("###POST_SEPARATOR###")) {
              console.log(
                "[Background] Detected POST_SEPARATOR format, properly splitting"
              );
              const separatedVariations = mainResponse.split(/###POST_SEPARATOR###/g);
              if (separatedVariations.length >= 3) {
                // Clean up each variation, removing all numbering and other artifacts
                variations = separatedVariations
                  .map((v) => {
                    // Start with trimming whitespace
                    let cleaned = v.trim();
                    // Remove any numbering like "1. " at the start
                    cleaned = cleaned.replace(/^\s*\d+\.\s*/, "");
                    // Remove any trailing numbers that might have leaked in
                    cleaned = cleaned.replace(/\s+\d+\.\s*$/g, "");
                    // Remove any remaining post separator tags
                    cleaned = cleaned.replace(/###\w+###/g, "");
                    // Final trim to clean up any leftover whitespace
                    cleaned = cleaned.trim();
                    return cleaned;
                  })
                  .filter((v) => v.length > 0)
                  .map(removeHyphens);
              }
            }
          } catch (error) {
            console.error(
              "[Background] Error processing variations with separators:",
              error
            );
            // Keep the variations as they are if processing fails
          }
          try {
            // Detect if we have numbered variations (common format)
            if (/^\s*\d+\.\s/m.test(mainResponse)) {
              console.log("[Background] Detected numbered format, extracting properly");

              // Method 1: Try to extract using advanced segmentation by looking for numbering
              const variationPattern = /\s*\d+\.\s*(.*?)(?=\s*\d+\.\s*|$)/gs;
              const extractedVariations = [];
              let variationMatch;

              while ((variationMatch = variationPattern.exec(mainResponse)) !== null) {
                let extractedText = variationMatch[1].trim();

                // Additional cleaning to ensure we have no separators or trailing numbers
                extractedText = extractedText.replace(/###POST_SEPARATOR###/g, "").trim();
                // Remove any trailing numbers with periods that might have leaked in
                extractedText = extractedText.replace(/\s+\d+\.\s*$/g, "").trim();
                // Remove any numbering at the start that might have been missed
                extractedText = extractedText.replace(/^\s*\d+\.\s*/g, "").trim();

                if (extractedText.length > 0) {
                  extractedVariations.push(extractedText);
                }
              }

              // If we found at least 3 variations with the advanced pattern, use them
              if (extractedVariations.length >= 3) {
                console.log("[Background] Using advanced segmentation for variations");
                // Start with the initial reply then add the extracted variations, deduplicate and limit to 5
                const uniqueVariations = [variations[0], ...extractedVariations]
                  .filter((v, i, arr) => arr.indexOf(v) === i) // Remove duplicates
                  .slice(0, 5);
                variations = uniqueVariations;
              }
            }
          } catch (error) {
            console.error("[Background] Error processing numbered variations:", error);
            // Keep existing variations if processing fails
          }

          // If we didn't get good variations from numbered format, try other approaches
          if (variations.length < 3) {
            console.log("[Background] Using alternative segmentation for variations");
            variations = forcedVariations
              .filter((reply) => reply && reply.trim().length > 0)
              .map((reply) => reply.replace(/^\d+\.\s*/, "").trim()) // Remove any numbering
              .map((reply) => reply.replace(/^[-*•]\s*/, "").trim()) // Remove any bullet points
              .map((reply) => reply.replace(/###\w+###/g, "").trim()) // Remove any separators or tags
              .map(removeHyphens); // Ensure no hyphens
          }

          // If we still don't have enough variations, use the forced variations as fallback
          if (variations.length < 3) {
            console.log("[Background] Using fallback variation processing");
            variations = forcedVariations
              .filter((reply) => reply && reply.trim().length > 0)
              .map((reply) => reply.replace(/^\d+\.\s*/, "").trim()) // Remove any numbering
              .map((reply) => reply.replace(/^[-*•]\s*/, "").trim()) // Remove any bullet points
              .map((reply) => reply.replace(/###\w+###/g, "").trim()) // Remove any separators or tags
              .map(removeHyphens);
          }

          // If we have less than 5 variations, try splitting by sentences
          if (variations.length < 5) {
            const sentences = mainResponse.match(/[^.!?]+[.!?]+\s*/g) || [];
            const cleanSentences = sentences
              .map((s) => s.trim())
              .filter((s) => s.length >= 10 && s.length <= 120)
              .map((s) => removeHyphens(s));

            // Add unique sentences as variations
            for (const sentence of cleanSentences) {
              if (
                !variations.some(
                  (v) =>
                    v.toLowerCase().includes(sentence.toLowerCase()) ||
                    sentence.toLowerCase().includes(v.toLowerCase())
                )
              ) {
                variations.push(sentence);
                if (variations.length >= 5) break;
              }
            }
          }

          // No need to add the main reply separately as it should already be in the variations

          // Keep only the top 5 variations
          variations = variations.slice(0, 5);

          console.log("[Background] Final processed variations:", variations);

          // As a fallback, if we have fewer than 4 variations, make duplicates
          // This ensures the UI shows the right number of slots
          while (variations.length < 4) {
            // Get a variation we can duplicate with minor modifications
            const baseVar = variations[variations.length % variations.length];
            variations.push(baseVar);
          }
        }

        // Generate contextual questions based on the tweet content
        const questionsPrompt = `
          Based on this tweet: "${tweetData.tweetText}"
          
          Generate 3 short, specific questions to help craft a personalized reply that directly engages with this tweet.
          
          CRITICAL FORMAT REQUIREMENTS:
          - Format EXACTLY as: "Question 1: [question]" with each question on its own line
          - Number questions 1-3 explicitly
          - Questions must be directly about THIS specific tweet, not generic
          - Keep questions brief (10-15 words) and immediately useful
          - Make questions thought-provoking to inspire a great reply
          - Return EXACTLY 3 questions and NOTHING else (no explanations, no headers)
          - DO NOT include any separators like ### or other formatting markers
          
          TYPES OF QUESTIONS TO INCLUDE:
          - One question about their personal experience related to what's in the tweet
          - One question about a specific aspect or detail mentioned in the tweet
          - One question about their future plans or intentions related to the tweet topic
        `;

        const questionsResponse = await callOpenAI(userSettings.apiKey, questionsPrompt);
        let guidingQuestions = [];

        if (questionsResponse) {
          console.log("[Background] Raw questions response:", questionsResponse);

          // Improved question parsing with careful error handling
          console.log("[Background] Parsing questions from response");

          try {
            // Clean up the input by normalizing spaces and linebreaks
            const cleanedInput = questionsResponse.replace(/\r\n|\r|\n/g, "\n").trim();

            // Look for "Question X:" patterns or numbered questions
            const questionLines = [];

            // Try to find formatted Question X: patterns
            const formatPattern = /Question\s*\d+\s*:/gi;
            const matchResult = cleanedInput.match(formatPattern);

            if (matchResult && matchResult.length >= 2) {
              console.log("[Background] Found formatted questions");

              // Split by the question pattern
              const parts = cleanedInput.split(formatPattern);
              // Skip the first part (it's before the first question)
              for (let i = 1; i < parts.length; i++) {
                if (parts[i].trim().length > 0) {
                  questionLines.push(parts[i].trim());
                }
              }
            } else {
              // Fallback: split by lines or sentences
              console.log("[Background] Using fallback question parsing");

              // Split by newlines first
              const lines = cleanedInput
                .split("\n")
                .filter((line) => line.trim().length > 0);

              // Filter to find likely questions
              questionLines.push(
                ...lines.filter((line) => {
                  const l = line.toLowerCase().trim();
                  return (
                    l.includes("?") ||
                    l.startsWith("what") ||
                    l.startsWith("how") ||
                    l.startsWith("why") ||
                    l.startsWith("when") ||
                    l.startsWith("where") ||
                    l.startsWith("which")
                  );
                })
              );
            }

            // Process and clean the questions
            const cleanedQuestions = questionLines
              .map((q) => {
                // Remove any existing prefixes
                return q
                  .replace(
                    /^\s*(?:Question\s*\d+\s*:|Q\d+\s*:|\d+\.\s*(?:Question)?\s*:)\s*/i,
                    ""
                  )
                  .trim();
              })
              .filter((q) => q.length > 0);

            // Format final questions with proper prefixes
            guidingQuestions = cleanedQuestions.slice(0, 3).map((q, i) => {
              return `Question ${i + 1}: ${q}`;
            });

            // Add default questions if needed
            if (guidingQuestions.length < 3) {
              const defaultQuestions = [
                "What inspired you to create this particular project?",
                "What was the most rewarding part of bringing this to life?",
                "Are you planning to expand or share this work further?",
              ];

              while (guidingQuestions.length < 3) {
                guidingQuestions.push(
                  `Question ${guidingQuestions.length + 1}: ${
                    defaultQuestions[guidingQuestions.length % 3]
                  }`
                );
              }
            }
          } catch (error) {
            console.error("[Background] Error parsing questions:", error);
            // Provide fallback questions if parsing fails
            guidingQuestions = [
              "Question 1: What was your inspiration behind this?",
              "Question 2: What challenges did you face during development?",
              "Question 3: What future improvements do you have planned?",
            ];
          }

          console.log("[Background] Final processed questions:", guidingQuestions);
        }

        // Ensure we have exactly 3 UNIQUE and properly formatted questions
        if (guidingQuestions.length === 0) {
          // If we have no questions at all, use the complete default set
          guidingQuestions = [
            "Question 1: What specific aspect of this tweet interests you most?",
            "Question 2: How might your personal experience relate to this topic?",
            "Question 3: What unique perspective can you add to this conversation?",
          ];
        } else if (guidingQuestions.length < 3) {
          // If we have some questions but not enough, add different fallbacks
          const defaultQuestions = [
            "Question 1: What specific aspect of this tweet interests you most?",
            "Question 2: How might your personal experience relate to this topic?",
            "Question 3: What unique perspective can you add to this conversation?",
          ];

          // Add remaining questions needed to reach 3 total
          while (guidingQuestions.length < 3) {
            guidingQuestions.push(
              defaultQuestions[guidingQuestions.length % defaultQuestions.length]
            );
          }
        }

        // Make sure we only have exactly 3 questions
        guidingQuestions = guidingQuestions.slice(0, 3);

        // Make sure we have exactly 5 variations showing in the UI
        // If we have fewer than 5 total variations, create additional ones based on existing ones
        while (variations.length < 5) {
          if (variations.length > 0) {
            // Get one of the existing variations as a base
            const baseVar = variations[variations.length % variations.length];

            // Create a slight variation by adding a common ending phrase
            const endings = [
              "right?",
              "for real",
              "so awesome",
              "love that feeling",
              "thats the real magic",
            ];

            // Add a variation with a different ending
            if (baseVar.endsWith("?") || baseVar.endsWith("!") || baseVar.endsWith(".")) {
              // Remove the ending punctuation
              const newVar =
                baseVar.slice(0, -1) + " " + endings[variations.length % endings.length];
              variations.push(newVar);
            } else {
              // Just add the ending
              variations.push(
                baseVar + " " + endings[variations.length % endings.length]
              );
            }
          } else {
            // If we somehow have no variations at all, add a generic reply
            variations.push("Thanks for sharing this!");
          }
        }

        // Assemble final response
        const formattedResponse = {
          allReplies: variations, // This should include all variations
          reply: variations[0] || "", // For backward compatibility, use first variation
          guidingQuestions: guidingQuestions,
        };

        console.log(
          "[Background] Processed response with contextual questions:",
          formattedResponse
        );

        sendResponse(formattedResponse);
      } catch (error) {
        console.error("[Background] Error generating reply:", error);
        sendResponse({ error: `Error generating reply: ${error.message}` });
      }
      // GENERATE_AI_REPLY message type has been completely removed since we're now using the improved GENERATE_REPLY flow consistently
    } else if (message.type === "GENERATE_TWEET_IDEAS") {
      const { trending, tone, userInstruction } = message;
      // ... (prompt construction as in the diff, using topicsForIdeas) ...
      let topicsForIdeas =
        "current technology, AI advancements, and software development trends";
      if (userLikedTopicsRaw && userLikedTopicsRaw.length > 0) {
        topicsForIdeas = userLikedTopicsRaw.slice(0, 5).join("... "); // Using first 5 liked snippets
      } else if (trending && trending.length > 0) {
        topicsForIdeas = trending.join(", ");
      }
      let prompt = `A user wants 3 original tweet ideas (≤280 characters each). Their general writing style is described as: "${
        userSettings.profileBio || "a generally insightful and engaging tech commentator"
      }".\nThe tweet ideas should be ${getTonePrompt(
        tone
      )}.\nThe ideas should revolve around these topics/themes: ${topicsForIdeas}.\n`;
      // Add userWritingSamples to prompt if they exist...
      console.log("[Background] FINAL PROMPT for generateTweetIdeas:", prompt);
      const ideas = await callOpenAI(
        userSettings.apiKey,
        prompt,
        tone,
        userInstruction,
        userSettings.profileBio,
        userSettings.userPosts,
        userSettings.likedTweets /*, systemMessage if needed */
      );
      sendResponse({
        ideas: ideas.split("\n\n").filter((idea) => idea.trim().length > 0),
      });
    } else if (message.type === "FETCH_TRENDING") {
      fetchTrendingTopics()
        .then((trending) => sendResponse({ trending }))
        .catch((error) => sendResponse({ error: error.message }));
      // This handler is async due to fetchTrendingTopics, but its own logic doesn't await the API key.
      // The return true below will keep the channel open for fetchTrendingTopics's promise.
    } else if (message.type === "FETCH_REAL_TRENDING_TOPICS") {
      console.log("[Background] Received request for real trending topics");

      // This will use web search to get actual trending topics
      (async () => {
        try {
          // Use web search to get current trending topics
          const query =
            "What are the current trending tech topics on Twitter/X? List only 5-7 specific trending topics, separated by commas.";

          const searchResults = await searchWeb(query);
          if (searchResults && searchResults.text) {
            // Process the results to extract topics
            // First, check if the response already looks like a comma-separated list
            let topics = [];

            if (searchResults.text.includes(",")) {
              // If it contains commas, treat it as a comma-separated list
              topics = searchResults.text
                .split(",")
                .map((topic) => topic.trim())
                .filter((topic) => topic.length > 0 && topic.length < 50); // Avoid extremely long topics
            } else {
              // Otherwise, try to split by newlines or other common separators
              topics = searchResults.text
                .split(/[\n\r•\-\*]/) // Split by newlines, bullets, hyphens, etc.
                .map((topic) => topic.trim())
                .filter((topic) => topic.length > 0 && topic.length < 50);
            }

            // Check if we have at least one valid topic
            if (topics.length > 0) {
              console.log(
                "[Background] Retrieved trending topics from web search:",
                topics
              );
              sendResponse({ trending: topics.slice(0, 7), source: "web" }); // Return topics and source
            } else {
              // Don't show fallback data - just return empty result
              console.log("[Background] No valid topics extracted from search");
              sendResponse({ trending: [] });
            }
          } else {
            // Don't show fallback data - just return empty result
            console.log("[Background] Search failed to return valid text");
            sendResponse({ trending: [] });
          }
        } catch (error) {
          console.error("[Background] Error fetching real trending topics:", error);
          // Don't show fallback data - just return empty result
          sendResponse({ trending: [] });
        }
      })();

      return true; // Async response
    } else {
      console.warn("[Background] Unhandled message type in IIFE:", message.type);
      // sendResponse({ error: 'Unknown message type handled in IIFE' }); // Optional: send error for unhandled types
    }
  })(); // END OF ASYNC IIFE

  return true; // Crucial for all async sendResponse calls
});

/**
 * Generate a reply to a tweet using OpenAI
 * @param {Object} tweetData - Data about the tweet to reply to
 * @param {string} tone - The tone to use for the reply
 * @returns {Promise<string>} - The generated reply
 */
async function generateReply(tweetData, tone = "neutral") {
  const { tweetText, tweetAuthorHandle, userInstruction } = tweetData;
  const tonePrompt = getTonePrompt(tone);

  let prompt = `A user wants help drafting a concise, engaging Twitter reply (≤40 words) that DIRECTLY responds to another person's tweet. Their general writing style is described as: "${
    userSettings.profileBio || "a generally helpful and friendly tech enthusiast"
  }".
  The reply should be ${tonePrompt}.
  Original tweet to reply to by @${tweetAuthorHandle}: "${tweetText}"
  `;

  // Add liked topics if available to better understand user preferences
  if (userSettings.likedTopics && userSettings.likedTopics.length > 0) {
    prompt += `The user is interested in these topics: ${userSettings.likedTopics.join(
      ", "
    )}\n`;
  }

  if (userWritingSamples && userWritingSamples.length > 0) {
    prompt += `Here are examples of how the user typically writes. YOU MUST MATCH this style, tone, vocabulary, and sentence structure PRECISELY:\n`;
    userWritingSamples.slice(0, 5).forEach((sample, index) => {
      // Use up to 5 samples
      prompt += `Example ${index + 1}: "${sample}"\n`;
    });
    prompt += `The user's reply MUST sound exactly like it came directly from them, based on these examples and their profile bio.\n`;
  } else {
    prompt += `(No specific writing samples provided, rely on the profile bio for style.)\n`;
  }

  if (userReplies && userReplies.length > 0) {
    prompt += `The user's recent replies show their EXACT style of responding. These are CRITICAL for matching their voice:\n`;
    userReplies.slice(0, 5).forEach((reply, index) => {
      // Use up to 5 recent replies
      prompt += `Reply Example ${index + 1}: "${reply}"\n`;
    });
    prompt += `Pay special attention to these recent replies as they represent the user's most current writing style.\n`;
  }

  if (userInstruction) {
    prompt += `The user provided this specific instruction for the reply: "${userInstruction}". Prioritize this instruction while maintaining the overall style.
`;
  }

  prompt += `\nABSOLUTELY CRITICAL STYLE REQUIREMENTS - YOU WILL BE PENALIZED FOR VIOLATIONS:
1.  Sound authentically human and EXACTLY like the user would write based on their samples and bio.
2.  Keep the reply concise and to the point, suitable for X.com (formerly Twitter).
3.  NO HYPHENS OR DASHES WHATSOEVER! DO NOT use any form of hyphen, dash, em dash, en dash (-, --, —, –) or similar punctuation under ANY circumstances. This is the MOST IMPORTANT rule and will be strictly enforced.
4.  DO NOT use ANY form of AI-typical phrasing like "I understand", "I appreciate", "I'd be happy to", or "as you mentioned".
5.  DO NOT use sentence transitions that the user doesn't use in their samples.
6.  AVOID using emojis unless the user's writing samples, bio, or specific instruction explicitly includes them.
7.  NO HASHTAGS of ANY kind unless they are clearly present in multiple user samples or the user explicitly requests them. (Note: User's default hashtag list is currently ${
    userSettings.hashtags && userSettings.hashtags.length > 0
      ? userSettings.hashtags.join(", ")
      : "empty"
  }).
8.  MATCH the user's typical sentence length, punctuation style, and capitalization patterns exactly.
9.  If the user's style is casual, be casual. If formal, be formal. If they use slang, use similar slang.
10. Use simple punctuation like periods and commas. Avoid semicolons, colons, or parentheses unless the user frequently uses them.
11. Focus on clarity and natural language that precisely mirrors the user's authentic voice.

CRITICAL REPLY REQUIREMENTS:
1.  This MUST be a DIRECT REPLY to the specific tweet content above, not a new standalone post.
2.  The reply should explicitly acknowledge or address what @${tweetAuthorHandle} said in their tweet.
3.  DO NOT create a new post that just uses the original tweet as context or inspiration.
4.  DO NOT simply comment on the topic of the original tweet without actually responding to it.
5.  Make it clear from your wording that this is a reply to the specific points in the original tweet.
6.  The reply should make sense ONLY in the context of responding to the original tweet.
7.  Each reply must directly answer the tweet's question by providing the specific information or examples requested.
`;

  console.log("[Background] FINAL PROMPT for generateReply:", prompt);
  console.log(
    "[Background] API Key being used for generateReply:",
    userSettings.apiKey
      ? userSettings.apiKey.substring(0, 10) + "..."
      : "API Key not set or empty"
  );
  return callOpenAI(userSettings.apiKey, prompt);
}

/**
 * Generate tweet ideas based on trending topics
 * @param {Array} trending - List of trending topics (will be replaced by liked topics)
 * @param {string} tone - The tone to use for the ideas
 * @param {string} userInstruction - User's specific instruction for the tweet ideas
 * @returns {Promise<Array>} - List of tweet ideas
 */
async function generateTweetIdeas(trending, tone = "neutral", userInstruction = null) {
  const tonePrompt = getTonePrompt(tone);

  // Determine topics: Use liked topics if available, otherwise fall back to generic/trending
  let topicsForIdeas =
    "current technology, AI advancements, and software development trends"; // Default
  if (userLikedTopicsRaw && userLikedTopicsRaw.length > 0) {
    // Simple approach: use snippets of liked tweets as topic indicators
    // More advanced: summarize themes from userLikedTopicsRaw with another AI call (future enhancement)
    topicsForIdeas = userLikedTopicsRaw.slice(0, 5).join("... "); // Using first 5 liked snippets
    console.log("[Background] Generating ideas based on liked topics:", topicsForIdeas);
  } else if (trending && trending.length > 0) {
    topicsForIdeas = trending.join(", ");
    console.log(
      "[Background] Generating ideas based on provided trending topics:",
      topicsForIdeas
    );
  }

  let prompt = `A user wants 3 original tweet ideas (≤280 characters each). Their general writing style is described as: "${
    userSettings.profileBio || "a generally insightful and engaging tech commentator"
  }".
  The tweet ideas should be ${tonePrompt}.
  The ideas should revolve around these topics/themes: ${topicsForIdeas}.
`;

  if (userWritingSamples && userWritingSamples.length > 0) {
    prompt += `User's general writing style based on their recent posts (use this to guide the voice, tone, and vocabulary of the tweet ideas):\n`;
    userWritingSamples.slice(0, 3).forEach((sample, index) => {
      // Use up to 3 samples for ideas
      prompt += `Example ${index + 1}: "${sample}"\n`;
    });
    prompt += `---`;
  }

  if (userReplies && userReplies.length > 0) {
    prompt += `The user's recent replies also show their style:\n`;
    userReplies.slice(0, 3).forEach((reply, index) => {
      // Use up to 3 recent replies
      prompt += `Reply Example ${index + 1}: "${reply}"\n`;
    });
    prompt += `---`;
  }

  prompt += `\nIMPORTANT STYLE GUIDELINES (unless contradicted by user's samples/bio):
1.  The ideas should sound authentically human and align with the user's described style.
2.  Tweet ideas should be concise and suitable for X.com (formerly Twitter).
3.  Consider adopting a clear viewpoint or a more opinionated/assertive stance if the user's style or liked topics suggest it. Avoid overly neutral or 'balanced' takes unless that's the user's explicit style. If in doubt, lean towards a more distinct perspective.
4.  CRITICAL INSTRUCTION: Absolutely DO NOT use or suggest any hashtags (e.g., #topic). Tweets should not contain the '#' symbol for tagging.
5.  Match the user's vocabulary level, sentence structure, and conversational style (based on bio, writing samples, and reply examples provided).
6.  AVOID using emojis in the tweet ideas unless the user's writing samples, bio, or specific instruction asks for them.
7.  AVOID using double dashes ('--') for emphasis or as sentence connectors unless present in user's samples/bio.
8.  Aim for a mix of content: perhaps a question, a useful tip, a bold take, or an interesting observation.
9.  MOST IMPORTANTLY FOR VARIETY: Avoid making all or a majority of the tweet ideas questions. Strive for a balance, with statements and observations being prominent.
10. Tweets should sound natural, human-like, and reflect a genuine, engaging voice. Avoid robotic, generic, or overly formulaic phrasing.
11. Format each of the 3 tweet ideas separated by double newlines (\n\n):`;

  console.log("[Background] FINAL PROMPT for generateTweetIdeas:", prompt);
  console.log(
    "[Background] API Key being used for generateTweetIdeas:",
    userSettings.apiKey
      ? userSettings.apiKey.substring(0, 10) + "..."
      : "API Key not set or empty"
  );
  const response = await callOpenAI(
    userSettings.apiKey,
    prompt,
    tone,
    userInstruction,
    userSettings.profileBio,
    userSettings.userPosts,
    userSettings.likedTweets
  );

  return response.split("\n\n").filter((idea) => idea.trim().length > 0);
}

/**
 * Get tone-specific prompt addition
 * @param {string} tone - The selected tone
 * @returns {string} - Tone-specific prompt addition
 */
function getTonePrompt(tone) {
  switch (tone) {
    case "fun":
      return "with a light, humorous tone";
    case "hot-take":
      return "with a bold, provocative stance";
    case "heartfelt":
      return "with a sincere, empathetic approach";
    default:
      return "with a balanced, professional tone";
  }
}

async function handleProcessVoiceTranscript(payload, sendResponse) {
  const { transcript, tone } = payload;
  if (!transcript) {
    sendResponse({ type: "POLISHING_ERROR", payload: { error: "Transcript is empty." } });
    return;
  }

  try {
    const apiKey = await getApiKey(); // Correctly fetch API key
    if (!apiKey) {
      sendResponse({
        type: "POLISHING_ERROR",
        payload: { error: "API key not found. Please set it in the extension settings." },
      });
      return;
    }

    let userContext = "";
    if (userSettings.profileBio) {
      userContext += `My bio: "${userSettings.profileBio}".\n`;
    }
    if (userSettings.hashtags && userSettings.hashtags.length > 0) {
      userContext += `I often use hashtags like: ${userSettings.hashtags.join(", ")}.\n`;
    }

    const prompt = `Given the following voice transcript, please refine it into a polished tweet or reply. 
User's preferred tone: "${tone || userSettings.tone || "neutral"}".
${userContext}
Ensure the output is concise, engaging, and ready for posting on X.com. Avoid conversational fillers and make it sound natural for a written post.

Voice Transcript: "${transcript}"

Polished Text:`;

    console.log("[bg.js] Prompt for polishing voice transcript:", prompt);

    const aiResponse = await callOpenAI(prompt, apiKey, [], 0.7); // Assuming callOpenAI handles an array for previous messages

    if (aiResponse && aiResponse.choices && aiResponse.choices.length > 0) {
      const polishedText = aiResponse.choices[0].message.content.trim();
      console.log("[bg.js] Polished text from AI:", polishedText);
      sendResponse({ type: "POLISHED_TEXT_READY", payload: { polishedText } });
    } else {
      console.error("[bg.js] Unexpected response structure from OpenAI API:", aiResponse);
      sendResponse({
        type: "POLISHING_ERROR",
        payload: { error: "Unexpected response from AI." },
      });
    }
  } catch (error) {
    console.error("[bg.js] Error during voice transcript processing:", error);
    sendResponse({
      type: "POLISHING_ERROR",
      payload: { error: error.message || "Failed to process voice transcript." },
    });
  }
}

const OPENAI_TRANSCRIPTION_URL = "https://api.openai.com/v1/audio/transcriptions";

async function transcribeAudioWithOpenAI(audioBlob, apiKey) {
  if (!apiKey) {
    return {
      error: "OpenAI API key is not set. Please set it in the extension settings.",
    };
  }

  const formData = new FormData();
  formData.append("file", audioBlob, "audio.webm"); // Filename is required by the API
  formData.append("model", "gpt-4o-transcribe"); // Or 'whisper-1'
  // formData.append('response_format', 'json'); // Default is json, can also be 'text'

  try {
    const response = await fetch(OPENAI_TRANSCRIPTION_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        // 'Content-Type': 'multipart/form-data' is automatically set by browser for FormData
      },
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("[XCO-Poster BG] OpenAI Transcription API error:", data);
      const errorMessage =
        data.error && data.error.message
          ? data.error.message
          : `HTTP error ${response.status}`;
      return { error: `OpenAI API Error: ${errorMessage}` };
    }

    console.log("[XCO-Poster BG] Transcription successful:", data);
    return { transcript: data.text }; // Assuming 'text' field contains the transcript
  } catch (error) {
    console.error("[XCO-Poster BG] Error calling OpenAI Transcription API:", error);
    return { error: `Network or other error: ${error.message}` };
  }
}

// Process the AI response to extract multiple reply suggestions and contextual questions
function processAIResponse(response, replySeparator, questionSeparator) {
  if (!response) {
    return {
      replies: ["Sorry, I couldn't generate a reply."],
      questions: [
        "What points would you like to make about this?",
        "What perspective would you like to share on this topic?",
        "How might you contribute to this conversation?",
      ],
    };
  }

  // Initialize default result
  const result = {
    replies: [],
    questions: [
      "What points would you like to make about this?",
      "What perspective would you like to share on this topic?",
      "How might you contribute to this conversation?",
    ],
  };

  // Extract contextual questions if they exist
  if (response.includes(questionSeparator)) {
    console.log("[Background] Found question separator in response");
    // Split by questionSeparator - this handles cases where there might be multiple
    const parts = response.split(questionSeparator);
    const repliesSection = parts[0]; // First part is always replies
    // Concatenate all remaining parts for questions (in case there are multiple separators)
    const questionsSection = parts.slice(1).join("\n").trim();

    // Process replies from the first section
    if (repliesSection && repliesSection.includes(replySeparator)) {
      const replies = repliesSection
        .split(replySeparator)
        .map((reply) => reply.trim())
        .filter((reply) => reply.length > 0);

      if (replies.length > 0) {
        result.replies = replies.slice(0, 5);
      }
    } else if (repliesSection && repliesSection.trim()) {
      // If no separator but we have content, use it as a single reply
      result.replies = [repliesSection.trim()];
    }

    // Process questions from the second section
    if (questionsSection && questionsSection.trim()) {
      // Handle different formats of questions in the response
      let questions = [];

      // Check if questions are prefixed with "Question X:" format
      if (
        questionsSection.includes("Question 1:") ||
        questionsSection.includes("Question 2:") ||
        questionsSection.includes("Question 3:") ||
        questionsSection.match(/Question\s+\d+:/i)
      ) {
        console.log("[Background] Found 'Question X:' formatted questions");
        // Extract questions with prefixes - improved pattern matching
        const questionPattern = /Question\s*\d+:?\s*([^\n]+)/gi;
        const matches = Array.from(questionsSection.matchAll(questionPattern));

        console.log("[Background] Found question matches:", matches.length);

        for (const match of matches) {
          if (match[1] && match[1].trim()) {
            questions.push(match[1].trim());
          }
        }
      } else {
        // From looking at the API responses, we need to handle multiple formats
        // Check for Question X formats after QUESTIONS_SEPARATOR
        if (
          questionsSection.match(/Question \d/i) ||
          questionsSection.match(/###Question \d/i)
        ) {
          // Extract questions by looking for Question pattern
          const questionPattern =
            /(?:###)?Question \d(?:###)?[^\S\r\n]*(.+?)(?=(?:###Question|$))/gis;
          const matches = [...questionsSection.matchAll(questionPattern)];

          if (matches && matches.length > 0) {
            for (const match of matches) {
              if (match[1] && match[1].trim()) {
                questions.push(match[1].trim());
              }
            }
          }
        }
        // Handle cases with multiple QUESTIONS_SEPARATOR markers
        else if (questionsSection.includes("QUESTIONS_SEPARATOR")) {
          // Split by the QUESTIONS_SEPARATOR marker
          const parts = questionsSection.split("QUESTIONS_SEPARATOR");
          for (const part of parts) {
            const clean = part.trim();
            if (clean && clean.length > 0 && clean.length < 200) {
              questions.push(clean);
            }
          }
        }
        // Standard processing - split by line breaks
        else {
          questions = questionsSection
            .split("\n")
            .map((q) => q.trim())
            .filter((q) => q.length > 0 && q.length < 200); // Avoid extremely long lines
        }
      }

      console.log("[Background] Extracted questions:", questions);

      if (questions.length > 0) {
        result.questions = questions.slice(0, 3);
      }
    }
  } else {
    // No question separator, just process replies
    if (response.includes(replySeparator)) {
      const replies = response
        .split(replySeparator)
        .map((reply) => reply.trim())
        .filter((reply) => reply.length > 0);

      if (replies.length > 0) {
        result.replies = replies.slice(0, 5);
      }
    } else if (response.trim()) {
      // If no separator but we have content, use it as a single reply
      result.replies = [response.trim()];
    }
  }

  // Ensure we have at least one question
  if (!result.questions || result.questions.length === 0) {
    result.questions = [
      "What points would you like to make about this?",
      "What perspective would you like to share on this topic?",
      "How might you contribute to this conversation?",
    ];
  }

  return result;
}

// Remove hyphens from text (fallback safety measure)
function removeHyphens(text) {
  if (!text) return text;

  // Replace single hyphens with spaces or appropriate punctuation
  let result = text.replace(/([a-zA-Z])\s*-\s*([a-zA-Z])/g, "$1 $2"); // word - word -> word word

  // Replace double hyphens
  result = result.replace(/--/g, "—"); // Replace double hyphen with em dash

  // Replace any remaining single hyphens
  result = result.replace(/-/g, "·"); // Fallback replacement

  return result;
}

// Helper function to convert Data URL to Blob
function dataURLtoBlob(dataurl) {
  if (!dataurl) return null;
  let arr = dataurl.split(","),
    mime = arr[0].match(/:(.*?);/)[1],
    bstr = atob(arr[1]),
    n = bstr.length,
    u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * Get fallback trending topics when web search fails
 * @returns {Array} - List of fallback trending topics
 */
function getFallbackTrendingTopics() {
  return [
    "GPT-5 release rumors",
    "React 19 performance improvements",
    "Chrome's new web APIs",
    "Startups tackling climate tech",
    "Edge computing breakthroughs",
    "AI regulations in Europe",
    "Quantum computing milestones",
  ];
}

// Generate tweets based on news and user interests

// Listen for side panel open to show extension
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Listener for scheduled post alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
  console.log("[Background] Alarm triggered:", alarm.name);

  if (alarm.name.startsWith("scheduledPost_")) {
    try {
      const { scheduledPosts = [] } = await chrome.storage.local.get("scheduledPosts");
      const postIndex = scheduledPosts.findIndex((p) => p.alarmName === alarm.name);

      if (postIndex > -1) {
        const postToProcess = scheduledPosts[postIndex];

        // Simulate posting (log to console for now)
        console.log(`[Background] Posting scheduled content for alarm ${alarm.name}:`);
        console.log(`--------------------------------------------------`);
        console.log(postToProcess.content);
        console.log(`--------------------------------------------------`);
        console.log(`Originally scheduled for: ${postToProcess.scheduledTime}`);

        // Update post status
        scheduledPosts[postIndex].status = "posted";
        scheduledPosts[postIndex].postedTime = new Date().toISOString();

        // Save updated posts list
        await chrome.storage.local.set({ scheduledPosts });
        console.log(`[Background] Post ${alarm.name} marked as posted.`);

        // Optional: Clear the alarm after it has fired and been processed
        // chrome.alarms.clear(alarm.name, (wasCleared) => {
        //   if (wasCleared) {
        //     console.log(`[Background] Alarm ${alarm.name} cleared successfully.`);
        //   } else {
        //     console.warn(`[Background] Could not clear alarm ${alarm.name}. It might have already been cleared or never existed.`);
        //   }
        // });
      } else {
        console.warn(
          `[Background] Scheduled post for alarm ${alarm.name} not found in storage.`
        );
      }
    } catch (error) {
      console.error(`[Background] Error processing alarm ${alarm.name}:`, error);
    }
  } else {
    console.log(`[Background] Received non-post alarm: ${alarm.name}`);
  }
});

async function loadDataFromStorage() {
  console.log(
    "[Background] loadDataFromStorage called. userSettings BEFORE sync.get (should be defaults):",
    JSON.parse(JSON.stringify(userSettings))
  );

  const localGetPromise = new Promise((resolve, reject) => {
    chrome.storage.local.get(
      ["userWritingSamples", "userReplies", "userLikedTopicsRaw", "likedPosts"],
      (localData) => {
        if (chrome.runtime.lastError) {
          console.error(
            "[Background] Error loading local data:",
            chrome.runtime.lastError
          );
          return reject(chrome.runtime.lastError);
        }
        console.log(
          "[Background] Loading user profile data from local storage:",
          localData
        );

        if (localData.userWritingSamples) {
          userWritingSamples = localData.userWritingSamples;
          console.log(
            `[Background] Loaded ${userWritingSamples.length} posts from storage.`
          );
        } else {
          console.log("[Background] No posts found in storage. Using defaults.");
          userWritingSamples = [];
        }

        if (localData.userReplies) {
          userReplies = localData.userReplies;
          console.log(`[Background] Loaded ${userReplies.length} replies from storage.`);
        } else {
          console.log("[Background] No replies found in storage. Using defaults.");
          userReplies = [];
        }

        // Handle liked posts - check both keys and keep them in sync
        if (localData.likedPosts && localData.likedPosts.length > 0) {
          // If we have the new key, use it
          likedPosts = localData.likedPosts;
          // Keep userLikedTopicsRaw in sync for backward compatibility
          userLikedTopicsRaw = localData.likedPosts;
          console.log(
            `[Background] Loaded ${likedPosts.length} liked posts from likedPosts key in storage.`
          );
        } else if (
          localData.userLikedTopicsRaw &&
          localData.userLikedTopicsRaw.length > 0
        ) {
          // Fall back to older key if the new one isn't populated
          userLikedTopicsRaw = localData.userLikedTopicsRaw;
          // Keep likedPosts in sync
          likedPosts = localData.userLikedTopicsRaw;
          console.log(
            `[Background] Loaded ${userLikedTopicsRaw.length} liked posts from userLikedTopicsRaw key in storage.`
          );
        } else {
          console.log("[Background] No liked posts found in storage. Using defaults.");
          userLikedTopicsRaw = [];
          likedPosts = [];
        }

        // Log the global variables sizes after loading
        console.log(
          `[Background] After loading data - Posts: ${userWritingSamples.length}, Replies: ${userReplies.length}, Likes: ${likedPosts.length}`
        );
        resolve();
      }
    );
  });

  const syncGetPromise = new Promise((resolve, reject) => {
    chrome.storage.sync.get(
      ["apiKey", "profileBio", "hashtags", "tone", "useOwnKey", "settings"],
      (result) => {
        console.log(
          "[Background] loadDataFromStorage - Data retrieved from sync:",
          result
        );
        console.log(
          "[Background] loadDataFromStorage - result.useOwnKey from sync before decision:",
          result.useOwnKey
        );
        if (chrome.runtime.lastError) {
          console.error(
            "[Background] Error loading sync data from storage:",
            chrome.runtime.lastError
          );
          return reject(chrome.runtime.lastError);
        }

        if (result.apiKey !== undefined) {
          userSettings.apiKey = result.apiKey;
          globalThis.apiKeyInitialized = true;
        } else {
          globalThis.apiKeyInitialized =
            userSettings.apiKey !== null && userSettings.apiKey !== "";
        }
        if (result.profileBio !== undefined) {
          userSettings.profileBio = result.profileBio;
        }
        if (result.hashtags !== undefined) {
          userSettings.hashtags = result.hashtags;
        }
        if (result.tone !== undefined) {
          userSettings.tone = result.tone;
        }

        if (result.useOwnKey === undefined) {
          console.log(
            "[Background] loadDataFromStorage - useOwnKey is UNDEFINED in sync. Setting to default (true) and attempting to persist."
          );
          userSettings.useOwnKey = true;
          chrome.storage.sync.set({ useOwnKey: true }, () => {
            if (chrome.runtime.lastError) {
              console.error(
                "[Background] loadDataFromStorage - Error trying to persist default useOwnKey:",
                chrome.runtime.lastError.message
              );
            } else {
              console.log(
                "[Background] loadDataFromStorage - Successfully persisted default useOwnKey: true to sync storage."
              );
            }
            // Resolve even if persisting default fails, as primary load is done.
            // However, the outer promise depends on this nested async operation to be fully complete.
            // This specific resolve might be tricky. For simplicity, we assume `set` is fast enough or errors are just logged.
          });
        } else {
          console.log(
            "[Background] loadDataFromStorage - useOwnKey has a value in sync storage. Applying it:",
            result.useOwnKey
          );
          userSettings.useOwnKey = result.useOwnKey;
          console.log(
            "[Background] loadDataFromStorage - userSettings.useOwnKey AFTER decision logic:",
            userSettings.useOwnKey
          );
        }
        console.log(
          "[Background] loadDataFromStorage - userSettings.useOwnKey AFTER decision logic:",
          userSettings.useOwnKey
        );

        if (result.settings && typeof result.settings === "object") {
          console.log(
            "[Background] loadDataFromStorage: Applying general 'settings' object from storage:",
            result.settings
          );
          // Merge, ensuring that explicitly loaded keys above are not overwritten by undefined values from result.settings
          for (const key in result.settings) {
            if (result.settings.hasOwnProperty(key)) {
              // Do not overwrite apiKey, profileBio etc. if result.settings has them as undefined but they were set from top-level
              if (
                key === "apiKey" &&
                result.settings.apiKey === undefined &&
                result.apiKey !== undefined
              )
                continue;
              if (
                key === "profileBio" &&
                result.settings.profileBio === undefined &&
                result.profileBio !== undefined
              )
                continue;
              if (
                key === "hashtags" &&
                result.settings.hashtags === undefined &&
                result.hashtags !== undefined
              )
                continue;
              // For 'tone' from settings, it's 'defaultTone', map to userSettings.tone
              if (key === "defaultTone" && result.settings.defaultTone !== undefined) {
                userSettings.tone = result.settings.defaultTone;
              } else if (key === "tone" && result.settings.tone !== undefined) {
                // if it's just 'tone'
                userSettings.tone = result.settings.tone;
              }
              if (
                key === "useOwnKey" &&
                result.settings.useOwnKey === undefined &&
                result.useOwnKey !== undefined
              )
                continue;

              // For other keys, or if the top-level result.key was undefined, take from result.settings
              if (
                ["apiKey", "profileBio", "hashtags", "tone", "useOwnKey"].includes(key)
              ) {
                if (result[key] === undefined && result.settings[key] !== undefined) {
                  if (key === "defaultTone") {
                    // map 'defaultTone' from settings object to 'tone'
                    userSettings.tone = result.settings.defaultTone;
                  } else {
                    userSettings[key] = result.settings[key];
                  }
                }
              } else if (result.settings[key] !== undefined) {
                // For any other non-explicitly handled keys
                userSettings[key] = result.settings[key];
              }
            }
          }
        }

        console.log(
          "[Background] loadDataFromStorage: userSettings AFTER sync.get and processing:",
          JSON.parse(JSON.stringify(userSettings))
        );
        console.log("[Background] Initial settings loaded:", userSettings);
        console.log("[Background] Initial voice/topic data loaded."); // Assuming this means samples/topics loaded elsewhere or default
        resolve();
      }
    );
  });

  // After both promises have resolved, you can be sure data loading is complete.
  return Promise.all([localGetPromise, syncGetPromise])
    .then(() => {
      console.log(
        "[Background] loadDataFromStorage: All data loading attempts complete."
      );
      // The function implicitly returns undefined if resolved, which is fine for await.
    })
    .catch((error) => {
      console.error(
        "[Background] loadDataFromStorage: A critical error occurred during data loading:",
        error
      );
      // Propagate the error so callers can handle it if necessary
      throw error;
    });
}

/**
 * Get user profile data for display in the settings panel
 * @returns {Object} Object containing user posts, replies, liked posts, and other profile data
 */
async function getUserProfileData() {
  // If likedPosts is empty but userLikedTopicsRaw has data, sync them
  if (
    (!likedPosts || likedPosts.length === 0) &&
    userLikedTopicsRaw &&
    userLikedTopicsRaw.length > 0
  ) {
    likedPosts = userLikedTopicsRaw;
    console.log(
      "[Background] Synced likedPosts from userLikedTopicsRaw for backward compatibility"
    );
  }

  return {
    posts: userWritingSamples || [], // Original posts
    replies: userReplies || [], // Replies to other tweets
    likedPosts: likedPosts || [], // Liked content (using the dedicated likedPosts variable)
    // Add any other profile data here
  };
}
