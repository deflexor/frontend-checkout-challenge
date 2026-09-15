import type { Delivery } from '@checkout/contracts';
import type { CheckoutOptions } from '../api/endpoints';

const rubles = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** Копейки → «1 290 ₽». Единственное место пересчёта денег для показа. */
export const formatMoney = (kopecks: number) => rubles.format(kopecks / 100);

/** Человекочитаемая доставка: один текст для оформления и страницы заказа. */
export function deliveryTitle(delivery: Delivery, options: CheckoutOptions | null): string {
  if (delivery.method === 'pickup') {
    const point = options?.deliveryMethods
      .find((method) => method.id === 'pickup')
      ?.pickupPoints.find((candidate) => candidate.id === delivery.pickupPointId);
    return point ? `Самовывоз · ${point.title}, ${point.address}` : 'Самовывоз';
  }
  const { city, street, house, apartment } = delivery.address;
  return `Курьер · ${city}, ${street}, д. ${house}${apartment ? `, кв. ${apartment}` : ''}`;
}

/** Отказ оплаты — состояние данных, один и тот же текст у диалога и страницы заказа. */
export const declineMessage = 'Банк отклонил оплату. Можно повторить попытку.';
