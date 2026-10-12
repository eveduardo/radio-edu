import { useCallback, useEffect, useRef, useState } from "react";
import {
	fetchGenresCatalog,
	fetchListenerRequests,
	fetchRadioSync,
	markRequestAsPlayed,
	rebuildRadioCache,
	removeListenerRequest,
	scheduleNextTrack,
	updateMesa,
	uploadVoiceChunk,
} from "@/services";

export const useLocutorMesa = () => {
	const [aoVivo, setAoVivo] = useState(false);
	const [faderMic, setFaderMic] = useState(1);
	const [faderMusica, setFaderMusica] = useState(1);

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

	const sincronizarMesaFirebase = useCallback((imediato = false) => {
		const enviar = () => {
			updateMesa({
				ao_vivo: aoVivoRef.current,
				mic_volume: faderMicRef.current,
				musica_tocando: true,
				musica_volume: faderMusicaRef.current,
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
			const num = parseFloat(val);
			faderMicRef.current = num;
			setFaderMic(num);
			sincronizarMesaFirebase(imediato);
		},
		[sincronizarMesaFirebase],
	);

	const handleChangeFaderMusica = useCallback(
		(val, imediato = false) => {
			const num = parseFloat(val);
			faderMusicaRef.current = num;
			setFaderMusica(num);
			sincronizarMesaFirebase(imediato);
		},
		[sincronizarMesaFirebase],
	);

	const iniciarNovoBloco = useCallback(() => {
		if (!aoVivoRef.current || !streamMicRef.current) return;

		chunksAtuaisRef.current = [];
		const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
			? "audio/webm;codecs=opus"
			: "audio/webm";

		const gravador = new MediaRecorder(streamMicRef.current, {
			mimeType: mime,
			audioBitsPerSecond: 64000,
		});
		gravadorMediaRef.current = gravador;

		gravador.ondataavailable = (e) => {
			if (e.data && e.data.size > 0) {
				chunksAtuaisRef.current.push(e.data);
			}
		};

		gravador.onstop = () => {
			if (chunksAtuaisRef.current.length > 0) {
				const audioBlob = new Blob(chunksAtuaisRef.current, { type: mime });
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

			if (aoVivoRef.current) {
				iniciarNovoBloco();
			}
		};

		gravador.start();
		inicioGravacaoBlocoRef.current = Date.now();
		timestampUltimoSomRef.current = Date.now();
		gravandoBlocoRef.current = true;
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
				gravadorMediaRef.current.stop();
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
			gravadorMediaRef.current.stop();
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
			try {
				const stream = await navigator.mediaDevices.getUserMedia({
					audio: {
						echoCancellation: true,
						noiseSuppression: true,
						autoGainControl: true,
						channelCount: 1,
					},
				});

				const AudioCtx = window.AudioContext || window.webkitAudioContext;
				const ctx = new AudioCtx();
				const analyser = ctx.createAnalyser();
				analyser.fftSize = 64;
				const dataArray = new Uint8Array(analyser.frequencyBinCount);

				const micSource = ctx.createMediaStreamSource(stream);
				micSource.connect(analyser);

				streamMicRef.current = stream;
				micAudioCtxRef.current = ctx;
				micAnalyserRef.current = analyser;
				micDataArrayRef.current = dataArray;

				aoVivoRef.current = true;
				setAoVivo(true);
				sincronizarMesaFirebase(true);

				iniciarNovoBloco();
				monitorarAtividadeVoz();
			} catch {
				setAvisoModal({
					icone: "⚠️",
					titulo: "Microfone Indisponível",
					mensagem: "Permissão de microfone negada ou dispositivo indisponível.",
				});
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

	const monitorarMusicaNoAr = useCallback(async () => {
		try {
			const data = await fetchRadioSync();
			if (data?.faixa_atual) {
				setMusicaAtual(data.faixa_atual.nome || "Sem título");
				setProximaAtual(
					`A seguir: ${data.proxima_faixa?.nome ? data.proxima_faixa.nome : "--"}`,
				);
				duracaoAtualRef.current = data.faixa_atual.duracao || 180;
				offsetAtualRef.current = data.offset_segundos || 0;
				setTempoRestanteSeg(
					Math.max(0, duracaoAtualRef.current - offsetAtualRef.current),
				);
			}
		} catch {
			// Ignora erro temporário de rede
		}
	}, []);

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
		if (transicaoEmAndamento) return;
		setTransicaoEmAndamento(true);

		const volInicial = faderMusicaRef.current;

		try {
			await fetchRadioSync({ forcarProxima: true });
			await monitorarMusicaNoAr();
		} catch {
			// ignore
		}

		updateMesa({ forcar_troca: Date.now() }).catch(() => {});

		const passos = 6;
		const decremento = volInicial / passos;

		for (let i = 1; i <= passos; i++) {
			await new Promise((r) => setTimeout(r, 200));
			const novoVol = Number(Math.max(0, volInicial - decremento * i).toFixed(2));
			faderMusicaRef.current = novoVol;
			setFaderMusica(novoVol);
		}

		await new Promise((r) => setTimeout(r, 200));

		for (let i = 1; i <= passos; i++) {
			await new Promise((r) => setTimeout(r, 120));
			const volSubindo = Number(
				Math.min(volInicial, (volInicial / passos) * i).toFixed(2),
			);
			faderMusicaRef.current = volSubindo;
			setFaderMusica(volSubindo);
		}

		sincronizarMesaFirebase(true);
		setTransicaoEmAndamento(false);
	}, [monitorarMusicaNoAr, sincronizarMesaFirebase, transicaoEmAndamento]);

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
		async (pedido) => {
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
				}
				await markRequestAsPlayed(pedido.chave_linha);

				setProximaAtual(
					`A seguir: ${tituloMusica} (Pedido de ${nomeOuvinte})`,
				);
				setAvisoModal({
					icone: "✅",
					titulo: "Pedido Agendado",
					mensagem: `Música agendada a seguir:\n"${tituloMusica}"\nPedido por: ${nomeOuvinte}`,
				});
				carregarPedidos();
				monitorarMusicaNoAr();
			} catch {
				setAvisoModal({
					icone: "⚠️",
					titulo: "Erro",
					mensagem: "Erro ao agendar música do ouvinte.",
				});
			}
		},
		[carregarPedidos, monitorarMusicaNoAr],
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
		async (faixa) => {
			const idParaEnviar = faixa.id || faixa.arquivo || faixa.url || "";
			const nomeFaixa = faixa.nome || "Música";

			try {
				const data = await scheduleNextTrack(idParaEnviar);
				if (data?.sucesso) {
					setProximaAtual(`A seguir (Agendada): ${nomeFaixa}`);
					setAvisoModal({
						icone: "✅",
						titulo: "Faixa Agendada",
						mensagem: `Próxima música agendada com sucesso:\n"${nomeFaixa}"`,
					});
					setTimeout(monitorarMusicaNoAr, 500);
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
		[monitorarMusicaNoAr],
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
		musicaAtual,
		proximaAtual,
		tempoRestanteFormatado: `${minutosRestantes}:${segundosRestantes}`,
		transicaoEmAndamento,
		pedidos,
		mapaGeneros,
		atualizandoAcervo,
		avisoModal,
		confirmacaoModal,
		micAnalyserRef,
		micDataArrayRef,
		setAvisoModal,
		setConfirmacaoModal,
		handleChangeFaderMic,
		handleChangeFaderMusica,
		alternarMicrofone,
		transicaoSuaveProxima,
		carregarPedidos,
		carregarAcervo,
		atualizarAcervo,
		atenderPedido,
		solicitarDescartePedido,
		agendarFaixaAcervo,
	};
};
