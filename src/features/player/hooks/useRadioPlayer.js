import { useCallback, useEffect, useRef, useState } from "react";
import { useRecoilState } from "recoil";
import { volumeAtom } from "@/globalState";
import {
	fetchRadioSync,
	fetchVoiceChunkBlob,
	limparTempVinheta,
	resolveRadioAssetUrl,
	subscribeToMesa,
} from "@/services";

export const useRadioPlayer = () => {
	const [volumeMaster, setVolumeMaster] = useRecoilState(volumeAtom);
	const [estaTocando, setEstaTocando] = useState(true);
	const [tituloMusica, setTituloMusica] = useState("Sintonizando Flash FM...");
	const [nomeOuvinte, setNomeOuvinte] = useState("");
	const [proximaFaixa, setProximaFaixa] = useState("Aguardando programação");
	const [statusTexto, setStatusTexto] = useState("Transmitindo em tempo real");
	const [recolhido, setRecolhido] = useState(false);
	const [programaAtual, setProgramaAtual] = useState(null);
	const [proximoPrograma, setProximoPrograma] = useState(null);

	const playerRef = useRef(null); // Deck A
	const playerDeckBRef = useRef(null); // Deck B
	const deckAtivoRef = useRef("A");
	const emTransicaoAntecipadaRef = useRef(false);

	const playerHoraRef = useRef(null);
	const playerVozRef = useRef(null);
	const playerVinhetaRef = useRef(null);
	const wakeVideoRef = useRef(null);

	const audioCtxRef = useRef(null);
	const analyserRef = useRef(null);
	const gainNodeMusicaRef = useRef(null);
	const gainNodeVozRef = useRef(null);
	const dataArrayRef = useRef(null);
	const sourceNodeMusicaRef = useRef(null);
	const sourceNodeMusicaBRef = useRef(null);
	const sourceNodeVozRef = useRef(null);

	const estaTocandoRef = useRef(estaTocando);
	estaTocandoRef.current = estaTocando;

	const volumeMasterRef = useRef(volumeMaster);
	volumeMasterRef.current = volumeMaster;

	const urlFaixaAtualRef = useRef("");
	const proximaUrlRef = useRef("");
	const vinhetaEmExecucaoRef = useRef(false);
	const ultimaHoraTocadaRef = useRef("");
	const filaAudioVozRef = useRef([]);
	const tocandoVozRef = useRef(false);
	const historicoChunksRef = useRef(new Set());
	const ultimaVinhetaTocadaRef = useRef(0);
	const primeiraCargaFirebaseRef = useRef(true);
	const ultimaTrocaForcadaRef = useRef(0);
	const ultimaAtualizacaoProgRef = useRef(0);
	const emTransicaoSuaveRef = useRef(false);
	const sincronizandoRef = useRef(false);
	const wakeLockRef = useRef(null);

	const estadoMesaRef = useRef({
		ao_vivo: false,
		mic_volume: 1.0,
		musica_tocando: true,
		musica_volume: 1.0,
		ultimo_chunk: 0,
	});

	const aplicarVolumesMesa = useCallback(() => {
		const estadoMesa = estadoMesaRef.current;
		const volMaster = Math.max(0, Math.min(1, volumeMasterRef.current));

		const volMusicaMesa =
			estadoMesa && typeof estadoMesa.musica_volume === "number"
				? Math.max(0, Math.min(1, estadoMesa.musica_volume))
				: 1.0;

		const volMicMesa =
			estadoMesa && typeof estadoMesa.mic_volume === "number"
				? Math.max(0, Math.min(1, estadoMesa.mic_volume))
				: 1.0;

		// CH-1 (Mic) e CH-2 (Música) seguem a mesma regra e nunca ultrapassam o volume Master do ouvinte
		const volumeFinalMusica = Math.max(
			0,
			Math.min(1, volMaster * volMusicaMesa),
		);
		const volumeFinalMic = Math.max(0, Math.min(1, volMaster * volMicMesa));

		const ctx = audioCtxRef.current;
		const gainNodeMusica = gainNodeMusicaRef.current;
		if (gainNodeMusica && ctx) {
			try {
				if (ctx.state === "running") {
					gainNodeMusica.gain.setValueAtTime(volumeFinalMusica, ctx.currentTime);
				} else {
					gainNodeMusica.gain.value = volumeFinalMusica;
				}
			} catch {
				gainNodeMusica.gain.value = volumeFinalMusica;
			}
		}

		const deckAtivo =
			deckAtivoRef.current === "A"
				? playerRef.current
				: playerDeckBRef.current;
		const deckOcioso =
			deckAtivoRef.current === "A"
				? playerDeckBRef.current
				: playerRef.current;

		if (deckAtivo && !emTransicaoAntecipadaRef.current) {
			try {
				deckAtivo.volume = volumeFinalMusica;
			} catch {
				// Ignora erro em dispositivos com volume fixo por botões físicos (ex.: iOS)
			}
		}
		if (deckOcioso && !emTransicaoAntecipadaRef.current) {
			try {
				deckOcioso.volume = 0;
			} catch {
				// ignore
			}
		}

		const gainNodeVoz = gainNodeVozRef.current;
		if (gainNodeVoz && ctx && ctx.state === "running") {
			gainNodeVoz.gain.setValueAtTime(volumeFinalMic, ctx.currentTime);
		}

		const playerVoz = playerVozRef.current;
		if (playerVoz) {
			try {
				playerVoz.volume = volumeFinalMic;
			} catch {
				// Ignora erro em dispositivos com volume fixo
			}
		}

		const playerHora = playerHoraRef.current;
		if (playerHora) {
			try {
				playerHora.volume = volumeFinalMusica;
			} catch {
				// Ignora erro em dispositivos com volume fixo
			}
		}

		const playerVinheta = playerVinhetaRef.current;
		if (playerVinheta) {
			try {
				playerVinheta.volume = volumeFinalMusica;
			} catch {
				// Ignora erro em dispositivos com volume fixo
			}
		}
	}, []);

	/**
	 * Inicializa o AudioContext e conecta o player ao AnalyserNode Web Audio.
	 * O áudio da música alimenta o analisador de frequência em tempo real (VU meter / UV),
	 * acompanhando precisamente o ritmo, graves e agudos da música tocada.
	 */
	const inicializarAudioContext = useCallback(() => {
		try {
			if (!audioCtxRef.current) {
				const AudioCtx = window.AudioContext || window.webkitAudioContext;
				if (!AudioCtx) return;

				const ctx = new AudioCtx();
				const analyser = ctx.createAnalyser();
				analyser.fftSize = 256;
				analyser.smoothingTimeConstant = 0.65;

				const gainNodeMusica = ctx.createGain();
				const gainNodeVoz = ctx.createGain();

				gainNodeMusica.connect(analyser);
				gainNodeVoz.connect(analyser);
				analyser.connect(ctx.destination);

				audioCtxRef.current = ctx;
				analyserRef.current = analyser;
				gainNodeMusicaRef.current = gainNodeMusica;
				gainNodeVozRef.current = gainNodeVoz;
				dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
			}

			const ctx = audioCtxRef.current;
			if (ctx && ctx.state === "suspended") {
				ctx.resume().catch(() => {});
			}

			// Conecta os decks <audio> ao grafo Web Audio para análise real de frequência (UV) e crossfade
			const playerA = playerRef.current;
			if (
				ctx &&
				playerA &&
				!sourceNodeMusicaRef.current &&
				gainNodeMusicaRef.current
			) {
				try {
					const source = ctx.createMediaElementSource(playerA);
					source.connect(gainNodeMusicaRef.current);
					sourceNodeMusicaRef.current = source;
				} catch {
					// Já conectado anteriormente
				}
			}

			const playerB = playerDeckBRef.current;
			if (
				ctx &&
				playerB &&
				!sourceNodeMusicaBRef.current &&
				gainNodeMusicaRef.current
			) {
				try {
					const sourceB = ctx.createMediaElementSource(playerB);
					sourceB.connect(gainNodeMusicaRef.current);
					sourceNodeMusicaBRef.current = sourceB;
				} catch {
					// Já conectado anteriormente
				}
			}

			aplicarVolumesMesa();
		} catch {
			// Fallback silencioso caso o navegador bloqueie Web Audio
		}
	}, [aplicarVolumesMesa]);

	const tocarProximoBlocoVoz = useCallback(async () => {
		if (filaAudioVozRef.current.length === 0) {
			tocandoVozRef.current = false;
			aplicarVolumesMesa();
			return;
		}

		tocandoVozRef.current = true;
		const item = filaAudioVozRef.current.shift();
		aplicarVolumesMesa();

		let finalizado = false;
		const limparEProximo = () => {
			if (finalizado) return;
			finalizado = true;
			sourceNodeVozRef.current = null;
			if (item?.url) {
				try {
					URL.revokeObjectURL(item.url);
				} catch {
					// ignore
				}
			}
			tocarProximoBlocoVoz();
		};

		// 1. Tenta reproduzir via Web Audio API (AudioBufferSourceNode -> gainNodeVoz)
		// que funciona em segundo plano no celular sem bloqueio de autoplay por elemento e respeita o fader CH-1
		const ctx = audioCtxRef.current;
		if (ctx && ctx.state === "suspended") {
			await ctx.resume().catch(() => {});
		}

		if (
			ctx &&
			ctx.state === "running" &&
			gainNodeVozRef.current &&
			item?.blob
		) {
			try {
				const buffer = await item.blob.arrayBuffer();
				const audioBuffer = await ctx.decodeAudioData(buffer);
				if (!estaTocandoRef.current) {
					limparEProximo();
					return;
				}
				const source = ctx.createBufferSource();
				source.buffer = audioBuffer;
				source.connect(gainNodeVozRef.current);
				sourceNodeVozRef.current = source;
				source.onended = limparEProximo;
				source.start(0);
				return;
			} catch {
				// Se decodeAudioData falhar para algum formato, usa o fallback <audio> abaixo
			}
		}

		// 2. Fallback via elemento <audio ref={playerVozRef}>
		const playerVoz = playerVozRef.current;
		if (!playerVoz || !item?.url) {
			limparEProximo();
			return;
		}

		playerVoz.src = item.url;
		aplicarVolumesMesa();
		playerVoz.onended = limparEProximo;
		playerVoz.onerror = limparEProximo;

		playerVoz.play().catch(() => {
			limparEProximo();
		});
	}, [aplicarVolumesMesa]);

	const tocarHoraCerta = useCallback(
		(arquivo, horario) => {
			const playerHora = playerHoraRef.current;
			if (!playerHora) return;

			ultimaHoraTocadaRef.current = horario;
			const ctx = audioCtxRef.current;
			const gainNodeMusica = gainNodeMusicaRef.current;
			if (gainNodeMusica && ctx && ctx.state === "running") {
				gainNodeMusica.gain.setValueAtTime(
					0.2 * volumeMasterRef.current,
					ctx.currentTime,
				);
			}
			if (playerRef.current) {
				try {
					playerRef.current.volume = 0.2 * volumeMasterRef.current;
				} catch {
					// ignore
				}
			}

			const volMusicaMesa =
				estadoMesaRef.current &&
				typeof estadoMesaRef.current.musica_volume === "number"
					? Math.max(0, Math.min(1, estadoMesaRef.current.musica_volume))
					: 1.0;
			const volumeFinalHora = Math.max(
				0,
				Math.min(1, volumeMasterRef.current * volMusicaMesa),
			);

			playerHora.src = resolveRadioAssetUrl(arquivo);
			try {
				playerHora.volume = volumeFinalHora;
			} catch {
				// ignore
			}
			playerHora.play().catch(() => {});

			playerHora.onended = () => {
				aplicarVolumesMesa();
			};
		},
		[aplicarVolumesMesa],
	);


	const sincronizarRadio = useCallback(
		async (forcarProxima = false, { recarregarAudio = false } = {}) => {
			if (
				sincronizandoRef.current &&
				!forcarProxima &&
				!recarregarAudio
			) {
				return null;
			}
			sincronizandoRef.current = true;

			try {
				const data = await fetchRadioSync({ forcarProxima });

				if (!data || data.error) {
					setTituloMusica(data?.error || "Sem programação");
					setNomeOuvinte("");
					return data;
				}

				const nomeOriginal = data.faixa_atual?.nome || "";
				const matchOuvinte = nomeOriginal.match(/\s*\(([^)]+)\)\s*$/);

				if (matchOuvinte) {
					const nomePuro = nomeOriginal.replace(matchOuvinte[0], "").trim();
					const textoOuvinte = matchOuvinte[1].trim();

					setTituloMusica(nomePuro);
					setNomeOuvinte(
						/^pedido/i.test(textoOuvinte)
							? `👤 ${textoOuvinte}`
							: `👤 Pedido de: ${textoOuvinte}`,
					);
				} else {
					setTituloMusica(nomeOriginal);
					setNomeOuvinte("");
				}

				setProximaFaixa(`A seguir: ${data.proxima_faixa?.nome || "--"}`);
				if (data.proxima_faixa?.url) {
					proximaUrlRef.current = resolveRadioAssetUrl(data.proxima_faixa.url);
				}

				if (data.programa) {
					setProgramaAtual(data.programa);
				}
				if (data.proximo_programa) {
					setProximoPrograma(data.proximo_programa);
				}

				const novaUrl = resolveRadioAssetUrl(data.faixa_atual?.url || "");
				if (!novaUrl) return data;

				const offsetExato = Math.max(0, data.offset_segundos || 0);
				const pausadoNaMesa =
					data.pausado === true ||
					estadoMesaRef.current?.musica_tocando === false;
				const deckAtivo =
					deckAtivoRef.current === "A"
						? playerRef.current
						: playerDeckBRef.current;
				const deckOcioso =
					deckAtivoRef.current === "A"
						? playerDeckBRef.current
						: playerRef.current;

				const mesmaFaixaJaTocando =
					urlFaixaAtualRef.current === novaUrl &&
					deckAtivo &&
					!deckAtivo.paused &&
					!recarregarAudio;

				if (
					deckAtivo &&
					!mesmaFaixaJaTocando &&
					(forcarProxima ||
						recarregarAudio ||
						!urlFaixaAtualRef.current ||
						urlFaixaAtualRef.current !== novaUrl)
				) {
					urlFaixaAtualRef.current = novaUrl;
					deckAtivo.muted = false;
					deckAtivo.src = novaUrl;

					// Pré-carrega a próxima faixa no deck ocioso para virada antecipada suave
					if (
						deckOcioso &&
						proximaUrlRef.current &&
						deckOcioso.src !== proximaUrlRef.current
					) {
						deckOcioso.src = proximaUrlRef.current;
						deckOcioso.preload = "auto";
					}

					aplicarVolumesMesa();

					const posicionarOffset = () => {
						if (!forcarProxima && offsetExato > 2) {
							try {
								deckAtivo.currentTime = offsetExato;
							} catch {
								// ignore seek error before metadata
							}
						}
					};

					if (deckAtivo.readyState >= 1) {
						posicionarOffset();
					} else {
						deckAtivo.addEventListener("loadedmetadata", posicionarOffset, {
							once: true,
						});
					}

					if (pausadoNaMesa) {
						deckAtivo.pause();
					} else if (estaTocandoRef.current) {
						if (audioCtxRef.current?.state === "suspended") {
							audioCtxRef.current.resume().catch(() => {});
						}

						const iniciarPlay = () => {
							deckAtivo.muted = false;
							aplicarVolumesMesa();
							deckAtivo
								.play()
								.then(() => {
									setStatusTexto("Transmitindo em tempo real");
								})
								.catch((err) => {
									if (err?.name === "AbortError") {
										deckAtivo.addEventListener(
											"canplay",
											() => {
												if (
													estaTocandoRef.current &&
													estadoMesaRef.current?.musica_tocando !== false &&
													deckAtivo.paused
												) {
													deckAtivo.muted = false;
													aplicarVolumesMesa();
													deckAtivo.play().catch(() => {});
												}
											},
											{ once: true },
										);
										return;
									}
									deckAtivo.muted = true;
									deckAtivo
										.play()
										.then(() => {
											setStatusTexto("Transmitindo em tempo real");
										})
										.catch(() => {});
								});
						};

						iniciarPlay();
					}
				} else if (deckAtivo && pausadoNaMesa) {
					if (!deckAtivo.paused) {
						deckAtivo.pause();
					}
				} else if (
					deckAtivo &&
					estaTocandoRef.current &&
					!deckAtivo.paused &&
					deckAtivo.readyState >= 2 &&
					Math.abs(deckAtivo.currentTime - offsetExato) > 4
				) {
					try {
						deckAtivo.currentTime = offsetExato;
					} catch {
						// ignore
					}
				}

				const minutoAgora = new Date().getMinutes();
				if (
					(minutoAgora === 0 || minutoAgora === 30) &&
					data.hora_certa?.arquivo &&
					ultimaHoraTocadaRef.current !== data.hora_certa.horario
				) {
					tocarHoraCerta(data.hora_certa.arquivo, data.hora_certa.horario);
				}

				return data;
			} catch {
				setStatusTexto("Erro ao sincronizar rádio");
				return null;
			} finally {
				sincronizandoRef.current = false;
			}
		},
		[aplicarVolumesMesa, tocarHoraCerta],
	);

	const executarCrossfadeOuvinte = useCallback(async () => {
		if (emTransicaoSuaveRef.current) return;
		emTransicaoSuaveRef.current = true;

		try {
			const passos = 7;
			const tempoPasso = 90;
			const player = playerRef.current;
			const ctx = audioCtxRef.current;
			const gainNodeMusica = gainNodeMusicaRef.current;
			const volAtual = player?.volume ?? 1;

			for (let i = 1; i <= passos; i++) {
				await new Promise((r) => setTimeout(r, tempoPasso));
				const v = Math.max(0, volAtual - (volAtual / passos) * i);
				if (gainNodeMusica && ctx && ctx.state === "running") {
					gainNodeMusica.gain.setValueAtTime(v, ctx.currentTime);
				}
				if (player) {
					try {
						player.volume = v;
					} catch {
						// ignore
					}
				}
			}

			// Carrega a nova música que o locutor já virou no servidor
			await sincronizarRadio(false, { recarregarAudio: true });

			for (let i = 1; i <= passos; i++) {
				await new Promise((r) => setTimeout(r, 80));
				const volAlvo = Math.max(
					0,
					Math.min(
						1,
						volumeMasterRef.current *
							(estadoMesaRef.current.musica_volume ?? 1.0),
					),
				);
				const v = Math.min(volAlvo, (volAlvo / passos) * i);
				if (gainNodeMusica && ctx && ctx.state === "running") {
					gainNodeMusica.gain.setValueAtTime(v, ctx.currentTime);
				}
				if (player) {
					try {
						player.volume = v;
					} catch {
						// ignore
					}
				}
			}
		} finally {
			aplicarVolumesMesa();
			emTransicaoSuaveRef.current = false;
		}
	}, [aplicarVolumesMesa, sincronizarRadio]);

	const ajustarVolume = useCallback(
		(novoValor) => {
			const val = Math.max(0, Math.min(1, parseFloat(novoValor)));
			volumeMasterRef.current = val;
			setVolumeMaster(val);
			aplicarVolumesMesa();
		},
		[aplicarVolumesMesa, setVolumeMaster],
	);

	const mutarOuRestaurar = useCallback(() => {
		if (volumeMasterRef.current > 0) {
			ajustarVolume(0);
		} else {
			ajustarVolume(1);
		}
	}, [ajustarVolume]);

	const alternarReproducao = useCallback(() => {
		inicializarAudioContext();
		const deckAtivo =
			deckAtivoRef.current === "A"
				? playerRef.current
				: playerDeckBRef.current;

		// Se o áudio estava mudo devido ao bloqueio de autoplay do navegador na abertura,
		// o primeiro toque deve liberar o som imediatamente, e não pausar
		if (deckAtivo && deckAtivo.muted) {
			deckAtivo.muted = false;
			aplicarVolumesMesa();
			estaTocandoRef.current = true;
			setEstaTocando(true);
			setStatusTexto("Transmitindo em tempo real");
			if (deckAtivo.paused) {
				deckAtivo.play().catch(() => {});
			}
			return;
		}

		if (!estaTocandoRef.current) {
			estaTocandoRef.current = true;
			setEstaTocando(true);
			setStatusTexto("Iniciando transmissão...");

			if (deckAtivo) {
				deckAtivo.muted = false;
			}
			aplicarVolumesMesa();

			if (estadoMesaRef.current?.musica_tocando === false) {
				setStatusTexto("Transmitindo em tempo real");
				sincronizarRadio(false, { recarregarAudio: true });
			} else if (deckAtivo?.src && deckAtivo.src !== window.location.href) {
				deckAtivo
					.play()
					.then(() => {
						setStatusTexto("Transmitindo em tempo real");
					})
					.catch(() => {
						sincronizarRadio(false, { recarregarAudio: true });
					});
			} else {
				sincronizarRadio(false, { recarregarAudio: true });
			}
		} else {
			estaTocandoRef.current = false;
			setEstaTocando(false);
			playerRef.current?.pause();
			playerDeckBRef.current?.pause();
			playerVozRef.current?.pause();
			playerVinhetaRef.current?.pause();
			if (sourceNodeVozRef.current) {
				try {
					sourceNodeVozRef.current.stop();
				} catch {
					// ignore
				}
				sourceNodeVozRef.current = null;
			}
			filaAudioVozRef.current = [];
			tocandoVozRef.current = false;
			setStatusTexto("Em pausa");
		}
	}, [aplicarVolumesMesa, inicializarAudioContext, sincronizarRadio]);

	const alternarExpansaoCard = useCallback(() => {
		setRecolhido((prev) => !prev);
	}, []);

	// Sincronização inicial e intervalo de 30s
	useEffect(() => {
		sincronizarRadio(false);

		const interval = setInterval(() => {
			if (estaTocandoRef.current && !emTransicaoSuaveRef.current) {
				sincronizarRadio(false);
			}
		}, 30000);

		return () => clearInterval(interval);
	}, [sincronizarRadio]);

	// Monitoramento contínuo da faixa para transição suave antecipada de 2s
	useEffect(() => {
		const interval = setInterval(() => {
			if (
				!estaTocandoRef.current ||
				emTransicaoAntecipadaRef.current ||
				emTransicaoSuaveRef.current ||
				vinhetaEmExecucaoRef.current ||
				estadoMesaRef.current?.musica_tocando === false
			) {
				return;
			}

			const deckAtual =
				deckAtivoRef.current === "A"
					? playerRef.current
					: playerDeckBRef.current;
			const deckProximo =
				deckAtivoRef.current === "A"
					? playerDeckBRef.current
					: playerRef.current;

			if (
				!deckAtual ||
				deckAtual.paused ||
				!Number.isFinite(deckAtual.duration) ||
				deckAtual.duration < 5
			) {
				return;
			}

			const restante = deckAtual.duration - deckAtual.currentTime;
			// Quando faltar <= 2.0s para o término da música, já entra a próxima faixa!
			if (restante <= 2.0 && restante > 0) {
				emTransicaoAntecipadaRef.current = true;
				const proximaUrl = proximaUrlRef.current;
				const volMaster = Math.max(0, Math.min(1, volumeMasterRef.current));
				const volMesa =
					typeof estadoMesaRef.current?.musica_volume === "number"
						? Math.max(0, Math.min(1, estadoMesaRef.current.musica_volume))
						: 1.0;
				const volAlvo = Math.max(0, Math.min(1, volMaster * volMesa));

				if (deckProximo && proximaUrl) {
					deckProximo.src = proximaUrl;
					deckProximo.currentTime = 0;
					try {
						deckProximo.volume = volAlvo;
					} catch {
						// ignore
					}
					deckProximo.play().catch(() => {});
				}

				// Fade out suave na faixa que encerra durante os 2 segundos
				const fadeInterval = setInterval(() => {
					if (!deckAtual || deckAtual.paused) {
						clearInterval(fadeInterval);
						return;
					}
					const r = deckAtual.duration - deckAtual.currentTime;
					if (r <= 0.1) {
						clearInterval(fadeInterval);
						deckAtual.pause();
						try {
							deckAtual.currentTime = 0;
							deckAtual.volume = 0;
						} catch {
							// ignore
						}
					} else {
						try {
							deckAtual.volume = Math.max(0, volAlvo * (r / 2.0));
						} catch {
							// ignore
						}
					}
				}, 100);

				setTimeout(() => {
					clearInterval(fadeInterval);
					if (deckAtual) {
						deckAtual.pause();
						try {
							deckAtual.currentTime = 0;
							deckAtual.volume = 0;
						} catch {
							// ignore
						}
					}

					deckAtivoRef.current = deckAtivoRef.current === "A" ? "B" : "A";
					if (proximaUrl) {
						urlFaixaAtualRef.current = proximaUrl;
					}
					emTransicaoAntecipadaRef.current = false;
					aplicarVolumesMesa();

					// Notifica o servidor para atualizar a programação
					sincronizarRadio(true);
				}, 2100);
			}
		}, 250);

		return () => clearInterval(interval);
	}, [aplicarVolumesMesa, sincronizarRadio]);

	// Desbloqueio imediato de áudio em qualquer interação, toque ou movimento na tela
	useEffect(() => {
		const desbloquear = () => {
			inicializarAudioContext();

			const player = playerRef.current;
			if (
				!player ||
				!estaTocandoRef.current ||
				!player.src ||
				estadoMesaRef.current?.musica_tocando === false
			) {
				return;
			}

			if (player.muted) {
				player.muted = false;
				aplicarVolumesMesa();
			}

			if (player.paused) {
				player
					.play()
					.then(() => {
						player.muted = false;
						aplicarVolumesMesa();
						setStatusTexto("Transmitindo em tempo real");
					})
					.catch(() => {});
			}
		};

		const eventos = [
			"click",
			"touchstart",
			"touchend",
			"pointerdown",
			"mousedown",
			"keydown",
			"pointermove",
			"mousemove",
			"wheel",
			"scroll",
			"focus",
		];

		eventos.forEach((evt) =>
			window.addEventListener(evt, desbloquear, {
				passive: true,
				capture: true,
			}),
		);

		return () => {
			eventos.forEach((evt) =>
				window.removeEventListener(evt, desbloquear, { capture: true }),
			);
		};
	}, [aplicarVolumesMesa, inicializarAudioContext]);

	// Assinatura em tempo real do Firebase (nó `mesa`)
	useEffect(() => {
		const unsubscribe = subscribeToMesa((dados) => {
			estadoMesaRef.current = dados;

			if (!emTransicaoSuaveRef.current) {
				aplicarVolumesMesa();
			}

			const player = playerRef.current;
			if (dados.musica_tocando === false && !vinhetaEmExecucaoRef.current) {
				if (player && !player.paused) {
					player.pause();
				}
			} else if (
				dados.musica_tocando === true &&
				estaTocandoRef.current &&
				player &&
				player.paused &&
				player.src &&
				!vinhetaEmExecucaoRef.current &&
				!emTransicaoSuaveRef.current
			) {
				player
					.play()
					.then(() => {
						player.muted = false;
						aplicarVolumesMesa();
						setStatusTexto("Transmitindo em tempo real");
					})
					.catch(() => {});
			}

			if (primeiraCargaFirebaseRef.current) {
				primeiraCargaFirebaseRef.current = false;
				const chunkRecenteAoVivo =
					dados.ao_vivo &&
					dados.ultimo_chunk &&
					Date.now() - Number(dados.ultimo_chunk) < 8000;

				if (dados.ultimo_chunk && !chunkRecenteAoVivo) {
					historicoChunksRef.current.add(dados.ultimo_chunk);
				}
				if (dados.forcar_troca) {
					ultimaTrocaForcadaRef.current = dados.forcar_troca;
				}
				if (dados.atualizacao_programacao) {
					ultimaAtualizacaoProgRef.current = dados.atualizacao_programacao;
				}
				if (dados.vinheta_ativa?.timestamp) {
					ultimaVinhetaTocadaRef.current = dados.vinheta_ativa.timestamp;
				}
				if (!chunkRecenteAoVivo) {
					return;
				}
			}

			if (
				dados.forcar_troca &&
				dados.forcar_troca > ultimaTrocaForcadaRef.current
			) {
				ultimaTrocaForcadaRef.current = dados.forcar_troca;
				if (estaTocandoRef.current) {
					executarCrossfadeOuvinte();
				} else {
					sincronizarRadio(false);
				}
			}

			if (
				dados.atualizacao_programacao &&
				dados.atualizacao_programacao > ultimaAtualizacaoProgRef.current
			) {
				ultimaAtualizacaoProgRef.current = dados.atualizacao_programacao;
				if (!emTransicaoSuaveRef.current) {
					sincronizarRadio(false);
				}
			}

			if (
				dados.vinheta_ativa &&
				dados.vinheta_ativa.timestamp > ultimaVinhetaTocadaRef.current
			) {
				ultimaVinhetaTocadaRef.current = dados.vinheta_ativa.timestamp;
				const playerVinheta = playerVinhetaRef.current;
				const playerVoz = playerVozRef.current;
				const deckAtivo =
					deckAtivoRef.current === "A"
						? playerRef.current
						: playerDeckBRef.current;

				if (dados.vinheta_ativa.acao === "parar") {
					vinhetaEmExecucaoRef.current = false;
					playerVinheta?.pause();
					playerVoz?.pause();
					if (
						estaTocandoRef.current &&
						deckAtivo &&
						deckAtivo.paused &&
						deckAtivo.src
					) {
						deckAtivo.play().catch(() => {});
					}
					aplicarVolumesMesa();
				} else {
					const caminhoVinheta =
						dados.vinheta_ativa.url || dados.vinheta_ativa.arquivo || "";
					const urlVinheta = resolveRadioAssetUrl(caminhoVinheta);
					const caminhoPrefixo = dados.vinheta_ativa.prefixo || null;

					// Se possui vinheta de prefixo (ex: recadinhosFlash.mp3 antes da voz da IA)
					if (
						caminhoPrefixo &&
						playerVinheta &&
						urlVinheta &&
						estaTocandoRef.current
					) {
						vinhetaEmExecucaoRef.current = true;
						if (deckAtivo && !deckAtivo.paused) {
							deckAtivo.pause();
						}

						const urlPrefixo = resolveRadioAssetUrl(caminhoPrefixo);
						playerVinheta.src = urlPrefixo;
						aplicarVolumesMesa();

						if (playerVoz) {
							playerVoz.src = urlVinheta;
							playerVoz.load();
						}

						let iaIniciada = false;
						let finalizado = false;

						const encerrarRecado = () => {
							if (finalizado) return;
							finalizado = true;
							playerVinheta.ontimeupdate = null;
							playerVinheta.onended = null;
							playerVinheta.onerror = null;
							if (playerVoz) {
								playerVoz.onended = null;
								playerVoz.onerror = null;
							}
							vinhetaEmExecucaoRef.current = false;
							aplicarVolumesMesa();
							if (
								estaTocandoRef.current &&
								deckAtivo &&
								deckAtivo.paused &&
								deckAtivo.src
							) {
								deckAtivo.play().catch(() => {});
							}
							if (caminhoVinheta.includes("temp_")) {
								limparTempVinheta(caminhoVinheta).catch(() => {});
							}
						};

						const iniciarVozIa = () => {
							if (iaIniciada) return;
							iaIniciada = true;
							if (playerVoz && estaTocandoRef.current) {
								aplicarVolumesMesa();
								playerVoz.currentTime = 0;
								playerVoz.play().catch(() => {});
								playerVoz.onended = encerrarRecado;
								playerVoz.onerror = encerrarRecado;
							}
						};

						// Intercala: faltando ~1.5s para concluir a vinheta de prefixo, já inicia a voz da IA
						playerVinheta.ontimeupdate = () => {
							if (iaIniciada) return;
							const dur = playerVinheta.duration;
							const cur = playerVinheta.currentTime;
							if (Number.isFinite(dur) && dur > 1.5) {
								if (dur - cur <= 1.5) {
									iniciarVozIa();
								}
							}
						};

						playerVinheta.onended = () => {
							iniciarVozIa();
							if (!playerVoz || !urlVinheta) {
								encerrarRecado();
							}
						};

						playerVinheta.onerror = () => {
							iniciarVozIa();
							if (!playerVoz || !urlVinheta) {
								encerrarRecado();
							}
						};

						playerVinheta.play().catch(() => {
							iniciarVozIa();
						});
					} else if (playerVinheta && urlVinheta && estaTocandoRef.current) {
						// Vinheta normal sem prefixo
						vinhetaEmExecucaoRef.current = true;
						if (deckAtivo && !deckAtivo.paused) {
							deckAtivo.pause();
						}
						playerVinheta.src = urlVinheta;
						aplicarVolumesMesa();

						const restaurarMusicaOuvinte = () => {
							vinhetaEmExecucaoRef.current = false;
							aplicarVolumesMesa();
							if (
								estaTocandoRef.current &&
								deckAtivo &&
								deckAtivo.paused &&
								deckAtivo.src
							) {
								deckAtivo.play().catch(() => {});
							}
							if (caminhoVinheta.includes("temp_")) {
								limparTempVinheta(caminhoVinheta).catch(() => {});
							}
						};

						playerVinheta.onended = restaurarMusicaOuvinte;
						playerVinheta.onerror = restaurarMusicaOuvinte;
						playerVinheta.play().catch(() => {
							restaurarMusicaOuvinte();
						});
					}
				}
			}

			const chunkId = dados.ultimo_chunk;
			if (chunkId && !historicoChunksRef.current.has(chunkId)) {
				historicoChunksRef.current.add(chunkId);

				if (historicoChunksRef.current.size > 150) {
					const primeiro = historicoChunksRef.current.values().next().value;
					historicoChunksRef.current.delete(primeiro);
				}

				fetchVoiceChunkBlob(chunkId).then((blob) => {
					if (!blob) return;
					const urlBlob = URL.createObjectURL(blob);
					filaAudioVozRef.current.push({ url: urlBlob, blob });

					if (!tocandoVozRef.current && estaTocandoRef.current) {
						tocarProximoBlocoVoz();
					}
				});
			}
		});

		return () => unsubscribe();
	}, [
		aplicarVolumesMesa,
		executarCrossfadeOuvinte,
		sincronizarRadio,
		tocarProximoBlocoVoz,
	]);

	// WakeLock API + NoSleep HTML5 Video para manter a tela do celular acesa (inclusive em HTTP local)
	useEffect(() => {
		const wakeVideo = wakeVideoRef.current;
		const player = playerRef.current;

		const liberarWakeLock = () => {
			if (wakeLockRef.current) {
				wakeLockRef.current.release().catch(() => {});
				wakeLockRef.current = null;
			}
			if (wakeVideo && !wakeVideo.paused) {
				wakeVideo.pause();
			}
		};

		const manterTelaAcesa = async () => {
			if (!estaTocandoRef.current) {
				return;
			}

			// 1. Mantém o vídeo NoSleep ativo em loop contínuo (mantém tela e processos acordados em HTTP e celular)
			if (wakeVideo) {
				wakeVideo.muted = true;
				wakeVideo.playsInline = true;
				wakeVideo.loop = true;
				if (wakeVideo.paused) {
					wakeVideo.play().catch(() => {});
				}
			}

			// 2. Solicita WakeLock nativa caso o navegador disponha da API (HTTPS / localhost)
			if (
				"wakeLock" in navigator &&
				document.visibilityState === "visible"
			) {
				if (!wakeLockRef.current || wakeLockRef.current.released) {
					try {
						const sentinel = await navigator.wakeLock.request("screen");
						wakeLockRef.current = sentinel;
						sentinel.addEventListener("release", () => {
							if (wakeLockRef.current === sentinel) {
								wakeLockRef.current = null;
							}
						});
					} catch {
						// Ignora caso exija contexto seguro ou gesto
					}
				}
			}
		};

		const aoMudarVisibilidade = () => {
			if (document.visibilityState === "visible" && estaTocandoRef.current) {
				manterTelaAcesa();
			}
		};

		if (estaTocando) {
			manterTelaAcesa();
			document.addEventListener("visibilitychange", aoMudarVisibilidade);
			window.addEventListener("focus", manterTelaAcesa);
			document.addEventListener("touchstart", manterTelaAcesa, {
				passive: true,
			});
			document.addEventListener("click", manterTelaAcesa, { passive: true });
			document.addEventListener("pointerdown", manterTelaAcesa, {
				passive: true,
			});
			document.addEventListener("keydown", manterTelaAcesa, { passive: true });
			player?.addEventListener("playing", manterTelaAcesa);
		} else {
			liberarWakeLock();
		}

		const keepAliveInterval = estaTocando
			? setInterval(manterTelaAcesa, 10000)
			: null;

		return () => {
			if (keepAliveInterval) clearInterval(keepAliveInterval);
			document.removeEventListener("visibilitychange", aoMudarVisibilidade);
			window.removeEventListener("focus", manterTelaAcesa);
			document.removeEventListener("touchstart", manterTelaAcesa);
			document.removeEventListener("click", manterTelaAcesa);
			document.removeEventListener("pointerdown", manterTelaAcesa);
			document.removeEventListener("keydown", manterTelaAcesa);
			player?.removeEventListener("playing", manterTelaAcesa);
			liberarWakeLock();
		};
	}, [estaTocando]);

	// MediaSession API para integração nativa no celular
	useEffect(() => {
		if (!("mediaSession" in navigator)) return;
		try {
			navigator.mediaSession.playbackState = estaTocando ? "playing" : "paused";
			if (typeof window.MediaMetadata !== "undefined") {
				navigator.mediaSession.metadata = new window.MediaMetadata({
					title: tituloMusica || "Flash FM",
					artist: nomeOuvinte || "Flash FM — Ao Vivo",
					album: proximaFaixa || "Transmissão em tempo real",
				});
			}
		} catch {
			// Ignora caso o navegador não suporte MediaMetadata
		}
	}, [estaTocando, nomeOuvinte, proximaFaixa, tituloMusica]);

	const handleTrackEnded = useCallback(() => {
		if (emTransicaoSuaveRef.current || emTransicaoAntecipadaRef.current) return;

		const deckOcioso =
			deckAtivoRef.current === "A"
				? playerDeckBRef.current
				: playerRef.current;
		const proximaUrl = proximaUrlRef.current;

		// 1. Transição imediata no deck ocioso para manter a reprodução contínua
		if (deckOcioso && proximaUrl && estaTocandoRef.current) {
			urlFaixaAtualRef.current = proximaUrl;
			deckOcioso.muted = false;
			deckOcioso.src = proximaUrl;
			deckAtivoRef.current = deckAtivoRef.current === "A" ? "B" : "A";
			aplicarVolumesMesa();
			deckOcioso.play().catch(() => {});
		}

		setStatusTexto("Carregando próxima música...");

		// 2. Consulta o servidor para avançar e atualizar títulos e metadados
		sincronizarRadio(true).then((data) => {
			const urlServidor = resolveRadioAssetUrl(data?.faixa_atual?.url || "");
			const deck =
				deckAtivoRef.current === "A"
					? playerRef.current
					: playerDeckBRef.current;
			if (
				deck &&
				urlServidor &&
				urlServidor !== urlFaixaAtualRef.current &&
				estaTocandoRef.current
			) {
				urlFaixaAtualRef.current = urlServidor;
				deck.src = urlServidor;
				deck.play().catch(() => {});
			}
		});
	}, [aplicarVolumesMesa, sincronizarRadio]);

	const handleTrackError = useCallback(() => {
		if (emTransicaoSuaveRef.current) return;
		setStatusTexto("Reconectando áudio...");
		// Se o arquivo atual falhou (ex.: 404), avança para a próxima faixa válida no servidor
		setTimeout(() => sincronizarRadio(true, { recarregarAudio: true }), 1500);
	}, [sincronizarRadio]);

	return {
		estaTocando,
		tituloMusica,
		nomeOuvinte,
		proximaFaixa,
		statusTexto,
		volumeMaster,
		recolhido,
		programaAtual,
		proximoPrograma,
		playerRef,
		playerDeckBRef,
		playerHoraRef,
		playerVozRef,
		playerVinhetaRef,
		wakeVideoRef,
		audioCtxRef,
		analyserRef,
		dataArrayRef,
		ajustarVolume,
		mutarOuRestaurar,
		alternarReproducao,
		alternarExpansaoCard,
		handleTrackEnded,
		handleTrackError,
	};
};
