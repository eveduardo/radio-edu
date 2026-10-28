import { useCallback, useEffect, useRef, useState } from "react";
import { useRecoilState } from "recoil";
import { volumeAtom } from "@/globalState";
import {
	disconnectListener,
	fetchRadioSync,
	fetchVoiceChunkBlob,
	limparTempVinheta,
	pingListenerHeartbeat,
	resolveRadioAssetUrl,
	subscribeToMesa,
} from "@/services";

const obterSessaoOuvinte = () => {
	if (typeof window === "undefined") return "";
	let id = sessionStorage.getItem("radio_ouvinte_id");
	if (!id) {
		id = `ouv_${Math.random().toString(36).substring(2, 10)}${Date.now().toString(36)}`;
		try {
			sessionStorage.setItem("radio_ouvinte_id", id);
		} catch {
			// ignore
		}
	}
	return id;
};

const normalizarUrlAudio = (u) => {
	if (!u) return "";
	try {
		const p = new URL(
			u,
			typeof window !== "undefined"
				? window.location.href
				: "http://localhost",
		).pathname;
		return decodeURIComponent(p).toLowerCase().trim();
	} catch {
		return decodeURIComponent(u.split("?")[0])
			.toLowerCase()
			.trim();
	}
};

export const useRadioPlayer = () => {
	const [volumeMaster, setVolumeMaster] = useRecoilState(volumeAtom);
	const [estaTocando, setEstaTocando] = useState(true);
	const [tituloMusica, setTituloMusica] = useState("Sintonizando Flash FM...");
	const [nomeOuvinte, setNomeOuvinte] = useState("");
	const [proximaFaixa, setProximaFaixa] = useState("");
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
	const faixaRecemConcluidaRef = useRef(null);
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
		const deckAtivo =
			deckAtivoRef.current === "A"
				? playerRef.current
				: playerDeckBRef.current;
		const deckOcioso =
			deckAtivoRef.current === "A"
				? playerDeckBRef.current
				: playerRef.current;

		if (gainNodeMusica && ctx && ctx.state === "running") {
			// Rampa suave exponencial de 40ms - elimina estalos, cliques e picotados!
			try {
				gainNodeMusica.gain.setTargetAtTime(volumeFinalMusica, ctx.currentTime, 0.04);
			} catch {
				gainNodeMusica.gain.value = volumeFinalMusica;
			}
			if (deckAtivo && !emTransicaoAntecipadaRef.current) {
				try {
					deckAtivo.volume = 1.0; // Evita dupla atenuação quando Web Audio está ativo
				} catch {
					// ignore
				}
			}
		} else {
			if (gainNodeMusica) {
				gainNodeMusica.gain.value = volumeFinalMusica;
			}
			if (deckAtivo && !emTransicaoAntecipadaRef.current) {
				try {
					deckAtivo.volume = volumeFinalMusica;
				} catch {
					// Ignora erro em dispositivos com volume fixo por botões físicos (ex.: iOS)
				}
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
			try {
				gainNodeVoz.gain.setTargetAtTime(volumeFinalMic, ctx.currentTime, 0.04);
			} catch {
				gainNodeVoz.gain.value = volumeFinalMic;
			}
		}

		const playerVoz = playerVozRef.current;
		if (playerVoz) {
			try {
				playerVoz.volume = (gainNodeVoz && ctx && ctx.state === "running") ? 1.0 : volumeFinalMic;
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

		const playerVinheta = playerVinhetaRef.current;
		if (playerVinheta) {
			try {
				const volVinhetaMesa =
					estadoMesa && typeof estadoMesa.vinheta_volume === "number"
						? Math.max(0, Math.min(1, estadoMesa.vinheta_volume))
						: 1.0;
				playerVinheta.volume = Math.max(0, Math.min(1, volMaster * volVinhetaMesa));
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
				try {
					gainNodeMusica.gain.setTargetAtTime(
						0.25 * volumeMasterRef.current,
						ctx.currentTime,
						0.06,
					);
				} catch {
					gainNodeMusica.gain.value = 0.25 * volumeMasterRef.current;
				}
			} else {
				const deckAtual =
					deckAtivoRef.current === "A"
						? playerRef.current
						: playerDeckBRef.current;
				if (deckAtual && !emTransicaoAntecipadaRef.current) {
					try {
						deckAtual.volume = 0.25 * volumeMasterRef.current;
					} catch {
						// ignore
					}
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
		async (forcarProxima = false, { recarregarAudio = false, faixaConcluida = false } = {}) => {
			if (
				sincronizandoRef.current &&
				!forcarProxima &&
				!recarregarAudio &&
				!faixaConcluida
			) {
				return null;
			}
			sincronizandoRef.current = true;

			try {
				const sessaoOuvinte = estaTocandoRef.current ? obterSessaoOuvinte() : null;
				const data = await fetchRadioSync({ forcarProxima, faixaConcluida, sessaoOuvinte });

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

				const mesmoArquivoJaCarregado =
					normalizarUrlAudio(urlFaixaAtualRef.current) ===
						normalizarUrlAudio(novaUrl) &&
					deckAtivo &&
					deckAtivo.src;

				if (
					deckAtivo &&
					!mesmoArquivoJaCarregado &&
					(recarregarAudio ||
						!urlFaixaAtualRef.current ||
						normalizarUrlAudio(urlFaixaAtualRef.current) !==
							normalizarUrlAudio(novaUrl))
				) {
					// Previne recarregar os últimos segundos da faixa que acabou de concluir neste cliente
					if (
						faixaRecemConcluidaRef.current &&
						normalizarUrlAudio(novaUrl) === normalizarUrlAudio(faixaRecemConcluidaRef.current)
					) {
						return data;
					}
					faixaRecemConcluidaRef.current = null;

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
						if (!forcarProxima && offsetExato > 2 && !novaUrl.includes("temp_trinca") && !novaUrl.includes("hora_certa")) {
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
					!novaUrl.includes("temp_trinca") &&
					!novaUrl.includes("hora_certa") &&
					Math.abs(deckAtivo.currentTime - offsetExato) > 25
				) {
					try {
						deckAtivo.currentTime = offsetExato;
					} catch {
						// ignore
					}
				}

				return data;
			} catch (err) {
				console.error("[useRadioPlayer] Erro ao sincronizar com o backend:", err);
				setStatusTexto("");
				if (!urlFaixaAtualRef.current) {
					setProximaFaixa("");
				}
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

	const ativarWakeLock = useCallback(async () => {
		try {
			if ("wakeLock" in navigator && estaTocandoRef.current) {
				const lock = await navigator.wakeLock.request("screen");
				wakeLockRef.current = lock;
				lock.addEventListener("release", () => {
					wakeLockRef.current = null;
				});
			}
		} catch {
			// Silencioso se o aparelho não suportar ou economia de bateria ativa
		}
	}, []);

	const libertarWakeLock = useCallback(() => {
		if (wakeLockRef.current) {
			wakeLockRef.current
				.release()
				.then(() => {
					wakeLockRef.current = null;
				})
				.catch(() => {});
		}
	}, []);

	useEffect(() => {
		const handleVisibilityChange = () => {
			if (document.visibilityState === "visible" && estaTocandoRef.current) {
				ativarWakeLock();
			}
		};
		document.addEventListener("visibilitychange", handleVisibilityChange);
		return () => {
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			libertarWakeLock();
		};
	}, [ativarWakeLock, libertarWakeLock]);

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
			pingListenerHeartbeat(obterSessaoOuvinte()).catch(() => {});
			ativarWakeLock();
			if (deckAtivo.paused) {
				deckAtivo.play().catch(() => {});
			}
			return;
		}

		if (!estaTocandoRef.current) {
			estaTocandoRef.current = true;
			setEstaTocando(true);
			setStatusTexto("Iniciando transmissão...");
			pingListenerHeartbeat(obterSessaoOuvinte()).catch(() => {});
			ativarWakeLock();

			// Destrava elementos auxiliares e deck B no gesto do usuário (requisito para background no iOS e Android)
			playerVozRef.current?.play().catch(() => {});
			playerHoraRef.current?.play().catch(() => {});
			playerVinhetaRef.current?.play().catch(() => {});
			playerDeckBRef.current?.play().then(() => playerDeckBRef.current?.pause()).catch(() => {});

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
			libertarWakeLock();
			const sid = sessionStorage.getItem("radio_ouvinte_id");
			if (sid) {
				disconnectListener(sid);
			}
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
	}, [aplicarVolumesMesa, ativarWakeLock, inicializarAudioContext, libertarWakeLock, sincronizarRadio]);

	const alternarExpansaoCard = useCallback(() => {
		setRecolhido((prev) => !prev);
	}, []);

	// Sincronização inicial e intervalo de 25s
	useEffect(() => {
		sincronizarRadio(false);

		const interval = setInterval(() => {
			if (estaTocandoRef.current && !emTransicaoSuaveRef.current) {
				sincronizarRadio(false);
			}
		}, 25000);

		return () => clearInterval(interval);
	}, [sincronizarRadio]);

	// Heartbeat contínuo de ouvinte ativo
	useEffect(() => {
		const enviarPing = () => {
			if (estaTocando) {
				const sid = obterSessaoOuvinte();
				if (sid) pingListenerHeartbeat(sid).catch(() => {});
			}
		};

		if (estaTocando) {
			enviarPing();
			const interval = setInterval(enviarPing, 25000);
			return () => clearInterval(interval);
		} else {
			const sid = sessionStorage.getItem("radio_ouvinte_id");
			if (sid) {
				disconnectListener(sid);
			}
		}
	}, [estaTocando]);

	// Desconexão imediata ao fechar a aba
	useEffect(() => {
		const aoFecharAba = () => {
			const sid = sessionStorage.getItem("radio_ouvinte_id");
			if (sid && estaTocandoRef.current) {
				disconnectListener(sid);
			}
		};

		window.addEventListener("beforeunload", aoFecharAba);
		return () => {
			window.removeEventListener("beforeunload", aoFecharAba);
			aoFecharAba();
		};
	}, []);

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

			// Locuções e vinhetas da IA (como anúncio de trincas e hora certa) devem falar até a última palavra sem corte de crossfade!
			const eLocucaoAtual =
				urlFaixaAtualRef.current &&
				(urlFaixaAtualRef.current.includes("temp_trinca") ||
					urlFaixaAtualRef.current.includes("vinhetas/") ||
					urlFaixaAtualRef.current.includes("hora_certa"));
			const eLocucaoProxima =
				proximaUrlRef.current &&
				(proximaUrlRef.current.includes("temp_trinca") ||
					proximaUrlRef.current.includes("vinhetas/") ||
					proximaUrlRef.current.includes("hora_certa"));
			if (eLocucaoAtual || eLocucaoProxima) {
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
					sincronizarRadio(false);
				}, 2100);
			}
		}, 250);

		return () => clearInterval(interval);
	}, [aplicarVolumesMesa, sincronizarRadio]);

	// Desbloqueio imediato de áudio em qualquer interação, toque ou movimento na tela
	useEffect(() => {
		const desbloquear = () => {
			inicializarAudioContext();

			const deckAtual =
				deckAtivoRef.current === "A"
					? playerRef.current
					: playerDeckBRef.current;
			if (
				!deckAtual ||
				!estaTocandoRef.current ||
				!deckAtual.src ||
				estadoMesaRef.current?.musica_tocando === false
			) {
				return;
			}

			if (deckAtual.muted) {
				deckAtual.muted = false;
				aplicarVolumesMesa();
			}

			if (deckAtual.paused) {
				deckAtual
					.play()
					.then(() => {
						deckAtual.muted = false;
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

			const deckAtual =
				deckAtivoRef.current === "A"
					? playerRef.current
					: playerDeckBRef.current;
			if (dados.musica_tocando === false && !vinhetaEmExecucaoRef.current) {
				if (playerRef.current && !playerRef.current.paused) {
					playerRef.current.pause();
				}
				if (playerDeckBRef.current && !playerDeckBRef.current.paused) {
					playerDeckBRef.current.pause();
				}
			} else if (
				dados.musica_tocando === true &&
				estaTocandoRef.current &&
				deckAtual &&
				deckAtual.paused &&
				deckAtual.src &&
				!vinhetaEmExecucaoRef.current &&
				!emTransicaoSuaveRef.current
			) {
				deckAtual
					.play()
					.then(() => {
						deckAtual.muted = false;
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
						!dados.vinheta_ativa?.manter_musica &&
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

						let vozIaIniciada = false;
						let finalizado = false;

						const encerrarRecado = () => {
							if (finalizado) return;
							finalizado = true;
							playerVinheta.ontimeupdate = null;
							playerVinheta.onended = null;
							playerVinheta.onerror = null;
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

						const tocarVozIa = () => {
							if (vozIaIniciada) return;
							vozIaIniciada = true;
							playerVinheta.ontimeupdate = null;
							if (!urlVinheta) {
								encerrarRecado();
								return;
							}
							playerVinheta.src = urlVinheta;
							aplicarVolumesMesa();
							playerVinheta.onended = encerrarRecado;
							playerVinheta.onerror = encerrarRecado;
							if (estaTocandoRef.current) {
								playerVinheta.play().catch(encerrarRecado);
							}
						};

						// Transiciona suavemente: faltando ~0.8s da vinheta de prefixo, já inicia a voz da IA
						playerVinheta.ontimeupdate = () => {
							if (vozIaIniciada) return;
							const dur = playerVinheta.duration;
							const cur = playerVinheta.currentTime;
							if (Number.isFinite(dur) && dur > 1.2) {
								if (dur - cur <= 0.8) {
									tocarVozIa();
								}
							}
						};

						playerVinheta.onended = tocarVozIa;
						playerVinheta.onerror = tocarVozIa;

						if (estaTocandoRef.current) {
							playerVinheta.play().catch(tocarVozIa);
						}
					} else if (playerVinheta && urlVinheta && estaTocandoRef.current) {
						// Vinheta normal sem prefixo (locutor controla faders manualmente)
						vinhetaEmExecucaoRef.current = true;
						const manterMusica = Boolean(dados.vinheta_ativa?.manter_musica);
						if (!manterMusica && deckAtivo && !deckAtivo.paused) {
							deckAtivo.pause();
						}
						playerVinheta.src = urlVinheta;
						aplicarVolumesMesa();

						const restaurarMusicaOuvinte = () => {
							vinhetaEmExecucaoRef.current = false;
							aplicarVolumesMesa();
							if (
								!manterMusica &&
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
					artwork: [
						{
							src: `${import.meta.env.BASE_URL}img/logoFM.jpg`,
							sizes: "512x512",
							type: "image/jpeg",
						},
					],
				});
			}
			navigator.mediaSession.setActionHandler("play", () => {
				alternarReproducao();
			});
			navigator.mediaSession.setActionHandler("pause", () => {
				alternarReproducao();
			});
		} catch {
			// Ignora caso o navegador não suporte MediaMetadata
		}
	}, [alternarReproducao, estaTocando, nomeOuvinte, proximaFaixa, tituloMusica]);

	const handleTrackEnded = useCallback((e) => {
		if (emTransicaoSuaveRef.current || emTransicaoAntecipadaRef.current) return;

		// Se o evento ended veio de um deck ocioso (ex.: deck anterior que acabou de sofrer fade-out), descarta!
		const deckDisparador = e && e.target;
		const deckAtual =
			deckAtivoRef.current === "A"
				? playerRef.current
				: playerDeckBRef.current;

		if (deckDisparador && deckDisparador !== deckAtual) {
			return;
		}
		const proximaUrl = proximaUrlRef.current;

		if (deckAtual && proximaUrl && estaTocandoRef.current) {
			faixaRecemConcluidaRef.current = urlFaixaAtualRef.current;
			urlFaixaAtualRef.current = proximaUrl;
			deckAtual.muted = false;
			deckAtual.src = proximaUrl;
			deckAtual.currentTime = 0;
			aplicarVolumesMesa();
			deckAtual.play().catch(() => {});
		}

		setStatusTexto("Carregando próxima música...");

		// Notifica o servidor que a faixa foi concluída (faixaConcluida: true)
		sincronizarRadio(false, { faixaConcluida: true }).then((data) => {
			const urlServidor = resolveRadioAssetUrl(data?.faixa_atual?.url || "");
			const deck =
				deckAtivoRef.current === "A"
					? playerRef.current
					: playerDeckBRef.current;
			// Se o servidor ainda respondeu com a faixa que acabou de concluir, descarta
			if (
				urlServidor &&
				faixaRecemConcluidaRef.current &&
				normalizarUrlAudio(urlServidor) === normalizarUrlAudio(faixaRecemConcluidaRef.current)
			) {
				return;
			}
			if (
				deck &&
				urlServidor &&
				normalizarUrlAudio(urlServidor) !==
					normalizarUrlAudio(urlFaixaAtualRef.current) &&
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
		// Reconecta o áudio sem forçar pulo prematuro de música
		setTimeout(() => sincronizarRadio(false, { recarregarAudio: true }), 2500);
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
