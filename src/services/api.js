import axios from "axios";
import { ENV } from "@/config";

/**
 * Instância HTTP compartilhada. Serviços de cada feature devem usar esta instância,
 * por exemplo em `src/features/<nome>/services/<nome>Service.js`.
 */
export const api = axios.create({
	baseURL: ENV.apiUrl,
	timeout: 15000,
	headers: { "Content-Type": "application/json" },
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

