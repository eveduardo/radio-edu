import { useCallback, useEffect, useRef, useState } from "react";
import {
	fetchGenresCatalog,
	fetchListenerRequests,
	fetchRadioSync,
	markRequestAsPlayed,
	rebuildRadioCache,
	removeListenerRequest,
	resolveRadioAssetUrl,
	scheduleNextTrack,
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
	const [ouvindoProgramacao, setOuvindoProgramacao] = useState(false);

	const [musicaAtual, setMusicaAtual] = useState("A carregar faixa...");
	const [proximaAtual, setProximaAtual] = useState("A seguir: --");
	const [tempoRestanteSeg, setTempoRestanteSeg] = useState(0);
	const [transicaoEmAndamento, setTransicaoEmAndamento] = useState(false);

	const [pedidos, setPedidos] = useState([]);
	const [mapaGeneros, setMapaGeneros] = useState({});
	const [atualizandoAcervo, setAtualizandoAcervo] = useState(false);

	const [avisoModal, setAvisoModal] = useState(null);
	const [confirmacaoModal, setConfirmacaoModal] = useState(null);

	const aoVivoRef = useRef(aoVivo);
	aoVivoRef.current = aoVivo;
	const faderMicRef = useRef(faderMic);
	faderMicRef.current = faderMic;
	const faderMusicaRef = useRef(faderMusica);
	faderMusicaRef.current = faderMusica;
	const ouvindoProgramacaoRef = useRef(ouvindoProgramacao);
	ouvindoProgramacaoRef.current = ouvindoProgramacao;
	const transicaoEmAndamentoRef = useRef(transicaoEmAndamento);
	transicaoEmAndamentoRef.current = transicaoEmAndamento;
	const pedidosRef = useRef(pedidos);
	pedidosRef.current = pedidos;

	const monitorAudioRef = useRef(null);
	const urlFaixaNoArRef = useRef("");
	const proximaNomeServidorRef = useRef("");
	const temAgendamentoExplicitoRef = useRef(false);

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

	const sincronizarMesaFirebase = useCallback((imediato = false) => {
		const enviar = () => {
			updateMesa({
				ao_vivo: aoVivoRef.current,
				mic_volume: Math.max(0, Math.min(1, faderMicRef.current)),
				musica_tocando: true,
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

				if (audioBlob.size > 2000) {
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
			}
		};

		try {
			gravador.start();
			inicioGravacaoBlocoRef.current = Date.now();
			timestampUltimoSomRef.current = Date.now();
			gravandoBlocoRef.current = true;
		} catch {
			// ignore
		}
	}, []);

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

		if (volumeMedio > 12) {
			timestampUltimoSomRef.current = agora;
		}

		const tempoEmSilencio = agora - timestampUltimoSomRef.current;
		const cortePorSilencio = duracaoAtual >= 6000 && tempoEmSilencio >= 700;
		const cortePorTetoMaximo = duracaoAtual >= 10000;

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

		if (loopDeteccaoIdRef.current) {
			cancelAnimationFrame(loopDeteccaoIdRef.current);
			loopDeteccaoIdRef.current = null;
		}

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

		sincronizarMesaFirebase(true);
	}, [sincronizarMesaFirebase]);

	const alternarMicrofone = useCallback(async () => {
		if (!aoVivoRef.current) {
			const stream = await obterStreamMicrofone();

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

					if (stream) {
						const micSource = ctx.createMediaStreamSource(stream);
						micSource.connect(analyser);
						streamMicRef.current = stream;
					}

					micAudioCtxRef.current = ctx;
					micAnalyserRef.current = analyser;
					micDataArrayRef.current = dataArray;
				}
			} catch {
				// Prossegue ativando o canal CH-1 mesmo sem Web Audio
			}

			aoVivoRef.current = true;
			setAoVivo(true);
			sincronizarMesaFirebase(true);

			if (streamMicRef.current) {
				iniciarNovoBloco();
				monitorarAtividadeVoz();
			}
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
							audio.play().catch(() => {});
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
				if (audio && urlFaixaNoArRef.current) {
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

		const volInicial = faderMusicaRef.current;

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
				await scheduleNextTrack(nomeProximaVisor).catch(() => {});
			}

			// 1. Vira a faixa no servidor e atualiza o visor da mesa
			const novoEstado = await fetchRadioSync({ forcarProxima: true });
			temAgendamentoExplicitoRef.current = false;
			aplicarDadosSyncNaMesa(novoEstado);
		} catch {
			// ignore
		}

		// 2. Notifica todos os ouvintes via Firebase para fazerem o crossfade para a nova faixa do servidor
		await updateMesa({ forcar_troca: Date.now() }).catch(() => {});

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

	useEffect(() => {
		carregarAcervo();
	}, [carregarAcervo]);

	const atualizarAcervo = useCallback(async () => {
		setAtualizandoAcervo(true);
		try {
			await rebuildRadioCache();
			await carregarAcervo();
			setAvisoModal({
				icone: "✅",
				titulo: "Acervo Atualizado",
				mensagem: "O cache de músicas e gêneros foi reindexado com sucesso!",
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
	}, [carregarAcervo]);

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
					} catch {
						// ignore
					} finally {
						setConfirmacaoModal(null);
					}
				},
			});
		},
		[carregarPedidos],
	);

	const agendarFaixaAcervo = useCallback(
		async (faixa, tocarAgora = false) => {
			const idParaEnviar = faixa.id || faixa.arquivo || faixa.url || "";
			const nomeFaixa = faixa.nome || "Música";

			try {
				const data = await scheduleNextTrack(idParaEnviar);
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

	return {
		aoVivo,
		faderMic,
		faderMusica,
		ouvindoProgramacao,
		musicaAtual,
		proximaAtual,
		tempoRestanteFormatado: `${minutosRestantes}:${segundosRestantes}`,
		transicaoEmAndamento,
		pedidos,
		mapaGeneros,
		atualizandoAcervo,
		avisoModal,
		confirmacaoModal,
		monitorAudioRef,
		micAnalyserRef,
		micDataArrayRef,
		setAvisoModal,
		setConfirmacaoModal,
		handleChangeFaderMic,
		handleChangeFaderMusica,
		alternarMicrofone,
		alternarEscutaProgramacao,
		monitorarMusicaNoAr,
		transicaoSuaveProxima,
		carregarPedidos,
		carregarAcervo,
		atualizarAcervo,
		atenderPedido,
		solicitarDescartePedido,
		agendarFaixaAcervo,
	};
};
