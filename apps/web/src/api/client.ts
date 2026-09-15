/** Поле с ошибкой из ответа API: `body/customer/email` + техническое сообщение. */
export type FieldIssue = { path: string; message: string };

type ErrorBody = { error: { code: string; message: string; fields?: FieldIssue[] } };

/** Откуда взялась ошибка: не дошли до сети, ответ HTTP или неожиданное тело. */
export type ErrorKind = 'network' | 'http' | 'parse';

const baseUrl: string = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000';

const fallbackMessages: Record<number, string> = {
  401: 'Сессия недействительна. Обновите страницу.',
  404: 'Данные не найдены.',
  500: 'Ошибка на сервере. Повторите попытку.',
};

/**
 * Единственный вид ошибки, который получают компоненты.
 * Транспорт — статус, конверт, поля ошибки — разбирается один раз здесь.
 */
export class ApiError extends Error {
  readonly kind: ErrorKind;
  readonly status: number;
  readonly code: string;
  readonly fields: FieldIssue[];
  readonly requestId: string;

  constructor(
    kind: ErrorKind,
    status: number,
    code: string,
    message: string,
    fields: FieldIssue[] = [],
    requestId = '',
  ) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.requestId = requestId;
  }
}

/** Любой выброс приводится к ApiError — компоненты обрабатывают один тип. */
export function asApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError('network', 0, 'UNKNOWN', 'Что-то пошло не так. Повторите попытку.');
}

export const isAborted = (error: unknown) =>
  error instanceof DOMException && error.name === 'AbortError';

let token = '';
/** Токен сессии подставляется во все запросы отсюда — компоненты его не передают. */
export function setToken(value: string) {
  token = value;
}

type Options = {
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
};

type Envelope<T> = { data?: T; meta?: { requestId?: string }; error?: ErrorBody['error'] };

/** Общий механизм отправки: адрес, заголовки, тело, статус и разбор — в одном месте. */
export async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  options: Options = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (cause) {
    if (isAborted(cause)) throw cause;
    throw new ApiError('network', 0, 'NETWORK', 'Нет связи с сервером. Повторите попытку.');
  }

  if (response.status === 204) return undefined as T;

  let payload: Envelope<T>;
  try {
    payload = (await response.json()) as Envelope<T>;
  } catch {
    throw new ApiError(
      'parse',
      response.status,
      'BAD_RESPONSE',
      response.ok
        ? 'Сервер вернул неожиданный ответ.'
        : (fallbackMessages[response.status] ?? 'Запрос не выполнен.'),
    );
  }

  if (!response.ok) {
    if (response.status === 401) notifyUnauthorized();
    throw new ApiError(
      'http',
      response.status,
      payload.error?.code ?? 'REQUEST_FAILED',
      payload.error?.message ?? fallbackMessages[response.status] ?? 'Запрос не выполнен.',
      payload.error?.fields ?? [],
      payload.meta?.requestId ?? response.headers.get('X-Request-Id') ?? '',
    );
  }
  return payload.data as T;
}

/** 401 в любом запросе означает потерю сессии; слушатель вешается один раз на приложение. */
const unauthorizedEvent = 'checkout:unauthorized';

function notifyUnauthorized() {
  window.dispatchEvent(new CustomEvent(unauthorizedEvent));
}

export function onUnauthorized(handler: () => void): () => void {
  window.addEventListener(unauthorizedEvent, handler);
  return () => window.removeEventListener(unauthorizedEvent, handler);
}
