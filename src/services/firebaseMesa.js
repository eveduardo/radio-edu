import { getApps, initializeApp } from "firebase/app";
import { getDatabase, ref, update } from "firebase/database";
import { ENV } from "@/config";
import { api, resolveRadioAssetUrl } from "./api";

let database = null;
let mesaRef = null;

try {
	if (ENV.firebase?.apiKey) {
		const app =
			getApps().length > 0 ? getApps()[0] : initializeApp(ENV.firebase);
		database = getDatabase(app);
		mesaRef = ref(database, "mesa");
	}
} catch (err) {
	if (ENV.isDev) {
		console.warn("[mesaService] Firebase desativado ou não configurado:", err);
	}
}

/**
 * Inscreve um listener ultraleve em tempo real no arquivo estático `estado_mesa.json`
 * (Arquitetura de alta performance com ZERO conexões presas em bancos de terceiros).
 *
 * @param {(dados: Record<string, any>) => void} callback
 * @returns {() => void} Função para cancelar a inscrição
 */
export const subscribeToMesa = (callback) => {
	let ativo = true;
	let timer = null;
	let ultimoJsonTexto = "";
	let ehAoVivo = false;

	const checar = async () => {
		if (!ativo) return;

		try {
			const url = `${resolveRadioAssetUrl("estado_mesa.json")}?t=${Date.now()}`;
			const res = await fetch(url, { cache: "no-store" });
			if (res.ok) {
				const texto = await res.text();
				if (ativo && texto && texto !== ultimoJsonTexto) {
					ultimoJsonTexto = texto;
					try {
						const dados = JSON.parse(texto);
						ehAoVivo = Boolean(dados?.ao_vivo);
						callback(dados);
					} catch {
						// Ignora erro temporário de parsing em escrita concorrente
					}
				}
			}
		} catch {
			// Ignora erro temporário de rede
		}

		if (ativo) {
			const intervalo = ehAoVivo ? 800 : 2000;
			timer = setTimeout(checar, intervalo);
		}
	};

	checar();

	return () => {
		ativo = false;
		if (timer) clearTimeout(timer);
	};
};

/**
 * Atualiza o estado da mesa no servidor em `estado_mesa.json` (`POST /atualizar_mesa.php`).
 *
 * @param {Record<string, any>} partialState
 * @returns {Promise<any>}
 */
export const updateMesa = async (partialState) => {
	// 1. Grava diretamente no servidor local em estado_mesa.json
	try {
		await api.post("/atualizar_mesa.php", partialState);
	} catch (err) {
		if (ENV.isDev) {
			console.warn("[mesaService] Erro ao postar atualizar_mesa.php:", err);
		}
	}

	// 2. Se Firebase estiver disponível, sincroniza em paralelo
	if (mesaRef) {
		try {
			await update(mesaRef, partialState);
		} catch {
			// ignore fallback error
		}
	}
};

