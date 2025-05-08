/**
 * Default user settings
 */
export const DEFAULT_SETTINGS = {
  apiKey: '',
  useOwnKey: true,
  profileBio: 'A tech enthusiast who loves building and sharing about web development, AI, and software engineering.',
  tones: {
    neutral: 100,
    fun: 50,
    hotTake: 30,
    heartfelt: 50
  },
  hashtags: ['#tech', '#webdev', '#AI', '#programming', '#startups'],
  defaultTone: 'neutral'
};

/**
 * Available tone options
 */
export const TONE_OPTIONS = [
  { id: 'neutral', label: 'Neutral', description: 'Balanced and professional' },
  { id: 'fun', label: 'Fun', description: 'Light and humorous' },
  { id: 'hot-take', label: 'Hot Take', description: 'Bold and provocative' },
  { id: 'heartfelt', label: 'Heartfelt', description: 'Sincere and empathetic' }
];

/**
 * X-style theme colors
 */
export const THEME = {
  background: '#15202B',
  text: '#FFFFFF',
  textSecondary: '#8899A6',
  border: '#38444D',
  primary: '#1DA1F2',
  hover: '#192734',
  success: '#17BF63',
  danger: '#E0245E'
};

export const STRIPE_PRICE_ID = 'price_xyz123'; // Replace with your actual price ID
export const PREMIUM_MONTHLY_PRICE = 14.99;