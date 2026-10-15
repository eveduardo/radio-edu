import { ENV } from "@/config";
import { api, resolveRadioAssetUrl } from "./api";

/**
 * Sincroniza o estado atual da programação da rádio (`radio_sync.php`).
 *
 * @param {Object} [options]
 * @param {boolean} [options.forcarProxima=false]
 */
export const fetchRadioSync = async ({ forcarProxima = false } = {}) => {
	const params = { t: Date.now() };
	if (forcarProxima) {
		params.forcar_proxima = "1";
	}

	const { data } = await api.get("/radio_sync.php", { params });
	return data;
};

/**
 * Pausa ou retoma a música que está no ar no servidor (`radio_sync.php?acao_musica=pausar|retomar`).
 *
 * @param {boolean} pausar `true` para pausar, `false` para retomar
 * @param {Object} [options]
 * @param {string} [options.excluirTemp] Caminho do arquivo temporário a excluir
 */
export const setRadioMusicPaused = async (
	pausar,
	{ excluirTemp = null } = {},
) => {
	const params = {
		acao_musica: pausar ? "pausar" : "retomar",
		t: Date.now(),
	};
	if (excluirTemp) {
		params.excluir_temp = excluirTemp;
	}
	const { data } = await api.get("/radio_sync.php", { params });
	return data;
};

/**
 * Remove um arquivo temporário de áudio (trinca ou recado) após ir pro ar (`radio_sync.php?limpar_temp_vinheta=...`).
 *
 * @param {string} arquivo
 */
export const limparTempVinheta = async (arquivo) => {
	if (!arquivo) return null;
	const { data } = await api.get("/radio_sync.php", {
		params: {
			limpar_temp_vinheta: arquivo,
			t: Date.now(),
		},
	});
	return data;
};

/**
 * Cancela o áudio temporário da locução IA da trinca (`radio_sync.php?cancelar_trinca_ia=1`).
 */
export const cancelarTrincaIa = async () => {
	const { data } = await api.get("/radio_sync.php", {
		params: {
			cancelar_trinca_ia: 1,
			limpar_temp_vinheta: "vinhetas/temp_trinca.mp3",
			t: Date.now(),
		},
	});
	return data;
};

/**
 * Lista o acervo indexado agrupado por gênero (`radio_sync.php?listar_generos=1`).
 *
 * @returns {Promise<Record<string, Array<{id: string, arquivo: string, nome: string, genero: string, url: string, duracao: number}>>>}
 */
export const fetchGenresCatalog = async () => {
	const { data } = await api.get("/radio_sync.php", {
		params: { listar_generos: "1", t: Date.now() },
	});

	if (data && typeof data === "object" && !Array.isArray(data)) {
		return data;
	}
	return {};
};

/**
 * Lista o catálogo de vinhetas, jingles e prefixos agrupado por subpasta (`radio_sync.php?listar_vinhetas=1`).
 *
 * @returns {Promise<Record<string, Array<{id: string, arquivo: string, nome: string, categoria: string, url: string}>>>}
 */
export const fetchVinhetasCatalog = async () => {
	const { data } = await api.get("/radio_sync.php", {
		params: { listar_vinhetas: "1", t: Date.now() },
	});

	if (data && typeof data === "object" && !Array.isArray(data)) {
		return data;
	}
	return {};
};

/**
 * Força a reconstrução do `playlist_cache.json` a partir da pasta `/musicas/` (`atualizar_acervo.php`).
 */
export const rebuildRadioCache = async () => {
	const { data } = await api.get("/atualizar_acervo.php", {
		params: { t: Date.now() },
	});
	return data;
};

/**
 * Agenda explicitamente a próxima música a tocar (`radio_sync.php?agendar_proxima=...`).
 *
 * @param {string} trackIdentifier ID, caminho de arquivo ou título da faixa
 * @param {Object} [options]
 * @param {boolean} [options.ignorarPedido=false] Quando true, não associa o agendamento a pedidos de ouvintes
 */
export const scheduleNextTrack = async (
	trackIdentifier,
	{ ignorarPedido = false } = {},
) => {
	const params = {
		agendar_proxima: trackIdentifier,
		t: Date.now(),
	};
	if (ignorarPedido) {
		params.ignorar_pedido = "1";
	}

	const { data } = await api.get("/radio_sync.php", { params });
	return data;
};

/**
 * Descarta a faixa que está agendada a seguir e sorteia outra imediatamente (`radio_sync.php?descartar_proxima=1`).
 */
