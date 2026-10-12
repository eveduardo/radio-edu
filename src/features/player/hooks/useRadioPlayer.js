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
	const [tituloMusica, setTituloMusica] = useState(
		"Aperte o play pra ligar...",
	);
	const [nomeOuvinte, setNomeOuvinte] = useState("");
	const [proximaFaixa, setProximaFaixa] = useState("Aguardando programação");
	const [statusTexto, setStatusTexto] = useState("Transmitindo em tempo real");
	const [recolhido, setRecolhido] = useState(false);

	const playerRef = useRef(null);
	const playerHoraRef = useRef(null);
	const playerVozRef = useRef(null);
	const playerVinhetaRef = useRef(null);

	const audioCtxRef = useRef(null);
	const analyserRef = useRef(null);
	const gainNodeMusicaRef = useRef(null);
	const dataArrayRef = useRef(null);
	const sourceNodeRef = useRef(null);

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
	const wakeLockRef = useRef(null);

	const estadoMesaRef = useRef({
		ao_vivo: false,
		mic_volume: 1.0,
		musica_tocando: true,
		musica_volume: 1.0,
		ultimo_chunk: 0,
	});

	const inicializarAudioContext = useCallback(() => {
		try {
			const player = playerRef.current;
			if (!player) return;

			if (!audioCtxRef.current) {
				const AudioCtx = window.AudioContext || window.webkitAudioContext;
				const ctx = new AudioCtx();
				const analyser = ctx.createAnalyser();
				analyser.fftSize = 64;
				analyser.smoothingTimeConstant = 0.75;

				const gainNode = ctx.createGain();

				if (!sourceNodeRef.current) {
					const source = ctx.createMediaElementSource(player);
					source.connect(gainNode);
					gainNode.connect(analyser);
					analyser.connect(ctx.destination);
					sourceNodeRef.current = source;
				}

				audioCtxRef.current = ctx;
				analyserRef.current = analyser;
				gainNodeMusicaRef.current = gainNode;
				dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
			}

			if (audioCtxRef.current.state === "suspended") {
				audioCtxRef.current.resume().catch(() => {});
			}
		} catch {
			// Fallback silencioso caso o navegador bloqueie Web Audio
		}
	}, []);

	const aplicarVolumesMesa = useCallback(() => {
		const estadoMesa = estadoMesaRef.current;
		const volMaster = volumeMasterRef.current;

		const volMusicaMesa =
			estadoMesa && typeof estadoMesa.musica_volume === "number"
				? estadoMesa.musica_volume
				: 1.0;

		const volMicMesa =
			estadoMesa && typeof estadoMesa.mic_volume === "number"
				? estadoMesa.mic_volume
				: 1.0;

		const volumeFinalMusica = Math.max(
			0,
			Math.min(1, volMaster * volMusicaMesa),
		);

		const ctx = audioCtxRef.current;
		const gainNode = gainNodeMusicaRef.current;
		const player = playerRef.current;

		if (gainNode && ctx && ctx.state === "running") {
			gainNode.gain.setValueAtTime(volumeFinalMusica, ctx.currentTime);
		} else if (player) {
			player.volume = volumeFinalMusica;
		}

		if (playerVozRef.current) {
			try {
				playerVozRef.current.volume = Math.max(
					0,
					Math.min(1, volMaster * volMicMesa),
				);
			} catch {
				// Ignora erro em dispositivos com volume fixo
			}
		}
	}, []);

	const tocarProximoBlocoVoz = useCallback(() => {
		const playerVoz = playerVozRef.current;
		if (!playerVoz) return;

		if (filaAudioVozRef.current.length === 0) {
			tocandoVozRef.current = false;
			aplicarVolumesMesa();
			return;
		}

		tocandoVozRef.current = true;
		const item = filaAudioVozRef.current.shift();
		playerVoz.src = item.url;
		aplicarVolumesMesa();

		const limparEProximo = () => {
			try {
				URL.revokeObjectURL(item.url);
			} catch {
				// ignore
			}
			tocarProximoBlocoVoz();
		};

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

	/**
	 * Sincroniza o player com o estado do servidor (`radio_sync.php`).
	 *
	 * Importante:
	 * - `forcarProxima` só deve ser `true` quando a faixa realmente terminou no cliente
	 *   e o servidor ainda não virou a faixa no `no_ar.json`.
	 * - Quando o locutor dispara uma transição (`forcar_troca` via Firebase), o locutor
	 *   JÁ virou a faixa no servidor, portanto o ouvinte deve buscar com `forcarProxima = false`
	 *   e `recarregarAudio = true` para carregar exatamente a faixa que o locutor colocou no ar.
	 */
	const sincronizarRadio = useCallback(
		async (forcarProxima = false, { recarregarAudio = false } = {}) => {
			try {
				const data = await fetchRadioSync({ forcarProxima });

				if (data.error) {
					setTituloMusica(data.error);
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
					player.src = novaUrl;

					if (estaTocandoRef.current) {
						player
							.play()
							.then(() => {
								inicializarAudioContext();
								if (!forcarProxima && offsetExato > 2) {
									player.currentTime = offsetExato;
								}
								setStatusTexto("Transmitindo em tempo real");
							})
							.catch(() => {
								setStatusTexto("Toque em qualquer lugar para ouvir");
							});
					}
				} else if (
					player &&
					estaTocandoRef.current &&
					Math.abs(player.currentTime - offsetExato) > 4
				) {
					player.currentTime = offsetExato;
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
			}
		},
		[inicializarAudioContext, tocarHoraCerta],
	);

	const executarCrossfadeOuvinte = useCallback(async () => {
		if (emTransicaoSuaveRef.current) return;
		emTransicaoSuaveRef.current = true;

		const passos = 7;
		const tempoPasso = 100;
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

		// Busca a faixa que o locutor JÁ virou no servidor (sem passar forcar_proxima=1!)
		await sincronizarRadio(false, { recarregarAudio: true });

		for (let i = 1; i <= passos; i++) {
			await new Promise((r) => setTimeout(r, 80));
			const volAlvo = Math.max(
				0,
				Math.min(
					1,
					volumeMasterRef.current * (estadoMesaRef.current.musica_volume ?? 1.0),
				),
			);
			const v = Math.min(volAlvo, (volAlvo / passos) * i);
			if (gainNode && ctx && ctx.state === "running") {
				gainNode.gain.setValueAtTime(v, ctx.currentTime);
			} else if (player) {
				player.volume = v;
			}
		}

		aplicarVolumesMesa();
		emTransicaoSuaveRef.current = false;
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

			playerVozRef.current?.play().catch(() => {});
			playerHoraRef.current?.play().catch(() => {});
			playerVinhetaRef.current?.play().catch(() => {});

			aplicarVolumesMesa();

			if (player?.src && player.src !== window.location.href) {
				player
					.play()
					.then(() => {
						setStatusTexto("Transmitindo em tempo real");
					})
					.catch(() => {
						sincronizarRadio(false);
					});
			} else {
				sincronizarRadio(false);
			}
		} else {
			estaTocandoRef.current = false;
			setEstaTocando(false);
			player?.pause();
			playerVozRef.current?.pause();
			playerVinhetaRef.current?.pause();
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

	// Desbloqueio de áudio no primeiro toque/clique
	useEffect(() => {
		const desbloquear = () => {
			inicializarAudioContext();
			if (audioCtxRef.current?.state === "suspended") {
				audioCtxRef.current.resume().catch(() => {});
			}
			aplicarVolumesMesa();
			const player = playerRef.current;
			if (estaTocandoRef.current && player?.paused && player.src) {
				player
					.play()
					.then(() => {
						setStatusTexto("Transmitindo em tempo real");
					})
					.catch(() => {});
			}
			document.removeEventListener("click", desbloquear);
			document.removeEventListener("touchstart", desbloquear);
		};

		document.addEventListener("click", desbloquear);
		document.addEventListener("touchstart", desbloquear);

		return () => {
			document.removeEventListener("click", desbloquear);
			document.removeEventListener("touchstart", desbloquear);
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
				if (dados.ultimo_chunk) {
					historicoChunksRef.current.add(dados.ultimo_chunk);
				}
				if (dados.forcar_troca) {
					ultimaTrocaForcadaRef.current = dados.forcar_troca;
				}
				if (dados.atualizacao_programacao) {
					ultimaAtualizacaoProgRef.current = dados.atualizacao_programacao;
				}
				return;
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
				if (playerVinheta) {
					playerVinheta.src = resolveRadioAssetUrl(dados.vinheta_ativa.arquivo);
					playerVinheta.volume = volumeMasterRef.current;
					if (estaTocandoRef.current) {
						playerVinheta.play().catch(() => {});
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
					filaAudioVozRef.current.push({ url: urlBlob });

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

	// WakeLock para manter a tela ativa enquanto a rádio toca
	useEffect(() => {
		const ativarWakeLock = async () => {
			try {
				if ("wakeLock" in navigator && estaTocando) {
					wakeLockRef.current = await navigator.wakeLock.request("screen");
				}
			} catch {
				// WakeLock não suportado ou recusado
			}
		};

		if (estaTocando) {
			ativarWakeLock();
		} else if (wakeLockRef.current) {
			wakeLockRef.current.release().catch(() => {});
			wakeLockRef.current = null;
		}

		return () => {
			if (wakeLockRef.current) {
				wakeLockRef.current.release().catch(() => {});
				wakeLockRef.current = null;
			}
		};
	}, [estaTocando]);

	const handleTrackEnded = useCallback(async () => {
		if (emTransicaoSuaveRef.current) return;
		setStatusTexto("Carregando próxima música...");

		const urlAnterior = urlFaixaAtualRef.current;
		// Primeiro consulta sem forçar para verificar se o servidor já virou a música
		const data = await sincronizarRadio(false);
		const urlServidor = resolveRadioAssetUrl(data?.faixa_atual?.url || "");

		// Só força a virada no servidor se ele ainda estiver preso na música que acabou de terminar
		if (!urlServidor || urlServidor === urlAnterior) {
			await sincronizarRadio(true, { recarregarAudio: true });
		}
	}, [sincronizarRadio]);

	const handleTrackError = useCallback(() => {
		if (emTransicaoSuaveRef.current) return;
		setStatusTexto("Reconectando áudio...");
		setTimeout(() => sincronizarRadio(false, { recarregarAudio: true }), 2000);
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
