/**
 * Handle a request to write a reply based on the user's prompt
 * @param {Object} contextTweet - The tweet being replied to
 * @param {string} userPrompt - The user's instructions for the reply
 * @returns {Promise<Object>} - Response with the generated reply
 */
async function handleWriteReplyRequest(contextTweet, userPrompt) {
  console.log("[Background] Handling Write Reply request:", { contextTweet, userPrompt });
  
  if (!contextTweet || !contextTweet.tweetText) {
    return { error: "Invalid tweet data. Cannot generate reply." };
  }
  
  try {
    // Construct prompt for writing a reply
    const prompt = `Write a reply to this tweet: "${contextTweet.tweetText}" by @${contextTweet.tweetAuthorHandle || 'author'}.
    
    ${userPrompt ? `Follow these instructions: ${userPrompt}` : "Make the reply natural and conversational."}`;
    
    // System message that ensures the reply is direct, natural, and avoids AI markers
    const systemMessage = `You are an expert at writing natural, conversational Twitter replies that sound like a real person. 
    
    CRITICAL INSTRUCTIONS:
    1. Write ONLY ONE reply that directly addresses the original tweet.
    2. DO NOT use hyphens or dashes of any kind (-, –, —). Use spaces instead.
    3. DO NOT use AI-typical phrases like "I understand," "I appreciate," "As an AI," etc.
    4. DO NOT add any hashtags or suggestions for hashtags.
    5. ENSURE the reply directly acknowledges specific points from the original tweet.
    6. MAKE the reply contextually dependent on the original tweet, not a standalone post.
    7. KEEP the reply concise and Twitter-appropriate in length.
    8. MATCH natural human writing patterns with varied sentence structures.
    
    Your reply should sound like it was written by a real person responding naturally to the tweet.`;
    
    // Call OpenAI API
    const reply = await callOpenAI(
      userSettings.apiKey,
      prompt,
      "conversational", // Use conversational tone for replies
      null, // No additional user instruction
      userSettings.profileBio || "",
      [], // No writing samples needed for simplified version
      [], // No liked tweets needed for simplified version
      systemMessage,
      "gpt-4.1-nano", // Use a suitable model
      0.7 // Temperature for some creativity but not too random
    );
    
    // Clean up the reply to ensure no hyphens/dashes
    const cleanedReply = reply.replace(/[-\u2013\u2014]/g, ' ').replace(/\s+/g, ' ');
    
    return { reply: cleanedReply };
  } catch (error) {
    console.error("[Background] Error in handleWriteReplyRequest:", error);
    return { error: error.message || "Failed to generate reply" };
  }
}

/**
 * Handle a request to polish a draft reply
 * @param {Object} contextTweet - The tweet being replied to
 * @param {string} userDraft - The user's draft reply to polish
 * @returns {Promise<Object>} - Response with the polished reply variations
 */
async function handlePolishReplyRequest(contextTweet, userDraft) {
  console.log("[Background] Handling Polish Reply request:", { contextTweet, userDraft });
  
  if (!contextTweet || !contextTweet.tweetText) {
    return { error: "Invalid tweet data. Cannot polish reply." };
  }
  
  if (!userDraft || userDraft.trim().length === 0) {
    return { error: "No draft reply provided to polish." };
  }
  
  try {
    // Construct prompt for polishing a reply
    const prompt = `Polish this draft reply to the tweet: "${contextTweet.tweetText}" by @${contextTweet.tweetAuthorHandle || 'author'}.
    
    My draft reply: "${userDraft}"
    
    Provide 3 polished variations of my draft reply, maintaining my core message and intent.`;
    
    // System message that ensures the polished replies maintain the user's intent
    const systemMessage = `You are an expert at polishing Twitter replies while maintaining the original intent and voice.
    
    CRITICAL INSTRUCTIONS:
    1. Provide EXACTLY 3 polished variations of the user's draft reply.
    2. PRESERVE the core meaning and intent of the original draft.
    3. DO NOT use hyphens or dashes of any kind (-, –, —). Use spaces instead.
    4. DO NOT add any hashtags or suggestions for hashtags.
    5. DO NOT change the fundamental message or opinion expressed in the draft.
    6. MAINTAIN the same level of formality/informality as the original.
    7. ENSURE each variation directly addresses the original tweet.
    8. SEPARATE each variation with "###VARIATION###".
    
    Your polished variations should sound like improved versions of what the user would naturally write.`;
    
    // Call OpenAI API
    const polishedText = await callOpenAI(
      userSettings.apiKey,
      prompt,
      "conversational", // Use conversational tone for replies
      null, // No additional user instruction
      userSettings.profileBio || "",
      [], // No writing samples needed for simplified version
      [], // No liked tweets needed for simplified version
      systemMessage,
      "gpt-4.1-nano", // Use a suitable model
      0.7 // Temperature for some creativity but not too random
    );
    
    // Process the response to extract variations
    const variations = polishedText
      .split("###VARIATION###")
      .map(v => v.trim())
      .filter(v => v.length > 0)
      .map(v => v.replace(/[-\u2013\u2014]/g, ' ').replace(/\s+/g, ' ')); // Clean up each variation
    
    return { 
      reply: variations[0] || userDraft, // First variation as the main reply
      allReplies: variations.length > 0 ? variations : [userDraft] // All variations or just the original if none
    };
  } catch (error) {
    console.error("[Background] Error in handlePolishReplyRequest:", error);
    return { error: error.message || "Failed to polish reply" };
  }
}

