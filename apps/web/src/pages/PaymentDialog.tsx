import { useEffect, useRef, useState } from 'react';
import { api, type SandboxCard } from '../api/endpoints';
import { ApiError, asApiError, isAborted } from '../api/client';
import { pollUntil } from '../api/poll';
import { useApiData, useAction } from '../lib/useApiData';
import { clearPaymentDraft, loadPaymentDraft, savePaymentDraft } from '../lib/pending';
import { declineMessage, formatMoney } from '../lib/format';
import { Banner, ErrorBanner, Loader } from '../ui/ui';
import type { Order, Payment, Scenario } from '@checkout/contracts';

type Phase = 'starting' | 'form' | 'waiting' | 'failed' | 'cancelled';

const isTerminal = (payment: Payment) =>
  payment.status === 'succeeded' || payment.status === 'failed' || payment.status === 'cancelled';

/**
 * Тестовая платёжная форма: карта выбирается из справочника API, номер не вводится.
 * Диалог можно закрыть в любой момент — попытка останется и подхватится заново.
 */
export function PaymentDialog({
  order,
  onClose,
  onPaid,
}: {
  order: Order;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('starting');
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [selected, setSelected] = useState('');
  const cards = useApiData((signal) => api.sandbox(signal), []);
  const watcher = useRef<AbortController | null>(null);

  // Уход со страницы или закрытие диалога останавливает опрос.
  useEffect(() => () => watcher.current?.abort(), []);

  const watch = async (id: string) => {
    const controller = new AbortController();
    watcher.current?.abort();
    watcher.current = controller;
    setPhase('waiting');
    try {
      // Пауза берётся из справочника тестовых карт, интервал — в рамках рекомендации API.
      const delayMs = Math.min(Math.max(cards.data?.settlementDelayMs ?? 1000, 500), 2000);
      const payment = await pollUntil({
        request: (signal) => api.payment(id, signal),
        isDone: isTerminal,
        intervalMs: delayMs,
        signal: controller.signal,
      });
      clearPaymentDraft();
      if (payment.status === 'succeeded') onPaid();
      else if (payment.status === 'failed') setPhase('failed');
      else setPhase('cancelled');
    } catch (cause) {
      if (isAborted(cause) || controller.signal.aborted) return;
      setError(asApiError(cause));
    }
  };

  // Попытка оплаты: сохраняем ключ до запроса; если попытка уже есть — подхватываем её.
  const start = useAction(async () => {
    setError(null);
    try {
      const draft = loadPaymentDraft();
      const key = draft?.orderId === order.id ? draft.key : crypto.randomUUID();
      savePaymentDraft({ orderId: order.id, key });
      let payment: Payment;
      try {
        payment = await api.createPayment(order.id, key);
      } catch (cause) {
        if (!(cause instanceof ApiError)) throw cause;
        if (cause.code === 'ORDER_ALREADY_PAID') {
          clearPaymentDraft();
          onPaid();
          return;
        }
        if (cause.code !== 'PAYMENT_IN_PROGRESS') throw cause;
        const attempts = await api.orderPayments(order.id);
        const active = attempts.find((attempt) => !isTerminal(attempt));
        if (!active) throw cause;
        payment = active;
      }
      setPaymentId(payment.id);
      if (payment.status === 'processing') await watch(payment.id);
      else setPhase('form');
    } catch (cause) {
      setError(asApiError(cause));
      setPhase('form');
    }
  });

  // Имитация сценария и ожидание: повтор того же сценария безопасен по контракту.
  const runScenario = useAction(async (scenario: Scenario) => {
    if (!paymentId) return;
    setError(null);
    await api.simulate(paymentId, scenario);
    await watch(paymentId);
  });

  useEffect(() => {
    if (phase === 'starting' && !start.pending) start.run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const card = cards.data?.cards.find((candidate: SandboxCard) => candidate.id === selected);
  const busy = start.pending || runScenario.pending;

  return (
    <div className="dialog" role="dialog" aria-modal="true" aria-label="Оплата заказа">
      <div className="dialog__panel">
        <header className="dialog__header">
          <h2>Оплата заказа №{order.number}</h2>
          <button type="button" className="btn btn--step" aria-label="Закрыть" onClick={onClose}>
            ×
          </button>
        </header>
        <p>
          К оплате: <strong>{formatMoney(order.total)}</strong>
        </p>
        {phase === 'starting' && <Loader>Создаём попытку оплаты…</Loader>}
        {phase === 'waiting' && <Loader>Обрабатываем платёж, не закрывайте страницу…</Loader>}
        {phase === 'failed' && <Banner kind="error">{declineMessage}</Banner>}
        {phase === 'cancelled' && (
          <Banner>Оплата отменена. Заказ сохранён, можно оплатить заново.</Banner>
        )}
        {error && (
          <ErrorBanner error={error} onRetry={paymentId ? () => watch(paymentId) : start.run} />
        )}
        {cards.error && <ErrorBanner error={cards.error} onRetry={cards.refetch} />}
        {(phase === 'form' || phase === 'starting') && cards.data && (
          <>
            <fieldset className="panel">
              <legend>Тестовая карта</legend>
              {cards.data.cards.map((candidate: SandboxCard) => (
                <label key={candidate.id} className="choice">
                  <input
                    type="radio"
                    name="sandboxCard"
                    checked={selected === candidate.id}
                    onChange={() => setSelected(candidate.id)}
                  />
                  {candidate.title} ({candidate.maskedNumber})
                </label>
              ))}
            </fieldset>
            <div className="dialog__actions">
              <button
                type="button"
                className="btn btn--primary"
                disabled={!card || busy}
                onClick={() => card && runScenario.run(card.scenario)}
              >
                {runScenario.pending ? 'Оплачиваем…' : 'Оплатить'}
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy || !paymentId}
                onClick={() => runScenario.run('cancel')}
              >
                Отменить оплату
              </button>
            </div>
          </>
        )}
        {(phase === 'failed' || phase === 'cancelled') && (
          <div className="dialog__actions">
            <button type="button" className="btn btn--primary" disabled={busy} onClick={start.run}>
              Повторить оплату
            </button>
            <button type="button" className="btn" onClick={onClose}>
              Вернуться к заказу
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
