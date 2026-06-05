const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN;

export function PaymentTestModeBanner() {
  if (!clientToken) {
    return (
      <div className="w-full bg-red-100 border-b border-red-300 px-4 py-2 text-center text-sm text-red-800">
        Production checkout is not configured. Complete payment go-live to accept real payments.
      </div>
    );
  }
  if (clientToken.startsWith('pk_test_')) {
    return (
      <div className="w-full bg-orange-100 border-b border-orange-300 px-4 py-2 text-center text-sm text-orange-800">
        All payments are in test mode. Use card <code className="font-mono font-medium">4242 4242 4242 4242</code> with any future expiry and any CVC.
      </div>
    );
  }
  return null;
}
