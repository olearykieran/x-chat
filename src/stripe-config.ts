export const STRIPE_PRODUCTS = {
  test: {
    priceId: 'price_1RLTbmIXsq21hoho8vbwmJpD',
    name: 'Test Product',
    description: 'Test subscription product',
    mode: 'subscription' as const,
  },
} as const;

export type ProductId = keyof typeof STRIPE_PRODUCTS;