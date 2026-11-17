/**
 * Horloge figée du serveur pendant les tests de bout en bout (lue par serverNow, mode local uniquement) :
 * les années déduites des messages restent stables. Partagée par playwright.config.ts et les scénarios.
 */
export const TEST_NOW = "2026-11-10T12:00:00Z";
