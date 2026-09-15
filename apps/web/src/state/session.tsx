import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ApiError, asApiError, onUnauthorized, setToken } from '../api/client';
import { api, type CartItem } from '../api/endpoints';
import { useApiData } from '../lib/useApiData';
import type { Cart, Product } from '@checkout/contracts';

type SessionValue = {
  ready: boolean;
  error: ApiError | null;
  retry: () => void;
  cart: Cart | null;
  products: Product[] | null;
  productsError: ApiError | null;
  refetchProducts: () => void;
  /** Позиция корзины по товару: строится один раз на загрузку корзины. */
  itemsByProduct: Map<string, CartItem>;
  refreshCart: () => Promise<void>;
  changeQuantity: (productId: string, quantity: number) => Promise<void>;
  removeItem: (productId: string) => Promise<void>;
};

const tokenKey = 'checkout:token';
const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [cart, setCart] = useState<Cart | null>(null);
  const [attempt, setAttempt] = useState(0);
  const starting = useRef(false);

  // Восстановление сессии: сохранённый токен проверяется корзиной,
  // невалидный (например, после сброса данных) заменяется новым.
  useEffect(() => {
    starting.current = true;
    const start = async () => {
      const saved = localStorage.getItem(tokenKey);
      if (saved) {
        setToken(saved);
        try {
          setCart(await api.cart());
          setReady(true);
          return;
        } catch (cause) {
          if (cause instanceof ApiError) {
            if (cause.status !== 401) throw cause;
            localStorage.removeItem(tokenKey);
          } else {
            throw cause;
          }
        }
      }
      const session = await api.createSession();
      setToken(session.token);
      localStorage.setItem(tokenKey, session.token);
      setCart(session.cart);
      setReady(true);
    };
    start()
      .catch((cause) => setError(asApiError(cause)))
      .finally(() => {
        starting.current = false;
      });
  }, [attempt]);

  // Потеря сессии в любом запросе — один перезапуск на приложение.
  useEffect(() => {
    if (!ready) return;
    return onUnauthorized(() => {
      if (starting.current) return;
      setReady(false);
      setAttempt((attempt) => attempt + 1);
    });
  }, [ready]);

  const products = useApiData((signal: AbortSignal) => api.products(signal), [ready]);

  const refreshCart = useCallback(async () => {
    const fresh = await api.cart();
    setCart(fresh);
  }, []);

  // Общий путь «изменил позицию — получил корзину заново» для каталога и корзины.
  const runThenRefresh = useCallback(
    async (change: Promise<unknown>) => {
      await change;
      await refreshCart();
    },
    [refreshCart],
  );

  const changeQuantity = useCallback(
    (productId: string, quantity: number) => runThenRefresh(api.setCartItem(productId, quantity)),
    [runThenRefresh],
  );
  const removeItem = useCallback(
    (productId: string) => runThenRefresh(api.removeCartItem(productId)),
    [runThenRefresh],
  );

  const itemsByProduct = useMemo(
    () => new Map((cart?.items ?? []).map((item) => [item.productId, item])),
    [cart],
  );

  const value = useMemo(
    () => ({
      ready,
      error,
      retry: () => setAttempt((attempt) => attempt + 1),
      cart,
      products: products.data,
      productsError: products.error,
      refetchProducts: products.refetch,
      itemsByProduct,
      refreshCart,
      changeQuantity,
      removeItem,
    }),
    [ready, error, cart, products, itemsByProduct, refreshCart, changeQuantity, removeItem],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession вне SessionProvider');
  return session;
}