export const discardNextTrack = async () => {
	const { data } = await api.get("/radio_sync.php", {
		params: {
			descartar_proxima: "1",
			t: Date.now(),
		},
	});
	return data;
};

/**
 * Envia um pedido musical do ouvinte (`POST /fazer_pedido.php`).
 *
 * @param {Object} payload
 * @param {string} payload.arquivo
 * @param {string} payload.titulo
 * @param {string} payload.nome
 * @param {string} [payload.recado]
 */
export const submitSongRequest = async ({
	arquivo,
	titulo,
	nome,
	recado = "",
}) => {
	const formData = new FormData();
	formData.append("arquivo", arquivo);
	formData.append("titulo", titulo);
	formData.append("nome", nome);
	formData.append("recado", recado);

	const { data } = await api.post("/fazer_pedido.php", formData);
	return data;
};

/**
 * Lista todos os pedidos dos ouvintes (`locutor.php?acao_pedidos=listar`).
 */
export const fetchListenerRequests = async () => {
	const { data } = await api.get("/locutor.php", {
		params: { acao_pedidos: "listar", t: Date.now() },
	});
	return data?.pedidos || [];
};

/**
 * Marca um pedido de ouvinte como já tocado (`locutor.php?acao_pedidos=marcar_tocado`).
 *
 * @param {string} chaveLinha
 */
export const markRequestAsPlayed = async (chaveLinha) => {
	const formData = new FormData();
	formData.append("chave_linha", chaveLinha);

	const { data } = await api.post(
		"/locutor.php?acao_pedidos=marcar_tocado",
		formData,
	);
	return data;
};

/**
 * Remove um pedido da fila (`locutor.php?acao_pedidos=remover`).
 *
 * @param {string} chaveLinha
 */
export const removeListenerRequest = async (chaveLinha) => {
	const formData = new FormData();
	formData.append("chave_linha", chaveLinha);

	const { data } = await api.post(
		"/locutor.php?acao_pedidos=remover",
		formData,
	);
	return data;
};

/**
 * Envia um bloco de voz gravado pelo locutor (`POST /api_locutor.php`).
 *
 * @param {Blob} audioBlob
 * @param {string} [password]
 */
export const uploadVoiceChunk = async (
	audioBlob,
	password = ENV.locutorPassword,
) => {
	const formData = new FormData();
	formData.append("acao", "enviar_audio");
	formData.append("senha", password);
	formData.append("audio", audioBlob, "voz.webm");

	const { data } = await api.post("/api_locutor.php", formData);
	return data;
};

/**
 * Baixa um chunk de voz do locutor com retry automático caso o arquivo ainda esteja sendo gravado.
 *
 * @param {number|string} chunkId
 * @param {number} [retries=2]
 * @returns {Promise<Blob|null>}
 */
export const fetchVoiceChunkBlob = async (chunkId, retries = 4) => {
	const url = `${resolveRadioAssetUrl(`voz_stream/chunk_${chunkId}.webm`)}?t=${Date.now()}`;

	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			const response = await fetch(url, { cache: "no-store" });
			if (!response.ok) {
				throw new Error("Chunk ainda não disponível");
			}
			const blob = await response.blob();
			if (blob.size < 200) {
				return null;
			}
			if (!blob.type || blob.type === "application/octet-stream") {
				return new Blob([blob], { type: "audio/webm" });
			}
			return blob;
		} catch {
			if (attempt < retries) {
				await new Promise((r) => setTimeout(r, 250));
			}
		}
	}

	return null;
};

/**
 * Gera áudio neural do recado do ouvinte via IA (Edge-TTS Neural pt-BR).
 *
 * @param {Object} params
 * @param {string} params.nome
 * @param {string} params.recado
 * @param {string} [params.titulo]
 * @param {string} [params.voz='pt-BR-FranciscaNeural']
 * @returns {Promise<{sucesso: boolean, arquivo: string, url: string, nome_vinheta: string, texto_falado: string}>}
 */
export const gerarVozRecadoIA = async ({
	nome,
	recado,
	titulo = "",
	voz = "pt-BR-ThalitaMultilingualNeural",
}) => {
	const formData = new FormData();
	formData.append("nome", nome);
	formData.append("recado", recado);
	formData.append("titulo", titulo);
	formData.append("voz", voz);

	const { data } = await api.post("/gerar_recado_ia.php", formData);
	return data;
};
