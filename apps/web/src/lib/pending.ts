import type { CreateOrder } from '@checkout/contracts';

/**
 * Черновики незавершённых операций в localStorage: ключ идемпотентности и тело
 * сохраняются до запроса и удаляются после ответа. Повтор после сетевой ошибки
 * или перезагрузки идёт с прежними телом и ключом — дубль не создаётся.
 */
export type OrderDraft = { key: string; body: CreateOrder };
export type PaymentDraft = { orderId: string; key: string };

const read = <T>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

const orderKey = 'checkout:orderDraft';
const paymentKey = 'checkout:paymentDraft';

export const loadOrderDraft = () => read<OrderDraft>(orderKey);
export const saveOrderDraft = (draft: OrderDraft) =>
  localStorage.setItem(orderKey, JSON.stringify(draft));
export const clearOrderDraft = () => localStorage.removeItem(orderKey);

export const loadPaymentDraft = () => read<PaymentDraft>(paymentKey);
export const savePaymentDraft = (draft: PaymentDraft) =>
  localStorage.setItem(paymentKey, JSON.stringify(draft));
export const clearPaymentDraft = () => localStorage.removeItem(paymentKey);
