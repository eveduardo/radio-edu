import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Input, Modal } from "@jposawa/ronin-ui";
import { fetchGenresCatalog, submitSongRequest } from "@/services";
import styles from "../pages/RadioPlayerPage.module.css";

/**
 * Modal de Pedido de Música + Catálogo de Acervo por Gênero com Filtro da Grade.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {() => void} props.onClose
 * @param {Object} [props.initialSong]
 * @param {Object} [props.programaAtual]
 * @param {Object} [props.proximoPrograma]
 */
export const SongRequestModal = ({
	isOpen,
	onClose,
	initialSong = null,
	programaAtual = null,
	proximoPrograma = null,
}) => {
	const [nome, setNome] = useState("");
	const [recado, setRecado] = useState("");
	const [faixaSelecionada, setFaixaSelecionada] = useState(null);
	const [enviando, setEnviando] = useState(false);

	const [catalogoAberto, setCatalogoAberto] = useState(false);
	const [mapaGeneros, setMapaGeneros] = useState({});
	const [carregandoAcervo, setCarregandoAcervo] = useState(false);
	const [generoAtivo, setGeneroAtivo] = useState(null);
	const [buscaFaixa, setBuscaFaixa] = useState("");
	const [buscaAcervoGlobal, setBuscaAcervoGlobal] = useState("");

	const [notificacao, setNotificacao] = useState(null);

	// Gêneros e pastas do programa atual para validação e destaque
	const generosDoPrograma = useMemo(() => {
		if (!programaAtual?.generos_prioritarios || !Array.isArray(programaAtual.generos_prioritarios)) {
			return [];
		}
		return programaAtual.generos_prioritarios.map((g) =>
			g.toLowerCase().trim().replace(/[_-]/g, " "),
		);
	}, [programaAtual]);

	const pastasDoPrograma = useMemo(() => {
		if (!programaAtual?.pastas_musicas || !Array.isArray(programaAtual.pastas_musicas)) {
			return [];
		}
		return programaAtual.pastas_musicas.map((p) =>
			p.toLowerCase().trim().replace(/[_-]/g, ""),
		);
	}, [programaAtual]);

	const faixaCombinaComPrograma = (faixa) => {
		if (generosDoPrograma.length === 0 && pastasDoPrograma.length === 0) {
			return true;
		}
		const gFaixa = (faixa.genero || "").toLowerCase().trim().replace(/[_-]/g, " ");
		const aFaixa = (faixa.arquivo || faixa.url || "").toLowerCase().trim().replace(/[_-]/g, "");

		const matchGen = generosDoPrograma.some(
			(gp) => gFaixa.includes(gp) || gp.includes(gFaixa),
		);
		if (matchGen) return true;

		const matchPasta = pastasDoPrograma.some((pm) => aFaixa.includes(pm));
		return matchPasta;
	};

	const generoCombinaComPrograma = (generoNome, faixas = []) => {
		if (generosDoPrograma.length === 0 && pastasDoPrograma.length === 0) {
			return true;
		}

		// 1. Verifica pela pasta física das faixas (ex: musicas/rock_classico/...)
		const exemploArq = faixas?.[0]?.arquivo || faixas?.[0]?.url || "";
		const partes = exemploArq.split("/");
		const pastaReal = (partes.length > 2 && partes[0] === "musicas") ? partes[1].toLowerCase().replace(/[-_ ]/g, "") : "";
		if (pastaReal && pastasDoPrograma.some((pm) => pm === pastaReal || pastaReal.includes(pm) || pm.includes(pastaReal))) {
			return true;
		}

		const genNorm = generoNome.toLowerCase().trim().replace(/[_-]/g, " ");
		const matchGen = generosDoPrograma.some(
			(gp) => genNorm.includes(gp) || gp.includes(genNorm),
		);
		if (matchGen) return true;

		const genSemEspaco = genNorm.replace(/\s+/g, "");
		return pastasDoPrograma.some(
			(pm) => genSemEspaco.includes(pm) || pm.includes(genSemEspaco),
		);
	};

	// Filtra as pastas/gêneros que pertencem exclusivamente ao programa no ar
	const generosPermitidos = useMemo(() => {
		const entries = Object.entries(mapaGeneros);
		if (!programaAtual) return entries;
		return entries.filter(([genero, faixas]) =>
			generoCombinaComPrograma(genero, faixas),
		);
	}, [mapaGeneros, programaAtual, generosDoPrograma, pastasDoPrograma]);

	useEffect(() => {
		if (isOpen) {
			setNome("");
			setRecado("");
			if (initialSong) {
				setFaixaSelecionada({
					arquivo: initialSong.arquivo || "",
					titulo: initialSong.titulo || initialSong.nome || "Música",
					genero: initialSong.genero || "",
				});
			} else {
				setFaixaSelecionada(null);
			}
			setBuscaAcervoGlobal("");
		}
	}, [isOpen, initialSong]);

	const carregarAcervo = async () => {
		setCarregandoAcervo(true);
		try {
			const generos = await fetchGenresCatalog();
			setMapaGeneros(generos);
		} catch {
			setNotificacao({
				icone: "⚠️",
				titulo: "Erro",
				mensagem: "Não foi possível carregar os gêneros do acervo.",
			});
		} finally {
			setCarregandoAcervo(false);
		}
	};

	const abrirCatalogo = () => {
		if (Object.keys(mapaGeneros).length === 0) {
			carregarAcervo();
		}
		setGeneroAtivo(null);
		setBuscaFaixa("");
		setBuscaAcervoGlobal("");
		setCatalogoAberto(true);
	};

	const faixasGlobaisFiltradas = useMemo(() => {
		const t = buscaAcervoGlobal.toLowerCase().trim();
		if (t.length < 2) return [];
		const todas = [];
		for (const [gen, faixas] of generosPermitidos) {
			if (Array.isArray(faixas)) {
				for (const f of faixas) {
					todas.push({ ...f, genero: f.genero || gen });
				}
			}
		}
		return todas
			.filter((f) => {
				const n = (f.nome || f.titulo || "").toLowerCase();
				const a = (f.arquivo || f.url || "").toLowerCase();
				const g = (f.genero || "").toLowerCase();
				return n.includes(t) || a.includes(t) || g.includes(t);
			})
			.slice(0, 50);
	}, [buscaAcervoGlobal, generosPermitidos]);

	const faixasFiltradas = useMemo(() => {
		if (!generoAtivo) return [];
		const lista = mapaGeneros[generoAtivo] || [];
		const termo = buscaFaixa.toLowerCase().trim();
		if (!termo) return lista;
		return lista.filter((f) =>
			(f.nome || f.titulo || "").toLowerCase().includes(termo),
		);
	}, [buscaFaixa, generoAtivo, mapaGeneros]);

	const selecionarFaixa = (faixa) => {
		const combina = faixaCombinaComPrograma(faixa);
		if (!combina && programaAtual) {
			const estiloProg = programaAtual.generos_prioritarios?.join(", ") || "específico";
			setNotificacao({
				icone: "⚠️",
				titulo: "Estilo Incompatível",
				mensagem: `A faixa "${faixa.nome || faixa.titulo}" não pertence ao estilo do programa "${programaAtual.nome}" (${estiloProg}). Escolha uma música compatível para ir ao ar!`,
			});
			return;
		}

		setFaixaSelecionada({
			arquivo: faixa.arquivo || faixa.url || "",
			titulo: faixa.nome || faixa.titulo || "Música",
			genero: faixa.genero || generoAtivo || "",
		});
		setCatalogoAberto(false);
	};

	const handleEnviarPedido = async () => {
		if (!nome.trim()) {
			setNotificacao({
				icone: "⚠️",
				titulo: "Atenção",
				mensagem: "Por favor, informe seu nome ou apelido!",
			});
			return;
		}
		if (!faixaSelecionada?.arquivo) {
			setNotificacao({
				icone: "⚠️",
				titulo: "Atenção",
				mensagem:
					'Toque em "Toque para Escolher a Música" e selecione uma faixa!',
			});
			return;
		}

		setEnviando(true);
		try {
			const data = await submitSongRequest({
				arquivo: faixaSelecionada.arquivo,
				titulo: faixaSelecionada.titulo,
				nome: nome.trim(),
				recado: recado.trim(),
			});

			if (data?.sucesso) {
				onClose();
				setNotificacao({
					icone: "✅",
					titulo: "Pedido Recebido!",
					mensagem:
						data?.mensagem ||
						`Show de bola! A faixa "${faixaSelecionada.titulo}" entrou na fila da programação.`,
				});
			} else {
				setNotificacao({
					icone: "⚠️",
					titulo: "Ops!",
					mensagem: data?.erro || "Não foi possível enviar o pedido.",
				});
			}
		} catch {
			setNotificacao({
				icone: "❌",
				titulo: "Erro de Conexão",
				mensagem: "Não foi possível contactar o servidor da rádio.",
			});
		} finally {
			setEnviando(false);
		}
	};

	const pedidosBloqueados = programaAtual && programaAtual.permite_pedidos === false;

	return (
		<>
			<Modal
				isOpen={isOpen}
				onClose={onClose}
				title="🎵 Pedir Música"
				size="sm"
				closeLabel="Fechar"
				footer={
					<div className={styles.modalFooterActions}>
						<Button variant="outline" intent="neutral" onClick={onClose}>
							{pedidosBloqueados ? "Compreendi" : "Voltar"}
						</Button>
						{!pedidosBloqueados && (
							<Button
								variant="filled"
								intent="primary"
								onClick={handleEnviarPedido}
								disabled={enviando}
							>
								{enviando ? "Enviando..." : "Enviar Pedido"}
							</Button>
						)}
					</div>
				}
			>
				{pedidosBloqueados ? (
					<div className={styles.avisoBloqueioPedidos}>
						<div className={styles.avisoIcone}>🔒</div>
						<h3 className={styles.avisoTitulo}>Pedidos Fechados Neste Horário</h3>
						<p className={styles.avisoTexto}>
							O programa <strong>{programaAtual?.nome || "atual"}</strong> conta com uma curadoria musical exclusiva da Flash FM e não recebe pedidos de ouvintes.
						</p>
						{proximoPrograma && (
							<div className={styles.avisoHorarioVolta}>
								📻 Os pedidos voltam no programa <strong>{proximoPrograma.nome}</strong>{proximoPrograma.horario ? ` (${proximoPrograma.horario})` : ""}!
							</div>
						)}
					</div>
				) : (
					<div className={styles.pedidoFormStack}>
						{programaAtual && (
							<div className={styles.bannerProgramaPedido}>
								<span className={styles.bannerProgramaIcone}>
									{programaAtual.icone || "📻"}
								</span>
								<div className={styles.bannerProgramaTextos}>
									<div className={styles.bannerProgramaNome}>
										{programaAtual.nome}
									</div>
									{programaAtual.generos_prioritarios?.length > 0 && (
										<div className={styles.bannerProgramaEstilo}>
											Estilo aceito: <strong>{programaAtual.generos_prioritarios.join(", ")}</strong>
										</div>
									)}
								</div>
							</div>
						)}

						<Input
							label="Seu Nome / Apelido (Obrigatório)"
							placeholder="Ex: Carlos do Centro"
							value={nome}
							onValueChange={setNome}
						/>
						<Input
							label="Recado / Alô (Opcional)"
							placeholder="Ex: Manda um alô pra galera!"
							value={recado}
							onValueChange={setRecado}
						/>
						<div className={styles.seletorAcervoField}>
							<span className={styles.seletorAcervoLabel}>
								Música Escolhida (Obrigatório)
							</span>
							<button
								type="button"
								className={
									faixaSelecionada
										? `${styles.btnSeletorAcervo} ${styles.selecionado}`
										: styles.btnSeletorAcervo
								}
								onClick={abrirCatalogo}
							>
								{faixaSelecionada
									? `✓ ${faixaSelecionada.titulo}`
									: "🔍 Toque para Escolher a Música"}
							</button>
						</div>
					</div>
				)}
			</Modal>

			{/* Sub-Modal: Navegação do Acervo por Gênero e Busca */}
			<Modal
				isOpen={catalogoAberto}
				onClose={() => setCatalogoAberto(false)}
				title={
					generoAtivo
						? `📁 ${generoAtivo} (${(mapaGeneros[generoAtivo] || []).length})`
						: programaAtual
							? `📁 Pastas do Programa: ${programaAtual.nome}`
							: "📁 Pastas de Músicas"
				}
				size="sm"
				closeLabel="Fechar catálogo"
				footer={
					generoAtivo ? (
						<Button
							variant="outline"
							intent="neutral"
							isFullWidth
							onClick={() => setGeneroAtivo(null)}
						>
							← Voltar às Pastas
						</Button>
					) : undefined
				}
			>
				{!generoAtivo ? (
					<div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
						<Input
							placeholder="🔍 Digite a música ou banda/cantor..."
							value={buscaAcervoGlobal}
							onValueChange={setBuscaAcervoGlobal}
						/>

						{buscaAcervoGlobal.trim().length >= 2 ? (
							<div className={styles.listaFaixasScroll}>
								{faixasGlobaisFiltradas.length === 0 ? (
									<div className={styles.emptyCatalogMsg}>
										Nenhuma música encontrada para &ldquo;{buscaAcervoGlobal}&rdquo;.
									</div>
								) : (
									faixasGlobaisFiltradas.map((f) => {
										const nomeFaixa = f.nome || f.titulo || "Música";
										return (
											<button
												key={f.id || f.arquivo || nomeFaixa}
												type="button"
												className={styles.itemFaixaBtn}
												onClick={() => selecionarFaixa(f)}
												style={{
													display: "flex",
													justifyContent: "space-between",
													alignItems: "center",
													gap: "8px",
												}}
											>
												<span
													style={{
														overflow: "hidden",
														textOverflow: "ellipsis",
														whiteSpace: "nowrap",
													}}
												>
													🎵 {nomeFaixa}
												</span>
												<span className={styles.badgeGeneroOuvinte}>
													{f.genero}
												</span>
											</button>
										);
									})
								)}
							</div>
						) : (
							<div className={styles.gridGenerosOuvinte}>
								{carregandoAcervo ? (
									<div className={styles.emptyCatalogMsg}>
										Carregando pastas...
									</div>
								) : generosPermitidos.length === 0 ? (
									<div className={styles.emptyCatalogMsg}>
										{programaAtual
											? `O programa "${programaAtual.nome}" possui programação exclusiva e não possui pastas liberadas para pedidos no momento.`
											: "Nenhuma pasta disponível."}
									</div>
								) : (
									generosPermitidos.map(([genero, faixas]) => (
										<button
											key={genero}
											type="button"
											className={styles.cardGenBtn}
											onClick={() => {
												setGeneroAtivo(genero);
												setBuscaFaixa("");
											}}
										>
											<div style={{ display: "flex", flexDirection: "column", textAlign: "left" }}>
												<span>📁 {genero}</span>
											</div>
											<Badge intent="neutral" variant="subtle">
												{faixas.length}
											</Badge>
										</button>
									))
								)}
							</div>
						)}
					</div>
				) : (
					<div className={styles.listaFaixasBox}>
						<Input
							placeholder="🔍 Filtrar música..."
							value={buscaFaixa}
							onValueChange={setBuscaFaixa}
						/>
						<div className={styles.listaFaixasScroll}>
							{faixasFiltradas.length === 0 ? (
								<div className={styles.emptyCatalogMsg}>
									Nenhuma música encontrada.
								</div>
							) : (
								faixasFiltradas.map((f) => {
									const nomeFaixa = f.nome || f.titulo || "Música";
									return (
										<button
											key={f.id || f.arquivo || nomeFaixa}
											type="button"
											className={styles.itemFaixaBtn}
											onClick={() => selecionarFaixa(f)}
										>
											🎵 {nomeFaixa}
										</button>
									);
								})
							)}
						</div>
					</div>
				)}
			</Modal>

			{/* Modal de Notificação / Feedback */}
			<Modal
				isOpen={Boolean(notificacao)}
				onClose={() => setNotificacao(null)}
				title={notificacao?.titulo || "Aviso"}
				size="sm"
				closeLabel="Fechar aviso"
				footer={
					<Button
						intent="primary"
						isFullWidth
						onClick={() => setNotificacao(null)}
					>
						OK
					</Button>
				}
			>
				<div className={styles.notificacaoBody}>
					<div className={styles.notificacaoIcone}>{notificacao?.icone}</div>
					<p className={styles.notificacaoTexto}>{notificacao?.mensagem}</p>
				</div>
			</Modal>
		</>
	);
};
