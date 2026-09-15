import { useEffect, useRef } from 'react';
import { SessionProvider, useSession } from './state/session';
import { hrefOf, navigate, orderRoute, useRoute } from './lib/router';
import { api } from './api/endpoints';
import { clearOrderDraft, loadOrderDraft } from './lib/pending';
import { ErrorBanner, Loader } from './ui/ui';
import { CatalogPage } from './pages/Catalog';
import { CartPage } from './pages/Cart';
import { CheckoutPage } from './pages/Checkout';
import { OrderPage } from './pages/Order';

function Header() {
  const { cart } = useSession();
  return (
    <header className="header">
      <div className="container header__row">
        <a className="header__logo" href={hrefOf({ name: 'catalog' })}>
          Магазин
        </a>
        <a className="header__cart" href={hrefOf({ name: 'cart' })}>
          Корзина
          <span className="header__badge" aria-label="Товаров в корзине">
            {cart?.quantity ?? 0}
          </span>
        </a>
      </div>
    </header>
  );
}

function Shell() {
  const session = useSession();
  const route = useRoute();

  // Незавершённое создание заказа (потерялся ответ или перезагрузка):
  // повтор с теми же телом и ключом вернёт тот же заказ без дубля.
  const resumed = useRef(false);
  useEffect(() => {
    if (!session.ready || resumed.current) return;
    resumed.current = true;
    const draft = loadOrderDraft();
    if (!draft) return;
    api.createOrder(draft.body, draft.key).then(
      (order) => {
        clearOrderDraft();
        navigate(orderRoute(order));
      },
      () => {
        clearOrderDraft();
      },
    );
  }, [session.ready]);

  if (session.error) return <ErrorBanner error={session.error} onRetry={session.retry} />;
  if (!session.ready) return <Loader />;

  return (
    <>
      <Header />
      <main className="container">
        {route.name === 'catalog' && <CatalogPage />}
        {route.name === 'cart' && <CartPage />}
        {route.name === 'checkout' && <CheckoutPage />}
        {route.name === 'order' && <OrderPage orderId={route.orderId} autoPay={route.pay} />}
      </main>
    </>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <Shell />
    </SessionProvider>
  );
}
