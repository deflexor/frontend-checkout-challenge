import { useSession } from '../state/session';
import { useAction } from '../lib/useApiData';
import { formatMoney } from '../lib/format';
import { ErrorBanner, Loader } from '../ui/ui';
import type { Product } from '@checkout/contracts';

export function CatalogPage() {
  const { products, productsError, refetchProducts, itemsByProduct, changeQuantity } = useSession();
  const add = useAction(changeQuantity);

  if (productsError) return <ErrorBanner error={productsError} onRetry={refetchProducts} />;
  if (!products) return <Loader />;

  const addToCart = async (product: Product) => {
    // Количество абсолютное: в корзине уже есть — увеличиваем на одну штуку.
    const inCart = itemsByProduct.get(product.id)?.quantity ?? 0;
    await add.run(product.id, inCart + 1);
  };

  return (
    <section>
      <h1>Каталог</h1>
      {add.error && <ErrorBanner error={add.error} />}
      {products.length === 0 ? (
        <p>Товаров пока нет.</p>
      ) : (
        <ul className="products">
          {products.map((product) => {
            const inCart = itemsByProduct.get(product.id)?.quantity ?? 0;
            const soldOut = product.stock === 0;
            const maxedOut = inCart >= product.stock;
            return (
              <li key={product.id} className="card product">
                <h2 className="product__title">{product.title}</h2>
                <p className="product__description">{product.description}</p>
                <p className="product__price">{formatMoney(product.price)}</p>
                {soldOut ? (
                  <p className="product__stock">Нет в наличии</p>
                ) : (
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={maxedOut || add.pending}
                    onClick={() => addToCart(product)}
                  >
                    {inCart > 0 ? `В корзине: ${inCart} · добавить ещё` : 'Добавить в корзину'}
                  </button>
                )}
                {maxedOut && !soldOut && (
                  <p className="product__stock">Больше нельзя: остаток {product.stock}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
