import { useCallback, useEffect, useRef, useState } from "react";
import { useRecoilState } from "recoil";
import { volumeAtom } from "@/globalState";
import {
	fetchRadioSync,
	fetchVoiceChunkBlob,
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

	const playerRef = useRef(null);
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

		const player = playerRef.current;
		if (player) {
			try {
				player.volume = volumeFinalMusica;
			} catch {
				// Ignora erro em dispositivos com volume fixo por botões físicos (ex.: iOS)
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
				playerHora.volume = volMaster;
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

			// Conecta o elemento <audio> principal ao grafo Web Audio para análise real de frequência (UV)
			const player = playerRef.current;
			if (
				ctx &&
				player &&
				!sourceNodeMusicaRef.current &&
				gainNodeMusicaRef.current
			) {
				try {
					const source = ctx.createMediaElementSource(player);
					source.connect(gainNodeMusicaRef.current);
					sourceNodeMusicaRef.current = source;
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

			playerHora.src = resolveRadioAssetUrl(arquivo);
			try {
				playerHora.volume = volumeMasterRef.current;
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

				const novaUrl = resolveRadioAssetUrl(data.faixa_atual?.url || "");
				if (!novaUrl) return data;

				const offsetExato = Math.max(0, data.offset_segundos || 0);
				const pausadoNaMesa =
					data.pausado === true ||
					estadoMesaRef.current?.musica_tocando === false;
				const player = playerRef.current;

				if (
					player &&
					(forcarProxima ||
						recarregarAudio ||
						!urlFaixaAtualRef.current ||
						urlFaixaAtualRef.current !== novaUrl)
				) {
					urlFaixaAtualRef.current = novaUrl;
					player.muted = false;
					player.src = novaUrl;
					aplicarVolumesMesa();

					const posicionarOffset = () => {
						if (!forcarProxima && offsetExato > 2) {
							try {
								player.currentTime = offsetExato;
							} catch {
								// ignore seek error before metadata
							}
						}
					};

					if (player.readyState >= 1) {
						posicionarOffset();
					} else {
						player.addEventListener("loadedmetadata", posicionarOffset, {
							once: true,
						});
					}

					if (pausadoNaMesa) {
						player.pause();
					} else if (estaTocandoRef.current) {
						if (audioCtxRef.current?.state === "suspended") {
							audioCtxRef.current.resume().catch(() => {});
						}

						const iniciarPlay = () => {
							player.muted = false;
							aplicarVolumesMesa();
							player
								.play()
								.then(() => {
									setStatusTexto("Transmitindo em tempo real");
								})
								.catch((err) => {
									if (err?.name === "AbortError") {
										player.addEventListener(
											"canplay",
											() => {
												if (
													estaTocandoRef.current &&
													estadoMesaRef.current?.musica_tocando !== false &&
													player.paused
												) {
													player.muted = false;
													aplicarVolumesMesa();
													player.play().catch(() => {});
												}
											},
											{ once: true },
										);
										return;
									}
									// Se o navegador bloqueou autoplay com som na primeira abertura sem gesto,
									// inicia a reprodução tocando com muted para manter a rádio sincronizada
									// e desbloqueia o som ao menor toque/interação
									player.muted = true;
									player
										.play()
										.then(() => {
											setStatusTexto("Transmitindo em tempo real");
										})
										.catch(() => {});
								});
						};

						iniciarPlay();
					}
				} else if (player && pausadoNaMesa) {
					if (!player.paused) {
						player.pause();
					}
				} else if (
					player &&
					estaTocandoRef.current &&
					!player.paused &&
					player.readyState >= 2 &&
					Math.abs(player.currentTime - offsetExato) > 4
				) {
					try {
						player.currentTime = offsetExato;
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
		const player = playerRef.current;

		// Se o áudio estava mudo devido ao bloqueio de autoplay do navegador na abertura,
		// o primeiro toque deve liberar o som imediatamente, e não pausar
		if (player && player.muted) {
			player.muted = false;
			aplicarVolumesMesa();
			estaTocandoRef.current = true;
			setEstaTocando(true);
			setStatusTexto("Transmitindo em tempo real");
			if (player.paused) {
				player.play().catch(() => {});
			}
			return;
		}

		if (!estaTocandoRef.current) {
			estaTocandoRef.current = true;
			setEstaTocando(true);
			setStatusTexto("Iniciando transmissão...");

			if (player) {
				player.muted = false;
			}
			aplicarVolumesMesa();

			if (estadoMesaRef.current?.musica_tocando === false) {
				setStatusTexto("Transmitindo em tempo real");
				sincronizarRadio(false, { recarregarAudio: true });
			} else if (player?.src && player.src !== window.location.href) {
				player
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
			player?.pause();
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
			if (dados.musica_tocando === false) {
				if (player && !player.paused) {
					player.pause();
				}
			} else if (
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
				const playerMusica = playerRef.current;

				if (dados.vinheta_ativa.acao === "parar") {
					vinhetaEmExecucaoRef.current = false;
					playerVinheta?.pause();
					if (
						estaTocandoRef.current &&
						playerMusica &&
						playerMusica.paused &&
						playerMusica.src &&
						dados.musica_tocando !== false
					) {
						playerMusica.play().catch(() => {});
					}
					aplicarVolumesMesa();
				} else {
					const caminhoVinheta =
						dados.vinheta_ativa.url || dados.vinheta_ativa.arquivo || "";
					const urlVinheta = resolveRadioAssetUrl(caminhoVinheta);
					if (playerVinheta && urlVinheta && estaTocandoRef.current) {
						vinhetaEmExecucaoRef.current = true;
						// PAUSA TOTAL DA MÚSICA AO DISPARAR VINHETA
						if (playerMusica && !playerMusica.paused) {
							playerMusica.pause();
						}
						aplicarVolumesMesa();

						playerVinheta.src = urlVinheta;
						try {
							playerVinheta.volume = Math.max(
								0,
								Math.min(1, volumeMasterRef.current),
							);
						} catch {
							// ignore
						}

						const restaurarMusicaOuvinte = () => {
							vinhetaEmExecucaoRef.current = false;
							aplicarVolumesMesa();
							// DÁ O PLAY NOVAMENTE NA MÚSICA APÓS O TÉRMINO DA VINHETA
							if (
								estaTocandoRef.current &&
								playerMusica &&
								playerMusica.paused &&
								playerMusica.src &&
								estadoMesaRef.current?.musica_tocando !== false
							) {
								playerMusica.play().catch(() => {});
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
		if (emTransicaoSuaveRef.current) return;

		const player = playerRef.current;
		const proximaUrl = proximaUrlRef.current;

		// 1. Transição síncrona imediata para manter a reprodução ativa em segundo plano no celular
		// O navegador mobile exige chamada síncrona no evento ended para não bloquear como autoplay restrito
		if (player && proximaUrl && estaTocandoRef.current) {
			urlFaixaAtualRef.current = proximaUrl;
			player.muted = false;
			player.src = proximaUrl;
			aplicarVolumesMesa();
			player.play().catch(() => {});
		}

		setStatusTexto("Carregando próxima música...");

		// 2. Consulta o servidor para atualizar títulos, pedidos atendidos e metadados
		sincronizarRadio(false).then((data) => {
			const urlServidor = resolveRadioAssetUrl(data?.faixa_atual?.url || "");
			if (
				player &&
				urlServidor &&
				urlServidor !== urlFaixaAtualRef.current &&
				estaTocandoRef.current
			) {
				urlFaixaAtualRef.current = urlServidor;
				player.src = urlServidor;
				player.play().catch(() => {});
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
		playerRef,
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
