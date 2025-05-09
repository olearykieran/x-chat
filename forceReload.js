/**
 * This file exists solely to force Chrome to reload the extension's background script
 * when any changes are made to the codebase. It's included in the manifest.json.
 * 
 * Current timestamp: ${new Date().toISOString()}
 */

// This variable intentionally changes on each save to trigger reload
const FORCE_RELOAD_TIMESTAMP = Date.now();
