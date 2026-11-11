export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const unauthorized = (msg = "Authentification requise.") => new AppError(401, "unauthorized", msg);
export const forbidden = (msg = "Action non autorisée.") => new AppError(403, "forbidden", msg);
export const notFound = (msg = "Ressource introuvable.") => new AppError(404, "not_found", msg);
export const badRequest = (msg: string, details?: unknown) => new AppError(400, "bad_request", msg, details);
export const conflict = (msg: string) => new AppError(409, "conflict", msg);
export const unavailable = (msg: string) => new AppError(503, "unavailable", msg);
