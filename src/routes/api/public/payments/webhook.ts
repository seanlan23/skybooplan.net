import { createFileRoute } from '@tanstack/react-router';
import { type StripeEnv, verifyWebhook } from '@/lib/stripe.server';
import { dispatchWebhookEvent, logEventReceived, markEvent } from '@/lib/webhooks.server';

export const Route = createFileRoute('/api/public/payments/webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get('env');
        if (rawEnv !== 'sandbox' && rawEnv !== 'live') {
          console.error('Webhook received with invalid env:', rawEnv);
          return Response.json({ received: true, ignored: 'invalid env' });
        }
        const env: StripeEnv = rawEnv;
        let logId: string | null = null;
        try {
          const event = await verifyWebhook(request, env);
          logId = await logEventReceived(event, env);
          try {
            const outcome = await dispatchWebhookEvent(event, env);
            await markEvent(logId, outcome);
          } catch (handlerErr: any) {
            await markEvent(logId, 'failed', handlerErr?.message ?? String(handlerErr));
            throw handlerErr;
          }
          return Response.json({ received: true });
        } catch (e: any) {
          console.error('Webhook error:', e);
          return new Response('Webhook error', { status: 400 });
        }
      },
    },
  },
});
