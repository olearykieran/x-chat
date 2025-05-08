/**
 * Call OpenAI API with a prompt
 * @param {string} apiKey - OpenAI API key
 * @param {string} prompt - The prompt to send to OpenAI
 * @returns {Promise<string>} - The generated text
 */
export async function callOpenAI(apiKey, prompt) {
  try {
    const model = "gpt-4.1-nano"; // Use a valid model ID string

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`, // Directly use the provided API key
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "You are a helpful AI assistant. You will be given a prompt and should respond as accurately as possible. IMPORTANT: Do not use hyphens (-) or double hyphens (--) in your output. If necessary, rephrase sentences or use alternative punctuation to avoid them.",
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 300,
        temperature: 0.7,
        stream: false, // For simplicity in MVP, we'll add streaming in a future iteration
      }),
    });

    const responseStatus = response.status;
    const responseStatusText = response.statusText;
    const responseText = await response.text(); // Get raw text first

    console.log('[API] OpenAI Response Status:', responseStatus, responseStatusText);
    console.log('[API] OpenAI Raw Response Text:', responseText);

    if (!response.ok) {
      // Try to parse error from responseText if possible, otherwise use statusText
      let errorDetail = responseStatusText;
      try {
        const errorJson = JSON.parse(responseText);
        if (errorJson.error && errorJson.error.message) {
          errorDetail = errorJson.error.message;
        }
      } catch (e) {
        // Ignore if responseText is not JSON
      }
      throw new Error(`OpenAI API Error: ${responseStatus} ${errorDetail}`);
    }

    try {
      const data = JSON.parse(responseText); // Parse the logged text
      if (data.choices && data.choices.length > 0 && data.choices[0].message) {
        return data.choices[0].message.content.trim();
      } else {
        console.error("[API] OpenAI response missing expected data structure:", data);
        throw new Error("Invalid response structure from OpenAI API.");
      }
    } catch (e) {
      console.error("[API] Error parsing OpenAI JSON response:", e);
      console.error("[API] Raw response text that failed to parse:", responseText);
      throw new Error(`Failed to parse OpenAI response: ${e.message}`);
    }

  } catch (error) {
    console.error("Error calling OpenAI:", error);
    throw error;
  }
}

/**
 * Fetch trending tech topics
 * @returns {Promise<Array>} - List of trending topics
 */
export async function fetchTrendingTopics() {
  try {
    // In MVP, we'll use a mock response
    // In production, this would call the Cloudflare Worker
    // const response = await fetch('https://your-worker.your-subdomain.workers.dev/trending');

    // Mock trending topics for now
    const mockTrending = [
      "GPT-5 release rumors",
      "React 19 performance improvements",
      "Chrome's new web APIs",
      "Startups tackling climate tech",
      "Edge computing breakthroughs",
    ];

    return mockTrending;
  } catch (error) {
    console.error("Error fetching trending topics:", error);
    return []; // Return empty array on error
  }
}

/**
 * Stream OpenAI responses (for future implementation)
 * @param {string} apiKey - OpenAI API key
 * @param {string} prompt - The prompt to send to OpenAI
 * @param {Function} onChunk - Callback for each text chunk
 * @returns {Promise<string>} - The complete generated text
 */
export async function streamOpenAI(apiKey, prompt, onChunk) {
  // This will be implemented in a future iteration
  // For now, we'll use the non-streaming version
  const result = await callOpenAI(apiKey, prompt);
  onChunk(result);
  return result;
}
