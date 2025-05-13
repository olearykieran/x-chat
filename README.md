# X-Polish Chrome Extension

A Chrome Extension (Manifest v3) that adds a left-side "Messages-style" AI chat panel to X.com, helping you craft replies and original posts quickly.

## Features

- Left-side panel that mirrors X.com's DM panel
- Auto-suggests replies for tweets in focus
- Interactive chat to refine suggestions
- Generates original post ideas based on trending topics
- Customizable tone options (Neutral, Fun, Hot Take, Heartfelt)
- Personalized content based on your profile bio and preferences
- One-click usage of suggestions in X.com's composer

## Installation

### Local Development

1. Clone this repository
2. Install dependencies:

```
npm install
```

3. Load the extension in Chrome:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the directory

### Configuration

1. Click the extension icon to open the side panel
2. Click the settings icon and enter your OpenAI API key

## Usage

1. **Polish Mode**:
   - Navigate to any tweet on X.com
   - type or speak into the input box
   - click polish and the extension will automatically polish the tweet

## Development

### Project Structure

```
/
├── manifest.json        # Extension configuration
├── bg.js                # Background service worker
├── contentScript.js     # X.com page interaction
├── sidepanel.html       # Side panel entry point
├── lib/                 # Shared utilities
│   ├── api.js           # API-related functions
│   └── constants.js     # Shared constants
└── src/
    └── ui/              # Panel UI components
        ├── index.js     # UI entry point
        ├── state.js     # State management
        ├── styles.css   # Global styles
        └── components/  # UI components
```

### Build Process

The extension is designed to be loaded unpacked in Chrome. No complex build process is required for development.

## TODOs & Future Improvements

- Add streaming responses from OpenAI
- Implement the Cloudflare Worker for fetching trending topics
- Handle edge cases: quoted tweets, polls, "community" posts
- Add rate-limit handling
- Support for rich media in tweets (images, videos)
- Add dark/light theme toggle
- Implement unit tests with Vitest

## License

MIT
