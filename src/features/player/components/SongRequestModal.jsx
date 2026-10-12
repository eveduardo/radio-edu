import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Input, Modal } from "@jposawa/ronin-ui";
import { fetchGenresCatalog, submitSongRequest } from "@/services";
import styles from "../pages/RadioPlayerPage.module.css";

/**
 * Modal de Pedido de Música + Catálogo de Acervo por Gênero usando `@jposawa/ronin-ui`.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {() => void} props.onClose
 */
export const SongRequestModal = ({ isOpen, onClose }) => {
	const [nome, setNome] = useState("");
	const [recado, setRecado] = useState("");
	const [faixaSelecionada, setFaixaSelecionada] = useState(null);
	const [enviando, setEnviando] = useState(false);

	const [catalogoAberto, setCatalogoAberto] = useState(false);
	const [mapaGeneros, setMapaGeneros] = useState({});
	const [carregandoAcervo, setCarregandoAcervo] = useState(false);
	const [generoAtivo, setGeneroAtivo] = useState(null);
	const [buscaFaixa, setBuscaFaixa] = useState("");

	const [notificacao, setNotificacao] = useState(null);

	useEffect(() => {
		if (isOpen) {
			setNome("");
			setRecado("");
			setFaixaSelecionada(null);
		}
	}, [isOpen]);

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
		setCatalogoAberto(true);
	};

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
		setFaixaSelecionada({
			arquivo: faixa.arquivo || faixa.url || "",
			titulo: faixa.nome || faixa.titulo || "Música",
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
					mensagem: `Show de bola! A faixa "${faixaSelecionada.titulo}" entrou na fila da programação.`,
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
							Voltar
						</Button>
						<Button
							variant="filled"
							intent="primary"
							onClick={handleEnviarPedido}
							disabled={enviando}
						>
							{enviando ? "Enviando..." : "Enviar Pedido"}
						</Button>
					</div>
				}
			>
				<div className={styles.pedidoFormStack}>
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
			</Modal>

			{/* Sub-Modal: Navegação do Acervo por Gênero e Busca */}
			<Modal
				isOpen={catalogoAberto}
				onClose={() => setCatalogoAberto(false)}
				title={
					generoAtivo
						? `📁 ${generoAtivo} (${(mapaGeneros[generoAtivo] || []).length})`
						: "📁 Escolha o Gênero"
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
							← Voltar aos Gêneros
						</Button>
					) : undefined
				}
			>
				{!generoAtivo ? (
					<div className={styles.gridGenerosOuvinte}>
						{carregandoAcervo ? (
							<div className={styles.emptyCatalogMsg}>
								Carregando gêneros...
							</div>
						) : Object.keys(mapaGeneros).length === 0 ? (
							<div className={styles.emptyCatalogMsg}>
								Nenhum gênero disponível.
							</div>
						) : (
							Object.entries(mapaGeneros).map(([genero, faixas]) => (
								<button
									key={genero}
									type="button"
									className={styles.cardGenBtn}
									onClick={() => {
										setGeneroAtivo(genero);
										setBuscaFaixa("");
									}}
								>
									<span>📁 {genero}</span>
									<Badge intent="primary" variant="subtle">
										{faixas.length}
									</Badge>
								</button>
							))
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
