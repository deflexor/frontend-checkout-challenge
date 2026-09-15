import { useEffect, useState } from 'react';
import { api } from '../api/endpoints';
import { isAborted } from '../api/client';
import { pollUntil } from '../api/poll';
import { useApiData } from '../lib/useApiData';
import { useSession } from '../state/session';
import { navigate } from '../lib/router';
import { declineMessage, deliveryTitle, formatMoney } from '../lib/format';
import { Banner, ErrorBanner, Loader } from '../ui/ui';
import { PaymentDialog } from './PaymentDialog';
import type { Order } from '@checkout/contracts';

export function OrderPage({ orderId, autoPay }: { orderId: string; autoPay: boolean }) {
  const { refreshCart } = useSession();
  const order = useApiData((signal) => api.order(orderId, signal), [orderId]);
  const options = useApiData((signal) => api.checkoutOptions(signal), []);
  const [paying, setPaying] = useState(autoPay);
  const [cartSynced, setCartSynced] = useState(false);

  const data = order.data;

  // Заказ создан — корзина на сервере очищена; подтягиваем её один раз.
  useEffect(() => {
    if (data && !cartSynced) {
      setCartSynced(true);
      refreshCart();
    }
  }, [data, cartSynced, refreshCart]);

  // Незавершённая оплата: продолжаем следить за заказом после перезагрузки.
  const pendingPayment = data?.paymentStatus === 'pending';
  useEffect(() => {
    if (!data || data.paymentMethod !== 'card') return;
    if (data.paymentStatus === 'pending') setPaying(true);
    if (data.paymentStatus === 'unpaid' && autoPay) setPaying(true);
  }, [data, autoPay]);

  useEffect(() => {
    if (!pendingPayment || paying) return;
    const controller = new AbortController();
    pollUntil({
      request: (signal) => api.order(orderId, signal),
      isDone: (fresh) => fresh.paymentStatus !== 'pending',
      intervalMs: 1000,
      signal: controller.signal,
    }).then(
      () => order.refetch(),
      (cause) => {
        if (!isAborted(cause) && !controller.signal.aborted) order.refetch();
      },
    );
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPayment, paying, orderId]);

  if (order.error) return <ErrorBanner error={order.error} onRetry={order.refetch} />;
  if (!data) return <Loader />;

  const paid = data.status === 'paid' && data.paymentStatus === 'succeeded';
  const cashOrder = data.paymentMethod === 'cash_on_delivery' && data.status === 'confirmed';
  const cardUnpaid = data.paymentMethod === 'card' && data.status === 'awaiting_payment';
  const declined = data.paymentStatus === 'failed' || data.paymentStatus === 'cancelled';

  return (
    <section>
      <h1>Заказ №{data.number}</h1>
      {paid && <Banner kind="success">Оплата прошла. Спасибо за покупку!</Banner>}
      {cashOrder && <Banner kind="success">Заказ оформлен, оплата при получении.</Banner>}
      {cardUnpaid && !paying && (
        <Banner>
          {declined
            ? `${data.paymentStatus === 'failed' ? declineMessage : 'Оплата отменена. '}Можно попробовать снова.`
            : 'Заказ ждёт оплаты.'}
          <button
            type="button"
            className="btn btn--primary banner__action"
            onClick={() => setPaying(true)}
          >
            Оплатить
          </button>
        </Banner>
      )}
      {paying && cardUnpaid && (
        <PaymentDialog
          order={data}
          onClose={() => setPaying(false)}
          onPaid={() => {
            setPaying(false);
            order.refetch();
          }}
        />
      )}
      {pendingPayment && !paying && <Loader>Ждём подтверждение оплаты…</Loader>}

      <div className="panel">
        <h2>Состав заказа</h2>
        <ul className="order-items">
          {data.items.map((item) => (
            <li key={item.productId}>
              <span>{item.title}</span>
              <span>
                {formatMoney(item.unitPrice)} × {item.quantity} = {formatMoney(item.lineTotal)}
              </span>
            </li>
          ))}
        </ul>
        <p>{deliveryTitle(data.delivery, options.data)}</p>
        <p>
          Получатель: {data.customer.name}, {data.customer.email}, {data.customer.phone}
        </p>
        <p className="total">
          Товары: {formatMoney(data.subtotal)} · Доставка:{' '}
          {data.shipping === 0 ? 'бесплатно' : formatMoney(data.shipping)} · Итого:{' '}
          <strong>{formatMoney(data.total)}</strong>
        </p>
      </div>
      <button type="button" className="btn" onClick={() => navigate({ name: 'catalog' })}>
        В каталог
      </button>
    </section>
  );
}