/**
 * Handle a request to write a post based on the user's prompt
 * @param {string} userPrompt - The user's instructions for the post
 * @returns {Promise<Object>} - Response with the generated post
 */
async function handleWritePostRequest(userPrompt) {
  console.log("[Background] Handling Write Post request:", { userPrompt });
  
  if (!userPrompt || userPrompt.trim().length === 0) {
    return { error: "No prompt provided for post generation." };
  }
  
  try {
    // Construct prompt for writing a post
    const prompt = `Write a Twitter post based on the following instructions: ${userPrompt}`;
    
    // System message that ensures the post is natural and avoids AI markers
    const systemMessage = `You are an expert at writing natural, engaging Twitter posts that sound like a real person.
    
    CRITICAL INSTRUCTIONS:
    1. Write ONLY ONE Twitter post based on the user's instructions.
    2. DO NOT use hyphens or dashes of any kind (-, –, —). Use spaces instead.
    3. DO NOT use AI-typical phrases like "I believe," "In my opinion," "As an AI," etc.
    4. DO NOT add any hashtags or suggestions for hashtags.
    5. KEEP the post concise and Twitter-appropriate in length (under 280 characters).
    6. MATCH natural human writing patterns with varied sentence structures.
    
    Your post should sound like it was written by a real person sharing their thoughts.`;
    
    // Call OpenAI API
    const post = await callOpenAI(
      userSettings.apiKey,
      prompt,
      "conversational", // Use conversational tone for posts
      null, // No additional user instruction
      userSettings.profileBio || "",
      [], // No writing samples needed for simplified version
      [], // No liked tweets needed for simplified version
      systemMessage,
      "gpt-4.1-nano", // Use a suitable model
      0.7 // Temperature for some creativity but not too random
    );
    
    // Clean up the post to ensure no hyphens/dashes
    const cleanedPost = post.replace(/[-\u2013\u2014]/g, ' ').replace(/\s+/g, ' ');
    
    return { 
      ideas: [cleanedPost] // Return as an array for compatibility with existing UI
    };
  } catch (error) {
    console.error("[Background] Error in handleWritePostRequest:", error);
    return { error: error.message || "Failed to generate post" };
  }
}

/**
 * Handle a request to polish a draft post
 * @param {string} userDraft - The user's draft post to polish
 * @returns {Promise<Object>} - Response with the polished post variations
 */
async function handlePolishPostRequest(userDraft) {
  console.log("[Background] Handling Polish Post request:", { userDraft });
  
  if (!userDraft || userDraft.trim().length === 0) {
    return { error: "No draft post provided to polish." };
  }
  
  try {
    // Construct prompt for polishing a post
    const prompt = `Polish this draft Twitter post: "${userDraft}"
    
    Provide 3 polished variations of my draft post, maintaining my core message and intent.`;
    
    // System message that ensures the polished posts maintain the user's intent
    const systemMessage = `You are an expert at polishing Twitter posts while maintaining the original intent and voice.
    
    CRITICAL INSTRUCTIONS:
    1. Provide EXACTLY 3 polished variations of the user's draft post.
    2. PRESERVE the core meaning and intent of the original draft.
    3. DO NOT use hyphens or dashes of any kind (-, –, —). Use spaces instead.
    4. DO NOT add any hashtags or suggestions for hashtags.
    5. DO NOT change the fundamental message or opinion expressed in the draft.
    6. MAINTAIN the same level of formality/informality as the original.
    7. KEEP each variation concise and Twitter-appropriate in length (under 280 characters).
    8. SEPARATE each variation with "###VARIATION###".
    
    Your polished variations should sound like improved versions of what the user would naturally write.`;
    
    // Call OpenAI API
    const polishedText = await callOpenAI(
      userSettings.apiKey,
      prompt,
      "conversational", // Use conversational tone for posts
      null, // No additional user instruction
      userSettings.profileBio || "",
      [], // No writing samples needed for simplified version
      [], // No liked tweets needed for simplified version
      systemMessage,
      "gpt-4.1-nano", // Use a suitable model
      0.7 // Temperature for some creativity but not too random
    );
    
    // Process the response to extract variations
    const variations = polishedText
      .split("###VARIATION###")
      .map(v => v.trim())
      .filter(v => v.length > 0)
      .map(v => v.replace(/[-\u2013\u2014]/g, ' ').replace(/\s+/g, ' ')); // Clean up each variation
    
    return { 
      ideas: variations.length > 0 ? variations : [userDraft] // All variations or just the original if none
    };
  } catch (error) {
    console.error("[Background] Error in handlePolishPostRequest:", error);
    return { error: error.message || "Failed to polish post" };
  }
}

// Add the new message handlers to the message listener
// This code should be added to the existing message listener in bg.js
/*
else if (message.type === "WRITE_REPLY") {
  const { contextTweet, userPrompt } = message;
  const response = await handleWriteReplyRequest(contextTweet, userPrompt);
  sendResponse(response);
} else if (message.type === "POLISH_REPLY") {
  const { contextTweet, userDraft } = message;
  const response = await handlePolishReplyRequest(contextTweet, userDraft);
  sendResponse(response);
} else if (message.type === "WRITE_POST") {
  const { userPrompt } = message;
  const response = await handleWritePostRequest(userPrompt);
  sendResponse(response);
} else if (message.type === "POLISH_POST") {
  const { userDraft } = message;
  const response = await handlePolishPostRequest(userDraft);
  sendResponse(response);
}
*/
