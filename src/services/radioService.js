import { ENV } from "@/config";
import { api, resolveRadioAssetUrl, REMOTE_BACKEND_URL } from "./api";

/**
 * Sincroniza o estado atual da programação da rádio (`radio_sync.php`).
 *
 * @param {Object} [options]
 * @param {boolean} [options.forcarProxima=false]
 * @param {string} [options.sessaoOuvinte=null]
 */
export const fetchRadioSync = async ({
	forcarProxima = false,
	faixaConcluida = false,
	sessaoOuvinte = null,
} = {}) => {
	const params = { t: Date.now() };
	if (forcarProxima) {
		params.forcar_proxima = "1";
	}
	if (faixaConcluida) {
		params.faixa_concluida = "1";
	}
	if (sessaoOuvinte) {
		params.sessao_ouvinte = sessaoOuvinte;
	}

	try {
		const { data } = await api.get("/radio_sync.php", { params });
		if (data && !data.error && data.faixa_atual?.url) {
			return data;
		}
	} catch (err) {
		console.warn(
			"[fetchRadioSync] Erro ao consultar radio_sync.php, acionando fallback estático:",
			err?.message,
		);
	}

	// Fallback de alta resiliência: lê diretamente no_ar.json ou playlist_cache.json se o PHP oscilar
	try {
		let noAr = null;
		try {
			const resNoAr = await api.get("/no_ar.json", { params: { t: Date.now() } });
			noAr = resNoAr.data;
		} catch {
			// ignora caso no_ar.json não esteja acessível
		}

		let playlist = [];
		try {
			const resCache = await api.get("/playlist_cache.json", { params: { t: Date.now() } });
			playlist = resCache.data?.todas || [];
		} catch {
			// ignora caso playlist_cache.json não esteja acessível
		}

		let grade = null;
		try {
			const resGrade = await api.get("/grade_programacao.json", { params: { t: Date.now() } });
			grade = resGrade.data?.programas || [];
		} catch {
			// ignora caso grade_programacao.json não esteja acessível
		}

		const agoraSeg = Math.floor(Date.now() / 1000);

		const obterProgramaAtual = () => {
			if (!grade || !Array.isArray(grade) || grade.length === 0) return null;
			const agora = new Date();
			const minutosAgora = agora.getHours() * 60 + agora.getMinutes();
			for (const prog of grade) {
				const [hI, mI] = (prog.inicio || "00:00").split(":").map(Number);
				const [hF, mF] = (prog.fim || "00:00").split(":").map(Number);
				const iniMin = hI * 60 + mI;
				let fimMin = hF * 60 + mF;
				if (fimMin === 0 && iniMin > 0) fimMin = 1440;
				if (fimMin > iniMin) {
					if (minutosAgora >= iniMin && minutosAgora < fimMin) return prog;
				} else {
					if (minutosAgora >= iniMin || minutosAgora < fimMin) return prog;
				}
			}
			return grade[0];
		};
		const progAtual = obterProgramaAtual();
		const progPayload = progAtual ? {
			id: progAtual.id || "",
			nome: progAtual.nome || "",
			slogan: progAtual.slogan || "",
			horario: `${progAtual.inicio} às ${progAtual.fim}`,
			inicio: progAtual.inicio || "",
			fim: progAtual.fim || "",
			apresentador: progAtual.apresentador || "",
			icone: progAtual.icone || "📻",
		} : null;

		if (noAr && noAr.nome && noAr.url) {
			const inicio = noAr.inicio_timestamp || agoraSeg;
			const decorrido = Math.max(0, agoraSeg - inicio);
			const duracao = noAr.duracao || 180;

			if (decorrido < duracao || playlist.length === 0) {
				return {
					timestamp_servidor: agoraSeg,
					ouvintes_conectados: 1,
					pico_hoje: 1,
					pausado: false,
					faixa_atual: {
						nome: noAr.nome,
						url: noAr.url,
						duracao: duracao,
					},
					offset_segundos: decorrido,
					proxima_faixa: {
						nome: noAr.proxima_nome || (playlist[0]?.nome ?? ""),
						url: noAr.proxima_url || (playlist[0]?.url ?? ""),
					},
					programa: progPayload,
				};
			}
		}

		if (playlist.length > 0) {
			const slotDuracao = 210;
			const indice = Math.floor(agoraSeg / slotDuracao) % playlist.length;
			const proximoIndice = (indice + 1) % playlist.length;
			const faixaAtual = playlist[indice];
			const proximaFaixa = playlist[proximoIndice];
			const offset = Math.max(0, agoraSeg % slotDuracao);

			return {
				timestamp_servidor: agoraSeg,
				ouvintes_conectados: 1,
				pico_hoje: 1,
				pausado: false,
				faixa_atual: {
					nome: faixaAtual.nome,
					url: faixaAtual.url,
					duracao: faixaAtual.duracao || slotDuracao,
				},
				offset_segundos: Math.min(offset, (faixaAtual.duracao || slotDuracao) - 5),
				proxima_faixa: {
					nome: proximaFaixa?.nome || "",
					url: proximaFaixa?.url || "",
				},
				programa: progPayload,
			};
		}
	} catch (fallbackErr) {
		console.error("[fetchRadioSync] Falha no fallback:", fallbackErr);
	}

	return null;
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
			limpar_temp_vinheta: "vinhetas/locucao_trinca.mp3",
			t: Date.now(),
		},
	});
	return data;
};

