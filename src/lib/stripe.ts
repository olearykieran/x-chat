import { loadStripe } from '@stripe/stripe-js';
import { STRIPE_PRODUCTS, type ProductId } from '../stripe-config';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

export async function createCheckoutSession(productId: ProductId) {
  const product = STRIPE_PRODUCTS[productId];
  if (!product) throw new Error('Invalid product ID');

  const { data: { session_url } } = await supabase.functions.invoke('stripe-checkout', {
    body: {
      price_id: product.priceId,
      success_url: `${window.location.origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${window.location.origin}/cancel`,
      mode: product.mode,
    },
  });

  const stripe = await stripePromise;
  if (!stripe) throw new Error('Failed to load Stripe');

  const { error } = await stripe.redirectToCheckout({
    sessionId: session_url,
  });

  if (error) throw error;
}

export async function getActiveSubscription() {
  const { data: subscription, error } = await supabase
    .from('stripe_user_subscriptions')
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return subscription;
}