const delay = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const stop = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', stop);
    };
    const timer = setTimeout(() => {
      stop();
      resolve();
    }, ms);
    signal.addEventListener(
      'abort',
      () => {
        stop();
        reject(new DOMException('Опрос остановлен', 'AbortError'));
      },
      { once: true },
    );
  });

/**
 * Единый опрос ресурса: запрос → проверка условия → пауза, без наложения запросов.
 * Прекращается сигналом (уход со страницы) или выполнением условия.
 */
export function pollUntil<T>(options: {
  request: (signal: AbortSignal) => Promise<T>;
  isDone: (value: T) => boolean;
  intervalMs: number;
  signal: AbortSignal;
}): Promise<T> {
  const { request, isDone, intervalMs, signal } = options;
  const run = async (): Promise<T> => {
    for (;;) {
      const value = await request(signal);
      if (isDone(value) || signal.aborted) return value;
      await delay(intervalMs, signal);
    }
  };
  return run();
}
