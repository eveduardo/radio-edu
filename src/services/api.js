import axios from "axios";
import { ENV } from "@/config";

/**
 * Instância HTTP compartilhada apontando para o backend PHP da rádio.
 */
export const api = axios.create({
	baseURL: ENV.apiUrl,
	timeout: 20000,
});

api.interceptors.response.use(
	(response) => response,
	(error) => {
		if (ENV.isDev) {
			console.error("[api]", error?.response?.status, error?.message);
		}

		return Promise.reject(error);
	},
);

/**
 * Resolve um caminho relativo retornado pelo backend PHP (ex.: `musicas/faixa.mp3`,
 * `hora_certa/19_00.mp3`, `voz_stream/chunk_123.webm`) para a URL completa.
 *
 * @param {string} relativePath
 * @returns {string}
 */
export const resolveRadioAssetUrl = (relativePath) => {
	if (!relativePath) return "";
	if (/^https?:\/\//i.test(relativePath)) return relativePath;

	const cleanBase = (ENV.apiUrl || "").replace(/\/+$/, "");
	const cleanPath = relativePath.replace(/^\/+/, "").replace(/^radio\//, "");

	return `${cleanBase}/${cleanPath}`;
};
