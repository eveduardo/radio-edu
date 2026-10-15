import { useCallback, useEffect, useRef, useState } from "react";
import {
	cancelarTrincaIa,
	discardNextTrack,
	fetchGenresCatalog,
	fetchListenerRequests,
	fetchRadioSync,
	fetchVinhetasCatalog,
	gerarVozRecadoIA,
	markRequestAsPlayed,
	rebuildRadioCache,
	removeListenerRequest,
	resolveRadioAssetUrl,
	scheduleNextTrack,
	setRadioMusicPaused,
	updateMesa,
	uploadVoiceChunk,
} from "@/services";

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

	const [pedidos, setPedidos] = useState([]);
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
	const debounceFirebaseRef = useRef(null);

	const duracaoAtualRef = useRef(0);
	const offsetAtualRef = useRef(0);
	const acervoMusicasGlobalRef = useRef([]);

	const aplicarVolumeMonitor = useCallback((vol) => {
		const audio = monitorAudioRef.current;
		if (!audio) return;
		try {
			audio.volume = Math.max(0, Math.min(1, vol));
		} catch {
			// ignore
		}
	}, []);

	const aplicarVolumeVinhetaPreview = useCallback((vol) => {
		const audio = vinhetaPreviewAudioRef.current;
		if (!audio) return;
		try {
			audio.volume = Math.max(0, Math.min(1, vol));
		} catch {
			// ignore
		}
	}, []);

	const sincronizarMesaFirebase = useCallback((imediato = false) => {
		const enviar = () => {
			updateMesa({
				ao_vivo: aoVivoRef.current,
				mic_volume: Math.max(0, Math.min(1, faderMicRef.current)),
				musica_tocando: !musicaPausadaRef.current,
				musica_volume: Math.max(0, Math.min(1, faderMusicaRef.current)),
			}).catch(() => {});
		};

		if (debounceFirebaseRef.current) {
			clearTimeout(debounceFirebaseRef.current);
		}

		if (imediato) {
			enviar();
		} else {
			debounceFirebaseRef.current = setTimeout(enviar, 30);
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
			if (chunksAtuaisRef.current.length > 0) {
				const audioBlob = new Blob(chunksAtuaisRef.current, {
					type: mime || "audio/webm",
				});
				chunksAtuaisRef.current = [];

				if (audioBlob.size > 400) {
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
			gravador.start(250);
			inicioGravacaoBlocoRef.current = Date.now();
			timestampUltimoSomRef.current = Date.now();
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

		if (volumeMedio > 10) {
			timestampUltimoSomRef.current = agora;
		}

		const tempoEmSilencio = agora - timestampUltimoSomRef.current;
		const cortePorSilencio = duracaoAtual >= 2500 && tempoEmSilencio >= 500;
		const cortePorTetoMaximo = duracaoAtual >= 4500;

		if (gravandoBlocoRef.current && (cortePorSilencio || cortePorTetoMaximo)) {
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
				setMusicaAtual(data.faixa_atual.nome || "Sem título");
				const nomeProx = data.proxima_faixa?.nome || "";
				proximaNomeServidorRef.current = nomeProx;
				setProximaAtual(`A seguir: ${nomeProx || "--"}`);
				duracaoAtualRef.current = data.faixa_atual.duracao || 180;
				offsetAtualRef.current = data.offset_segundos || 0;
				setTempoRestanteSeg(
					Math.max(0, duracaoAtualRef.current - offsetAtualRef.current),
				);

				if (typeof data.pausado === "boolean") {
					musicaPausadaRef.current = data.pausado;
					setMusicaPausada(data.pausado);
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
						if (autoTrincaHabilitadoRef.current && liberarVinhetaNoArRef.current) {
							ultimoAnuncioTrincaRef.current = data.bloco_trinca.anuncio_pendente;
							liberarVinhetaNoArRef.current({
								id: "trinca_" + Date.now(),
								nome: "Trinca Flash (Locução)",
								arquivo: data.bloco_trinca.anuncio_pendente,
								url: data.bloco_trinca.anuncio_pendente,
								excluirAposTocar: true,
							});
						}
					}
				}

				const novaUrl = resolveRadioAssetUrl(data.faixa_atual.url || "");
				const audio = monitorAudioRef.current;

				if (novaUrl) {
					const trocouFaixa = urlFaixaNoArRef.current !== novaUrl;
					urlFaixaNoArRef.current = novaUrl;

					if (ouvindoProgramacaoRef.current && audio) {
						if (trocouFaixa || !audio.src || audio.paused) {
							audio.src = novaUrl;
							aplicarVolumeMonitor(faderMusicaRef.current);
							const offset = Math.max(0, data.offset_segundos || 0);
							const posicionar = () => {
								if (offset > 2) {
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
							audio.pause();
						} else if (
							audio.readyState >= 2 &&
							Math.abs(audio.currentTime - (data.offset_segundos || 0)) > 4
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
		const syncInterval = setInterval(monitorarMusicaNoAr, 15000);

		const countdownInterval = setInterval(() => {
			if (musicaPausadaRef.current) return;

			offsetAtualRef.current += 1;
			const restante = Math.max(
				0,
				duracaoAtualRef.current - offsetAtualRef.current,
			);
			setTempoRestanteSeg(restante);

			if (restante === 0) {
				setTimeout(monitorarMusicaNoAr, 1200);
			}
		}, 1000);

		return () => {
			clearInterval(syncInterval);
			clearInterval(countdownInterval);
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
		vinhetaSelecionadaRef.current = null;
		setVinhetaSelecionada(null);
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

	const iniciarCronometroVinhetaNoAr = useCallback((alvo, urlVinheta) => {
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
			previewAudio.src.includes(urlVinheta.split("/").pop()) &&
			Number.isFinite(previewAudio.duration) &&
			previewAudio.duration > 0
		) {
			duracaoSeg = Math.max(1, Math.ceil(previewAudio.duration));
		}

		fimVinhetaNoArMsRef.current = inicioMs + duracaoSeg * 1000;
		setVinhetaNoArId(alvo.id);
		setVinhetaNoArNome(alvo.nome || "Vinheta");
		setTempoRestanteVinhetaSeg(duracaoSeg);

		if (urlVinheta) {
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
				if (vinhetaTimerIntervalRef.current) {
					clearInterval(vinhetaTimerIntervalRef.current);
					vinhetaTimerIntervalRef.current = null;
				}
				setVinhetaNoArId(null);
				setVinhetaNoArNome("");
				setTempoRestanteVinhetaSeg(0);
				vinhetaSelecionadaRef.current = null;
				setVinhetaSelecionada(null);

				// Ao término da vinheta/prefixo, dá o play novamente na música
				musicaPausadaPorVinhetaRef.current = false;
				musicaPausadaRef.current = false;
				setMusicaPausada(false);

				const audio = monitorAudioRef.current;
				if (audio && ouvindoProgramacaoRef.current && audio.src) {
					aplicarVolumeMonitor(faderMusicaRef.current);
					audio.play().catch(() => {});
				}

				const arqTemp =
					alvo?.excluirAposTocar || alvo?.arquivo?.includes("temp_")
						? alvo.arquivo
						: null;
				setRadioMusicPaused(false, { excluirTemp: arqTemp }).catch(() => {});

				updateMesa({
					ao_vivo: aoVivoRef.current,
					mic_volume: Math.max(0, Math.min(1, faderMicRef.current)),
					musica_tocando: true,
					musica_volume: faderMusicaRef.current,
					vinheta_ativa: { acao: "parar", timestamp: Date.now() },
				}).catch(() => {});
			}
		}, 250);
	}, [aplicarVolumeMonitor]);

	useEffect(() => {
		return () => {
			if (vinhetaTimerIntervalRef.current) {
				clearInterval(vinhetaTimerIntervalRef.current);
			}
		};
	}, []);

	const liberarVinhetaNoAr = useCallback(
		async (vinhetaAlvo = null) => {
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
			}

			vinhetaSelecionadaRef.current = alvo;
			setVinhetaSelecionada(alvo);

			const urlVinheta = resolveRadioAssetUrl(alvo.url || alvo.arquivo || "");

			// Pausa total da música no ar durante a vinheta (sem mexer no fader)
			if (!musicaPausadaRef.current) {
				musicaPausadaPorVinhetaRef.current = true;
				musicaPausadaRef.current = true;
				setMusicaPausada(true);

				const audio = monitorAudioRef.current;
				if (audio) {
					audio.pause();
				}

				setRadioMusicPaused(true).catch(() => {});
			} else {
				musicaPausadaPorVinhetaRef.current = false;
			}

			try {
				await updateMesa({
					ao_vivo: aoVivoRef.current,
					mic_volume: Math.max(0, Math.min(1, faderMicRef.current)),
					musica_tocando: false, // PAUSA TOTAL DA MÚSICA NO AR
					musica_volume: faderMusicaRef.current,
					vinheta_ativa: {
						arquivo: alvo.arquivo,
						url: alvo.url || alvo.arquivo,
						nome: alvo.nome,
						acao: "tocar",
						timestamp: Date.now(),
					},
				});

				iniciarCronometroVinhetaNoAr(alvo, urlVinheta);
			} catch {
				setAvisoModal({
					icone: "⚠️",
					titulo: "Erro",
					mensagem: "Não foi possível disparar a vinheta no ar.",
				});
			}
		},
		[iniciarCronometroVinhetaNoAr],
	);
	liberarVinhetaNoArRef.current = liberarVinhetaNoAr;

	const alternarAutoTrinca = useCallback((ativo) => {
		setAutoTrincaHabilitado(Boolean(ativo));
		autoTrincaHabilitadoRef.current = Boolean(ativo);
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
		async (pedido, voz = "pt-BR-ThalitaMultilingualNeural") => {
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
					excluirAposTocar: true,
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
				if (identificador) {
					await scheduleNextTrack(identificador);
					temAgendamentoExplicitoRef.current = true;
				}
				await markRequestAsPlayed(pedido.chave_linha);
				carregarPedidos();

				if (tocarAgora) {
					await transicaoSuaveProxima();
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
			} catch {
				setAvisoModal({
					icone: "⚠️",
					titulo: "Erro",
					mensagem: "Erro ao agendar música do ouvinte.",
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
		async (faixa, tocarAgora = false) => {
			const idParaEnviar = faixa.id || faixa.arquivo || faixa.url || "";
			const nomeFaixa = faixa.nome || "Música";

			try {
				const data = await scheduleNextTrack(idParaEnviar, {
					ignorarPedido: true,
				});
				if (data?.sucesso) {
					temAgendamentoExplicitoRef.current = true;
					proximaNomeServidorRef.current = data.proxima || nomeFaixa;

					if (tocarAgora) {
						await transicaoSuaveProxima();
					} else {
						setProximaAtual(`A seguir (Agendada): ${nomeFaixa}`);
						updateMesa({ atualizacao_programacao: Date.now() }).catch(() => {});
						setAvisoModal({
							icone: "✅",
							titulo: "Faixa Agendada",
							mensagem: `Próxima música agendada com sucesso:\n"${nomeFaixa}"`,
						});
						setTimeout(monitorarMusicaNoAr, 500);
					}
				} else {
					setAvisoModal({
						icone: "⚠️",
						titulo: "Atenção",
						mensagem: "O servidor não confirmou o agendamento.",
					});
				}
			} catch {
				setAvisoModal({
					icone: "⚠️",
					titulo: "Erro de Conexão",
					mensagem: "Erro de conexão ao agendar a música.",
				});
			}
		},
		[monitorarMusicaNoAr, transicaoSuaveProxima],
	);

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
		ouvirVinhetaNoCanal,
		pararEscutaVinheta,
		liberarVinhetaNoAr,
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
		cancelarIaTrinca,
	};
};
