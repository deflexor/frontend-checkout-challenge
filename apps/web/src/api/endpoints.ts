import type { Static } from '@sinclair/typebox';
import {
  CartItemSchema,
  CheckoutOptionsSchema,
  SandboxSchema,
  SessionSchema,
  type Cart,
  type CreateOrder,
  type Delivery,
  type Order,
  type Payment,
  type Product,
  type Quote,
  type Scenario,
  type Simulation,
} from '@checkout/contracts';
import { request } from './client';

export type CartItem = Static<typeof CartItemSchema>;
export type CheckoutOptions = Static<typeof CheckoutOptionsSchema>;
export type Sandbox = Static<typeof SandboxSchema>;
export type Session = Static<typeof SessionSchema>;
export type SandboxCard = Sandbox['cards'][number];

/** Реестр запросов: новый вызов API — одна строка с его особенностями. */
export const api = {
  createSession: () => request<Session>('POST', '/api/sessions', { body: {} }),
  products: (signal?: AbortSignal) => request<Product[]>('GET', '/api/products', { signal }),
  sandbox: (signal?: AbortSignal) => request<Sandbox>('GET', '/api/sandbox', { signal }),
  cart: (signal?: AbortSignal) => request<Cart>('GET', '/api/cart', { signal }),
  checkoutOptions: (signal?: AbortSignal) =>
    request<CheckoutOptions>('GET', '/api/checkout/options', { signal }),
  setCartItem: (productId: string, quantity: number) =>
    request<CartItem>('PUT', `/api/cart/items/${productId}`, { body: { quantity } }),
  removeCartItem: (productId: string) =>
    request<undefined>('DELETE', `/api/cart/items/${productId}`),
  createQuote: (delivery: Delivery, cartVersion: number, signal?: AbortSignal) =>
    request<Quote>('POST', '/api/quotes', { body: { cartVersion, delivery }, signal }),
  createOrder: (body: CreateOrder, idempotencyKey: string) =>
    request<Order>('POST', '/api/orders', { body, idempotencyKey }),
  order: (orderId: string, signal?: AbortSignal) =>
    request<Order>('GET', `/api/orders/${orderId}`, { signal }),
  orderPayments: (orderId: string, signal?: AbortSignal) =>
    request<Payment[]>('GET', `/api/orders/${orderId}/payments`, { signal }),
  createPayment: (orderId: string, idempotencyKey: string) =>
    request<Payment>('POST', `/api/orders/${orderId}/payments`, { body: {}, idempotencyKey }),
  payment: (paymentId: string, signal?: AbortSignal) =>
    request<Payment>('GET', `/api/payments/${paymentId}`, { signal }),
  simulate: (paymentId: string, scenario: Scenario) =>
    request<Simulation>('POST', `/api/payments/${paymentId}/simulations`, { body: { scenario } }),
};
