import { useEffect, useState } from 'react';
import type { Order } from '@checkout/contracts';

export type Route =
  | { name: 'catalog' }
  | { name: 'cart' }
  | { name: 'checkout' }
  | { name: 'order'; orderId: string; pay: boolean };

/** Разбор hash-маршрута: перезагрузка и ссылка ведут на тот же экран. */
export function parseRoute(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'cart') return { name: 'cart' };
  if (parts[0] === 'checkout') return { name: 'checkout' };
  if (parts[0] === 'order' && parts[1])
    return { name: 'order', orderId: parts[1], pay: new URLSearchParams(query).has('pay') };
  return { name: 'catalog' };
}

/** Карта не подтверждена сервером — заказ открывается с оплатой. */
export const orderRoute = (order: Order): Route => ({
  name: 'order',
  orderId: order.id,
  pay: order.paymentMethod === 'card' && order.paymentStatus !== 'succeeded',
});

export const hrefOf = (route: Route): string => {
  switch (route.name) {
    case 'cart':
      return '#/cart';
    case 'checkout':
      return '#/checkout';
    case 'order':
      return `#/order/${route.orderId}${route.pay ? '?pay=1' : ''}`;
    default:
      return '#/';
  }
};

export function navigate(route: Route) {
  const target = hrefOf(route);
  if (location.hash === target) return;
  location.hash = target;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(location.hash));
  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute(location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  return route;
}
