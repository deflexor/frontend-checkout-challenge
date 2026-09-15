import { useCallback, useEffect, useRef, useState } from 'react';
import { asApiError, isAborted, type ApiError } from '../api/client';

export type Query<T> = { data: T | null; error: ApiError | null; pending: boolean };

/**
 * Загрузка данных для показа: отмена при уходе и защита от устаревшего ответа —
 * применяются данные только последнего запуска.
 */
export function useApiData<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
): Query<T> & { refetch: () => void } {
  const [state, setState] = useState<Query<T>>({ data: null, error: null, pending: true });
  const [attempt, setAttempt] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    const controller = new AbortController();
    setState((previous) => ({ ...previous, pending: true, error: null }));
    fetcherRef.current(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ data, error: null, pending: false });
      },
      (cause) => {
        if (controller.signal.aborted || isAborted(cause)) return;
        setState((previous) => ({ ...previous, error: asApiError(cause), pending: false }));
      },
    );
    return () => controller.abort();
    // Набор зависимостей задаёт вызывающий; количество элементов стабильно.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  const refetch = useCallback(() => setAttempt((attempt) => attempt + 1), []);
  return { ...state, refetch };
}

/**
 * Мутация по действию пользователя: защита от двойного запуска, флаг занятости
 * и единая ошибка ApiError для показа.
 */
export function useAction<A extends unknown[], R>(action: (...args: A) => Promise<R>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const actionRef = useRef(action);
  actionRef.current = action;
  const lock = useRef(false);

  const run = useCallback(async (...args: A): Promise<R | undefined> => {
    if (lock.current) return undefined;
    lock.current = true;
    setPending(true);
    setError(null);
    try {
      return await actionRef.current(...args);
    } catch (cause) {
      setError(asApiError(cause));
      return undefined;
    } finally {
      lock.current = false;
      setPending(false);
    }
  }, []);

  return { run, pending, error, resetError: useCallback(() => setError(null), []) };
}