/**
 * Liga ou desliga a reprodução automática de voz IA nos recados dos ouvintes (`radio_sync.php?auto_recados=1|0`).
 *
 * @param {boolean} ativo
 */
export const alternarAutoRecadosIa = async (ativo) => {
	const { data } = await api.get("/radio_sync.php", {
		params: {
			auto_recados: ativo ? "1" : "0",
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
	try {
		const { data } = await api.get("/radio_sync.php", {
			params: { listar_generos: "1", t: Date.now() },
		});

		if (data && typeof data === "object" && !Array.isArray(data) && Object.keys(data).length > 0) {
			return data;
		}
	} catch (err) {
		console.warn("[fetchGenresCatalog] Falha ao consultar endpoint dinâmico, tentando fallback estático:", err?.message);
	}

	// Fallback de alta resiliência: lê diretamente o playlist_cache.json
	try {
		const resCache = await api.get("/playlist_cache.json", {
			params: { t: Date.now() },
		});
		if (resCache.data?.generos && typeof resCache.data.generos === "object" && !Array.isArray(resCache.data.generos)) {
			return resCache.data.generos;
		}
	} catch (err) {
		console.warn("[fetchGenresCatalog] Falha ao ler playlist_cache.json diretamente:", err?.message);
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
	{ ignorarPedido = false, tocarAgora = false } = {},
) => {
	const params = {
		agendar_proxima: trackIdentifier,
		t: Date.now(),
	};
	if (ignorarPedido) {
		params.ignorar_pedido = "1";
	}
	if (tocarAgora) {
		params.tocar_agora = "1";
		params.forcar_proxima = "1";
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
	voz = "alternar",
}) => {
	const params = {
		nome: nome || "Ouvinte",
		recado: recado || "",
		titulo: titulo || "",
		voz: voz || "alternar",
		t: Date.now(),
	};

	// 1. Tenta POST com URLSearchParams (application/x-www-form-urlencoded)
	try {
		const form = new URLSearchParams();
		form.append("nome", params.nome);
		form.append("recado", params.recado);
		form.append("titulo", params.titulo);
		form.append("voz", params.voz);

		const { data } = await api.post("/gerar_recado_ia.php", form, {
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			timeout: 25000,
		});
		if (data && data.sucesso && data.arquivo) {
			return data;
		}
		if (data && data.erro) {
			throw new Error(data.erro);
		}
	} catch (postErr) {
		console.warn("[gerarVozRecadoIA] Falha no POST, tentando GET transparente:", postErr?.message);
	}

	// 2. Fallback resiliente via GET (evita preflight OPTIONS e passa direto pelo proxy Netlify)
	try {
		const { data } = await api.get("/gerar_recado_ia.php", {
			params,
			timeout: 25000,
		});
		if (data && data.sucesso && data.arquivo) {
			return data;
		}
		if (data && data.erro) {
			throw new Error(data.erro);
		}
	} catch (getErr) {
		console.warn("[gerarVozRecadoIA] Falha no GET proxy, tentando URL remota direta:", getErr?.message);
	}

	// 3. Fallback final direto com fetch nativo no endpoint HTTPS de produção
	const urlDireta = new URL(`${REMOTE_BACKEND_URL}/gerar_recado_ia.php`);
	Object.entries(params).forEach(([k, v]) => urlDireta.searchParams.set(k, String(v)));

	const res = await fetch(urlDireta.toString(), {
		method: "GET",
		mode: "cors",
	});
	if (!res.ok) {
		throw new Error(`Servidor retornou status HTTP ${res.status}`);
	}
	const data = await res.json();
	if (data && data.sucesso && data.arquivo) {
		return data;
	}
	throw new Error(data?.erro || "Não foi possível gerar a voz neural do recado.");
};

/**
 * Envia um pulso de atividade (heartbeat) do ouvinte conectado (`radio_sync.php?ping_ouvinte=...`).
 *
 * @param {string} sessionId
 * @returns {Promise<{sucesso: boolean, ouvintes_conectados: number, pico_hoje: number}>}
 */
export const pingListenerHeartbeat = async (sessionId) => {
	if (!sessionId) return null;
	const { data } = await api.get("/radio_sync.php", {
		params: { ping_ouvinte: sessionId, t: Date.now() },
	});
	return data;
};

/**
 * Notifica a desconexão imediata do ouvinte (`radio_sync.php?desconectar_ouvinte=...`).
 *
 * @param {string} sessionId
 */
export const disconnectListener = (sessionId) => {
	if (!sessionId) return;
	const baseUrl = (ENV.apiUrl || "").replace(/\/+$/, "");
	const url = `${baseUrl}/radio_sync.php?desconectar_ouvinte=${encodeURIComponent(sessionId)}`;
	if (typeof navigator !== "undefined" && navigator.sendBeacon) {
		navigator.sendBeacon(url);
	} else {
		fetch(url, { keepalive: true }).catch(() => {});
	}
};

/**
 * Obtém os números consolidados de audiência da rádio (`radio_sync.php?obter_audiencia=1`).
 *
 * @returns {Promise<{sucesso: boolean, ouvintes_conectados: number, pico_hoje: number}>}
 */
export const fetchListenerAudience = async () => {
	const { data } = await api.get("/radio_sync.php", {
		params: { obter_audiencia: "1", t: Date.now() },
	});
	return data;
};

/**
 * Obtém os dados da Fila do Programa (Playlist do Locutor) (`radio_sync.php?obter_fila=1`).
 *
 * @returns {Promise<{sucesso: boolean, faixas: Array, total: number, duracao_total: number, duracao_formatada: string, modo: string}>}
 */
export const fetchFilaProgramacao = async () => {
	const { data } = await api.get("/radio_sync.php", {
		params: { obter_fila: "1", t: Date.now() },
	});
	return data;
};

/**
 * Adiciona uma faixa à Fila do Programa (`radio_sync.php?acao_fila=adicionar`).
 *
 * @param {Object} item
 * @returns {Promise<{sucesso: boolean, faixas: Array, total: number, duracao_formatada: string, modo: string}>}
 */
export const adicionarFaixaFilaProgramacao = async (item) => {
	const params = {
		acao_fila: "adicionar",
		id: item.id || "",
		nome: item.nome || "",
		duracao: item.duracao || 180,
		genero: item.genero || "Acervo",
		arquivo: item.arquivo || "",
		url: item.url || "",
		t: Date.now(),
	};
	try {
		const { data } = await api.get("/radio_sync.php", { params });
		if (data && data.sucesso) return data;
	} catch {
		// tenta fallback via POST
	}
	const { data } = await api.post("/radio_sync.php?acao_fila=adicionar", item);
	return data;
};

/**
 * Remove uma faixa da Fila do Programa por índice ou id (`radio_sync.php?acao_fila=remover`).
 *
 * @param {number} [indice]
 * @param {string} [id]
 * @returns {Promise<{sucesso: boolean, faixas: Array, total: number, duracao_formatada: string, modo: string}>}
 */
export const removerFaixaFilaProgramacao = async (indice, id) => {
	const params = { acao_fila: "remover", t: Date.now() };
	if (typeof indice === "number") params.indice = indice;
	if (id) params.id = id;
	const { data } = await api.get("/radio_sync.php", { params });
	return data;
};

/**
 * Reordena uma faixa na Fila do Programa (`radio_sync.php?acao_fila=mover`).
 *
 * @param {number} de
 * @param {number} para
 * @returns {Promise<{sucesso: boolean, faixas: Array, total: number, duracao_formatada: string, modo: string}>}
 */
export const moverFaixaFilaProgramacao = async (de, para) => {
	const { data } = await api.get("/radio_sync.php", {
		params: { acao_fila: "mover", de, para, t: Date.now() },
	});
	return data;
};

/**
 * Limpa todas as faixas da Fila do Programa (`radio_sync.php?acao_fila=limpar`).
 *
 * @returns {Promise<{sucesso: boolean, faixas: Array, total: number, duracao_formatada: string, modo: string}>}
 */
export const limparFilaProgramacao = async () => {
	const { data } = await api.get("/radio_sync.php", {
		params: { acao_fila: "limpar", t: Date.now() },
	});
	return data;
};

