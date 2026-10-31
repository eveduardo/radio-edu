import { useCallback, useEffect, useRef, useState } from "react";
import {
	adicionarFaixaFilaProgramacao,
	alternarAutoRecadosIa,
	cancelarTrincaIa,
	discardNextTrack,
	fetchFilaProgramacao,
	fetchGenresCatalog,
	fetchListenerAudience,
	fetchListenerRequests,
	fetchRadioSync,
	fetchVinhetasCatalog,
	gerarVozRecadoIA,
	limparFilaProgramacao,
	markRequestAsPlayed,
	moverFaixaFilaProgramacao,
	rebuildRadioCache,
	removerFaixaFilaProgramacao,
	removeListenerRequest,
	resolveRadioAssetUrl,
	scheduleNextTrack,
	setRadioMusicPaused,
	updateMesa,
	uploadVoiceChunk,
} from "@/services";

const normalizarUrlAudio = (u) => {
	if (!u) return "";
	try {
		const semQuery = String(u).split("?")[0].split("#")[0];
		const p = new URL(
			semQuery,
			typeof window !== "undefined"
				? window.location.href
				: "http://localhost",
		).pathname;
		try {
			return decodeURIComponent(p).toLowerCase().trim();
		} catch {
			return p.toLowerCase().trim();
		}
	} catch {
		try {
			return decodeURIComponent(String(u).split("?")[0])
				.toLowerCase()
				.trim();
		} catch {
			return String(u).split("?")[0].toLowerCase().trim();
		}
	}
};

const ehAudioEspecialIaOuVinheta = (urlOuTitulo) => {
	if (!urlOuTitulo) return false;
	const s = String(urlOuTitulo).toLowerCase();
	return (
		s.includes("hora_certa") ||
		s.includes("polly_") ||
		s.includes("locucao_") ||
		s.includes("trinca") ||
		s.includes("recado") ||
		s.includes("recadinho") ||
		s.includes("vinheta") ||
		s.includes("sequência de sucessos") ||
		s.includes("flash fm -") ||
		s.includes("temp_")
	);
};

const obterStreamMicrofone = async () => {
	if (navigator.mediaDevices?.getUserMedia) {
		const tentativas = [
			{
				audio: {
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true,
				},
			},
			{ audio: true },
		];

		for (const constraints of tentativas) {
			try {
				return await navigator.mediaDevices.getUserMedia(constraints);
			} catch {
				// Tenta a próxima configuração de áudio
			}
		}

		if (navigator.mediaDevices.enumerateDevices) {
			try {
				const devices = await navigator.mediaDevices.enumerateDevices();
				const audioInput = devices.find((d) => d.kind === "audioinput");
				if (audioInput?.deviceId) {
					return await navigator.mediaDevices.getUserMedia({
						audio: { deviceId: { ideal: audioInput.deviceId } },
					});
				}
			} catch {
				// ignore
			}
		}
	}

	const legacyGetUserMedia =
		navigator.getUserMedia ||
		navigator.webkitGetUserMedia ||
		navigator.mozGetUserMedia;

	if (legacyGetUserMedia) {
		try {
			return await new Promise((resolve, reject) => {
				legacyGetUserMedia.call(navigator, { audio: true }, resolve, reject);
			});
		} catch {
			return null;
		}
	}

	return null;
};

const escolherMimeGravacao = () => {
	if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) {
		return "";
	}
	const candidatos = [
		"audio/webm;codecs=opus",
		"audio/webm",
		"audio/mp4",
		"audio/ogg;codecs=opus",
	];
	return candidatos.find((m) => MediaRecorder.isTypeSupported(m)) || "";
};

