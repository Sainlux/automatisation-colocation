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

export const unauthorized = (msg = "Votre session a expiré. Reconnectez-vous.") => new AppError(401, "unauthorized", msg);
export const forbidden = (msg = "Action non autorisée.") => new AppError(403, "forbidden", msg);
export const notFound = (msg = "Ressource introuvable.") => new AppError(404, "not_found", msg);
export const badRequest = (msg: string, details?: unknown) => new AppError(400, "bad_request", msg, details);
export const conflict = (msg: string) => new AppError(409, "conflict", msg);
export const unavailable = (msg: string) => new AppError(503, "unavailable", msg);
export const lengthRequired = (msg = "La taille de l'envoi est inconnue. Rechargez la page, puis réessayez.") => new AppError(411, "length_required", msg);

/** Message lisible d'une erreur inconnue (journalisation uniquement : ne pas l'afficher tel quel). */
export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e) ?? String(e);
  } catch {
    return String(e);
  }
}
