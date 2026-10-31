import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Button, Input, Modal } from "@jposawa/ronin-ui";
import { VerticalVuMeter } from "../components/VerticalVuMeter";
import { useLocutorMesa } from "../hooks/useLocutorMesa";
import styles from "./LocutorPage.module.css";

const PADS_CARTUCHEIRA = [
	{
		id: "pad_aplausos",
		nome: "Aplausos",
		icone: "👏",
		arquivo: "vinhetas/efeitos/aplausos.wav",
	},
	{
		id: "pad_risada",
		nome: "Risada",
		icone: "😂",
		arquivo: "vinhetas/efeitos/risada.wav",
	},
	{
		id: "pad_gongo",
		nome: "Gongo/Sino",
		icone: "🔔",
		arquivo: "vinhetas/efeitos/gongo.wav",
	},
	{
		id: "pad_sirene",
		nome: "Sirene",
		icone: "🚨",
		arquivo: "vinhetas/efeitos/sirene.wav",
	},
	{
		id: "pad_impacto",
		nome: "Impacto",
		icone: "💥",
		arquivo: "vinhetas/efeitos/impacto.wav",
	},
	{
		id: "pad_corneta",
		nome: "Corneta",
		icone: "🎺",
		arquivo: "vinhetas/efeitos/corneta.wav",
	},
];

