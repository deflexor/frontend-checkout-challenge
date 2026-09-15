import { useMemo } from 'react';
import { useSession } from '../state/session';
import { useAction } from '../lib/useApiData';
import { navigate } from '../lib/router';
import { formatMoney } from '../lib/format';
import { ErrorBanner, Loader, QuantityStepper } from '../ui/ui';

export function CartPage() {
  const { cart, products, changeQuantity, removeItem } = useSession();
  const change = useAction(changeQuantity);
  const remove = useAction(removeItem);
  // Хуки — до ранних возвратов: состав корзины меняется в любом рендере.
  // Остаток товара для границы счётчика: индекс каталога строится один раз, без поиска по массиву.
  const stockById = useMemo(
    () => new Map((products ?? []).map((product) => [product.id, product.stock])),
    [products],
  );

  if (!cart) return <Loader />;

  if (cart.items.length === 0) {
    return (
      <section>
        <h1>Корзина</h1>
        <p>В корзине пока ничего нет.</p>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => navigate({ name: 'catalog' })}
        >
          Перейти в каталог
        </button>
      </section>
    );
  }

  const stockOf = (productId: string) => stockById.get(productId) ?? 99;

  return (
    <section>
      <h1>Корзина</h1>
      {change.error && <ErrorBanner error={change.error} />}
      {remove.error && <ErrorBanner error={remove.error} />}
      <ul className="cart">
        {cart.items.map((item) => (
          <li key={item.productId} className="card cart-item">
            <div className="cart-item__info">
              <h2>{item.title}</h2>
              <p>
                {formatMoney(item.unitPrice)} × {item.quantity}
              </p>
            </div>
            <div className="cart-item__controls">
              <QuantityStepper
                value={item.quantity}
                min={1}
                max={Math.min(stockOf(item.productId), 99)}
                disabled={change.pending || remove.pending}
                onChange={(quantity) => change.run(item.productId, quantity)}
                onRemove={() => remove.run(item.productId)}
              />
              <p className="cart-item__total">{formatMoney(item.lineTotal)}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="total">
        Товары ({cart.quantity}): <strong>{formatMoney(cart.subtotal)}</strong>
      </p>
      <button
        type="button"
        className="btn btn--primary"
        disabled={change.pending || remove.pending}
        onClick={() => navigate({ name: 'checkout' })}
      >
        Оформить заказ
      </button>
    </section>
  );
}
