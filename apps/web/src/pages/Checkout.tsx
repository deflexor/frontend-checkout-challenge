import { Fragment, useEffect, useState, type FormEvent } from 'react';
import { api } from '../api/endpoints';
import { useSession } from '../state/session';
import { ApiError, asApiError } from '../api/client';
import { useApiData } from '../lib/useApiData';
import { navigate, orderRoute } from '../lib/router';
import { clearOrderDraft, loadOrderDraft, saveOrderDraft } from '../lib/pending';
import {
  deliveryOf,
  deliveryReady,
  emptyForm,
  errorField,
  orderBodyOf,
  validate,
  type CheckoutForm,
  type FormErrors,
} from '../lib/validation';
import { formatMoney } from '../lib/format';
import { Banner, ErrorBanner, Field, Loader } from '../ui/ui';
import type { Delivery, Quote } from '@checkout/contracts';

const formKey = 'checkout:form';

const loadForm = (): CheckoutForm => {
  try {
    const raw = localStorage.getItem(formKey);
    return raw ? { ...emptyForm, ...(JSON.parse(raw) as CheckoutForm) } : emptyForm;
  } catch {
    return emptyForm;
  }
};

export function CheckoutPage() {
  const { cart, refreshCart, refetchProducts } = useSession();
  const options = useApiData((signal) => api.checkoutOptions(signal), []);
  const [form, setForm] = useState<CheckoutForm>(loadForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<ApiError | null>(null);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Введённые данные переживают перезагрузку и ошибки запросов.
  useEffect(() => {
    localStorage.setItem(formKey, JSON.stringify(form));
  }, [form]);

  const set = <K extends keyof CheckoutForm>(field: K, value: CheckoutForm[K]) =>
    setForm((previous) => ({ ...previous, [field]: value }));

  // Пункт выдачи по умолчанию — первый из справочника.
  const pickupPoints =
    options.data?.deliveryMethods.find((method) => method.id === 'pickup')?.pickupPoints ?? [];
  useEffect(() => {
    if (options.data && !form.pickupPointId && pickupPoints.length > 0) {
      set('pickupPointId', pickupPoints[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.data]);

  // Расчёт: как только доставка заполнена, сервер считает доставку и итог.
  const ready = cart !== null && cart.items.length > 0 && deliveryReady(form);
  const deliveryKey = ready ? JSON.stringify(deliveryOf(form)) : '';
  const cartVersion = cart?.version;
  useEffect(() => {
    // Доставка или корзина изменились
    setQuote(null);
    setQuoteError(null);
    if (!deliveryKey || cartVersion === undefined) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api.createQuote(JSON.parse(deliveryKey) as Delivery, cartVersion, controller.signal).then(
        (fresh) => {
          if (controller.signal.aborted) return;
          setQuote(fresh);
          setQuoteError(null);
        },
        (cause) => {
          if (controller.signal.aborted) return;
          // Версия корзины устарела — обновляем корзину, эффект пересчитает сам.
          if (cause instanceof ApiError && cause.code === 'CART_VERSION_CONFLICT') {
            refreshCart();
            return;
          }
          setQuote(null);
          setQuoteError(asApiError(cause));
        },
      );
    }, 400);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [deliveryKey, cartVersion]);

  if (options.error) return <ErrorBanner error={options.error} onRetry={options.refetch} />;
  if (!options.data || !cart) return <Loader />;

  if (cart.items.length === 0) {
    return (
      <section>
        <h1>Оформление</h1>
        <p>Корзина пуста — сначала выберите товары.</p>
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

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSubmitting(true);
    setSubmitError(null);
    setNotice(null);
    try {
      // Свежий расчёт перед заказом: свой может быть устаревшим.
      const delivery = deliveryOf(form);
      const deliveryJson = JSON.stringify(delivery);
      const current =
        quote &&
        quote.cartVersion === cart.version &&
        JSON.stringify(quote.delivery) === deliveryJson
          ? quote
          : await api.createQuote(delivery, cart.version);

      // Ключ сохраняется до запроса: повтор после сетевой ошибки идёт без дубля.
      const key = crypto.randomUUID();
      const body = orderBodyOf(form, current.id);
      saveOrderDraft({ key, body });
      const order = await api.createOrder(body, key);
      clearOrderDraft();
      localStorage.removeItem(formKey);
      navigate(orderRoute(order));
    } catch (cause) {
      clearOrderDraft();
      const error = asApiError(cause);
      const fieldErrors: FormErrors = {};
      for (const issue of error.fields) {
        const field = errorField(issue.path);
        if (field) fieldErrors[field] ??= issue.message;
      }
      if (error.code === 'CART_EMPTY') {
        navigate({ name: 'cart' });
      } else if (error.code === 'CART_VERSION_CONFLICT' || error.code === 'QUOTE_EXPIRED') {
        // Данные изменились: обновляем корзину, расчёт пересоздастся, заказ можно продолжить.
        await refreshCart();
        setNotice('Корзина изменилась — расчёт обновлён. Проверьте сумму и подтвердите заказ.');
      } else if (Object.keys(fieldErrors).length > 0) {
        setErrors(fieldErrors);
      } else {
        setSubmitError(error);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section>
      <h1>Оформление заказа</h1>
      <form onSubmit={submit} noValidate>
        <fieldset className="panel">
          <legend>Получатель</legend>
          <Field
            label="Имя и фамилия"
            name="name"
            value={form.name}
            onChange={(value) => set('name', value)}
            error={errors.name}
            autoComplete="name"
          />
          <Field
            label="Email"
            name="email"
            type="email"
            value={form.email}
            onChange={(value) => set('email', value)}
            error={errors.email}
            autoComplete="email"
            inputMode="email"
            placeholder="buyer@example.test"
          />
          <Field
            label="Телефон"
            name="phone"
            type="tel"
            value={form.phone}
            onChange={(value) => set('phone', value)}
            error={errors.phone}
            autoComplete="tel"
            inputMode="tel"
            placeholder="+79990000000"
          />
        </fieldset>

        <fieldset className="panel">
          <legend>Доставка</legend>
          {options.data.deliveryMethods.map((method) => (
            <Fragment key={method.id}>
              <label className="choice">
                <input
                  type="radio"
                  name="deliveryMethod"
                  checked={form.deliveryMethod === method.id}
                  onChange={() => set('deliveryMethod', method.id)}
                />
                {method.title} · {method.price === 0 ? 'бесплатно' : formatMoney(method.price)}
                {method.freeFrom !== null && ` (бесплатно от ${formatMoney(method.freeFrom)})`}
              </label>
              {method.id === 'pickup' && form.deliveryMethod === 'pickup' && (
                <>
                  {pickupPoints.map((point, index) => (
                    <label key={point.id} className="choice choice--nested">
                      <input
                        type="radio"
                        name="pickupPointId"
                        checked={
                          form.pickupPointId === point.id ||
                          (form.pickupPointId === '' && index === 0)
                        }
                        onChange={() => set('pickupPointId', point.id)}
                      />
                      {point.title}, {point.address}
                    </label>
                  ))}
                </>
              )}
              {method.id === 'courier' && form.deliveryMethod === 'courier' && (
                <>
                  <Field
                    label="Город"
                    name="city"
                    value={form.city}
                    onChange={(value) => set('city', value)}
                    error={errors.city}
                  />
                  <Field
                    label="Улица"
                    name="street"
                    value={form.street}
                    onChange={(value) => set('street', value)}
                    error={errors.street}
                  />
                  <div className="field-row">
                    <Field
                      label="Дом"
                      name="house"
                      value={form.house}
                      onChange={(value) => set('house', value)}
                      error={errors.house}
                    />
                    <Field
                      label="Квартира (необязательно)"
                      name="apartment"
                      value={form.apartment}
                      onChange={(value) => set('apartment', value)}
                    />
                  </div>
                </>
              )}
            </Fragment>
          ))}
        </fieldset>

        <fieldset className="panel">
          <legend>Оплата</legend>
          {options.data.paymentMethods.map((method) => (
            <label key={method.id} className="choice">
              <input
                type="radio"
                name="paymentMethod"
                checked={form.paymentMethod === method.id}
                onChange={() => set('paymentMethod', method.id)}
              />
              {method.title}
            </label>
          ))}
        </fieldset>

        <div className="panel summary" aria-live="polite">
          <p>
            Товары ({cart.quantity}): {formatMoney(cart.subtotal)}
          </p>
          <p>
            Доставка:{' '}
            {quoteError
              ? 'не удалось рассчитать'
              : quote
                ? quote.shipping === 0
                  ? 'бесплатно'
                  : formatMoney(quote.shipping)
                : ready
                  ? 'считаем…'
                  : 'заполните доставку'}
          </p>
          <p className="total">
            Итого:{' '}
            <strong>
              {quote && !quoteError ? formatMoney(quote.total) : formatMoney(cart.subtotal)}
            </strong>
          </p>
          {quoteError && <ErrorBanner error={quoteError} />}
          {notice && <Banner>{notice}</Banner>}
          {submitError && <ErrorBanner error={submitError} />}
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? 'Оформляем…' : 'Оформить заказ'}
          </button>
        </div>
      </form>
    </section>
  );
}
