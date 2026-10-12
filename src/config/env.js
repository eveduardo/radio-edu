/**
 * Único ponto de leitura de variáveis de ambiente.
 * Defina os valores em `.env.local` (veja `.env.example`).
 */
export const ENV = Object.freeze({
	appName: import.meta.env.VITE_APP_NAME || "Radio Edu",
	apiUrl: import.meta.env.VITE_API_URL || "",
	isDev: import.meta.env.DEV,
});

