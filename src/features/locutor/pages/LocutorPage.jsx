import { useMemo, useState } from "react";
import clsx from "clsx";
import { Badge, Button, Input, Modal } from "@jposawa/ronin-ui";
import { VerticalVuMeter } from "../components/VerticalVuMeter";
import { useLocutorMesa } from "../hooks/useLocutorMesa";
import styles from "./LocutorPage.module.css";

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
		agendarFaixaAcervo,
	} = useLocutorMesa();

	const [generoModalAtivo, setGeneroModalAtivo] = useState(null);
	const [buscaMusicaModal, setBuscaMusicaModal] = useState("");
	const [vinhetaCategoriaAtiva, setVinhetaCategoriaAtiva] = useState(null);
	const [buscaVinhetaModal, setBuscaVinhetaModal] = useState("");
	const [pedidoLeituraAtivo, setPedidoLeituraAtivo] = useState(null);

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

	return (
		<div className={styles.locutorScreen}>
			<div className={styles.containerMesa}>
				<div className={styles.topoMesa}>
					<h1 className={styles.titulo}>🎙️ MESA MASTER</h1>
					<Badge
						intent={aoVivo ? "danger" : "neutral"}
						variant="filled"
						className={clsx(styles.statusBadge, aoVivo && styles.noAr)}
					>
						{aoVivo ? "NO AR" : "STANDBY"}
					</Badge>
				</div>

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
								title="Ligar / Desligar escuta da música que está no ar"
							>
								<span>{ouvindoProgramacao ? "🔊" : "🔇"}</span>
								<span>{ouvindoProgramacao ? "LIG." : "DESL."}</span>
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
								aoVivo={ouvindoVinheta}
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
									? `Selecionada: ${vinhetaSelecionada.nome}`
									: "Nenhuma vinheta no cache (PRÉ-ESCUTA)"
							}
						>
							{vinhetaSelecionada ? vinhetaSelecionada.nome : "PRÉ-ESCUTA"}
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
										? "Ouvir / Parar vinheta apenas para o locutor (CH-3)"
										: "Nenhuma vinheta no cache. Escolha uma nas pastas abaixo."
								}
							>
								<span>{ouvindoVinheta ? "⏹" : "🎧"}</span>
								<span>{ouvindoVinheta ? "PARAR" : "OUVIR"}</span>
							</button>
							<button
								type="button"
								className={clsx(
									styles.btnCanalVinhetaAr,
									vinhetaSelecionada &&
										vinhetaNoArId === vinhetaSelecionada.id &&
										styles.ativo,
								)}
								onClick={() => liberarVinhetaNoAr()}
								disabled={!vinhetaSelecionada && !vinhetaNoArId}
								title={
									vinhetaSelecionada
										? "Liberar vinheta selecionada para o AR"
										: "Nenhuma vinheta no cache. Escolha uma nas pastas abaixo."
								}
							>
								<span>📡</span>
								<span>
									{vinhetaSelecionada &&
									vinhetaNoArId === vinhetaSelecionada.id
										? "NO AR!"
										: "AR"}
								</span>
							</button>
						</div>
					</div>
				</div>

				{/* CARD DE STATUS DA MÚSICA */}
				<div className={styles.cardMusicaNoAr}>
					<div className={styles.statusLinhaTopo}>
						<span>● No Ar Agora</span>
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
				</div>

				{/* ÁREA INFERIOR ROLÁVEL (MANTÉM A MESA MASTER ACIMA SEMPRE FIXA) */}
				<div className={styles.areaPaineisInferiores}>
					{/* PAINEL DE PEDIDOS DOS OUVINTES */}
					<div className={styles.painelPedidos}>
						<div className={styles.painelPedidosHeader}>
							<span>📩 Pedidos dos Ouvintes ({pedidos.length})</span>
							<button
								type="button"
								className={styles.btnRefresh}
								onClick={carregarPedidos}
							>
								↻ Atualizar
							</button>
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
													<button
														type="button"
														className={styles.btnLerPedido}
														title="Abrir recado em fonte grande para leitura no ar"
														onClick={() => setPedidoLeituraAtivo(p)}
													>
														📖 Ler
													</button>
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
								const estaOuvindoEsta =
									ouvindoVinheta && vinhetaSelecionada?.id === v.id;
								const estaNoArEsta = vinhetaNoArId === v.id;
								return (
									<div
										key={v.id || v.arquivo || v.nome}
										className={styles.itemMusicaLinha}
									>
										<span className={styles.itemMusicaTitulo}>
											📢 {v.nome}
										</span>
										<div className={styles.botoesAcaoPedido}>
											<button
												type="button"
												className={clsx(
													styles.btnVinhetaOuvir,
													estaOuvindoEsta && styles.btnVinhetaOuvirAtivo,
												)}
												onClick={() => {
													setVinhetaCategoriaAtiva(null);
													ouvirVinhetaNoCanal(v);
												}}
												title="Pré-escutar apenas para o locutor (CH-3)"
											>
												{estaOuvindoEsta ? "⏹ Parar (CH-3)" : "🎧 Ouvir (CH-3)"}
											</button>
											<button
												type="button"
												className={clsx(
													styles.btnAcervoTocarAgora,
													estaNoArEsta && styles.btnVinhetaNoArAtivo,
												)}
												onClick={() => {
													setVinhetaCategoriaAtiva(null);
													liberarVinhetaNoAr(v);
												}}
												title="Liberar esta vinheta imediatamente para o AR"
											>
												{estaNoArEsta ? "📡 No Ar!" : "📡 Pro Ar"}
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
				crossOrigin="anonymous"
				onEnded={pararEscutaVinheta}
				onError={pararEscutaVinheta}
			/>
		</div>
	);
};

export default LocutorPage;
