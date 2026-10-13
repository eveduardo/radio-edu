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
	const sourceNodeRef = useRef(null);
	const sourceNodeVozRef = useRef(null);

	const estaTocandoRef = useRef(estaTocando);
	estaTocandoRef.current = estaTocando;

	const volumeMasterRef = useRef(volumeMaster);
	volumeMasterRef.current = volumeMaster;

	const urlFaixaAtualRef = useRef("");
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
		const volumeFinalMusica = Math.min(volMaster, volMaster * volMusicaMesa);
		const volumeFinalMic = Math.min(volMaster, volMaster * volMicMesa);

		const ctx = audioCtxRef.current;
		const gainNodeMusica = gainNodeMusicaRef.current;
		const gainNodeVoz = gainNodeVozRef.current;
		const player = playerRef.current;
		const playerVoz = playerVozRef.current;

		if (
			gainNodeMusica &&
			sourceNodeRef.current &&
			ctx &&
			ctx.state === "running"
		) {
			gainNodeMusica.gain.setValueAtTime(volumeFinalMusica, ctx.currentTime);
			if (player) {
				try {
					player.volume = 1;
				} catch {
					// Ignora erro em dispositivos com volume fixo
				}
			}
		} else if (player) {
			try {
				player.volume = volumeFinalMusica;
			} catch {
				// Ignora erro em dispositivos com volume fixo
			}
		}

		if (gainNodeVoz && ctx && ctx.state === "running") {
			gainNodeVoz.gain.setValueAtTime(volumeFinalMic, ctx.currentTime);
		}

		if (playerVoz) {
			try {
				playerVoz.volume = volumeFinalMic;
			} catch {
				// Ignora erro em dispositivos com volume fixo
			}
		}
	}, []);

	/**
	 * Inicializa o AudioContext e só conecta o MediaElementSource do player principal
	 * quando o contexto estiver efetivamente em estado "running", evitando silenciar o <audio>.
	 */
	const inicializarAudioContext = useCallback(() => {
		try {
			const player = playerRef.current;
			if (!player) return;

			if (!audioCtxRef.current) {
				const AudioCtx = window.AudioContext || window.webkitAudioContext;
				if (!AudioCtx) return;

				const ctx = new AudioCtx();
				const analyser = ctx.createAnalyser();
				analyser.fftSize = 64;
				analyser.smoothingTimeConstant = 0.75;

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
			const conectarPlayerSeRunning = () => {
				if (
					ctx &&
					ctx.state === "running" &&
					playerRef.current &&
					!sourceNodeRef.current &&
					gainNodeMusicaRef.current
				) {
					try {
						const sourceMusica = ctx.createMediaElementSource(
							playerRef.current,
						);
						sourceMusica.connect(gainNodeMusicaRef.current);
						sourceNodeRef.current = sourceMusica;
					} catch {
						// Ignora caso já esteja conectado
					}
				}
				aplicarVolumesMesa();
			};

			if (ctx.state === "suspended") {
				ctx
					.resume()
					.then(conectarPlayerSeRunning)
					.catch(() => {});
			} else {
				conectarPlayerSeRunning();
			}

			ctx.onstatechange = conectarPlayerSeRunning;
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
			const gainNode = gainNodeMusicaRef.current;

			if (gainNode && ctx && ctx.state === "running") {
				gainNode.gain.setValueAtTime(
					0.2 * volumeMasterRef.current,
					ctx.currentTime,
				);
			} else if (playerRef.current) {
				playerRef.current.volume = 0.2 * volumeMasterRef.current;
			}

			playerHora.src = resolveRadioAssetUrl(arquivo);
			playerHora.volume = volumeMasterRef.current;
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

				const novaUrl = resolveRadioAssetUrl(data.faixa_atual?.url || "");
				if (!novaUrl) return data;

				const offsetExato = Math.max(0, data.offset_segundos || 0);
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

					if (estaTocandoRef.current) {
						if (audioCtxRef.current?.state === "suspended") {
							audioCtxRef.current.resume().catch(() => {});
						}

						const iniciarPlay = () => {
							player
								.play()
								.then(() => {
									player.muted = false;
									aplicarVolumesMesa();
									setStatusTexto("Transmitindo em tempo real");
								})
								.catch((err) => {
									if (err?.name === "AbortError") {
										player.addEventListener(
											"canplay",
											() => {
												if (estaTocandoRef.current && player.paused) {
													player.play().catch(() => {});
												}
											},
											{ once: true },
										);
										return;
									}
									// Se o navegador bloqueou autoplay com som na primeira abertura,
									// inicia a reprodução sincronizada imediatamente e libera o som no primeiro movimento/evento
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
			const ctx = audioCtxRef.current;
			const gainNode = gainNodeMusicaRef.current;
			const player = playerRef.current;

			const volAtual =
				gainNode && ctx && ctx.state === "running"
					? gainNode.gain.value
					: player?.volume ?? 1;

			for (let i = 1; i <= passos; i++) {
				await new Promise((r) => setTimeout(r, tempoPasso));
				const v = Math.max(0, volAtual - (volAtual / passos) * i);
				if (gainNode && ctx && ctx.state === "running") {
					gainNode.gain.setValueAtTime(v, ctx.currentTime);
				} else if (player) {
					player.volume = v;
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
				if (gainNode && ctx && ctx.state === "running") {
					gainNode.gain.setValueAtTime(v, ctx.currentTime);
				} else if (player) {
					player.volume = v;
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

		if (!estaTocandoRef.current) {
			estaTocandoRef.current = true;
			setEstaTocando(true);
			setStatusTexto("Iniciando transmissão...");

			if (player) {
				player.muted = false;
			}
			aplicarVolumesMesa();

			if (player?.src && player.src !== window.location.href) {
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

	// Desbloqueio imediato de áudio em qualquer interação/movimento
	useEffect(() => {
		const desbloquear = (e) => {
			const isUserActivation =
				e.type === "click" ||
				e.type === "touchstart" ||
				e.type === "pointerdown" ||
				e.type === "mousedown" ||
				e.type === "keydown";

			if (isUserActivation) {
				inicializarAudioContext();
			}

			const player = playerRef.current;
			if (!player || !estaTocandoRef.current || !player.src) return;

			if (player.muted) {
				player.muted = false;
				aplicarVolumesMesa();
				if (player.paused) {
					player
						.play()
						.then(() => {
							setStatusTexto("Transmitindo em tempo real");
						})
						.catch(() => {
							player.muted = true;
							player.play().catch(() => {});
						});
					return;
				}
			}

			if (player.paused) {
				player
					.play()
					.then(() => {
						setStatusTexto("Transmitindo em tempo real");
					})
					.catch(() => {
						if (!isUserActivation) {
							player.muted = true;
							player.play().catch(() => {});
						}
					});
			}
		};

		const eventos = [
			"click",
			"touchstart",
			"pointerdown",
			"mousedown",
			"keydown",
			"pointermove",
			"mousemove",
			"wheel",
		];

		eventos.forEach((evt) =>
			document.addEventListener(evt, desbloquear, { passive: true }),
		);

		return () => {
			eventos.forEach((evt) => document.removeEventListener(evt, desbloquear));
		};
	}, [aplicarVolumesMesa, inicializarAudioContext]);

	// Assinatura em tempo real do Firebase (nó `mesa`)
	useEffect(() => {
		const unsubscribe = subscribeToMesa((dados) => {
			estadoMesaRef.current = dados;

			if (!emTransicaoSuaveRef.current) {
				aplicarVolumesMesa();
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

				if (dados.vinheta_ativa.acao === "parar") {
					playerVinheta?.pause();
				} else {
					const caminhoVinheta =
						dados.vinheta_ativa.url || dados.vinheta_ativa.arquivo || "";
					const urlVinheta = resolveRadioAssetUrl(caminhoVinheta);
					if (playerVinheta && urlVinheta && estaTocandoRef.current) {
						playerVinheta.src = urlVinheta;
						try {
							playerVinheta.volume = Math.max(
								0,
								Math.min(1, volumeMasterRef.current),
							);
						} catch {
							// ignore
						}
						playerVinheta.play().catch(async () => {
							// Fallback via Web Audio API caso o elemento <audio> secundário seja bloqueado no celular
							const ctx = audioCtxRef.current;
							if (ctx && ctx.state === "running" && analyserRef.current) {
								try {
									const resp = await fetch(urlVinheta);
									const buf = await resp.arrayBuffer();
									const audioBuf = await ctx.decodeAudioData(buf);
									const src = ctx.createBufferSource();
									const gain = ctx.createGain();
									gain.gain.value = Math.max(
										0,
										Math.min(1, volumeMasterRef.current),
									);
									src.buffer = audioBuf;
									src.connect(gain);
									gain.connect(analyserRef.current);
									src.start(0);
								} catch {
									// ignore
								}
							}
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

		const aoTimeUpdateWakeVideo = () => {
			if (wakeVideo && wakeVideo.currentTime > 0.5) {
				try {
					wakeVideo.currentTime = Math.random() * 0.25;
				} catch {
					// ignore
				}
			}
		};

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
			if (!estaTocandoRef.current || document.visibilityState !== "visible") {
				return;
			}

			// 1. Mantém o vídeo NoSleep ativo (funciona em HTTP e sem exigir clique quando muted+playsInline)
			if (wakeVideo) {
				wakeVideo.muted = true;
				wakeVideo.playsInline = true;
				if (wakeVideo.paused) {
					wakeVideo.play().catch(() => {});
				}
			}

			// 2. Solicita WakeLock nativa caso o navegador disponha da API (HTTPS / localhost)
			if ("wakeLock" in navigator) {
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
						// Ignora caso exija gesto adicional
					}
				}
			}
		};

		const aoMudarVisibilidade = () => {
			if (document.visibilityState === "visible" && estaTocandoRef.current) {
				manterTelaAcesa();
			}
		};

		wakeVideo?.addEventListener("timeupdate", aoTimeUpdateWakeVideo);

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
			player?.addEventListener("timeupdate", manterTelaAcesa);
		} else {
			liberarWakeLock();
		}

		const keepAliveInterval = estaTocando
			? setInterval(manterTelaAcesa, 5000)
			: null;

		return () => {
			if (keepAliveInterval) clearInterval(keepAliveInterval);
			wakeVideo?.removeEventListener("timeupdate", aoTimeUpdateWakeVideo);
			document.removeEventListener("visibilitychange", aoMudarVisibilidade);
			window.removeEventListener("focus", manterTelaAcesa);
			document.removeEventListener("touchstart", manterTelaAcesa);
			document.removeEventListener("click", manterTelaAcesa);
			document.removeEventListener("pointerdown", manterTelaAcesa);
			document.removeEventListener("keydown", manterTelaAcesa);
			player?.removeEventListener("playing", manterTelaAcesa);
			player?.removeEventListener("timeupdate", manterTelaAcesa);
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

	const handleTrackEnded = useCallback(async () => {
		if (emTransicaoSuaveRef.current) return;
		setStatusTexto("Carregando próxima música...");

		const urlAnterior = urlFaixaAtualRef.current;
		const data = await sincronizarRadio(false);
		const urlServidor = resolveRadioAssetUrl(data?.faixa_atual?.url || "");

		if (!urlServidor || urlServidor === urlAnterior) {
			await sincronizarRadio(true, { recarregarAudio: true });
		}
	}, [sincronizarRadio]);

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