const LocutorPage = () => {
	const {
		aoVivo,
		faderMic,
		faderMusica,
		faderVinheta,
		musicaPausada,
		ouvindoProgramacao,
		ouvindoVinheta,
		musicaAtual,
		proximaAtual,
		tempoRestanteFormatado,
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
		tempoRestanteVinhetaSeg,
		tempoRestanteVinhetaFormatado,
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
	} = useLocutorMesa();

	const [adicionandoFilaId, setAdicionandoFilaId] = useState(null);

	const [modalTrincaAberto, setModalTrincaAberto] = useState(false);
	const [generoModalAtivo, setGeneroModalAtivo] = useState(null);
	const [buscaMusicaModal, setBuscaMusicaModal] = useState("");
	const [vinhetaCategoriaAtiva, setVinhetaCategoriaAtiva] = useState(null);
	const [buscaVinhetaModal, setBuscaVinhetaModal] = useState("");
	const [pedidoLeituraAtivo, setPedidoLeituraAtivo] = useState(null);
	const [relogioAoVivo, setRelogioAoVivo] = useState(() =>
		new Date().toLocaleTimeString("pt-BR", {
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		}),
	);

	const dataFormatada = useMemo(() => {
		return new Date()
			.toLocaleDateString("pt-BR", {
				weekday: "short",
				day: "2-digit",
				month: "2-digit",
			})
			.toUpperCase();
	}, []);

	useEffect(() => {
		const timer = setInterval(() => {
			setRelogioAoVivo(
				new Date().toLocaleTimeString("pt-BR", {
					hour: "2-digit",
					minute: "2-digit",
					second: "2-digit",
				}),
			);
		}, 1000);
		return () => clearInterval(timer);
	}, []);

	const [padChimeAtivo, setPadChimeAtivo] = useState(false);

	const tocarChimeEstudio = useCallback(() => {
		setPadChimeAtivo(true);
		setTimeout(() => setPadChimeAtivo(false), 1800);
		try {
			const AudioCtx = window.AudioContext || window.webkitAudioContext;
			if (!AudioCtx) return;
			const ctx = new AudioCtx();
			const vol = typeof faderVinheta === "number" ? faderVinheta : 1.0;

			const osc1 = ctx.createOscillator();
			const osc2 = ctx.createOscillator();
			const gain = ctx.createGain();

			osc1.type = "sine";
			osc1.frequency.setValueAtTime(880, ctx.currentTime);
			osc1.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.15);

			osc2.type = "triangle";
			osc2.frequency.setValueAtTime(1320, ctx.currentTime);

			gain.gain.setValueAtTime(0.35 * vol, ctx.currentTime);
			gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.6);

			osc1.connect(gain);
			osc2.connect(gain);
			gain.connect(ctx.destination);

			osc1.start();
			osc2.start();
			osc1.stop(ctx.currentTime + 1.6);
			osc2.stop(ctx.currentTime + 1.6);
		} catch (e) {
			console.warn("Erro ao sintetizar chime de estúdio:", e);
		}
	}, [faderVinheta]);

	const [gradeCompleta, setGradeCompleta] = useState(null);

	useEffect(() => {
		let ativo = true;
		const carregarGrade = async () => {
			try {
				const res = await fetch("./grade_programacao.json?t=" + Date.now());
				if (res.ok) {
					const data = await res.json();
					if (ativo && data && Array.isArray(data.programas)) {
						setGradeCompleta(data.programas);
					}
				}
			} catch (e) {
				console.warn("Erro ao carregar grade no React:", e);
			}
		};
		carregarGrade();
		const interval = setInterval(carregarGrade, 60000);
		return () => {
			ativo = false;
			clearInterval(interval);
		};
	}, []);

	const proximosProgramas = useMemo(() => {
		if (!gradeCompleta || gradeCompleta.length === 0) {
			if (proximoPrograma) {
				return [
					{
						id: proximoPrograma.id || "prox",
						nome: proximoPrograma.nome || "Próximo Programa",
						horario: proximoPrograma.horario || "--:--",
						icone: proximoPrograma.icone || "⏰",
						rotulo: "A Seguir",
						tagClass: styles.tagASeguir,
					},
				];
			}
			return [];
		}

		const agora = new Date();
		const diaSemana = agora.getDay();
		const minAgora = agora.getHours() * 60 + agora.getMinutes();

		const progsHoje = gradeCompleta.filter((p) => {
			const dias = p.dias_semana || [0, 1, 2, 3, 4, 5, 6];
			return dias.includes(diaSemana);
		});
		const lista = progsHoje.length > 0 ? progsHoje : gradeCompleta;

		const progsComMin = lista.map((p, idx) => {
			const [hI, mI] = (p.inicio || "00:00").split(":").map(Number);
			const [hF, mF] = (p.fim || "00:00").split(":").map(Number);
			let iniMin = hI * 60 + mI;
			let fimMin = hF * 60 + mF;
			if (fimMin === 0 && iniMin > 0) fimMin = 1440;
			return { ...p, iniMin, fimMin, idxOriginal: idx };
		});

		let idxAtual = progsComMin.findIndex((p) => {
			if (p.fimMin > p.iniMin) {
				return minAgora >= p.iniMin && minAgora < p.fimMin;
			} else {
				return minAgora >= p.iniMin || minAgora < p.fimMin;
			}
		});
		if (idxAtual === -1) idxAtual = 0;

		const res = [];
		const total = progsComMin.length;
		if (total > 1) {
			const p1 = progsComMin[(idxAtual + 1) % total];
			res.push({
				...p1,
				horario: `${p1.inicio} - ${p1.fim}`,
				rotulo: "A Seguir",
				tagClass: styles.tagASeguir,
			});
			if (total > 2) {
				const p2 = progsComMin[(idxAtual + 2) % total];
				res.push({
					...p2,
					horario: `${p2.inicio} - ${p2.fim}`,
					rotulo: "Depois",
					tagClass: styles.tagDepois,
				});
			}
		}
		return res;
	}, [gradeCompleta, proximoPrograma]);

	const faixasDoGeneroFiltradas = useMemo(() => {
		if (!generoModalAtivo) return [];
		const lista = mapaGeneros[generoModalAtivo] || [];
		const termo = buscaMusicaModal.toLowerCase().trim();
		if (!termo) return lista;
		return lista.filter((f) => (f.nome || "").toLowerCase().includes(termo));
	}, [buscaMusicaModal, generoModalAtivo, mapaGeneros]);

	const vinhetasDaCategoriaFiltradas = useMemo(() => {
		if (!vinhetaCategoriaAtiva) return [];
		const lista = mapaVinhetas[vinhetaCategoriaAtiva] || [];
		const termo = buscaVinhetaModal.toLowerCase().trim();
		if (!termo) return lista;
		return lista.filter((v) => (v.nome || "").toLowerCase().includes(termo));
	}, [buscaVinhetaModal, mapaVinhetas, vinhetaCategoriaAtiva]);

	const [gerandoHoraCerta, setGerandoHoraCerta] = useState(false);

	const handleCarregarHoraCerta = useCallback(async () => {
		setGerandoHoraCerta(true);
		try {
			const res = await fetch("https://datasystem-ce.com.br/radio/hora_certa.php?json=1&gerar=1&voz=Ricardo&t=" + Date.now());
			const data = await res.json();
			if (data && data.sucesso) {
				const arq = data.arquivo || data.url;
				const urlAudio = arq.startsWith("http")
					? arq
					: `https://datasystem-ce.com.br/radio/${arq}`;
				const itemHora = {
					id: `hora_${Date.now()}`,
					nome: `Hora Certa (${data.horario})`,
					arquivo: urlAudio
				};
				carregarVinhetaNoCanal(itemHora);
			}
		} catch (err) {
			console.error("Erro ao carregar hora certa:", err);
		} finally {
			setGerandoHoraCerta(false);
		}
	}, [carregarVinhetaNoCanal]);

	return (
		<div className={styles.locutorScreen}>
			<div className={styles.containerMesa}>
				<div className={styles.topoMesa}>
					<div className={styles.topoMarca}>
						<img
							src="/img/logoFM.jpg"
							alt="Flash FM"
							className={styles.logoRadioTopo}
						/>
						<div className={styles.topoTextos}>
							<h1 className={styles.titulo}>
								🎙️ MESA MASTER <span className={styles.versaoBadge}>v2.8</span>
							</h1>
							<span className={styles.subtituloEstudio}>
								ESTÚDIO PRINCIPAL • EMISSORA AO VIVO
							</span>
						</div>
					</div>

					<div className={styles.topoAcoes}>
						<div className={styles.relogioMesa}>
							<span className={styles.relogioPonto}>●</span>
							<span className={styles.relogioTexto}>{relogioAoVivo}</span>
							<span className={styles.relogioData}>{dataFormatada}</span>
						</div>

						{programaAtual && (
							<div
								className={styles.badgeProgramaMesa}
								title={`${programaAtual.nome || "Programa"} (${programaAtual.horario || ""})`}
							>
								<span className={styles.badgeProgramaIcone}>
									{programaAtual.icone || "📻"}
								</span>
								<span className={styles.badgeProgramaNome}>
									{programaAtual.nome}
								</span>
							</div>
						)}

						<div
							className={styles.badgeAudiencia}
							title={`Audiência em tempo real: ${ouvintesConectados} ouvinte(s) conectado(s)${picoHoje > 0 ? ` • Pico hoje: ${picoHoje}` : ""}`}
						>
							<span className={styles.badgeAudienciaPonto}>●</span>
							<span className={styles.badgeAudienciaIcone}>👥</span>
							<span className={styles.badgeAudienciaQtd}>
								{ouvintesConectados}
							</span>
							<span className={styles.badgeAudienciaRotulo}>
								{ouvintesConectados === 1 ? "ouvinte" : "ouvintes"}
							</span>
						</div>
					</div>

					{/* NOVO CARD: FILA DO PROGRAMA (PLAYLIST DO LOCUTOR) */}
					<div className={styles.painelFilaPrograma}>
						<div className={styles.painelFilaHeader}>
							<div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
								<span>📋 Fila do Programa</span>
								<span
									className={styles.badgePedidosCount}
									style={{
										color: "#38bdf8",
										background: "rgba(56, 189, 248, 0.15)",
										borderColor: "rgba(56, 189, 248, 0.35)",
									}}
								>
									{filaPrograma?.faixas?.length || 0}{" "}
									{(filaPrograma?.faixas?.length || 0) === 1 ? "faixa" : "faixas"}
									{filaPrograma?.duracao_formatada ? ` • ${filaPrograma.duracao_formatada}` : ""}
								</span>
							</div>
							<div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
								<span
									className={clsx(
										styles.badgeFilaStatus,
										(filaPrograma?.faixas?.length || 0) > 0
											? styles.badgeStatusRoteiro
											: styles.badgeStatusAutoDj,
									)}
									title={
										(filaPrograma?.faixas?.length || 0) > 0
											? "O sistema tocará estas faixas em ordem"
											: "Fila vazia: o sistema toca pelo sorteio automático da pasta do programa"
									}
								>
									{(filaPrograma?.faixas?.length || 0) > 0 ? "Roteiro Ativo" : "Auto-DJ"}
								</span>
								{(filaPrograma?.faixas?.length || 0) > 0 && (
									<button
										type="button"
										className={styles.btnLimparFila}
										onClick={() => {
											if (
												window.confirm(
													"Deseja realmente limpar toda a fila do programa? O sistema voltará ao sorteio automático da grade.",
												)
											) {
												limparFila();
											}
										}}
										title="Limpar todas as faixas do roteiro"
									>
										🗑️ Limpar
									</button>
								)}
							</div>
						</div>
						<div className={styles.areaScrollFila}>
							{(filaPrograma?.faixas?.length || 0) === 0 ? (
								<div
									style={{
										fontSize: "11px",
										color: "#64748b",
										textAlign: "center",
										padding: "25px 10px",
										lineHeight: 1.5,
									}}
								>
									Fila vazia.
									<br />
									O sistema está tocando pelo <b>sorteio automático</b> da grade.
									<br />
									<span style={{ fontSize: "10px", color: "#38bdf8", opacity: 0.85 }}>
										Abra o Acervo e clique em <b>➕ Fila</b> para montar seu roteiro.
									</span>
								</div>
							) : (
								filaPrograma.faixas.map((f, idx) => {
									const durTxt =
										f.duracao_formatada ||
										(f.duracao
											? `${Math.floor(f.duracao / 60)}:${String(f.duracao % 60).padStart(2, "0")}`
											: "");
									return (
										<div key={f.id || `fila_${idx}`} className={styles.itemFilaLinha}>
											<div className={styles.itemFilaEsquerda}>
												<span className={styles.itemFilaOrdem}>{idx + 1}</span>
												<div className={styles.itemFilaTitulo} title={f.nome || ""}>
													{f.nome || "Música"}{" "}
													<span
														style={{
															fontSize: "9.5px",
															color: "#94a3b8",
															fontWeight: "normal",
															marginLeft: "4px",
														}}
													>
														({f.genero || "Acervo"}
														{durTxt ? ` • ${durTxt}` : ""})
													</span>
												</div>
											</div>
											<div className={styles.itemFilaAcoes}>
												{idx > 0 && (
													<button
														type="button"
														className={styles.btnAcaoFila}
														title="Mover para cima"
														onClick={() => moverFaixaFila(idx, idx - 1)}
													>
														▲
													</button>
												)}
												{idx < filaPrograma.faixas.length - 1 && (
													<button
														type="button"
														className={styles.btnAcaoFila}
														title="Mover para baixo"
														onClick={() => moverFaixaFila(idx, idx + 1)}
													>
														▼
													</button>
												)}
												<button
													type="button"
													className={clsx(styles.btnAcaoFila, styles.btnAcaoFilaPlay)}
													title="Tocar agora (cortar para esta faixa)"
													onClick={() => tocarFaixaFilaAgora(idx)}
												>
													▶
												</button>
												<button
													type="button"
													className={clsx(styles.btnAcaoFila, styles.btnAcaoFilaDel)}
													title="Remover da fila"
													onClick={() => removerFaixaFila(idx, f.id)}
												>
													✕
												</button>
											</div>
										</div>
									);
								})
							)}
						</div>
					</div>
				</div>

				{/* GRID PRINCIPAL EM 3 COLUNAS */}
				<div className={styles.gridMesaLayout}>
					{/* COLUNA 1: TRANSMISSÃO (MESA DE CANAIS + NO AR) */}
					<div className={styles.colunaMesa}>
						{/* SEÇÃO DA MESA COM FADERS E VU METERS */}
				<div className={styles.secaoCanais}>
					{/* CH 1: MICROFONE */}
					<div className={styles.canalFader}>
						<div className={styles.nomeCanal}>CH 1 • MIC</div>
						<div className={styles.valorFader}>
							{Math.round(faderMic * 100)}%
						</div>

						<div className={styles.faderComVuRow}>
							<VerticalVuMeter
								mode="mic"
								aoVivo={aoVivo}
								faderValue={faderMic}
								micAnalyserRef={micAnalyserRef}
								micDataArrayRef={micDataArrayRef}
							/>
							<div className={styles.faderSlot}>
								<input
									type="range"
									className={styles.faderVertical}
									min="0"
									max="1"
									step="0.01"
									value={faderMic}
									onChange={(e) => handleChangeFaderMic(e.target.value, false)}
									onMouseUp={(e) =>
										handleChangeFaderMic(e.currentTarget.value, true)
									}
									onTouchEnd={(e) =>
										handleChangeFaderMic(e.currentTarget.value, true)
									}
									aria-label="Volume do Microfone"
								/>
							</div>
						</div>

						<div className={styles.infoCanalMusica}>LOCUÇÃO</div>
						<button
							type="button"
							className={clsx(styles.btnCanalMic, aoVivo && styles.ativo)}
							onClick={alternarMicrofone}
						>
							<span>{aoVivo ? "🔴" : "🎤"}</span>
							<span>{aoVivo ? "MIC ON" : "MIC OFF"}</span>
						</button>
					</div>

					{/* CH 2: MÚSICA */}
					<div className={styles.canalFader}>
						<div className={styles.nomeCanal}>CH 2 • MÚSICA</div>
						<div className={styles.valorFader}>
							{Math.round(faderMusica * 100)}%
						</div>

						<div className={styles.faderComVuRow}>
							<VerticalVuMeter
								mode="musica"
								aoVivo={!musicaPausada}
								faderValue={faderMusica}
							/>
							<div className={styles.faderSlot}>
								<input
									type="range"
									className={styles.faderVertical}
									min="0"
									max="1"
									step="0.01"
									value={faderMusica}
									onChange={(e) =>
										handleChangeFaderMusica(e.target.value, false)
									}
									onMouseUp={(e) =>
										handleChangeFaderMusica(e.currentTarget.value, true)
									}
									onTouchEnd={(e) =>
										handleChangeFaderMusica(e.currentTarget.value, true)
									}
									aria-label="Volume da Música"
								/>
							</div>
						</div>

						<div
							className={clsx(
								styles.infoCanalMusica,
								musicaPausada && styles.infoCanalMusicaPausada,
							)}
						>
							{musicaPausada ? "EM PAUSA" : "PROGRAMAÇÃO"}
						</div>
						<div className={styles.botoesCanalVinheta}>
							<button
								type="button"
								className={clsx(
									styles.btnCanalVinhetaCue,
									musicaPausada && styles.ativoPausa,
								)}
								onClick={alternarPausaMusicaNoAr}
								title={
									musicaPausada
										? "Retomar a música que está no ar"
										: "Pausar a música que está no ar"
								}
							>
								<span>{musicaPausada ? "▶" : "⏸"}</span>
								<span>{musicaPausada ? "PLAY" : "PAUSA"}</span>
							</button>
							<button
								type="button"
								className={clsx(
									styles.btnCanalVinhetaCue,
									ouvindoProgramacao && styles.ativoRetorno,
								)}
								onClick={alternarEscutaProgramacao}
								title={
									ouvindoProgramacao
										? "Desligar retorno da música na mesa/fones"
										: "Ligar retorno da música na mesa/fones"
								}
							>
								<span>{ouvindoProgramacao ? "🔊" : "🔇"}</span>
								<span>{ouvindoProgramacao ? "DESL." : "LIG."}</span>
							</button>
						</div>
					</div>

					{/* CH 3: VINHETA / PRÉ-ESCUTA DO LOCUTOR */}
					<div className={styles.canalFader}>
						<div className={styles.nomeCanal}>CH 3 • VINHETA</div>
						<div className={styles.valorFader}>
							{Math.round(faderVinheta * 100)}%
						</div>

						<div className={styles.faderComVuRow}>
							<VerticalVuMeter
								mode="vinheta"
								aoVivo={ouvindoVinheta || Boolean(vinhetaNoArId)}
								faderValue={faderVinheta}
							/>
							<div className={styles.faderSlot}>
								<input
									type="range"
									className={styles.faderVertical}
									min="0"
									max="1"
									step="0.01"
									value={faderVinheta}
									onChange={(e) => handleChangeFaderVinheta(e.target.value)}
									aria-label="Volume de Pré-escuta de Vinhetas (CH-3)"
								/>
							</div>
						</div>

						<div
							className={styles.infoCanalMusica}
							title={
								vinhetaSelecionada
									? `CH-3: ${vinhetaSelecionada.nome} (PAUSADA - Aguardando OUVIR ou AR)`
									: "Nenhuma vinheta carregada no CH-3"
							}
						>
							{vinhetaNoArId && vinhetaSelecionada
								? `🔴 ${vinhetaSelecionada.nome}`
								: ouvindoVinheta && vinhetaSelecionada
									? `🎧 ${vinhetaSelecionada.nome}`
									: vinhetaSelecionada
										? `⏸ ${vinhetaSelecionada.nome}`
										: "PAUSADA (CH-3)"}
						</div>
						<div className={styles.botoesCanalVinheta}>
							<button
								type="button"
								className={clsx(
									styles.btnCanalVinhetaCue,
									ouvindoVinheta && styles.ativoRetorno,
								)}
								onClick={alternarEscutaVinhetaCanal}
								disabled={!vinhetaSelecionada && !ouvindoVinheta}
								title={
									vinhetaSelecionada
										? "Apenas ouvir na mesa / retorno de fone (CH-3)"
										: "Nenhuma vinheta carregada. Escolha uma nas pastas abaixo."
								}
							>
								<span>{ouvindoVinheta ? "⏹" : "🎧"}</span>
								<span>{ouvindoVinheta ? "PARAR" : "OUVIR"}</span>
							</button>
							<button
								type="button"
								className={clsx(
									styles.btnCanalVinhetaAr,
									vinhetaNoArId && styles.ativo,
								)}
								onClick={() =>
									vinhetaNoArId
										? pararVinhetaNoAr(true)
										: liberarVinhetaNoAr()
								}
								disabled={!vinhetaSelecionada && !vinhetaNoArId}
								title={
									vinhetaNoArId
										? "Interromper vinheta que está no ar"
										: vinhetaSelecionada
											? "Mandar vinheta pro AR no CH-3 (sem pausar a música)"
											: "Nenhuma vinheta carregada. Escolha uma nas pastas abaixo."
								}
							>
								<span>{vinhetaNoArId ? "🔴" : "📡"}</span>
								<span>{vinhetaNoArId ? "NO AR!" : "AR"}</span>
							</button>
						</div>
						<button
							type="button"
							style={{
								width: "100%",
								marginTop: "5px",
								padding: "6px 2px",
								fontSize: "10px",
								background: "linear-gradient(180deg, #d97706 0%, #b45309 100%)",
								border: "1px solid #f59e0b",
								color: "#fff",
								fontWeight: 800,
								borderRadius: "6px",
								cursor: "pointer",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								gap: "4px"
							}}
							onClick={handleCarregarHoraCerta}
							disabled={gerandoHoraCerta}
							title="Carregar a hora certa falada no Canal 3 (CH-3)"
						>
							<span>{gerandoHoraCerta ? "⏳ GERANDO..." : "⏰ HORA CERTA"}</span>
						</button>
					</div>
				</div>

				{/* CARD DE STATUS DA MÚSICA */}
				<div className={styles.cardMusicaNoAr}>
					<div className={styles.statusLinhaTopo}>
						<div className={styles.statusLinhaTopoEsquerda}>
							<span>● No Ar Agora</span>
							{programaAtual && (
								<span
									className={styles.badgeProgramaCard}
									title={`${programaAtual.nome || "Programa"} (${programaAtual.horario || ""})`}
								>
									<span>{programaAtual.icone || "📻"}</span>
									<span>{programaAtual.nome}</span>
								</span>
							)}
						</div>
						<div className={styles.statusTopoRight}>
							{tempoRestanteVinhetaSeg > 0 && (
								<span
									className={styles.badgeTempoVinheta}
									title={`Vinheta tocando no ar: ${vinhetaNoArNome}`}
								>
									📢 Vinheta: {tempoRestanteVinhetaFormatado}
								</span>
							)}
							<span className={styles.badgeTempoRestante}>
								{tempoRestanteFormatado}
							</span>
							<button
								type="button"
								className={styles.btnFadeProxima}
								onClick={transicaoSuaveProxima}
								disabled={transicaoEmAndamento}
								title="Abaixa o volume e chama a próxima faixa"
							>
								{transicaoEmAndamento ? "⏳ Virando..." : "⏭ Próxima"}
							</button>
						</div>
					</div>
					<div className={styles.nomeMusicaAr} title={musicaAtual}>
						{musicaAtual}
					</div>
					<div className={styles.proximaProgramadaLbl} title={proximaAtual}>
						{proximaAtual}
					</div>
					<div className={styles.linhaBlocoTrinca}>
						<span className={styles.textoBlocoTrinca}>
							<button
								type="button"
								className={styles.btnLinkTrinca}
								onClick={() => setModalTrincaAberto(true)}
								title="Clique para ver o roteiro e ler no microfone"
							>
								📻 Bloco de Músicas:
							</button>{" "}
							<strong
								className={
									blocoTrinca?.anuncio_pendente
										? styles.destaqueTrincaVerde
										: styles.destaqueTrincaAzul
								}
								onClick={() => setModalTrincaAberto(true)}
								style={{ cursor: "pointer" }}
								title="Clique para abrir o roteiro e ler no microfone"
							>
								{Math.min(3, (blocoTrinca?.contagem || 0) + 1)} de 3 tocadas
							</strong>
						</span>
						<label className={styles.labelAutoTrinca} title="Locução automática da IA ao final de cada sequência de 3 músicas">
							<input
								type="checkbox"
								checked={autoTrincaHabilitado}
								onChange={(e) => alternarAutoTrinca(e.target.checked)}
							/>
							<span>🤖 Locução IA a cada 3 músicas</span>
						</label>
					</div>
				</div>

				{/* CARTUCHEIRA RÁPIDA DE EFEITOS (SOUNDBOARD DE DISPARO INSTANTÂNEO NO CH-3) */}
				<div className={styles.painelCartucheira}>
					<div className={styles.headerCartucheira}>
						<span style={{ color: "#38bdf8" }}>⚡ Cartucheira de Efeitos (CH-3)</span>
						{vinhetaNoArId && (
							<button
								type="button"
								className={styles.btnPararCartucho}
								onClick={() => pararVinhetaNoAr(true)}
								title="Interromper efeito que está no ar"
							>
								⏹ Parar Efeito
							</button>
						)}
					</div>
					<div className={styles.gridCartucheira}>
						{PADS_CARTUCHEIRA.map((pad) => {
							const estaTocando =
								vinhetaNoArId === pad.arquivo || vinhetaNoArId === pad.id;

							return (
								<button
									key={pad.id}
									type="button"
									className={clsx(
										styles.btnPadCartucho,
										estaTocando && styles.tocando
									)}
									onClick={() => {
										if (estaTocando) {
											pararVinhetaNoAr(true);
										} else {
											liberarVinhetaNoAr({
												id: pad.id,
												nome: pad.nome,
												arquivo: pad.arquivo,
												url: pad.arquivo,
											});
										}
									}}
									title={`Disparar ${pad.nome} no CH-3`}
								>
									<span>{pad.icone}</span>
									<span>{pad.nome}</span>
								</button>
							);
						})}
					</div>
				</div>

				{/* PRÓXIMOS PROGRAMAS DA GRADE */}
				<div className={styles.painelGradeProximos}>
					<div className={styles.headerGradeProximos}>
						<span style={{ color: "#facc15" }}>🗓️ A Seguir na Grade</span>
						<span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>
							HOJE
						</span>
					</div>
					<div className={styles.listaGradeProximos}>
						{proximosProgramas.length === 0 ? (
							<div
								style={{
									fontSize: "11px",
									color: "#64748b",
									textAlign: "center",
									padding: "6px",
								}}
							>
								Nenhum próximo programa cadastrado.
							</div>
						) : (
							proximosProgramas.map((prog) => (
								<div key={prog.id} className={styles.itemGradeProximo}>
									<div className={styles.itemGradeEsquerda}>
										<span className={styles.badgeHoraProximo}>
											{prog.horario || `${prog.inicio} - ${prog.fim}`}
										</span>
										<span
											className={styles.nomeGradeProximo}
											title={`${prog.nome}${prog.slogan ? `: ${prog.slogan}` : ""}`}
										>
											{prog.icone || "📻"} {prog.nome}
										</span>
									</div>
									<span className={clsx(styles.tagGradeStatus, prog.tagClass)}>
										{prog.rotulo}
									</span>
								</div>
							))
						)}
					</div>
				</div>
			</div>

			{/* COLUNA 2: PEDIDOS DOS OUVINTES */}
			<div className={styles.colunaMesa}>
				{/* PAINEL DE PEDIDOS DOS OUVINTES */}
				<div className={styles.painelPedidos}>
						<div className={styles.painelPedidosHeader}>
							<span>📩 Pedidos dos Ouvintes ({pedidos.length})</span>
							<div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
								<label
									className={styles.labelAutoTrinca}
									style={{ margin: 0, padding: "2px 8px", background: "rgba(56, 189, 248, 0.08)", borderRadius: "6px", border: "1px solid rgba(56, 189, 248, 0.2)" }}
									title="Lê automaticamente os recados dos ouvintes com Voz IA antes da música solicitada"
								>
									<input
										type="checkbox"
										checked={autoRecadosHabilitado}
										onChange={(e) => alternarAutoRecados(e.target.checked)}
									/>
									<span style={{ fontSize: "11px", fontWeight: "600", color: autoRecadosHabilitado ? "#38bdf8" : "#94a3b8" }}>
										🤖 Ativa Voz IA
									</span>
								</label>
								<button
									type="button"
									className={styles.btnRefresh}
									onClick={carregarPedidos}
								>
									↻ Atualizar
								</button>
							</div>
						</div>
						<div className={styles.areaScrollPedidos}>
							{pedidos.length === 0 ? (
								<div className={styles.emptyPanelText}>
									Nenhum pedido no momento.
								</div>
							) : (
								pedidos.map((p) => {
									const temRecado = Boolean(p.recado && p.recado.trim());
									return (
										<div key={p.chave_linha} className={styles.itemPedidoCard}>
											{temRecado ? (
												<button
													type="button"
													className={styles.dadosPedidoInfoBtn}
													onClick={() => setPedidoLeituraAtivo(p)}
													title="Clique para abrir e ler o recado em tamanho grande"
												>
													<div className={styles.pedidoLinhaTopo}>
														<span className={styles.badgeOuvinte}>
															👤 {p.nome}
														</span>
														<span title={p.titulo}>🎵 {p.titulo}</span>
													</div>
													<div className={styles.pedidoRecado}>
														💬 &ldquo;{p.recado}&rdquo;
													</div>
												</button>
											) : (
												<div className={styles.dadosPedidoInfo}>
													<div className={styles.pedidoLinhaTopo}>
														<span className={styles.badgeOuvinte}>
															👤 {p.nome}
														</span>
														<span title={p.titulo}>🎵 {p.titulo}</span>
													</div>
												</div>
											)}
											<div className={styles.botoesAcaoPedido}>
												{temRecado && (
													<>
														<button
															type="button"
															className={styles.btnIaPedido}
															title="Gerar áudio com IA (Edge-TTS Neural) e disparar no ar como vinheta"
															disabled={gerandoVozIaChave === p.chave_linha}
															onClick={() => dispararRecadoComIA(p)}
														>
															{gerandoVozIaChave === p.chave_linha
																? "⏳ Gerando..."
																: "🤖 Voz IA"}
														</button>
														<button
															type="button"
															className={styles.btnLerPedido}
															title="Abrir recado em fonte grande para leitura no ar"
															onClick={() => setPedidoLeituraAtivo(p)}
														>
															📖 Ler
														</button>
													</>
												)}
												{p.tocado ? (
													<span className={styles.badgeTocado}>✔ Já Tocou</span>
												) : (
													<>
														<button
															type="button"
															className={styles.btnAtenderPedido}
															title="Agendar como próxima faixa"
															onClick={() => atenderPedido(p, false)}
														>
															▶ A Seguir
														</button>
														<button
															type="button"
															className={styles.btnFadeProxima}
															title="Entrar no ar agora com crossfade"
															disabled={transicaoEmAndamento}
															onClick={() => atenderPedido(p, true)}
														>
															⏭ Agora
														</button>
													</>
												)}
												<button
													type="button"
													className={styles.btnDescartarPedido}
													title="Excluir do arquivo"
													onClick={() => solicitarDescartePedido(p)}
												>
													✕
												</button>
											</div>
										</div>
									);
								})
							)}
						</div>
					</div>

					{/* NOVO CARD: FILA DO PROGRAMA (PLAYLIST DO LOCUTOR) */}
					<div className={styles.painelFilaPrograma}>
						<div className={styles.painelFilaHeader}>
							<div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
								<span>📋 Fila do Programa</span>
								<span
									className={styles.badgePedidosCount}
									style={{
										color: "#38bdf8",
										background: "rgba(56, 189, 248, 0.15)",
										borderColor: "rgba(56, 189, 248, 0.35)",
									}}
								>
									{filaPrograma?.faixas?.length || 0}{" "}
									{(filaPrograma?.faixas?.length || 0) === 1 ? "faixa" : "faixas"}
									{filaPrograma?.duracao_formatada ? ` • ${filaPrograma.duracao_formatada}` : ""}
								</span>
							</div>
							<div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
								<span
									className={clsx(
										styles.badgeFilaStatus,
										(filaPrograma?.faixas?.length || 0) > 0
											? styles.badgeStatusRoteiro
											: styles.badgeStatusAutoDj,
									)}
									title={
										(filaPrograma?.faixas?.length || 0) > 0
											? "O sistema tocará estas faixas em ordem"
											: "Fila vazia: o sistema toca pelo sorteio automático da pasta do programa"
									}
								>
									{(filaPrograma?.faixas?.length || 0) > 0 ? "Roteiro Ativo" : "Auto-DJ"}
								</span>
								{(filaPrograma?.faixas?.length || 0) > 0 && (
									<button
										type="button"
										className={styles.btnLimparFila}
										onClick={() => {
											if (
												window.confirm(
													"Deseja realmente limpar toda a fila do programa? O sistema voltará ao sorteio automático da grade.",
												)
											) {
												limparFila();
											}
										}}
										title="Limpar todas as faixas do roteiro"
									>
										🗑️ Limpar
									</button>
								)}
							</div>
						</div>
						<div className={styles.areaScrollFila}>
							{(filaPrograma?.faixas?.length || 0) === 0 ? (
								<div
									style={{
										fontSize: "11px",
										color: "#64748b",
										textAlign: "center",
										padding: "25px 10px",
										lineHeight: 1.5,
									}}
								>
									Fila vazia.
									<br />
									O sistema está tocando pelo <b>sorteio automático</b> da grade.
									<br />
									<span style={{ fontSize: "10px", color: "#38bdf8", opacity: 0.85 }}>
										Abra o Acervo e clique em <b>➕ Fila</b> para montar seu roteiro.
									</span>
								</div>
							) : (
								filaPrograma.faixas.map((f, idx) => {
									const durTxt =
										f.duracao_formatada ||
										(f.duracao
											? `${Math.floor(f.duracao / 60)}:${String(f.duracao % 60).padStart(2, "0")}`
											: "");
									return (
										<div key={f.id || `fila_${idx}`} className={styles.itemFilaLinha}>
											<div className={styles.itemFilaEsquerda}>
												<span className={styles.itemFilaOrdem}>{idx + 1}</span>
												<div className={styles.itemFilaTitulo} title={f.nome || ""}>
													{f.nome || "Música"}{" "}
													<span
														style={{
															fontSize: "9.5px",
															color: "#94a3b8",
															fontWeight: "normal",
															marginLeft: "4px",
														}}
													>
														({f.genero || "Acervo"}
														{durTxt ? ` • ${durTxt}` : ""})
													</span>
												</div>
											</div>
											<div className={styles.itemFilaAcoes}>
												{idx > 0 && (
													<button
														type="button"
														className={styles.btnAcaoFila}
														title="Mover para cima"
														onClick={() => moverFaixaFila(idx, idx - 1)}
													>
														▲
													</button>
												)}
												{idx < filaPrograma.faixas.length - 1 && (
													<button
														type="button"
														className={styles.btnAcaoFila}
														title="Mover para baixo"
														onClick={() => moverFaixaFila(idx, idx + 1)}
													>
														▼
													</button>
												)}
												<button
													type="button"
													className={clsx(styles.btnAcaoFila, styles.btnAcaoFilaPlay)}
													title="Tocar agora (cortar para esta faixa)"
													onClick={() => tocarFaixaFilaAgora(idx)}
												>
													▶
												</button>
												<button
													type="button"
													className={clsx(styles.btnAcaoFila, styles.btnAcaoFilaDel)}
													title="Remover da fila"
													onClick={() => removerFaixaFila(idx, f.id)}
												>
													✕
												</button>
											</div>
										</div>
									);
								})
							)}
						</div>
					</div>
				</div>

				{/* COLUNA 3: DISPAROS (VINHETAS + ACERVO) */}
				<div className={clsx(styles.colunaMesa, styles.colDisparos)}>
					{/* PAINEL DE VINHETAS, JINGOS E PREFIXOS POR SUBPASTA */}
					<div className={styles.painelVinhetas}>
						<div className={styles.painelHeader}>
							<span>📢 Vinhetas, Jingos e Prefixos</span>
							<div className={styles.acervoHeaderActions}>
								<button
									type="button"
									className={styles.btnRefresh}
									style={{ color: "#a855f7" }}
									onClick={carregarVinhetas}
								>
									↻ Recarregar
								</button>
							</div>
						</div>

						<div className={styles.gridGeneros}>
							{Object.keys(mapaVinhetas).length === 0 ? (
								<div className={styles.emptyGenerosText}>
									Nenhuma subpasta de vinhetas encontrada em /vinhetas/.
								</div>
							) : (
								Object.entries(mapaVinhetas).map(([nomeCat, listaVinhetas]) => {
									if (
										!Array.isArray(listaVinhetas) ||
										listaVinhetas.length === 0
									)
										return null;
									return (
										<button
											key={nomeCat}
											type="button"
											className={styles.cardVinhetaCatBtn}
											onClick={() => {
												setVinhetaCategoriaAtiva(nomeCat);
												setBuscaVinhetaModal("");
											}}
										>
											<div className={styles.generoNome}>📢 {nomeCat}</div>
											<span className={styles.vinhetaBadgeCount}>
												{listaVinhetas.length}
											</span>
										</button>
									);
								})
							)}
						</div>
					</div>

					{/* PAINEL DE ACERVO POR GÊNERO */}
					<div className={styles.painelAcervo}>
						<div className={styles.painelHeader}>
							<span>📁 Acervo por Gênero</span>
							<div className={styles.acervoHeaderActions}>
								<button
									type="button"
									className={styles.btnRefresh}
									onClick={atualizarAcervo}
									disabled={atualizandoAcervo}
									title="Reindexar pasta /musicas/ no servidor"
								>
									{atualizandoAcervo ? "⏳ Indexando..." : "⚡ Reindexar"}
								</button>
								<button
									type="button"
									className={styles.btnRefresh}
									style={{ color: "#38bdf8" }}
									onClick={carregarAcervo}
								>
									↻ Recarregar
								</button>
							</div>
						</div>

						<div className={styles.gridGeneros}>
							{Object.keys(mapaGeneros).length === 0 ? (
								<div className={styles.emptyGenerosText}>
									Nenhum gênero indexado. Clique em &ldquo;⚡ Reindexar&rdquo;
									para atualizar o acervo.
								</div>
							) : (
								Object.entries(mapaGeneros).map(([nomeGenero, faixas]) => {
									if (!Array.isArray(faixas) || faixas.length === 0)
										return null;
									return (
										<button
											key={nomeGenero}
											type="button"
											className={styles.cardGeneroBtn}
											onClick={() => {
												setGeneroModalAtivo(nomeGenero);
												setBuscaMusicaModal("");
											}}
										>
											<div className={styles.generoNome}>📁 {nomeGenero}</div>
											<span className={styles.generoBadgeCount}>
												{faixas.length}
											</span>
										</button>
									);
								})
							)}
						</div>
					</div>

					{/* NOVO CARD: FILA DO PROGRAMA (PLAYLIST DO LOCUTOR) */}
					<div className={styles.painelFilaPrograma}>
						<div className={styles.painelFilaHeader}>
							<div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
								<span>📋 Fila do Programa</span>
								<span
									className={styles.badgePedidosCount}
									style={{
										color: "#38bdf8",
										background: "rgba(56, 189, 248, 0.15)",
										borderColor: "rgba(56, 189, 248, 0.35)",
									}}
								>
									{filaPrograma?.faixas?.length || 0}{" "}
									{(filaPrograma?.faixas?.length || 0) === 1 ? "faixa" : "faixas"}
									{filaPrograma?.duracao_formatada ? ` • ${filaPrograma.duracao_formatada}` : ""}
								</span>
							</div>
							<div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
								<span
									className={clsx(
										styles.badgeFilaStatus,
										(filaPrograma?.faixas?.length || 0) > 0
											? styles.badgeStatusRoteiro
											: styles.badgeStatusAutoDj,
									)}
									title={
										(filaPrograma?.faixas?.length || 0) > 0
											? "O sistema tocará estas faixas em ordem"
											: "Fila vazia: o sistema toca pelo sorteio automático da pasta do programa"
									}
								>
									{(filaPrograma?.faixas?.length || 0) > 0 ? "Roteiro Ativo" : "Auto-DJ"}
								</span>
								{(filaPrograma?.faixas?.length || 0) > 0 && (
									<button
										type="button"
										className={styles.btnLimparFila}
										onClick={() => {
											if (
												window.confirm(
													"Deseja realmente limpar toda a fila do programa? O sistema voltará ao sorteio automático da grade.",
												)
											) {
												limparFila();
											}
										}}
										title="Limpar todas as faixas do roteiro"
									>
										🗑️ Limpar
									</button>
								)}
							</div>
						</div>
						<div className={styles.areaScrollFila}>
							{(filaPrograma?.faixas?.length || 0) === 0 ? (
								<div
									style={{
										fontSize: "11px",
										color: "#64748b",
										textAlign: "center",
										padding: "25px 10px",
										lineHeight: 1.5,
									}}
								>
									Fila vazia.
									<br />
									O sistema está tocando pelo <b>sorteio automático</b> da grade.
									<br />
									<span style={{ fontSize: "10px", color: "#38bdf8", opacity: 0.85 }}>
										Abra o Acervo e clique em <b>➕ Fila</b> para montar seu roteiro.
									</span>
								</div>
							) : (
								filaPrograma.faixas.map((f, idx) => {
									const durTxt =
										f.duracao_formatada ||
										(f.duracao
											? `${Math.floor(f.duracao / 60)}:${String(f.duracao % 60).padStart(2, "0")}`
											: "");
									return (
										<div key={f.id || `fila_${idx}`} className={styles.itemFilaLinha}>
											<div className={styles.itemFilaEsquerda}>
												<span className={styles.itemFilaOrdem}>{idx + 1}</span>
												<div className={styles.itemFilaTitulo} title={f.nome || ""}>
													{f.nome || "Música"}{" "}
													<span
														style={{
															fontSize: "9.5px",
															color: "#94a3b8",
															fontWeight: "normal",
															marginLeft: "4px",
														}}
													>
														({f.genero || "Acervo"}
														{durTxt ? ` • ${durTxt}` : ""})
													</span>
												</div>
											</div>
											<div className={styles.itemFilaAcoes}>
												{idx > 0 && (
													<button
														type="button"
														className={styles.btnAcaoFila}
														title="Mover para cima"
														onClick={() => moverFaixaFila(idx, idx - 1)}
													>
														▲
													</button>
												)}
												{idx < filaPrograma.faixas.length - 1 && (
													<button
														type="button"
														className={styles.btnAcaoFila}
														title="Mover para baixo"
														onClick={() => moverFaixaFila(idx, idx + 1)}
													>
														▼
													</button>
												)}
												<button
													type="button"
													className={clsx(styles.btnAcaoFila, styles.btnAcaoFilaPlay)}
													title="Tocar agora (cortar para esta faixa)"
													onClick={() => tocarFaixaFilaAgora(idx)}
												>
													▶
												</button>
												<button
													type="button"
													className={clsx(styles.btnAcaoFila, styles.btnAcaoFilaDel)}
													title="Remover da fila"
													onClick={() => removerFaixaFila(idx, f.id)}
												>
													✕
												</button>
											</div>
										</div>
									);
								})
							)}
						</div>
					</div>
				</div>
			</div>
		</div>

			{/* MODAL DE LEITURA AMPLIADA DO PEDIDO DO OUVINTE */}
			<Modal
				isOpen={Boolean(pedidoLeituraAtivo)}
				onClose={() => setPedidoLeituraAtivo(null)}
				title="🎙️ Leitura de Pedido no Ar"
				size="md"
				closeLabel="Fechar leitura do pedido"
				footer={
					<div className={styles.modalLeituraFooter}>
						<button
							type="button"
							className={styles.btnDescartarPedidoModal}
							onClick={() => {
								const pedidoAlvo = pedidoLeituraAtivo;
								setPedidoLeituraAtivo(null);
								if (pedidoAlvo) solicitarDescartePedido(pedidoAlvo);
							}}
						>
							🗑 Excluir
						</button>
						<div className={styles.modalLeituraRightActions}>
							{pedidoLeituraAtivo?.recado && (
								<button
									type="button"
									className={styles.btnIaPedido}
									disabled={
										gerandoVozIaChave === pedidoLeituraAtivo.chave_linha
									}
									onClick={() => {
										const pedidoAlvo = pedidoLeituraAtivo;
										setPedidoLeituraAtivo(null);
										dispararRecadoComIA(pedidoAlvo);
									}}
								>
									{gerandoVozIaChave === pedidoLeituraAtivo.chave_linha
										? "⏳ Gerando Voz IA..."
										: "🤖 Tocar no Ar com Voz IA"}
								</button>
							)}
							{pedidoLeituraAtivo && !pedidoLeituraAtivo.tocado && (
								<>
									<button
										type="button"
										className={styles.btnAcervoAgendar}
										onClick={() => {
											const pedidoAlvo = pedidoLeituraAtivo;
											setPedidoLeituraAtivo(null);
											atenderPedido(pedidoAlvo, false);
										}}
									>
										▶ Agendar
									</button>
									<button
										type="button"
										className={styles.btnAcervoTocarAgora}
										disabled={transicaoEmAndamento}
										onClick={() => {
											const pedidoAlvo = pedidoLeituraAtivo;
											setPedidoLeituraAtivo(null);
											atenderPedido(pedidoAlvo, true);
										}}
									>
										⏭ Tocar Agora
									</button>
								</>
							)}
							<Button
								intent="neutral"
								variant="outline"
								onClick={() => setPedidoLeituraAtivo(null)}
							>
								Fechar
							</Button>
						</div>
					</div>
				}
			>
				{pedidoLeituraAtivo && (
					<div className={styles.modalLeituraBody}>
						<div className={styles.leituraBlocoOuvinte}>
							<span className={styles.leituraLabel}>OUVINTE</span>
							<div className={styles.leituraNomeOuvinte}>
								👤 {pedidoLeituraAtivo.nome}
							</div>
							{pedidoLeituraAtivo.data && (
								<span className={styles.leituraDataHorario}>
									Enviado em: {pedidoLeituraAtivo.data}
								</span>
							)}
						</div>

						<div className={styles.leituraBlocoMusica}>
							<span className={styles.leituraLabel}>MÚSICA PEDIDA</span>
							<div className={styles.leituraTituloMusica}>
								🎵 {pedidoLeituraAtivo.titulo}
							</div>
						</div>

						<div className={styles.leituraBlocoRecado}>
							<span className={styles.leituraLabel}>
								RECADO / ALÔ PARA LER NO AR
							</span>
							{pedidoLeituraAtivo.recado ? (
								<div className={styles.leituraTextoRecado}>
									&ldquo;{pedidoLeituraAtivo.recado}&rdquo;
								</div>
							) : (
								<div className={styles.leituraSemRecado}>
									O ouvinte não deixou recado adicional — apenas pediu a música.
								</div>
							)}
						</div>
					</div>
				)}
			</Modal>

			{/* MODAL DE CONTEÚDO DO BLOCO / ROTEIRO DE LOCUÇÃO (TRINCA) */}
			<Modal
				isOpen={modalTrincaAberto}
				onClose={() => setModalTrincaAberto(false)}
				title="📻 Roteiro de Locução — Bloco de 3 Músicas"
				size="md"
				closeLabel="Fechar roteiro"
				footer={
					<div className={styles.modalTrincaFooter}>
						<Button
							variant="primary"
							className={styles.btnAcaoLerMic}
							onClick={async () => {
								await cancelarIaTrinca();
								if (!aoVivo) {
									alternarMicrofone();
								}
								setModalTrincaAberto(false);
							}}
						>
							🎙️ Vou ler no Microfone (Cancelar Voz IA)
						</Button>
						<Button
							variant="secondary"
							onClick={() => setModalTrincaAberto(false)}
						>
							Fechar
						</Button>
					</div>
				}
			>
				<div className={styles.modalTrincaBody}>
					<div className={styles.modalTrincaStatusBar}>
						{blocoTrinca?.anuncio_pendente && (
							<span className={styles.badgeTrincaVerde}>
								● Bloco Completo (Anúncio Pronto)
							</span>
						)}
						<span className={styles.badgeTrincaModo}>
							{autoTrincaHabilitado
								? "Modo: Locução IA Automática"
								: "Modo: Locução Manual (Microfone)"}
						</span>
						<span
							className={styles.badgeTrincaModo}
							style={{ color: "#38bdf8", fontWeight: 700 }}
						>
							🎙️ Voz IA:{" "}
							{blocoTrinca?.locutor_nome ||
								(blocoTrinca?.genero_voz === "feminino"
									? "Camila (Feminina)"
									: "Ricardo (Masculino)")}
						</span>
					</div>

					<div className={styles.blocoTextoLocucao}>
						<div className={styles.headerTextoLocucao}>
							<span className={styles.tituloSessaoPequena}>
								📜 Roteiro do Locutor (Teleprompter):
							</span>
							<button
								type="button"
								className={styles.btnCopiarTrinca}
								onClick={() => {
									let faixas = Array.isArray(blocoTrinca?.faixas)
										? blocoTrinca.faixas.slice()
										: [];
									if (faixas.length < 3 && Array.isArray(blocoTrinca?.historico)) {
										blocoTrinca.historico.forEach((h) => {
											if (h && !faixas.includes(h)) faixas.unshift(h);
										});
									}
									if (faixas.length < 3 && musicaAtual && !faixas.includes(musicaAtual)) {
										faixas.push(musicaAtual);
									}
									faixas = faixas
										.filter((f) => f && !f.includes("Flash FM - Sequência"))
										.slice(-3);
									if (faixas.length === 0) {
										faixas = ["Música 1", "Música 2", "Música 3"];
									}
									const lista = faixas
										.map((f, i) => `${i + 1}. ${f}`)
										.join("\n");
									const roteiro =
										blocoTrinca?.texto_anuncio &&
										blocoTrinca.texto_anuncio.includes(
											"🎵 Músicas deste bloco:",
										) &&
										/1\..+2\..+3\./s.test(blocoTrinca.texto_anuncio)
											? blocoTrinca.texto_anuncio
											: `Você acabou de curtir aqui na Flash a nossa sequência de três sucessos!\n\n🎵 Músicas deste bloco:\n${lista}\n\nFique ligado que tem muito mais som pra você!`;
									navigator.clipboard.writeText(roteiro).then(() => {
										setAvisoModal({
											icone: "📋",
											titulo: "Copiado!",
											mensagem: "Roteiro copiado para a área de transferência.",
										});
									});
								}}
							>
								📋 Copiar
							</button>
						</div>
						<div className={styles.caixaTeleprompter}>
							{(() => {
								if (
									blocoTrinca?.texto_anuncio &&
									blocoTrinca.texto_anuncio.includes("🎵 Músicas deste bloco:") &&
									/1\..+2\..+3\./s.test(blocoTrinca.texto_anuncio)
								) {
									return blocoTrinca.texto_anuncio;
								}
								let faixas = Array.isArray(blocoTrinca?.faixas)
									? blocoTrinca.faixas.slice()
									: [];
								if (faixas.length < 3 && Array.isArray(blocoTrinca?.historico)) {
									blocoTrinca.historico.forEach((h) => {
										if (h && !faixas.includes(h)) faixas.unshift(h);
									});
								}
								if (faixas.length < 3 && musicaAtual && !faixas.includes(musicaAtual)) {
									faixas.push(musicaAtual);
								}
								faixas = faixas
									.filter((f) => f && !f.includes("Flash FM - Sequência"))
									.slice(-3);
								if (faixas.length === 0) {
									faixas = ["Música 1", "Música 2", "Música 3"];
								}
								const lista = faixas.map((f, i) => `${i + 1}. ${f}`).join("\n");
								return `Você acabou de curtir aqui na Flash a nossa sequência de três sucessos!\n\n🎵 Músicas deste bloco:\n${lista}\n\nFique ligado que tem muito mais som pra você!`;
							})()}
						</div>
					</div>

					{/* NOVO CARD: FILA DO PROGRAMA (PLAYLIST DO LOCUTOR) */}
					<div className={styles.painelFilaPrograma}>
						<div className={styles.painelFilaHeader}>
							<div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
								<span>📋 Fila do Programa</span>
								<span
									className={styles.badgePedidosCount}
									style={{
										color: "#38bdf8",
										background: "rgba(56, 189, 248, 0.15)",
										borderColor: "rgba(56, 189, 248, 0.35)",
									}}
								>
									{filaPrograma?.faixas?.length || 0}{" "}
									{(filaPrograma?.faixas?.length || 0) === 1 ? "faixa" : "faixas"}
									{filaPrograma?.duracao_formatada ? ` • ${filaPrograma.duracao_formatada}` : ""}
								</span>
							</div>
							<div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
								<span
									className={clsx(
										styles.badgeFilaStatus,
										(filaPrograma?.faixas?.length || 0) > 0
											? styles.badgeStatusRoteiro
											: styles.badgeStatusAutoDj,
									)}
									title={
										(filaPrograma?.faixas?.length || 0) > 0
											? "O sistema tocará estas faixas em ordem"
											: "Fila vazia: o sistema toca pelo sorteio automático da pasta do programa"
									}
								>
									{(filaPrograma?.faixas?.length || 0) > 0 ? "Roteiro Ativo" : "Auto-DJ"}
								</span>
								{(filaPrograma?.faixas?.length || 0) > 0 && (
									<button
										type="button"
										className={styles.btnLimparFila}
										onClick={() => {
											if (
												window.confirm(
													"Deseja realmente limpar toda a fila do programa? O sistema voltará ao sorteio automático da grade.",
												)
											) {
												limparFila();
											}
										}}
										title="Limpar todas as faixas do roteiro"
									>
										🗑️ Limpar
									</button>
								)}
							</div>
						</div>
						<div className={styles.areaScrollFila}>
							{(filaPrograma?.faixas?.length || 0) === 0 ? (
								<div
									style={{
										fontSize: "11px",
										color: "#64748b",
										textAlign: "center",
										padding: "25px 10px",
										lineHeight: 1.5,
									}}
								>
									Fila vazia.
									<br />
									O sistema está tocando pelo <b>sorteio automático</b> da grade.
									<br />
									<span style={{ fontSize: "10px", color: "#38bdf8", opacity: 0.85 }}>
										Abra o Acervo e clique em <b>➕ Fila</b> para montar seu roteiro.
									</span>
								</div>
							) : (
								filaPrograma.faixas.map((f, idx) => {
									const durTxt =
										f.duracao_formatada ||
										(f.duracao
											? `${Math.floor(f.duracao / 60)}:${String(f.duracao % 60).padStart(2, "0")}`
											: "");
									return (
										<div key={f.id || `fila_${idx}`} className={styles.itemFilaLinha}>
											<div className={styles.itemFilaEsquerda}>
												<span className={styles.itemFilaOrdem}>{idx + 1}</span>
												<div className={styles.itemFilaTitulo} title={f.nome || ""}>
													{f.nome || "Música"}{" "}
													<span
														style={{
															fontSize: "9.5px",
															color: "#94a3b8",
															fontWeight: "normal",
															marginLeft: "4px",
														}}
													>
														({f.genero || "Acervo"}
														{durTxt ? ` • ${durTxt}` : ""})
													</span>
												</div>
											</div>
											<div className={styles.itemFilaAcoes}>
												{idx > 0 && (
													<button
														type="button"
														className={styles.btnAcaoFila}
														title="Mover para cima"
														onClick={() => moverFaixaFila(idx, idx - 1)}
													>
														▲
													</button>
												)}
												{idx < filaPrograma.faixas.length - 1 && (
													<button
														type="button"
														className={styles.btnAcaoFila}
														title="Mover para baixo"
														onClick={() => moverFaixaFila(idx, idx + 1)}
													>
														▼
													</button>
												)}
												<button
													type="button"
													className={clsx(styles.btnAcaoFila, styles.btnAcaoFilaPlay)}
													title="Tocar agora (cortar para esta faixa)"
													onClick={() => tocarFaixaFilaAgora(idx)}
												>
													▶
												</button>
												<button
													type="button"
													className={clsx(styles.btnAcaoFila, styles.btnAcaoFilaDel)}
													title="Remover da fila"
													onClick={() => removerFaixaFila(idx, f.id)}
												>
													✕
												</button>
											</div>
										</div>
									);
								})
							)}
						</div>
					</div>
				</div>
			</Modal>

			{/* MODAL DE VINHETAS / JINGOS / PREFIXO POR SUBPASTA */}
			<Modal
				isOpen={Boolean(vinhetaCategoriaAtiva)}
				onClose={() => setVinhetaCategoriaAtiva(null)}
				title={
					vinhetaCategoriaAtiva
						? `📢 ${vinhetaCategoriaAtiva} (${(mapaVinhetas[vinhetaCategoriaAtiva] || []).length})`
						: "📢 Vinhetas"
				}
				size="md"
				closeLabel="Fechar lista de vinhetas"
			>
				<div className={styles.modalGeneroBody}>
					<Input
						placeholder="🔍 Filtrar vinheta, jingo ou prefixo..."
						value={buscaVinhetaModal}
						onValueChange={setBuscaVinhetaModal}
					/>
					<div className={styles.listaMusicasGenero}>
						{vinhetasDaCategoriaFiltradas.length === 0 ? (
							<div className={styles.emptyPanelText}>
								Nenhuma vinheta encontrada.
							</div>
						) : (
							vinhetasDaCategoriaFiltradas.map((v) => {
								const estaCarregada =
									vinhetaSelecionada?.id === v.id ||
									vinhetaSelecionada?.arquivo === v.arquivo;
								return (
									<div
										key={v.id || v.arquivo || v.nome}
										className={styles.itemMusicaLinha}
										style={
											estaCarregada
												? {
														borderLeft: "3px solid #38bdf8",
														background: "#1e293b",
													}
												: undefined
										}
									>
										<span
											className={styles.itemMusicaTitulo}
											style={{ cursor: "pointer" }}
											onClick={() => {
												carregarVinhetaNoCanal(v);
												setVinhetaCategoriaAtiva(null);
											}}
											title="Clique para carregar no canal 3 (CH-3) pausada"
										>
											📻 {v.nome}
										</span>
										<div className={styles.botoesAcaoPedido}>
											<button
												type="button"
												className={styles.btnAgendarFaixa}
												style={{
													background: "#0284c7",
													borderColor: "#38bdf8",
													color: "#ffffff",
													fontWeight: 700,
													padding: "6px 14px",
													borderRadius: "6px",
													cursor: "pointer",
												}}
												onClick={() => {
													carregarVinhetaNoCanal(v);
													setVinhetaCategoriaAtiva(null);
												}}
												title="Carregar esta vinheta no canal 3 (CH-3) pausada"
											>
												✓ Selecionar
											</button>
										</div>
									</div>
								);
							})
						)}
					</div>
				</div>
			</Modal>

			{/* MODAL DE SELEÇÃO DE MÚSICA POR GÊNERO */}
			<Modal
				isOpen={Boolean(generoModalAtivo)}
				onClose={() => setGeneroModalAtivo(null)}
				title={
					generoModalAtivo
						? `📁 ${generoModalAtivo} (${(mapaGeneros[generoModalAtivo] || []).length})`
						: "📁 Gênero"
				}
				size="md"
				closeLabel="Fechar lista de músicas"
			>
				<div className={styles.modalGeneroBody}>
					<Input
						placeholder="🔍 Filtrar música pelo título..."
						value={buscaMusicaModal}
						onValueChange={setBuscaMusicaModal}
					/>
					<div className={styles.listaMusicasGenero}>
						{faixasDoGeneroFiltradas.length === 0 ? (
							<div className={styles.emptyPanelText}>
								Nenhuma faixa encontrada.
							</div>
						) : (
							faixasDoGeneroFiltradas.map((faixa) => (
								<div
									key={faixa.id || faixa.arquivo || faixa.nome}
									className={styles.itemMusicaLinha}
								>
									<span className={styles.itemMusicaTitulo}>
										🎵 {faixa.nome}
									</span>
									<div className={styles.botoesAcaoPedido}>
										<button
											type="button"
											className={styles.btnAcervoFila}
											title="Adicionar à Fila do Programa (Playlist do Locutor)"
											onClick={async () => {
												const idFaixa = faixa.id || faixa.arquivo || faixa.nome;
												setAdicionandoFilaId(idFaixa);
												await adicionarFaixaFila({
													...faixa,
													genero: generoModalAtivo || faixa.genero || "Acervo",
												});
												setTimeout(() => setAdicionandoFilaId(null), 1200);
											}}
										>
											{adicionandoFilaId === (faixa.id || faixa.arquivo || faixa.nome)
												? "✓ Na fila"
												: "➕ Fila"}
										</button>
										<button
											type="button"
											className={styles.btnAcervoAgendar}
											onClick={() => {
												setGeneroModalAtivo(null);
												agendarFaixaAcervo(faixa, false);
											}}
										>
											▶ Agendar
										</button>
										<button
											type="button"
											className={styles.btnAcervoTocarAgora}
											disabled={transicaoEmAndamento}
											onClick={() => {
												setGeneroModalAtivo(null);
												agendarFaixaAcervo(faixa, true);
											}}
										>
											⏭ Tocar Agora
										</button>
									</div>
								</div>
							))
						)}
					</div>
				</div>
			</Modal>

			{/* MODAL DE AVISOS */}
			<Modal
				isOpen={Boolean(avisoModal)}
				onClose={() => setAvisoModal(null)}
				title={avisoModal?.titulo || "Aviso"}
				size="sm"
				closeLabel="Fechar aviso"
				footer={
					<Button
						intent="primary"
						isFullWidth
						onClick={() => setAvisoModal(null)}
					>
						OK
					</Button>
				}
			>
				<div className={styles.modalAvisoContent}>
					<div className={styles.modalAvisoIcone}>{avisoModal?.icone}</div>
					<p className={styles.modalAvisoTexto}>{avisoModal?.mensagem}</p>
				</div>
			</Modal>

			{/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO */}
			<Modal
				isOpen={Boolean(confirmacaoModal)}
				onClose={() => setConfirmacaoModal(null)}
				title={confirmacaoModal?.titulo || "Confirmação"}
				size="sm"
				closeLabel="Cancelar"
				footer={
					<div className={styles.modalConfirmActions}>
						<Button
							intent="neutral"
							variant="outline"
							onClick={() => setConfirmacaoModal(null)}
						>
							Cancelar
						</Button>
						<Button
							intent="danger"
							variant="filled"
							onClick={() => confirmacaoModal?.onConfirm?.()}
						>
							Sim, Excluir
						</Button>
					</div>
				}
			>
				<div className={styles.modalAvisoContent}>
					<div className={styles.modalAvisoIcone}>❓</div>
					<p className={styles.modalAvisoTexto}>{confirmacaoModal?.mensagem}</p>
				</div>
			</Modal>

			<audio
				ref={monitorAudioRef}
				preload="auto"
				crossOrigin="anonymous"
				onEnded={monitorarMusicaNoAr}
			/>
			<audio
				ref={vinhetaPreviewAudioRef}
				preload="auto"
				onEnded={pararEscutaVinheta}
				onError={pararEscutaVinheta}
			/>
		</div>
	);
};

export default LocutorPage;
