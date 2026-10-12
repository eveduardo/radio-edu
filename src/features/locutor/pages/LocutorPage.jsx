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
		musicaAtual,
		proximaAtual,
		tempoRestanteFormatado,
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
	} = useLocutorMesa();

	const [generoModalAtivo, setGeneroModalAtivo] = useState(null);
	const [buscaMusicaModal, setBuscaMusicaModal] = useState("");

	const faixasDoGeneroFiltradas = useMemo(() => {
		if (!generoModalAtivo) return [];
		const lista = mapaGeneros[generoModalAtivo] || [];
		const termo = buscaMusicaModal.toLowerCase().trim();
		if (!termo) return lista;
		return lista.filter((f) => (f.nome || "").toLowerCase().includes(termo));
	}, [buscaMusicaModal, generoModalAtivo, mapaGeneros]);

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
							<VerticalVuMeter mode="musica" faderValue={faderMusica} />
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

						<div className={styles.infoCanalMusica}>PROGRAMAÇÃO</div>
					</div>
				</div>

				{/* CARD DE STATUS DA MÚSICA */}
				<div className={styles.cardMusicaNoAr}>
					<div className={styles.statusLinhaTopo}>
						<span>● No Ar Agora</span>
						<div className={styles.statusTopoRight}>
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
								{transicaoEmAndamento ? "⏳ Virando..." : "⏭ Pular / Fade"}
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
							pedidos.map((p) => (
								<div key={p.chave_linha} className={styles.itemPedidoCard}>
									<div className={styles.dadosPedidoInfo}>
										<div className={styles.pedidoLinhaTopo}>
											<span className={styles.badgeOuvinte}>👤 {p.nome}</span>
											<span title={p.titulo}>🎵 {p.titulo}</span>
										</div>
										{p.recado && (
											<div className={styles.pedidoRecado}>
												💬 &ldquo;{p.recado}&rdquo;
											</div>
										)}
									</div>
									<div className={styles.botoesAcaoPedido}>
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
							))
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
								if (!Array.isArray(faixas) || faixas.length === 0) return null;
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
										<Button
											intent="secondary"
											variant="outline"
											onClick={() => {
												setGeneroModalAtivo(null);
												agendarFaixaAcervo(faixa, false);
											}}
										>
											▶ Agendar
										</Button>
										<Button
											intent="primary"
											variant="filled"
											disabled={transicaoEmAndamento}
											onClick={() => {
												setGeneroModalAtivo(null);
												agendarFaixaAcervo(faixa, true);
											}}
										>
											⏭ Tocar Agora
										</Button>
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
		</div>
	);
};

export default LocutorPage;
