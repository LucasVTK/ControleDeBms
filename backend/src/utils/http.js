export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Envolve handlers async para mandar erros ao middleware de erro. */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/** Aceita apenas inteiros >= 0 (como string de dígitos ou number). */
export function parseNonNegativeInt(value, fieldLabel, max = 1_000_000) {
  const str = typeof value === 'number' ? String(value) : String(value ?? '').trim();
  if (!/^\d+$/.test(str)) {
    throw new HttpError(400, `${fieldLabel} deve ser um número inteiro maior ou igual a zero.`);
  }
  const n = Number(str);
  if (!Number.isSafeInteger(n) || n > max) {
    throw new HttpError(400, `${fieldLabel} deve ser no máximo ${max}.`);
  }
  return n;
}

export function parseId(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'ID inválido.');
  return n;
}
