import type { ReactNode } from 'react';
import type { ApiError } from '../api/client';

/** Подписанное поле: метка, ввод и ошибка связаны через aria — единое поведение всех форм. */
export function Field(props: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  inputMode?: 'text' | 'email' | 'tel' | 'numeric';
}) {
  const { label, name, error, onChange, ...input } = props;
  const errorId = `${name}-error`;
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        {...input}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error && (
        <p className="field-error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
}

export function Banner({
  kind = 'info',
  children,
}: {
  kind?: 'info' | 'error' | 'success';
  children: ReactNode;
}) {
  return (
    <p className={`banner banner--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}

/** Показ уже разобранной ошибки API: сообщение и повтор — в одном месте. */
export function ErrorBanner({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  return (
    <Banner kind="error">
      {error.message}
      {onRetry && (
        <>
          {' '}
          <button type="button" className="btn btn--link" onClick={onRetry}>
            Повторить
          </button>
        </>
      )}
    </Banner>
  );
}

export function Loader({ children = 'Загрузка…' }: { children?: ReactNode }) {
  return (
    <p className="loader" role="status">
      {children}
    </p>
  );
}

/** Счётчик количества: шаги доступны с клавиатуры, границы задаёт остаток товара. */
export function QuantityStepper(props: {
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  onRemove: () => void;
}) {
  const { value, min, max, disabled, onChange, onRemove } = props;
  return (
    <div className="stepper">
      <button
        type="button"
        className="btn btn--step"
        disabled={disabled || value <= min}
        aria-label="Уменьшить количество"
        onClick={() => onChange(value - 1)}
      >
        −
      </button>
      <span className="stepper__value" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className="btn btn--step"
        disabled={disabled || value >= max}
        aria-label="Увеличить количество"
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
      <button type="button" className="btn btn--link" disabled={disabled} onClick={onRemove}>
        Удалить
      </button>
    </div>
  );
}
