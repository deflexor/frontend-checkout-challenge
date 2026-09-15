import type { CreateOrder, Customer, Delivery } from '@checkout/contracts';

/** Состояние формы оформления. Значения не обрезаются до отправки — обрезает customerOf. */
export type CheckoutForm = {
  name: string;
  email: string;
  phone: string;
  deliveryMethod: 'pickup' | 'courier';
  pickupPointId: string;
  city: string;
  street: string;
  house: string;
  apartment: string;
  paymentMethod: 'card' | 'cash_on_delivery';
};

export type FormErrors = Partial<Record<string, string>>;

export const emptyForm: CheckoutForm = {
  name: '',
  email: '',
  phone: '',
  deliveryMethod: 'pickup',
  pickupPointId: '',
  city: '',
  street: '',
  house: '',
  apartment: '',
  paymentMethod: 'card',
};

/** Правила совпадают с контрактами API; одна реализация для показа и для отправки. */
const rules: Partial<Record<keyof CheckoutForm, (value: string) => string | null>> = {
  name: (value) => (value.trim().length >= 2 ? null : 'Укажите имя и фамилию'),
  email: (value) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? null : 'Проверьте формат: name@example.com',
  phone: (value) =>
    /^\+[1-9]\d{9,14}$/.test(normalizePhone(value))
      ? null
      : 'Телефон: «+» и 10–15 цифр, например +79990000000',
  city: (value) => (value.trim().length >= 2 ? null : 'Укажите город'),
  street: (value) => (value.trim().length >= 2 ? null : 'Укажите улицу'),
  house: (value) => (value.trim() ? null : 'Укажите дом'),
};

export function validate(form: CheckoutForm): FormErrors {
  const fields: (keyof CheckoutForm)[] =
    form.deliveryMethod === 'courier'
      ? ['name', 'email', 'phone', 'city', 'street', 'house']
      : ['name', 'email', 'phone'];
  const errors: FormErrors = {};
  for (const field of fields) {
    const message = rules[field]?.(form[field]);
    if (message) errors[field] = message;
  }
  return errors;
}

const normalizePhone = (value: string) => value.replace(/[\s()-]/g, '');

export function customerOf(form: CheckoutForm): Customer {
  return {
    name: form.name.trim(),
    email: form.email.trim(),
    phone: normalizePhone(form.phone),
  };
}

export function deliveryOf(form: CheckoutForm): Delivery {
  return form.deliveryMethod === 'pickup'
    ? { method: 'pickup', pickupPointId: form.pickupPointId }
    : {
        method: 'courier',
        address: {
          city: form.city.trim(),
          street: form.street.trim(),
          house: form.house.trim(),
          ...(form.apartment.trim() ? { apartment: form.apartment.trim() } : {}),
        },
      };
}

/** Готова ли доставка к расчёту: выбран пункт или заполнен адрес. */
export function deliveryReady(form: CheckoutForm): boolean {
  if (form.deliveryMethod === 'pickup') return form.pickupPointId !== '';
  return [form.city, form.street, form.house].every((value) => value.trim() !== '');
}

/** Путь поля из ошибки сервера `body/customer/email` → имя поля формы. */
export const errorField = (path: string) => path.split('/').pop() ?? '';

export function orderBodyOf(form: CheckoutForm, quoteId: string): CreateOrder {
  return { quoteId, customer: customerOf(form), paymentMethod: form.paymentMethod };
}
