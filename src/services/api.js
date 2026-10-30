import axios from "axios";
import { ENV } from "@/config";

export const REMOTE_BACKEND_URL = "https://datasystem-ce.com.br/radio";

/**
 * Instância HTTP compartilhada apontando para o backend PHP da rádio.
 */
export const api = axios.create({
	baseURL: ENV.apiUrl,
	timeout: 20000,
});

api.interceptors.response.use(
	(response) => response,
	async (error) => {
		const originalRequest = error?.config;

		// Fallback automático transparente: se a requisição via proxy (/radio-api) falhar
		// (ex.: erro de rede, 404 de proxy ou 400), tenta diretamente no endpoint HTTPS da rádio
		if (
			originalRequest &&
			!originalRequest._retryDirect &&
			(originalRequest.baseURL?.includes("radio-api") ||
				originalRequest.url?.startsWith("/radio-api"))
		) {
			originalRequest._retryDirect = true;
			originalRequest.baseURL = REMOTE_BACKEND_URL;
			if (originalRequest.url?.startsWith("/radio-api")) {
				originalRequest.url = originalRequest.url.replace(/^\/radio-api/, "");
			}
			try {
				return await axios(originalRequest);
			} catch (fallbackError) {
				if (ENV.isDev) {
					console.error("[api fallback]", fallbackError?.message);
				}
				return Promise.reject(fallbackError);
			}
		}

		if (ENV.isDev) {
			console.error("[api]", error?.response?.status, error?.message);
		}

		return Promise.reject(error);
	},
);

export const R2_STORAGE_URL = "https://pub-22e8765882e44af2b9abf39208d2f0bc.r2.dev";

// Pastas de músicas confirmadas no Cloudflare R2
const R2_MIGRATED_GENRES = [
	"acustico",
	"anos_70_80_90_internacional",
	"bossa_nova",
	"instrumental",
	"moda_viola",
	"mpb",
	"pop_nacional",
	"rock_classico",
	"romanticas",
	"sertanejo_universitario",
];

/**
 * Resolve um caminho relativo retornado pelo backend PHP (ex.: `musicas/faixa.mp3`,
 * `hora_certa/19_00.mp3`, `voz_stream/chunk_123.webm`) para a URL completa.
 *
 * @param {string} relativePath
 * @returns {string}
 */
export const resolveRadioAssetUrl = (relativePath) => {
	if (!relativePath) return "";
	if (/^https?:\/\//i.test(relativePath)) return encodeURI(decodeURI(relativePath));

	const cleanPath = relativePath.replace(/^\/+/, "").replace(/^radio\//, "");
	if (cleanPath.startsWith("musicas/")) {
		const r2Path = cleanPath.replace(/^musicas\//, "");
		const folder = (r2Path.split("/")[0] || "").toLowerCase();
		if (R2_MIGRATED_GENRES.includes(folder)) {
			return encodeURI(decodeURI(`${R2_STORAGE_URL}/${r2Path}`));
		}
		const cleanBase = (ENV.apiUrl || "").replace(/\/+$/, "");
		return encodeURI(decodeURI(`${cleanBase}/${cleanPath}`));
	}

	const cleanBase = (ENV.apiUrl || "").replace(/\/+$/, "");
	return encodeURI(decodeURI(`${cleanBase}/${cleanPath}`));
};
