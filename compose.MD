# Compose Tab Functionality Analysis

This document outlines the functionality of the Compose tab, focusing on web search, data utilization for tweet generation, and the AI prompts involved.

## 1. Web Search Functionality (`searchWeb` in `bg.js`)

- **Query Source**: The `searchWeb` function receives a `query` string as a direct argument.
- **Query Construction (within `generateTweetsWithNews`)**: 
    - The primary search query for news is dynamically built based on topics extracted from the user's bio and liked posts.
    - If no specific topics are identified from the bio or liked posts, the `searchQuery` defaults to: `"current trending topics in tech and AI"`.
    - The `searchWeb` function itself is then called with this `searchQuery`.
- **Search Mechanism**: The function uses `callOpenAI` with a system message instructing the AI to act as a web search engine to get relevant information based on the query.

## 2. Data Used for Tweet Generation (`generateTweetsWithNews` in `bg.js`)

The `generateTweetsWithNews` function synthesizes information from several sources:

- **User Bio Topics**:
    - Extracted from `userSettings.profileBio` via the `extractTopicsFromBio` function.
    - **Prompt for `extractTopicsFromBio`**:
      ```
      Extract the main topics, interests, professional fields, and areas of expertise from this Twitter/X bio.
      Focus on keywords and concise phrases.
      Return a comma-separated list of these topics.

      Bio:
      """
      ${bio} 
      """

      Topics:
      ```

- **Liked Posts Topics**:
    - Extracted from `userLikedTopicsRaw` (representing user's liked posts) via the `analyzeLikedPosts` function.
    - **Prompt for `analyzeLikedPosts`**:
      ```
      Analyze the following collection of tweet texts that a user has liked.
      Identify recurring themes, topics, keywords, and potential areas of interest.
      Focus on extracting a concise, comma-separated list of these topics.

      Tweet texts:
      """
      ${postsToAnalyze.map(post => post.text || "").join("\n---\n")}
      """

      Topics:
      ```

- **Current News/Search Results**:
    - Obtained by calling `searchWeb` with the `searchQuery` derived from bio/liked posts topics (or the default query).
    - If `searchWeb` returns results, its `text` field is used as `newsContext`. Otherwise, `newsContext` is: `"No specific news context available. Focus on general interest based on topics."`

- **Combined User Topics**:
    - Topics from bio and liked posts are merged.
    - If no topics are found, `combinedTopics` defaults to: `"general interest, technology, AI, current events"`.

- **Tone**: 
    - Passed as a parameter `tone` to `generateTweetsWithNews`.
    - Defaults to `"neutral"` or `userSettings.tone` if the parameter is not explicitly provided.

- **User Instruction**:
    - An optional `userInstruction` parameter can be passed to `generateTweetsWithNews` to provide additional specific directives to the AI.

## 3. AI Prompt for Tweet and Question Generation (in `generateTweetsWithNews`)

The core prompt sent to OpenAI for generating 5 tweets and 3 guiding questions is structured as follows:

**System Message**:
```
You are an expert X/Twitter content creator specializing in crafting engaging and relevant tweets.
Your task is to generate 5 diverse tweet suggestions and 3 insightful brainstorming questions based on the provided context.
```

**User Prompt (dynamic parts shown with placeholders)**:
```
**Context for Tweet Generation:**
1. **Current News/Search Results:**
   ${newsContext}  // Content from searchWeb or default message

2. **User's Key Topics/Interests:**
   ${combinedTopics} // Combined topics from bio/liked posts or default topics

**Instructions for Tweets:**
1. Generate 5 distinct tweet suggestions.
2. Each tweet should be engaging, concise, and suitable for X/Twitter.
3. Tweets should integrate insights from the "Current News/Search Results" with the "User's Key Topics/Interests".
4. If news is very general, focus more on making tweets relevant to the user's topics.
5. Format each tweet separated by "${postSeparator}" // (e.g., %%%)
6. Tone should be: ${tone || "neutral"}
7. Include relevant hashtags where appropriate
${userInstruction ? `8. Additional instruction: ${userInstruction}` : ""}

AFTER THE TWEETS, INCLUDE "${questionSeparator}" FOLLOWED BY 3 BRAINSTORMING QUESTIONS: // (e.g., ???)
1. Create 3 thought-provoking questions that help the user formulate their own unique tweets.
2. Questions should be inspired by the news context and user topics.
3. Questions should encourage reflection, opinion-sharing, or calls to action.

Example Question Format:
- What's your take on [news_item] in relation to [user_topic]?
- How do you think [user_topic] will be affected by [trending_event_from_news]?
- If you could ask one thing about [news_subject], what would it be and why?
```

This information should give you a clear overview of how the compose tab's tweet and question generation works and allow you to tweak the logic and prompts as needed.