export const useLocutorMesa = () => {
	const [aoVivo, setAoVivo] = useState(false);
	const [faderMic, setFaderMic] = useState(1);
	const [faderMusica, setFaderMusica] = useState(1);
	const [faderVinheta, setFaderVinheta] = useState(1);
	const [musicaPausada, setMusicaPausada] = useState(false);
	const [ouvindoProgramacao, setOuvindoProgramacao] = useState(false);
	const [ouvindoVinheta, setOuvindoVinheta] = useState(false);

	const [musicaAtual, setMusicaAtual] = useState("A carregar faixa...");
	const [proximaAtual, setProximaAtual] = useState("A seguir: --");
	const [tempoRestanteSeg, setTempoRestanteSeg] = useState(0);
	const [transicaoEmAndamento, setTransicaoEmAndamento] = useState(false);
	const [ouvintesConectados, setOuvintesConectados] = useState(0);
	const [picoHoje, setPicoHoje] = useState(0);
	const [programaAtual, setProgramaAtual] = useState(null);
	const [proximoPrograma, setProximoPrograma] = useState(null);

	const [pedidos, setPedidos] = useState([]);
	const [filaPrograma, setFilaPrograma] = useState(() => {
		try {
			const salvo =
				typeof localStorage !== "undefined"
					? localStorage.getItem("radio_fila_programa")
					: null;
			if (salvo) {
				const parsed = JSON.parse(salvo);
				if (parsed && Array.isArray(parsed.faixas)) return parsed;
			}
		} catch {}
		return {
			faixas: [],
			total: 0,
			duracao_formatada: "~0 min",
			modo: "auto_dj",
		};
	});
	const filaProgramaRef = useRef(filaPrograma);
	filaProgramaRef.current = filaPrograma;
	const [mapaGeneros, setMapaGeneros] = useState({});
	const [mapaVinhetas, setMapaVinhetas] = useState({});
	const [vinhetaSelecionada, setVinhetaSelecionada] = useState(null);
	const [vinhetaNoArId, setVinhetaNoArId] = useState(null);
	const [vinhetaNoArNome, setVinhetaNoArNome] = useState("");
	const [tempoRestanteVinhetaSeg, setTempoRestanteVinhetaSeg] = useState(0);
	const [atualizandoAcervo, setAtualizandoAcervo] = useState(false);
	const [gerandoVozIaChave, setGerandoVozIaChave] = useState(null);
	const [blocoTrinca, setBlocoTrinca] = useState({
		contagem: 0,
		total: 3,
		historico: [],
	});
	const [autoTrincaHabilitado, setAutoTrincaHabilitado] = useState(true);
	const autoTrincaHabilitadoRef = useRef(true);
	autoTrincaHabilitadoRef.current = autoTrincaHabilitado;

	const [autoRecadosHabilitado, setAutoRecadosHabilitado] = useState(() => {
		const salvo =
			typeof localStorage !== "undefined"
				? localStorage.getItem("autoRecadosHabilitado")
				: null;
		return salvo !== null ? salvo === "true" : true;
	});
	const autoRecadosHabilitadoRef = useRef(autoRecadosHabilitado);
	autoRecadosHabilitadoRef.current = autoRecadosHabilitado;
	const ultimoAnuncioTrincaRef = useRef("");
	const liberarVinhetaNoArRef = useRef(null);

	const [avisoModal, setAvisoModal] = useState(null);
	const [confirmacaoModal, setConfirmacaoModal] = useState(null);

	const aoVivoRef = useRef(aoVivo);
	aoVivoRef.current = aoVivo;
	const faderMicRef = useRef(faderMic);
	faderMicRef.current = faderMic;
	const faderMusicaRef = useRef(faderMusica);
	faderMusicaRef.current = faderMusica;
	const faderMusicaAnteriorRef = useRef(null);
	const faderVinhetaRef = useRef(faderVinheta);
	faderVinhetaRef.current = faderVinheta;
	const musicaPausadaRef = useRef(musicaPausada);
	musicaPausadaRef.current = musicaPausada;
	const ouvindoProgramacaoRef = useRef(ouvindoProgramacao);
	ouvindoProgramacaoRef.current = ouvindoProgramacao;
	const ouvindoVinhetaRef = useRef(ouvindoVinheta);
	ouvindoVinhetaRef.current = ouvindoVinheta;
	const vinhetaSelecionadaRef = useRef(vinhetaSelecionada);
	vinhetaSelecionadaRef.current = vinhetaSelecionada;
	const transicaoEmAndamentoRef = useRef(transicaoEmAndamento);
	transicaoEmAndamentoRef.current = transicaoEmAndamento;
	const pedidosRef = useRef(pedidos);
	pedidosRef.current = pedidos;

	const monitorAudioRef = useRef(null);
	const vinhetaPreviewAudioRef = useRef(null);
	const vinhetaTimerIntervalRef = useRef(null);
	const fimVinhetaNoArMsRef = useRef(0);
	const urlFaixaNoArRef = useRef("");
	const proximaNomeServidorRef = useRef("");
	const temAgendamentoExplicitoRef = useRef(false);
	const musicaPausadaPorVinhetaRef = useRef(false);

	const streamMicRef = useRef(null);
	const micAudioCtxRef = useRef(null);
	const micAnalyserRef = useRef(null);
	const micDataArrayRef = useRef(null);
	const gravadorMediaRef = useRef(null);
	const chunksAtuaisRef = useRef([]);
	const loopDeteccaoIdRef = useRef(null);

	const inicioGravacaoBlocoRef = useRef(0);
	const timestampUltimoSomRef = useRef(0);
	const gravandoBlocoRef = useRef(false);
	const houveFalaNoBlocoRef = useRef(false);
	const debounceFirebaseRef = useRef(null);

	const duracaoAtualRef = useRef(0);
	const offsetAtualRef = useRef(0);
	const baseOffsetRef = useRef(0);
	const timestampSyncRef = useRef(Date.now());
	const viradaConsultadaRef = useRef(false);
	const acervoMusicasGlobalRef = useRef([]);
	const ultimaTrocaLocalRef = useRef(0);
	const faixaLocalNomeRef = useRef("");
	const executarViradaFilaParaNoArRef = useRef(null);

	const aplicarVolumeMonitor = useCallback((vol) => {
		const audio = monitorAudioRef.current;
		if (!audio) return;
		try {
			const clamped = Math.max(0, Math.min(1, vol));
			if (Math.abs(audio.volume - clamped) > 0.02) {
				audio.volume = clamped;
			}
		} catch {
			// ignore
		}
	}, []);

	const aplicarVolumeVinhetaPreview = useCallback((vol) => {
		const audio = vinhetaPreviewAudioRef.current;
		if (!audio) return;
		try {
			const clamped = Math.max(0, Math.min(1, vol));
			if (Math.abs(audio.volume - clamped) > 0.02) {
				audio.volume = clamped;
			}
		} catch {
			// ignore
		}
	}, []);

	const sincronizarMesaFirebase = useCallback((imediato = false) => {
		const enviar = () => {
			const tsAgora = Date.now() / 1000;
			updateMesa({
				ao_vivo: aoVivoRef.current,
				mic_volume: Math.max(0, Math.min(1, faderMicRef.current)),
				musica_tocando: !musicaPausadaRef.current,
				musica_volume: Math.max(0, Math.min(1, faderMusicaRef.current)),
				vinheta_volume: Math.max(0, Math.min(1, faderVinhetaRef.current)),
				timestamp: tsAgora,
			}).catch(() => {});
		};

		if (imediato) {
			if (debounceFirebaseRef.current) {
				clearTimeout(debounceFirebaseRef.current);
				debounceFirebaseRef.current = null;
			}
			enviar();
		} else {
			if (!debounceFirebaseRef.current) {
				debounceFirebaseRef.current = setTimeout(() => {
					debounceFirebaseRef.current = null;
					enviar();
				}, 80);
			}
		}
	}, []);

	const handleChangeFaderMic = useCallback(
		(val, imediato = false) => {
			const num = Math.max(0, Math.min(1, parseFloat(val)));
			faderMicRef.current = num;
			setFaderMic(num);
			sincronizarMesaFirebase(imediato);
		},
		[sincronizarMesaFirebase],
	);

	const handleChangeFaderMusica = useCallback(
		(val, imediato = false) => {
			const num = Math.max(0, Math.min(1, parseFloat(val)));
			faderMusicaRef.current = num;
			setFaderMusica(num);
			aplicarVolumeMonitor(num);
			sincronizarMesaFirebase(imediato);
		},
		[aplicarVolumeMonitor, sincronizarMesaFirebase],
	);

	// CH-3: controla exclusivamente o volume de pré-escuta de vinhetas do locutor
	const handleChangeFaderVinheta = useCallback(
		(val) => {
			const num = Math.max(0, Math.min(1, parseFloat(val)));
			faderVinhetaRef.current = num;
			setFaderVinheta(num);
			aplicarVolumeVinhetaPreview(num);
		},
		[aplicarVolumeVinhetaPreview],
	);


	const liberarRecursosMic = useCallback(() => {
		if (streamMicRef.current) {
			streamMicRef.current.getTracks().forEach((track) => track.stop());
			streamMicRef.current = null;
		}

		if (micAudioCtxRef.current) {
			micAudioCtxRef.current.close().catch(() => {});
			micAudioCtxRef.current = null;
			micAnalyserRef.current = null;
			micDataArrayRef.current = null;
		}
	}, []);

	const iniciarNovoBloco = useCallback(() => {
		if (!aoVivoRef.current || !streamMicRef.current) return;
		if (typeof MediaRecorder === "undefined") return;

		chunksAtuaisRef.current = [];
		const mime = escolherMimeGravacao();

		let gravador;
		try {
			gravador = mime
				? new MediaRecorder(streamMicRef.current, {
						mimeType: mime,
						audioBitsPerSecond: 64000,
					})
				: new MediaRecorder(streamMicRef.current);
		} catch {
			try {
				gravador = new MediaRecorder(streamMicRef.current);
			} catch {
				return;
			}
		}

		gravadorMediaRef.current = gravador;

		gravador.ondataavailable = (e) => {
			if (e.data && e.data.size > 0) {
				chunksAtuaisRef.current.push(e.data);
			}
		};

		gravador.onstop = () => {
			const chunksParaEnviar = chunksAtuaisRef.current.slice();
			chunksAtuaisRef.current = [];
			const teveFala = houveFalaNoBlocoRef.current;
			houveFalaNoBlocoRef.current = false;

			if (chunksParaEnviar.length > 0 && teveFala) {
				const audioBlob = new Blob(chunksParaEnviar, {
					type: mime || "audio/webm",
				});

				if (audioBlob.size > 300) {
					uploadVoiceChunk(audioBlob)
						.then((res) => {
							if (res?.chunk) {
								updateMesa({ ultimo_chunk: res.chunk }).catch(() => {});
							}
						})
						.catch(() => {});
				}
			}

			if (aoVivoRef.current && streamMicRef.current) {
				iniciarNovoBloco();
			} else {
				liberarRecursosMic();
			}
		};

		try {
			gravador.start(200);
			inicioGravacaoBlocoRef.current = Date.now();
			timestampUltimoSomRef.current = Date.now();
			houveFalaNoBlocoRef.current = false;
			gravandoBlocoRef.current = true;
		} catch {
			// ignore
		}
	}, [liberarRecursosMic]);

	const monitorarAtividadeVoz = useCallback(() => {
		if (!aoVivoRef.current || !micAnalyserRef.current) return;

		const analyser = micAnalyserRef.current;
		const data = new Uint8Array(analyser.frequencyBinCount);
		analyser.getByteFrequencyData(data);

		let soma = 0;
		for (let i = 0; i < data.length; i++) {
			soma += data[i];
		}
		const volumeMedio = soma / data.length;

		const agora = Date.now();
		const duracaoAtual = agora - inicioGravacaoBlocoRef.current;

		if (volumeMedio > 9) {
			timestampUltimoSomRef.current = agora;
			houveFalaNoBlocoRef.current = true;
		}

		const tempoEmSilencio = agora - timestampUltimoSomRef.current;
		const houveFala = houveFalaNoBlocoRef.current;

		// Se ainda não houve fala no bloco (apenas silêncio do estúdio):
		if (!houveFala && duracaoAtual >= 2500) {
			inicioGravacaoBlocoRef.current = agora;
			timestampUltimoSomRef.current = agora;
			loopDeteccaoIdRef.current = requestAnimationFrame(monitorarAtividadeVoz);
			return;
		}

		// CORTE INTELIGENTE POR PAUSAS NA FALA (VAD):
		// 1. Pausa natural entre frases/respiro: após 1.8s gravado, ao detectar pausa de 450ms corta com perfeição sem fatiar palavras
		const cortePausaNatural = houveFala && duracaoAtual >= 1800 && tempoEmSilencio >= 450;
		// 2. Fala mais acelerada: após 5.0s, qualquer micro-pausa de 250ms já aproveita para cortar
		const corteMicroPausa = houveFala && duracaoAtual >= 5000 && tempoEmSilencio >= 250;
		// 3. Teto seguro: após 8.5s, aproveita micro-pausa de 150ms
		const corteTetoSeguro = houveFala && duracaoAtual >= 8500 && tempoEmSilencio >= 150;
		// 4. Limite de emergência: 11s caso o locutor fale sem nenhuma pausa
		const corteLimiteMaximo = duracaoAtual >= 11000;

		if (gravandoBlocoRef.current && (cortePausaNatural || corteMicroPausa || corteTetoSeguro || corteLimiteMaximo)) {
			gravandoBlocoRef.current = false;
			if (
				gravadorMediaRef.current &&
				gravadorMediaRef.current.state !== "inactive"
			) {
				try {
					gravadorMediaRef.current.stop();
				} catch {
					// ignore
				}
			}
		}

		loopDeteccaoIdRef.current = requestAnimationFrame(monitorarAtividadeVoz);
	}, []);

	const desligarMicrofone = useCallback(() => {
		aoVivoRef.current = false;
		setAoVivo(false);
		gravandoBlocoRef.current = false;

		if (loopDeteccaoIdRef.current) {
			cancelAnimationFrame(loopDeteccaoIdRef.current);
			loopDeteccaoIdRef.current = null;
		}

		if (
			gravadorMediaRef.current &&
			gravadorMediaRef.current.state !== "inactive"
		) {
			try {
				// O onstop enviará o bloco final e em seguida chamará liberarRecursosMic()
				gravadorMediaRef.current.stop();
			} catch {
				liberarRecursosMic();
			}
		} else {
			liberarRecursosMic();
		}

		sincronizarMesaFirebase(true);
	}, [liberarRecursosMic, sincronizarMesaFirebase]);

	const alternarMicrofone = useCallback(async () => {
		if (!aoVivoRef.current) {
			if (!navigator.mediaDevices?.getUserMedia) {
				setAvisoModal({
					icone: "🔒",
					titulo: "Conexão Segura Necessária (HTTPS)",
					mensagem:
						"O microfone no navegador exige uma Conexão Segura (HTTPS) ou acesso local por 'localhost'.\n\n" +
						"• Se estiver no Computador: acesse diretamente por http://localhost:5173/locutor.\n" +
						"• Se estiver no Celular via IP: ative a flag chrome://flags/#unsafely-treat-insecure-origin-as-secure no Chrome adicionando a URL da rádio, ou configure HTTPS.",
				});
				return;
			}

			const stream = await obterStreamMicrofone();
			if (!stream) {
				setAvisoModal({
					icone: "🎤",
					titulo: "Permissão do Microfone",
					mensagem:
						"Não foi possível acessar o microfone.\nVerifique se a permissão de Microfone está liberada no ícone ao lado da barra de endereço do navegador.",
				});
				return;
			}

			streamMicRef.current = stream;

			try {
				const AudioCtx = window.AudioContext || window.webkitAudioContext;
				if (AudioCtx) {
					const ctx = new AudioCtx();
					if (ctx.state === "suspended") {
						ctx.resume().catch(() => {});
					}
					const analyser = ctx.createAnalyser();
					analyser.fftSize = 64;
					const dataArray = new Uint8Array(analyser.frequencyBinCount);

					const micSource = ctx.createMediaStreamSource(stream);
					micSource.connect(analyser);

					micAudioCtxRef.current = ctx;
					micAnalyserRef.current = analyser;
					micDataArrayRef.current = dataArray;
				}
			} catch {
				// Continua com a gravação mesmo se o AnalyserNode falhar
			}

			aoVivoRef.current = true;
			setAoVivo(true);
			sincronizarMesaFirebase(true);

			iniciarNovoBloco();
			monitorarAtividadeVoz();
		} else {
			desligarMicrofone();
		}
	}, [
		desligarMicrofone,
		iniciarNovoBloco,
		monitorarAtividadeVoz,
		sincronizarMesaFirebase,
	]);

	useEffect(() => {
		return () => {
			if (aoVivoRef.current) {
				desligarMicrofone();
			}
		};
	}, [desligarMicrofone]);

	const aplicarDadosSyncNaMesa = useCallback(
		(data) => {
			if (data?.faixa_atual) {
				if (Date.now() - ultimaTrocaLocalRef.current < 4000 && faixaLocalNomeRef.current) {
					if (data.faixa_atual.nome !== faixaLocalNomeRef.current) {
						return;
					}
				}
				setMusicaAtual(data.faixa_atual.nome || "Sem título");
				if (filaProgramaRef.current?.faixas?.length > 0) {
					const proxFila = filaProgramaRef.current.faixas[0];
					setProximaAtual(`A seguir (Roteiro): ${proxFila.nome}`);
					proximaNomeServidorRef.current = proxFila.nome;
				} else {
					const nomeProx = data.proxima_faixa?.nome || "";
					proximaNomeServidorRef.current = nomeProx;
					setProximaAtual(`A seguir: ${nomeProx || "--"}`);
				}
				duracaoAtualRef.current = data.faixa_atual.duracao || 180;
				baseOffsetRef.current = data.offset_segundos || 0;
				timestampSyncRef.current = Date.now();
				offsetAtualRef.current = baseOffsetRef.current;
				setTempoRestanteSeg(
					Math.max(0, duracaoAtualRef.current - offsetAtualRef.current),
				);

				if (typeof data.pausado === "boolean") {
					musicaPausadaRef.current = data.pausado;
					setMusicaPausada(data.pausado);
				}

				if (typeof data.ouvintes_conectados !== "undefined") {
					setOuvintesConectados(Number(data.ouvintes_conectados) || 0);
				}
				if (typeof data.pico_hoje !== "undefined") {
					setPicoHoje(Number(data.pico_hoje) || 0);
				}
				if (data.programa) {
					setProgramaAtual(data.programa);
				}
				if (data.proximo_programa) {
					setProximoPrograma(data.proximo_programa);
				}

				if (data.bloco_trinca) {
					setBlocoTrinca({
						contagem: data.bloco_trinca.contagem || 0,
						total: data.bloco_trinca.total || 3,
						historico: data.bloco_trinca.historico || [],
						anuncio_pendente: data.bloco_trinca.anuncio_pendente || null,
						texto_anuncio: data.bloco_trinca.texto_anuncio || null,
						faixas:
							data.bloco_trinca.faixas ||
							data.bloco_trinca.historico ||
							[],
					});

					if (
						data.bloco_trinca.anuncio_pendente &&
						data.bloco_trinca.anuncio_pendente !== ultimoAnuncioTrincaRef.current
					) {
						ultimoAnuncioTrincaRef.current = data.bloco_trinca.anuncio_pendente;
					}
				}

				if (data.fila_programacao) {
					setFilaPrograma(data.fila_programacao);
				}

				const novaUrl = resolveRadioAssetUrl(data.faixa_atual.url || "");
				const audio = monitorAudioRef.current;

				if (novaUrl) {
					const urlAtualNorm = normalizarUrlAudio(urlFaixaNoArRef.current);
					const novaUrlNorm = normalizarUrlAudio(novaUrl);
					const trocouFaixa = !urlAtualNorm || urlAtualNorm !== novaUrlNorm;
					urlFaixaNoArRef.current = novaUrl;

					if (trocouFaixa) {
						viradaConsultadaRef.current = false;
					}

					if (ouvindoProgramacaoRef.current && audio) {
						audio.onended = () => {
							if (filaProgramaRef.current?.faixas?.length > 0) {
								executarViradaFilaParaNoArRef.current?.();
							} else {
								monitorarMusicaNoAr();
							}
						};

						const eAudioEspecial = ehAudioEspecialIaOuVinheta(novaUrl) || ehAudioEspecialIaOuVinheta(data.faixa_atual.nome);

						const precisaCarregarNoAudio =
							trocouFaixa ||
							!audio.src ||
							normalizarUrlAudio(audio.src) !== novaUrlNorm;

						if (precisaCarregarNoAudio) {
							audio.src = novaUrl;
							aplicarVolumeMonitor(faderMusicaRef.current);
							const offset = Math.max(0, data.offset_segundos || 0);
							const posicionar = () => {
								if (offset > 2 && !eAudioEspecial) {
									try {
										audio.currentTime = offset;
									} catch {
										// ignore
									}
								}
							};
							if (audio.readyState >= 1) {
								posicionar();
							} else {
								audio.addEventListener("loadedmetadata", posicionar, {
									once: true,
								});
							}
							if (!musicaPausadaRef.current) {
								audio.play().catch(() => {});
							} else {
								audio.pause();
							}
						} else if (musicaPausadaRef.current) {
							if (!audio.paused) {
								audio.pause();
							}
						} else if (audio.paused) {
							// Se é a mesma faixa e apenas estava pausado, NÃO reseta audio.src! Apenas despausa
							aplicarVolumeMonitor(faderMusicaRef.current);
							audio.play().catch(() => {});
						} else if (
							audio.readyState >= 2 &&
							!eAudioEspecial &&
							Math.abs(audio.currentTime - (data.offset_segundos || 0)) > 25
						) {
							try {
								audio.currentTime = Math.max(0, data.offset_segundos || 0);
							} catch {
								// ignore
							}
						}
					}
				}
			}
		},
		[aplicarVolumeMonitor],
	);

	const alternarPausaMusicaNoAr = useCallback(async () => {
		const novoPausado = !musicaPausadaRef.current;
		musicaPausadaRef.current = novoPausado;
		setMusicaPausada(novoPausado);

		const audio = monitorAudioRef.current;
		if (audio) {
			if (novoPausado) {
				audio.pause();
			} else if (ouvindoProgramacaoRef.current && audio.src) {
				aplicarVolumeMonitor(faderMusicaRef.current);
				audio.play().catch(() => {});
			}
		}

		// Notifica imediatamente os ouvintes via Firebase
		updateMesa({ musica_tocando: !novoPausado }).catch(() => {});

		try {
			const res = await setRadioMusicPaused(novoPausado);
			if (res && typeof res.offset_segundos === "number") {
				offsetAtualRef.current = res.offset_segundos;
				if (res.duracao) {
					duracaoAtualRef.current = res.duracao;
				}
				setTempoRestanteSeg(
					Math.max(0, duracaoAtualRef.current - offsetAtualRef.current),
				);
			}
		} catch {
			// ignore
		}
	}, [aplicarVolumeMonitor]);

	const alternarEscutaProgramacao = useCallback(async () => {
		const audio = monitorAudioRef.current;
		if (!ouvindoProgramacaoRef.current) {
			ouvindoProgramacaoRef.current = true;
			setOuvindoProgramacao(true);
			aplicarVolumeMonitor(faderMusicaRef.current);

			try {
				const data = await fetchRadioSync();
				aplicarDadosSyncNaMesa(data);
			} catch {
				if (audio && urlFaixaNoArRef.current && !musicaPausadaRef.current) {
					audio.src = urlFaixaNoArRef.current;
					audio.play().catch(() => {});
				}
			}
		} else {
			ouvindoProgramacaoRef.current = false;
			setOuvindoProgramacao(false);
			audio?.pause();
		}
	}, [aplicarDadosSyncNaMesa, aplicarVolumeMonitor]);

	const monitorarMusicaNoAr = useCallback(async () => {
		try {
			const data = await fetchRadioSync();
			aplicarDadosSyncNaMesa(data);
		} catch {
			// Ignora erro temporário de rede
		}
	}, [aplicarDadosSyncNaMesa]);

	useEffect(() => {
		monitorarMusicaNoAr();
		// Consulta contínua da mesa: a cada 5 segundos
		const syncInterval = setInterval(monitorarMusicaNoAr, 5000);

		const checarAudiencia = async () => {
			try {
				const audData = await fetchListenerAudience();
				if (audData && typeof audData.ouvintes_conectados !== "undefined") {
					setOuvintesConectados(Number(audData.ouvintes_conectados) || 0);
				}
				if (audData && typeof audData.pico_hoje !== "undefined") {
					setPicoHoje(Number(audData.pico_hoje) || 0);
				}
			} catch {
				// ignore
			}
		};

		checarAudiencia();
		const audInterval = setInterval(checarAudiencia, 10000);

		const countdownInterval = setInterval(() => {
			if (musicaPausadaRef.current) return;

			const decorridoLocal = Math.floor(
				(Date.now() - timestampSyncRef.current) / 1000,
			);
			const offsetReal = baseOffsetRef.current + decorridoLocal;
			offsetAtualRef.current = offsetReal;
			const restante = Math.max(
				0,
				duracaoAtualRef.current - offsetReal,
			);
			setTempoRestanteSeg(restante);

			// Quando faltar <= 1s, vira automaticamente para a fila do programa ou consulta o servidor sem spam
			if (restante <= 1 && !viradaConsultadaRef.current && !musicaPausadaRef.current) {
				viradaConsultadaRef.current = true;
				if (filaProgramaRef.current?.faixas?.length > 0) {
					executarViradaFilaParaNoArRef.current?.();
				} else {
					monitorarMusicaNoAr();
				}
			}
		}, 1000);

		const onVisibility = () => {
			if (!document.hidden) {
				monitorarMusicaNoAr();
			}
		};
		document.addEventListener("visibilitychange", onVisibility);

		return () => {
			clearInterval(syncInterval);
			clearInterval(audInterval);
			clearInterval(countdownInterval);
			document.removeEventListener("visibilitychange", onVisibility);
		};
	}, [monitorarMusicaNoAr]);

	const transicaoSuaveProxima = useCallback(async () => {
		if (transicaoEmAndamentoRef.current) return;
		transicaoEmAndamentoRef.current = true;
		setTransicaoEmAndamento(true);

		musicaPausadaRef.current = false;
		setMusicaPausada(false);

		const volInicial = faderMusicaAnteriorRef.current ?? faderMusicaRef.current;
		faderMusicaAnteriorRef.current = null;

		try {
			if (filaProgramaRef.current?.faixas?.length > 0) {
				await executarViradaFilaParaNoArRef.current?.();
			} else {
				// Se não houve agendamento manual nem pedido pendente, fixa a faixa exibida em "A seguir"
				// antes de virar a faixa para que o servidor não faça um sorteio aleatório diferente do visor
				const haPedidoPendente = pedidosRef.current.some((p) => !p.tocado);
				const nomeProximaVisor = proximaNomeServidorRef.current
					.replace(/\s*\([^)]+\)\s*$/, "")
					.trim();

				if (
					!temAgendamentoExplicitoRef.current &&
					!haPedidoPendente &&
					nomeProximaVisor
				) {
					await scheduleNextTrack(nomeProximaVisor, {
						ignorarPedido: true,
					}).catch(() => {});
				}

				// 1. Vira a faixa no servidor e atualiza o visor da mesa
				const novoEstado = await fetchRadioSync({ forcarProxima: true });
				temAgendamentoExplicitoRef.current = false;
				aplicarDadosSyncNaMesa(novoEstado);
			}
		} catch {
			// ignore
		}

		// 2. Notifica todos os ouvintes via Firebase para fazerem o crossfade para a nova faixa do servidor
		await updateMesa({
			musica_tocando: true,
			forcar_troca: Date.now(),
		}).catch(() => {});

		// 3. Anima o fader na interface do locutor
		const passos = 6;
		const decremento = volInicial / passos;

		for (let i = 1; i <= passos; i++) {
			await new Promise((r) => setTimeout(r, 200));
			const novoVol = Number(Math.max(0, volInicial - decremento * i).toFixed(2));
			faderMusicaRef.current = novoVol;
			setFaderMusica(novoVol);
			aplicarVolumeMonitor(novoVol);
		}

		await new Promise((r) => setTimeout(r, 200));

		for (let i = 1; i <= passos; i++) {
			await new Promise((r) => setTimeout(r, 120));
			const volSubindo = Number(
				Math.min(volInicial, (volInicial / passos) * i).toFixed(2),
			);
			faderMusicaRef.current = volSubindo;
			setFaderMusica(volSubindo);
			aplicarVolumeMonitor(volSubindo);
		}

		sincronizarMesaFirebase(true);
		transicaoEmAndamentoRef.current = false;
		setTransicaoEmAndamento(false);
	}, [aplicarDadosSyncNaMesa, aplicarVolumeMonitor, sincronizarMesaFirebase]);

	const carregarPedidos = useCallback(async () => {
		try {
			const lista = await fetchListenerRequests();
			setPedidos(lista);
		} catch {
			// ignore
		}
	}, []);

	useEffect(() => {
		carregarPedidos();
		const interval = setInterval(carregarPedidos, 10000);
		return () => clearInterval(interval);
	}, [carregarPedidos]);

	const carregarAcervo = useCallback(async () => {
		try {
			const generos = await fetchGenresCatalog();
			setMapaGeneros(generos);

			const todas = [];
			Object.values(generos).forEach((faixas) => {
				if (Array.isArray(faixas)) {
					faixas.forEach((f) => todas.push(f));
				}
			});
			acervoMusicasGlobalRef.current = todas;
		} catch {
			setMapaGeneros({});
		}
	}, []);

	const carregarVinhetas = useCallback(async () => {
		try {
			const vinhetas = await fetchVinhetasCatalog();
			setMapaVinhetas(vinhetas);
		} catch {
			setMapaVinhetas({});
		}
	}, []);

	useEffect(() => {
		carregarAcervo();
		carregarVinhetas();
	}, [carregarAcervo, carregarVinhetas]);

	const pararEscutaVinheta = useCallback(() => {
		const audio = vinhetaPreviewAudioRef.current;
		if (audio) {
			audio.pause();
			try {
				audio.currentTime = 0;
				audio.src = "";
			} catch {
				// ignore
			}
		}
		ouvindoVinhetaRef.current = false;
		setOuvindoVinheta(false);
		// Mantém vinhetaSelecionada no CH-3 para o locutor poder dar AR ou ouvir novamente
	}, []);

	const carregarVinhetaNoCanal = useCallback((vinheta) => {
		if (!vinheta) return;
		if (vinhetaTimerIntervalRef.current) {
			clearInterval(vinhetaTimerIntervalRef.current);
			vinhetaTimerIntervalRef.current = null;
		}
		setVinhetaNoArId(null);
		setVinhetaNoArNome("");
		setTempoRestanteVinhetaSeg(0);
		if (ouvindoVinhetaRef.current) {
			const audio = vinhetaPreviewAudioRef.current;
			if (audio) {
				try {
					audio.pause();
					audio.currentTime = 0;
					audio.src = "";
				} catch {
					// ignore
				}
			}
			ouvindoVinhetaRef.current = false;
			setOuvindoVinheta(false);
		}
		vinhetaSelecionadaRef.current = vinheta;
		setVinhetaSelecionada(vinheta);

		// Pré-carrega o áudio imediatamente no navegador para disparo instantâneo ao clicar em AR
		const url = resolveRadioAssetUrl(vinheta.url || vinheta.arquivo || "");
		const audio = vinhetaPreviewAudioRef.current;
		if (audio && url) {
			try {
				audio.src = url;
				audio.preload = "auto";
				audio.load();
			} catch {
				// ignore
			}
		}
	}, []);

	const ouvirVinhetaNoCanal = useCallback(
		(vinheta) => {
			if (!vinheta) return;
			const audio = vinhetaPreviewAudioRef.current;
			if (!audio) return;

			if (
				ouvindoVinhetaRef.current &&
				vinhetaSelecionadaRef.current?.id === vinheta.id
			) {
				pararEscutaVinheta();
				return;
			}

			vinhetaSelecionadaRef.current = vinheta;
			setVinhetaSelecionada(vinheta);

			const url = resolveRadioAssetUrl(vinheta.url || vinheta.arquivo || "");
			if (!url) return;

			audio.src = url;
			aplicarVolumeVinhetaPreview(faderVinhetaRef.current);
			ouvindoVinhetaRef.current = true;
			setOuvindoVinheta(true);

			audio.play().catch(() => {
				ouvindoVinhetaRef.current = false;
				setOuvindoVinheta(false);
			});
		},
		[aplicarVolumeVinhetaPreview, pararEscutaVinheta],
	);

	const alternarEscutaVinhetaCanal = useCallback(() => {
		if (ouvindoVinhetaRef.current) {
			pararEscutaVinheta();
			return;
		}

		const alvo = vinhetaSelecionadaRef.current;
		if (alvo) {
			ouvirVinhetaNoCanal(alvo);
		} else {
			setAvisoModal({
				icone: "🎧",
				titulo: "Pré-escuta CH-3",
				mensagem:
					"Selecione uma vinheta, jingle ou prefixo nas subpastas de Vinhetas abaixo para ouvir no CH-3.",
			});
		}
	}, [ouvirVinhetaNoCanal, pararEscutaVinheta]);

	const pararVinhetaNoAr = useCallback(
		async (notificarMesa = true) => {
			if (vinhetaTimerIntervalRef.current) {
				clearInterval(vinhetaTimerIntervalRef.current);
				vinhetaTimerIntervalRef.current = null;
			}
			setVinhetaNoArId(null);
			setVinhetaNoArNome("");
			setTempoRestanteVinhetaSeg(0);

			const audio = vinhetaPreviewAudioRef.current;
			if (audio) {
				try {
					audio.pause();
					audio.currentTime = 0;
					audio.src = "";
				} catch {
					// ignore
				}
			}

			if (notificarMesa) {
				try {
					await updateMesa({
						ao_vivo: aoVivoRef.current,
						mic_volume: Math.max(0, Math.min(1, faderMicRef.current)),
						musica_tocando: !musicaPausadaRef.current,
						musica_volume: faderMusicaRef.current,
						vinheta_volume: faderVinhetaRef.current,
						timestamp: Date.now() / 1000,
						vinheta_ativa: {
							acao: "parar",
							manter_musica: true,
							timestamp: Date.now(),
						},
					});
				} catch {
					// ignore
				}
			}
		},
		[],
	);

	const iniciarCronometroVinhetaNoAr = useCallback(
		(alvo, urlVinheta) => {
			if (vinhetaTimerIntervalRef.current) {
				clearInterval(vinhetaTimerIntervalRef.current);
				vinhetaTimerIntervalRef.current = null;
			}

			const inicioMs = Date.now();
			let duracaoSeg = 10;

			const previewAudio = vinhetaPreviewAudioRef.current;
			if (
				previewAudio &&
				previewAudio.src &&
				urlVinheta &&
				decodeURI(previewAudio.src).includes(decodeURI(urlVinheta).split("/").pop()) &&
				Number.isFinite(previewAudio.duration) &&
				previewAudio.duration > 0
			) {
				duracaoSeg = Math.max(1, Math.ceil(previewAudio.duration));
			}

			fimVinhetaNoArMsRef.current = inicioMs + duracaoSeg * 1000;
			setVinhetaNoArId(alvo.id || alvo.arquivo || "vinheta");
			setVinhetaNoArNome(alvo.nome || "Vinheta");
			setTempoRestanteVinhetaSeg(duracaoSeg);

			if (alvo.prefixo) {
				const probePrefixo = new Audio();
				probePrefixo.preload = "metadata";
				probePrefixo.muted = true;
				probePrefixo.src = resolveRadioAssetUrl(alvo.prefixo);

				const probeIa = new Audio();
				probeIa.preload = "metadata";
				probeIa.muted = true;
				probeIa.src = urlVinheta;

				let durPrefixo = 8.0;
				let durIa = alvo?.texto_falado?.length
					? Math.max(10.0, Math.ceil(alvo.texto_falado.length / 10))
					: 15.0;

				const recalcular = () => {
					const totalSeg = Math.max(5, Math.ceil(durPrefixo + durIa - 0.8));
					fimVinhetaNoArMsRef.current = inicioMs + totalSeg * 1000;
					setTempoRestanteVinhetaSeg(
						Math.max(0, Math.ceil((fimVinhetaNoArMsRef.current - Date.now()) / 1000)),
					);
				};

				probePrefixo.addEventListener(
					"loadedmetadata",
					() => {
						if (Number.isFinite(probePrefixo.duration) && probePrefixo.duration > 0) {
							durPrefixo = probePrefixo.duration;
							recalcular();
						}
					},
					{ once: true },
				);

				probeIa.addEventListener(
					"loadedmetadata",
					() => {
						if (Number.isFinite(probeIa.duration) && probeIa.duration > 0) {
							durIa = probeIa.duration;
							recalcular();
						}
					},
					{ once: true },
				);

				try {
					probePrefixo.load();
					probeIa.load();
				} catch {
					// ignore
				}
				recalcular();
			} else if (urlVinheta) {
				const probe = new Audio();
				probe.preload = "metadata";
				probe.muted = true;
				probe.src = urlVinheta;
				probe.addEventListener(
					"loadedmetadata",
					() => {
						if (Number.isFinite(probe.duration) && probe.duration > 0) {
							const durRealMs = Math.ceil(probe.duration * 1000);
							fimVinhetaNoArMsRef.current = inicioMs + durRealMs;
							const rest = Math.max(
								0,
								Math.ceil((fimVinhetaNoArMsRef.current - Date.now()) / 1000),
							);
							setTempoRestanteVinhetaSeg(rest);
						}
					},
					{ once: true },
				);
				try {
					probe.load();
				} catch {
					// ignore
				}
			}

			vinhetaTimerIntervalRef.current = setInterval(() => {
				const restante = Math.max(
					0,
					Math.ceil((fimVinhetaNoArMsRef.current - Date.now()) / 1000),
				);
				setTempoRestanteVinhetaSeg(restante);

				if (restante <= 0) {
					pararVinhetaNoAr(true);

					// Exclui temporário se necessário
					const arqTemp =
						alvo?.excluirAposTocar || alvo?.arquivo?.includes("temp_")
							? alvo.arquivo
							: null;
					if (arqTemp) {
						setRadioMusicPaused(false, { excluirTemp: arqTemp }).catch(() => {});
					}
				}
			}, 250);
		},
		[pararVinhetaNoAr],
	);

	useEffect(() => {
		return () => {
			if (vinhetaTimerIntervalRef.current) {
				clearInterval(vinhetaTimerIntervalRef.current);
			}
		};
	}, []);

	const liberarVinhetaNoAr = useCallback(
		async (vinhetaAlvo = null) => {
			if (vinhetaNoArId) {
				if (!vinhetaAlvo || vinhetaAlvo.id === vinhetaNoArId || vinhetaAlvo.arquivo === vinhetaNoArId) {
					await pararVinhetaNoAr(true);
					return;
				}
				// Se for uma vinheta diferente, interrompe a anterior para entrar a nova
				await pararVinhetaNoAr(false);
			}

			const alvo = vinhetaAlvo || vinhetaSelecionadaRef.current;
			if (!alvo) {
				setAvisoModal({
					icone: "📡",
					titulo: "Nenhuma Vinheta Selecionada",
					mensagem:
						"Escolha uma vinheta nas subpastas abaixo antes de liberar para o ar.",
				});
				return;
			}

			// Se a vinheta estava tocando no retorno/fone do locutor, interrompe a pré-escuta
			if (ouvindoVinhetaRef.current) {
				const audio = vinhetaPreviewAudioRef.current;
				if (audio) {
					try {
						audio.pause();
						audio.currentTime = 0;
						audio.src = "";
					} catch {
						// ignore
					}
				}
				ouvindoVinhetaRef.current = false;
				setOuvindoVinheta(false);
			}

			vinhetaSelecionadaRef.current = alvo;
			setVinhetaSelecionada(alvo);

			const urlVinheta = resolveRadioAssetUrl(alvo.url || alvo.arquivo || "");

			// Toca no estúdio do locutor no volume do fader CH-3
			const previewAudio = vinhetaPreviewAudioRef.current;
			if (previewAudio && urlVinheta) {
				try {
					previewAudio.src = urlVinheta;
					aplicarVolumeVinhetaPreview(faderVinhetaRef.current);
					previewAudio.onended = () => pararVinhetaNoAr(true);
					previewAudio.onerror = (e) => {
						console.warn("[previewAudio error]", e);
						// NUNCA cancela a transmissão no ar por falha ou bloqueio local de áudio
					};
					previewAudio.play().catch((err) => {
						console.warn("[previewAudio play rejected]", err);
						// NUNCA cancela a transmissão no ar por política de autoplay local
					});
				} catch {
					// ignore
				}
			}

			// Não pausa a música no canal 2 (locutor manipula os faders manualmente)
			musicaPausadaPorVinhetaRef.current = false;

			// Resposta visual e cronômetro INSTANTÂNEOS no clique (0ms de atraso)
			iniciarCronometroVinhetaNoAr(alvo, urlVinheta);

			try {
				updateMesa({
					ao_vivo: aoVivoRef.current,
					mic_volume: Math.max(0, Math.min(1, faderMicRef.current)),
					musica_tocando: !musicaPausadaRef.current, // MÚSICA SEGUE A DECISÃO MANUAL DO LOCUTOR
					musica_volume: faderMusicaRef.current,
					vinheta_volume: faderVinhetaRef.current,
					timestamp: Date.now() / 1000,
					vinheta_ativa: {
						arquivo: alvo.arquivo,
						url: alvo.url || alvo.arquivo,
						prefixo: alvo.prefixo || null,
						url_prefixo: alvo.url_prefixo || null,
						nome: alvo.nome,
						acao: "tocar",
						manter_musica: true,
						timestamp: Date.now(),
					},
				}).catch(() => {});
			} catch {
				setAvisoModal({
					icone: "⚠️",
					titulo: "Erro",
					mensagem: "Não foi possível disparar a vinheta no ar.",
				});
			}
		},
		[
			aplicarVolumeVinhetaPreview,
			iniciarCronometroVinhetaNoAr,
			pararVinhetaNoAr,
			vinhetaNoArId,
		],
	);
	liberarVinhetaNoArRef.current = liberarVinhetaNoAr;

	const alternarAutoTrinca = useCallback((ativo) => {
		setAutoTrincaHabilitado(Boolean(ativo));
		autoTrincaHabilitadoRef.current = Boolean(ativo);
	}, []);

	const alternarAutoRecados = useCallback((ativo) => {
		const val = Boolean(ativo);
		setAutoRecadosHabilitado(val);
		autoRecadosHabilitadoRef.current = val;
		if (typeof localStorage !== "undefined") {
			localStorage.setItem("autoRecadosHabilitado", String(val));
		}
		updateMesa({ auto_recados: val }).catch(() => {});
		alternarAutoRecadosIa(val).catch(() => {});
	}, []);

	const cancelarIaTrinca = useCallback(async () => {
		try {
			await cancelarTrincaIa();
			ultimoAnuncioTrincaRef.current = "cancelado_" + Date.now();
			setBlocoTrinca((prev) => ({ ...prev, anuncio_pendente: null }));
			return true;
		} catch {
			return false;
		}
	}, []);

	const dispararRecadoComIA = useCallback(
		async (pedido, voz = "alternar") => {
			if (!pedido || !pedido.recado || !pedido.recado.trim()) {
				setAvisoModal({
					icone: "⚠️",
					titulo: "Sem Recado",
					mensagem: "Este pedido não contém mensagem de texto para a IA ler.",
				});
				return;
			}

			setGerandoVozIaChave(pedido.chave_linha);
			try {
				const dados = await gerarVozRecadoIA({
					nome: pedido.nome,
					recado: pedido.recado,
					titulo: pedido.titulo || "",
					voz,
				});

				// Marca o pedido como TOCADO no pedidos.txt para permanecer na lista com opção de excluir
				if (pedido.chave_linha) {
					markRequestAsPlayed(pedido.chave_linha).catch(() => {});
					setPedidos((prev) =>
						prev.map((item) =>
							item.chave_linha === pedido.chave_linha
								? { ...item, tocado: true }
								: item,
						),
					);
				}

				await liberarVinhetaNoAr({
					id: "recado_" + pedido.chave_linha,
					nome: `Recado: ${pedido.nome}`,
					arquivo: dados.arquivo,
					url: dados.url || dados.arquivo,
					prefixo:
						dados.prefixo ||
						"vinhetas/aarquivos_vinhetas_prefixo/recadinhosFlash.mp3",
					url_prefixo:
						dados.url_prefixo ||
						"/radio/vinhetas/aarquivos_vinhetas_prefixo/recadinhosFlash.mp3",
					excluirAposTocar: true,
					texto_falado: dados.texto_falado || pedido.recado || "",
				});
			} catch (err) {
				setAvisoModal({
					icone: "❌",
					titulo: "Erro na Voz IA",
					mensagem:
						"Não foi possível gerar a voz neural do recado: " +
						(err?.message || err),
				});
			} finally {
				setGerandoVozIaChave(null);
			}
		},
		[liberarVinhetaNoAr],
	);

	const atualizarAcervo = useCallback(async () => {
		setAtualizandoAcervo(true);
		try {
			await rebuildRadioCache();
			await carregarAcervo();
			await carregarVinhetas();
			setAvisoModal({
				icone: "✅",
				titulo: "Acervo Atualizado",
				mensagem: "O cache de músicas, gêneros e vinhetas foi atualizado!",
			});
		} catch {
			setAvisoModal({
				icone: "⚠️",
				titulo: "Erro",
				mensagem: "Não foi possível reindexar o acervo.",
			});
		} finally {
			setAtualizandoAcervo(false);
		}
	}, [carregarAcervo, carregarVinhetas]);

	const atenderPedido = useCallback(
		async (pedido, tocarAgora = false) => {
			const arquivoMusica = pedido.arquivo || "";
			const tituloMusica = pedido.titulo || "";
			const nomeOuvinte = pedido.nome || "Ouvinte";

			let identificador = arquivoMusica || tituloMusica;
			const nomeBase = arquivoMusica.split("/").pop().split("\\").pop();

			for (const f of acervoMusicasGlobalRef.current) {
				const fBase = decodeURIComponent(
					(f.arquivo || f.url || "").split("/").pop().split("\\").pop(),
				);
				if (fBase === nomeBase || f.nome === tituloMusica) {
					identificador = f.id;
					break;
				}
			}

			try {
				let data = null;
				if (identificador) {
					data = await scheduleNextTrack(identificador, { tocarAgora });
					temAgendamentoExplicitoRef.current = true;
				}
				await markRequestAsPlayed(pedido.chave_linha);
				carregarPedidos();

				if (tocarAgora) {
					if (data?.faixa_atual) {
						aplicarDadosSyncNaMesa(data);
					}
					await updateMesa({ musica_tocando: true, forcar_troca: Date.now() }).catch(() => {});
					setAvisoModal({
						icone: "✅",
						titulo: "Pedido no Ar",
						mensagem: `Música do ouvinte colocada no ar com sucesso:\n"${tituloMusica}"\nPedido por: ${nomeOuvinte}`,
					});
					setTimeout(monitorarMusicaNoAr, 600);
				} else {
					const textoProx = `${tituloMusica} (${nomeOuvinte})`;
					proximaNomeServidorRef.current = textoProx;
					setProximaAtual(`A seguir: ${textoProx}`);
					updateMesa({ atualizacao_programacao: Date.now() }).catch(() => {});
					setAvisoModal({
						icone: "✅",
						titulo: "Pedido Agendado",
						mensagem: `Música agendada a seguir:\n"${tituloMusica}"\nPedido por: ${nomeOuvinte}`,
					});
					monitorarMusicaNoAr();
				}
			} catch (err) {
				const msgErro =
					err?.response?.data?.erro ||
					err?.response?.data?.error ||
					err?.message ||
					"Erro ao agendar música do ouvinte.";
				setAvisoModal({
					icone: "⚠️",
					titulo: "Erro no Pedido",
					mensagem: `Não foi possível agendar a música do ouvinte:\n${msgErro}`,
				});
			}
		},
		[carregarPedidos, monitorarMusicaNoAr, transicaoSuaveProxima],
	);

	const solicitarDescartePedido = useCallback(
		(pedido) => {
			setConfirmacaoModal({
				titulo: "Excluir Pedido",
				mensagem: `Deseja excluir este pedido do arquivo?\n\n"${pedido.titulo}"`,
				onConfirm: async () => {
					try {
						await removeListenerRequest(pedido.chave_linha);
						carregarPedidos();
						const tituloPedido = pedido.titulo || "";
						const nomeOuvinte = pedido.nome || "";
						if (
							(tituloPedido && proximaAtual.includes(tituloPedido)) ||
							(nomeOuvinte &&
								nomeOuvinte !== "Anônimo" &&
								nomeOuvinte !== "Ouvinte Anônimo" &&
								proximaAtual.includes(nomeOuvinte))
						) {
							await discardNextTrack();
						}
						await monitorarMusicaNoAr();
					} catch {
						// ignore
					} finally {
						setConfirmacaoModal(null);
					}
				},
			});
		},
		[carregarPedidos, monitorarMusicaNoAr, proximaAtual],
	);

	const descartarProximaFaixa = useCallback(async () => {
		try {
			const res = await discardNextTrack();
			if (res?.proxima_faixa?.nome) {
				const novoTexto = res.proxima_faixa.nome;
				proximaNomeServidorRef.current = novoTexto;
				temAgendamentoExplicitoRef.current = false;
				setProximaAtual(`A seguir: ${novoTexto}`);
				updateMesa({ atualizacao_programacao: Date.now() }).catch(() => {});
				setAvisoModal({
					icone: "🔄",
					titulo: "Próxima Faixa Alterada",
					mensagem: `A faixa anterior foi descartada.\n\nNova música a seguir:\n"${novoTexto}"`,
				});
				setTimeout(monitorarMusicaNoAr, 500);
			}
		} catch {
			setAvisoModal({
				icone: "⚠️",
				titulo: "Erro",
				mensagem: "Não foi possível descartar a próxima faixa.",
			});
		}
	}, [monitorarMusicaNoAr]);

	const agendarFaixaAcervo = useCallback(
		async (faixa, tocarAgora = false, automatico = false) => {
			const idParaEnviar = faixa.id || faixa.arquivo || faixa.url || "";
			const nomeFaixa = faixa.nome || "Música";

			// Atualização local imediata na mesa se for tocar agora
			if (tocarAgora) {
				ultimaTrocaLocalRef.current = Date.now();
				faixaLocalNomeRef.current = nomeFaixa;
				setMusicaAtual(nomeFaixa);
				const dur = Number(faixa.duracao) || 180;
				duracaoAtualRef.current = dur;
				baseOffsetRef.current = 0;
				timestampSyncRef.current = Date.now();
				offsetAtualRef.current = 0;
				setTempoRestanteSeg(dur);
				viradaConsultadaRef.current = false;

				// Se ainda tem faixa seguinte na fila do programa, já antecipa no visor
				const proximaNaFila = filaProgramaRef.current?.faixas?.[0];
				if (proximaNaFila) {
					setProximaAtual(`A seguir (Roteiro): ${proximaNaFila.nome}`);
					proximaNomeServidorRef.current = proximaNaFila.nome;
				}

				// Atualiza áudio do monitor da mesa se estiver ouvindo programação
				const audio = monitorAudioRef.current;
				const novaUrl = resolveRadioAssetUrl(faixa.url || faixa.arquivo || "");
				if (novaUrl) {
					urlFaixaNoArRef.current = novaUrl;
					if (audio) {
						audio.onended = () => {
							if (filaProgramaRef.current?.faixas?.length > 0) {
								executarViradaFilaParaNoArRef.current?.();
							} else {
								monitorarMusicaNoAr();
							}
						};
						if (ouvindoProgramacaoRef.current && audio) {
							audio.src = novaUrl;
							audio.currentTime = 0;
							aplicarVolumeMonitor(faderMusicaRef.current);
							if (!musicaPausadaRef.current) {
								audio.play().catch(() => {});
							}
						}
					}
				}

				// Notifica ouvintes imediatamente via Firebase
				updateMesa({
					musica_tocando: true,
					forcar_troca: Date.now(),
					faixa_atual: {
						nome: nomeFaixa,
						duracao: dur,
						url: faixa.url || "",
					},
				}).catch(() => {});
			}

			try {
				const data = await scheduleNextTrack(idParaEnviar, {
					ignorarPedido: true,
					tocarAgora,
				});
				if (data?.sucesso || data?.faixa_atual) {
					temAgendamentoExplicitoRef.current = true;
					proximaNomeServidorRef.current = data.proxima || nomeFaixa;

					if (tocarAgora) {
						if (data?.faixa_atual) {
							aplicarDadosSyncNaMesa(data);
						}
						if (!automatico) {
							setAvisoModal({
								icone: "✅",
								titulo: "Música no Ar",
								mensagem: `Música colocada no ar com sucesso:\n"${nomeFaixa}"`,
							});
						}
						setTimeout(monitorarMusicaNoAr, 600);
					} else {
						if (!automatico) {
							setAvisoModal({
								icone: "✅",
								titulo: "Faixa Agendada",
								mensagem: `Próxima música agendada com sucesso:\n"${nomeFaixa}"`,
							});
						}
						setTimeout(monitorarMusicaNoAr, 500);
					}
				} else if (!automatico) {
					setAvisoModal({
						icone: "⚠️",
						titulo: "Atenção",
						mensagem: "O servidor não confirmou o agendamento.",
					});
				}
			} catch (err) {
				console.warn(
					"[agendarFaixaAcervo] Sincronização de agendamento:",
					err?.message,
				);
				if (!automatico) {
					const msgErro =
						err?.response?.data?.erro ||
						err?.response?.data?.error ||
						err?.message ||
						"Erro de conexão ao agendar a música.";
					setAvisoModal({
						icone: "⚠️",
						titulo: "Erro de Conexão",
						mensagem: `Não foi possível agendar a música:\n${msgErro}`,
					});
				}
			}
		},
		[aplicarDadosSyncNaMesa, monitorarMusicaNoAr, aplicarVolumeMonitor],
	);

	const carregarFila = useCallback(async () => {
		try {
			const res = await fetchFilaProgramacao();
			if (res && res.sucesso && Array.isArray(res.faixas)) {
				setFilaPrograma(res);
				try {
					localStorage.setItem("radio_fila_programa", JSON.stringify(res));
				} catch {}
			}
		} catch {
			// ignore
		}
	}, []);

	const adicionarFaixaFila = useCallback(async (faixa) => {
		if (!faixa) return false;
		const duracaoNum = Number(faixa.duracao) || 180;
		const min = Math.floor(duracaoNum / 60);
		const seg = String(duracaoNum % 60).padStart(2, "0");
		const payload = {
			id: faixa.id || faixa.arquivo || faixa.url || `fx_${Date.now()}`,
			nome: faixa.nome || "Música",
			duracao: duracaoNum,
			duracao_formatada: `${min}:${seg}`,
			genero: faixa.genero || "Acervo",
			arquivo: faixa.arquivo || "",
			url: faixa.url || "",
			adicionado_em: new Date().toLocaleTimeString("pt-BR", {
				hour: "2-digit",
				minute: "2-digit",
			}),
		};

		// 1. Atualização OTIMISTA imediata no estado local e localStorage
		setFilaPrograma((prev) => {
			const faixasAtuais = Array.isArray(prev?.faixas) ? prev.faixas : [];
			const novasFaixas = [...faixasAtuais, payload];
			const totalSeg = novasFaixas.reduce(
				(acc, f) => acc + (Number(f.duracao) || 180),
				0,
			);
			const novaFila = {
				faixas: novasFaixas,
				total: novasFaixas.length,
				duracao_total: totalSeg,
				duracao_formatada: `~${Math.round(totalSeg / 60)} min`,
				modo: "roteiro",
			};
			filaProgramaRef.current = novaFila;
			try {
				localStorage.setItem("radio_fila_programa", JSON.stringify(novaFila));
			} catch {}
			return novaFila;
		});

		// 2. Notifica Firebase em tempo real
		updateMesa({
			atualizacao_fila: Date.now(),
		}).catch(() => {});

		// 3. Persiste no backend PHP (se disponível)
		try {
			const res = await adicionarFaixaFilaProgramacao(payload);
			if (res && res.sucesso && Array.isArray(res.faixas)) {
				filaProgramaRef.current = res;
				setFilaPrograma(res);
				try {
					localStorage.setItem("radio_fila_programa", JSON.stringify(res));
				} catch {}
			}
		} catch (err) {
			console.warn(
				"[adicionarFaixaFila] Backend PHP indisponível, mantendo fila local:",
				err?.message,
			);
		}

		return true;
	}, []);

	const removerFaixaFila = useCallback(async (indice, id) => {
		setFilaPrograma((prev) => {
			const faixasAtuais = Array.isArray(prev?.faixas) ? [...prev.faixas] : [];
			if (
				typeof indice === "number" &&
				indice >= 0 &&
				indice < faixasAtuais.length
			) {
				faixasAtuais.splice(indice, 1);
			} else if (id) {
				const idx = faixasAtuais.findIndex((f) => f.id === id);
				if (idx >= 0) faixasAtuais.splice(idx, 1);
			}
			const totalSeg = faixasAtuais.reduce(
				(acc, f) => acc + (Number(f.duracao) || 180),
				0,
			);
			const novaFila = {
				faixas: faixasAtuais,
				total: faixasAtuais.length,
				duracao_total: totalSeg,
				duracao_formatada: `~${Math.round(totalSeg / 60)} min`,
				modo: faixasAtuais.length > 0 ? "roteiro" : "auto_dj",
			};
			filaProgramaRef.current = novaFila;
			try {
				localStorage.setItem("radio_fila_programa", JSON.stringify(novaFila));
			} catch {}
			return novaFila;
		});

		updateMesa({ atualizacao_fila: Date.now() }).catch(() => {});

		try {
			const res = await removerFaixaFilaProgramacao(indice, id);
			if (res && res.sucesso && Array.isArray(res.faixas)) {
				filaProgramaRef.current = res;
				setFilaPrograma(res);
				try {
					localStorage.setItem("radio_fila_programa", JSON.stringify(res));
				} catch {}
			}
		} catch {}
	}, []);

	const moverFaixaFila = useCallback(async (de, para) => {
		setFilaPrograma((prev) => {
			const faixasAtuais = Array.isArray(prev?.faixas) ? [...prev.faixas] : [];
			if (
				de >= 0 &&
				para >= 0 &&
				de < faixasAtuais.length &&
				para < faixasAtuais.length
			) {
				const item = faixasAtuais.splice(de, 1)[0];
				faixasAtuais.splice(para, 0, item);
			}
			const totalSeg = faixasAtuais.reduce(
				(acc, f) => acc + (Number(f.duracao) || 180),
				0,
			);
			const novaFila = {
				faixas: faixasAtuais,
				total: faixasAtuais.length,
				duracao_total: totalSeg,
				duracao_formatada: `~${Math.round(totalSeg / 60)} min`,
				modo: faixasAtuais.length > 0 ? "roteiro" : "auto_dj",
			};
			filaProgramaRef.current = novaFila;
			try {
				localStorage.setItem("radio_fila_programa", JSON.stringify(novaFila));
			} catch {}
			return novaFila;
		});

		updateMesa({ atualizacao_fila: Date.now() }).catch(() => {});

		try {
			const res = await moverFaixaFilaProgramacao(de, para);
			if (res && res.sucesso && Array.isArray(res.faixas)) {
				filaProgramaRef.current = res;
				setFilaPrograma(res);
				try {
					localStorage.setItem("radio_fila_programa", JSON.stringify(res));
				} catch {}
			}
		} catch {}
	}, []);

	const limparFila = useCallback(async () => {
		const novaFila = {
			faixas: [],
			total: 0,
			duracao_total: 0,
			duracao_formatada: "~0 min",
			modo: "auto_dj",
		};
		filaProgramaRef.current = novaFila;
		setFilaPrograma(novaFila);
		try {
			localStorage.setItem("radio_fila_programa", JSON.stringify(novaFila));
		} catch {}

		updateMesa({ atualizacao_fila: Date.now() }).catch(() => {});

		try {
			const res = await limparFilaProgramacao();
			if (res && res.sucesso && Array.isArray(res.faixas)) {
				filaProgramaRef.current = res;
				setFilaPrograma(res);
			}
		} catch {}
	}, []);

	const tocarFaixaFilaAgora = useCallback(
		async (indice) => {
			const faixas = filaProgramaRef.current?.faixas || [];
			const faixa = faixas[indice];
			if (!faixa) return;
			await removerFaixaFila(indice, faixa.id);
			await agendarFaixaAcervo(faixa, true, false);
		},
		[removerFaixaFila, agendarFaixaAcervo],
	);

	const executarViradaFilaParaNoAr = useCallback(async () => {
		if (transicaoEmAndamentoRef.current) return false;
		const faixas = filaProgramaRef.current?.faixas || [];
		if (faixas.length === 0) {
			monitorarMusicaNoAr();
			return false;
		}

		transicaoEmAndamentoRef.current = true;
		try {
			const faixaParaTocar = faixas[0];
			await removerFaixaFila(0, faixaParaTocar.id);
			await agendarFaixaAcervo(faixaParaTocar, true, true);
			return true;
		} finally {
			setTimeout(() => {
				transicaoEmAndamentoRef.current = false;
			}, 2000);
		}
	}, [removerFaixaFila, agendarFaixaAcervo, monitorarMusicaNoAr]);
	executarViradaFilaParaNoArRef.current = executarViradaFilaParaNoAr;

	useEffect(() => {
		if (filaPrograma?.faixas?.length > 0) {
			const prox = filaPrograma.faixas[0];
			setProximaAtual(`A seguir (Roteiro): ${prox.nome}`);
			proximaNomeServidorRef.current = prox.nome;
			const idParaEnviar = prox.id || prox.arquivo || prox.url || prox.nome;
			if (idParaEnviar) {
				scheduleNextTrack(idParaEnviar, { ignorarPedido: true }).catch(() => {});
			}
		} else {
			// Se a fila esvaziou, volta ao sorteio automático da grade (Auto-DJ)
			monitorarMusicaNoAr();
		}
	}, [filaPrograma, monitorarMusicaNoAr]);

	const minutosRestantes = String(Math.floor(tempoRestanteSeg / 60)).padStart(
		2,
		"0",
	);
	const segundosRestantes = String(Math.floor(tempoRestanteSeg % 60)).padStart(
		2,
		"0",
	);

	const minVinheta = String(Math.floor(tempoRestanteVinhetaSeg / 60)).padStart(
		2,
		"0",
	);
	const segVinheta = String(Math.floor(tempoRestanteVinhetaSeg % 60)).padStart(
		2,
		"0",
	);

	return {
		aoVivo,
		faderMic,
		faderMusica,
		faderVinheta,
		musicaPausada,
		ouvindoProgramacao,
		ouvindoVinheta,
		musicaAtual,
		proximaAtual,
		tempoRestanteFormatado: `${minutosRestantes}:${segundosRestantes}`,
		tempoRestanteVinhetaSeg,
		tempoRestanteVinhetaFormatado: `${minVinheta}:${segVinheta}`,
		transicaoEmAndamento,
		ouvintesConectados,
		picoHoje,
		programaAtual,
		proximoPrograma,
		pedidos,
		mapaGeneros,
		mapaVinhetas,
		vinhetaSelecionada,
		vinhetaNoArId,
		vinhetaNoArNome,
		atualizandoAcervo,
		avisoModal,
		confirmacaoModal,
		monitorAudioRef,
		vinhetaPreviewAudioRef,
		micAnalyserRef,
		micDataArrayRef,
		setAvisoModal,
		setConfirmacaoModal,
		handleChangeFaderMic,
		handleChangeFaderMusica,
		handleChangeFaderVinheta,
		alternarMicrofone,
		alternarPausaMusicaNoAr,
		alternarEscutaProgramacao,
		alternarEscutaVinhetaCanal,
		carregarVinhetaNoCanal,
		ouvirVinhetaNoCanal,
		pararEscutaVinheta,
		liberarVinhetaNoAr,
		pararVinhetaNoAr,
		monitorarMusicaNoAr,
		transicaoSuaveProxima,
		carregarPedidos,
		carregarAcervo,
		carregarVinhetas,
		atualizarAcervo,
		atenderPedido,
		solicitarDescartePedido,
		descartarProximaFaixa,
		agendarFaixaAcervo,
		dispararRecadoComIA,
		gerandoVozIaChave,
		blocoTrinca,
		autoTrincaHabilitado,
		alternarAutoTrinca,
		autoRecadosHabilitado,
		alternarAutoRecados,
		cancelarIaTrinca,
		filaPrograma,
		carregarFila,
		adicionarFaixaFila,
		removerFaixaFila,
		moverFaixaFila,
		limparFila,
		tocarFaixaFilaAgora,
	};
};
