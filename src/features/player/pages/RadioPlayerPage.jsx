import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Badge, Button, Modal } from "@jposawa/ronin-ui";
import {
	RadioPlayerProvider,
	useRadioPlayerContext,
} from "../context/RadioPlayerContext";
import { VinylDisc } from "../components/VinylDisc";
import { HorizontalVuMeter } from "../components/HorizontalVuMeter";
import { SongRequestModal } from "../components/SongRequestModal";
import { ShareModal } from "../components/ShareModal";
import styles from "./RadioPlayerPage.module.css";

const CHAVE_FAVORITAS = "flashfm_favoritas_v1";

const getVolumeIcon = (val) => {
	if (val === 0) return "🔇";
	if (val < 0.5) return "🔉";
	return "🔊";
};

const RadioPlayerContent = () => {
	const [modalPedidoAberto, setModalPedidoAberto] = useState(false);
	const [modalCompartilharAberto, setModalCompartilharAberto] = useState(false);
	const [modalTimerAberto, setModalTimerAberto] = useState(false);
	const [modalFavoritasAberto, setModalFavoritasAberto] = useState(false);
	const [faixaInicialPedido, setFaixaInicialPedido] = useState(null);

	// Favoritas salvas no LocalStorage
	const [favoritas, setFavoritas] = useState(() => {
		try {
			const raw = localStorage.getItem(CHAVE_FAVORITAS);
			return raw ? JSON.parse(raw) : [];
		} catch {
			return [];
		}
	});

	// Sleep Timer
	const [segundosTimerSono, setSegundosTimerSono] = useState(0);

	const {
		estaTocando,
		tituloMusica,
		nomeOuvinte,
		proximaFaixa,
		statusTexto,
		volumeMaster,
		recolhido,
		programaAtual,
		playerRef,
		playerDeckBRef,
		audioCtxRef,
		analyserRef,
		dataArrayRef,
		ajustarVolume,
		mutarOuRestaurar,
		alternarReproducao,
		alternarExpansaoCard,
	} = useRadioPlayerContext();

	// Salva no localStorage quando favoritas mudam
	const salvarFavoritas = (novas) => {
		setFavoritas(novas);
		try {
			localStorage.setItem(CHAVE_FAVORITAS, JSON.stringify(novas));
		} catch (e) {
			console.warn("Erro ao salvar favoritas:", e);
		}
	};

	const ehFavoritoAtual = useMemo(() => {
		if (
			!tituloMusica ||
			tituloMusica === "Aperte o play pra ligar..." ||
			tituloMusica === "Transmissão Ao Vivo"
		) {
			return false;
		}
		return favoritas.some(
			(f) => f.titulo.toLowerCase() === tituloMusica.toLowerCase(),
		);
	}, [favoritas, tituloMusica]);

	const alternarFavoritoAtual = () => {
		if (
			!tituloMusica ||
			tituloMusica === "Aperte o play pra ligar..." ||
			tituloMusica === "Transmissão Ao Vivo"
		) {
			return;
		}
		if (ehFavoritoAtual) {
			salvarFavoritas(
				favoritas.filter(
					(f) => f.titulo.toLowerCase() !== tituloMusica.toLowerCase(),
				),
			);
		} else {
			salvarFavoritas([
				{
					id: "fav_" + Date.now(),
					titulo: tituloMusica,
					adicionadoEm: Date.now(),
				},
				...favoritas,
			]);
		}
	};

	const removerFavorita = (idOuTitulo) => {
		salvarFavoritas(
			favoritas.filter((f) => f.id !== idOuTitulo && f.titulo !== idOuTitulo),
		);
	};

	const handlePedirMusicaFavorita = (fav) => {
		setFaixaInicialPedido({
			titulo: fav.titulo,
			arquivo: fav.arquivo || "",
		});
		setModalFavoritasAberto(false);
		setModalPedidoAberto(true);
	};

	// Compartilhar música atual no WhatsApp
	const compartilharWhatsAppAtual = () => {
		const urlRadio =
			typeof window !== "undefined"
				? window.location.href.split("?")[0].split("#")[0]
				: "https://datasystem-ce.com.br/radio/";
		let texto = "";
		if (
			tituloMusica &&
			tituloMusica !== "Aperte o play pra ligar..." &&
			tituloMusica !== "Transmissão Ao Vivo"
		) {
			texto = `Estou ouvindo "${tituloMusica}" na Rádio Flash FM! 📻🎵\nVem curtir comigo ao vivo: ${urlRadio}`;
		} else {
			texto = `Estou curtindo a melhor seleção de flashbacks na Rádio Flash FM! 📻✨\nOuça você também: ${urlRadio}`;
		}
		const link = `https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`;
		window.open(link, "_blank");
	};

	// Contagem regressiva do Sleep Timer
	useEffect(() => {
		if (segundosTimerSono <= 0) return;

		const timer = setInterval(() => {
			setSegundosTimerSono((prev) => {
				if (prev <= 1) {
					clearInterval(timer);
					if (estaTocando) {
						alternarReproducao();
					}
					return 0;
				}
				return prev - 1;
			});
		}, 1000);

		return () => clearInterval(timer);
	}, [segundosTimerSono, estaTocando, alternarReproducao]);

	const definirTimerSono = (minutos) => {
		setSegundosTimerSono(minutos * 60);
		setModalTimerAberto(false);
	};

	const desativarTimerSono = () => {
		setSegundosTimerSono(0);
		setModalTimerAberto(false);
	};

	return (
		<div className={styles.radioScreen}>
			<div className={styles.logoTopo}>
				<img src="/img/logoFM.jpg" alt="Flash FM" />
			</div>

			<button
				type="button"
				className={styles.btnTopoCompartilhar}
				onClick={() => setModalCompartilharAberto(true)}
				title="Compartilhar rádio com QR Code"
			>
				<span className={styles.iconeQrTopo}>📱</span>
				<span>QR Code</span>
			</button>

			<div className={clsx(styles.cardRadio, recolhido && styles.recolhido)}>
				<button
					type="button"
					className={styles.sheetHandleBtn}
					onClick={alternarExpansaoCard}
					title="Recolher / Expandir painel"
				>
					<div className={styles.sheetHandleBar} />
					<span className={styles.sheetHandleIcon}>▼</span>
				</button>

				<div className={styles.playerVisualRow}>
					<VinylDisc girando={estaTocando} />
					<HorizontalVuMeter
						estaTocando={estaTocando}
						playerRef={playerRef}
						playerDeckBRef={playerDeckBRef}
						audioCtxRef={audioCtxRef}
						analyserRef={analyserRef}
						dataArrayRef={dataArrayRef}
					/>
					<div className={styles.badgeBox}>
						<Badge
							intent="danger"
							variant="filled"
							className={styles.badgeLive}
						>
							● AO VIVO
						</Badge>
					</div>
				</div>

				<div className={styles.cardCorpoInferior}>
					{programaAtual && (
						<div
							className={styles.badgePrograma}
							title={programaAtual.slogan || programaAtual.nome}
						>
							<span>{programaAtual.icone || "📻"}</span>
							<span>{programaAtual.nome}</span>
							<span className={styles.horarioPrograma}>
								({programaAtual.horario})
							</span>
						</div>
					)}
					<div className={styles.linhaTituloFavorito}>
						<h2 className={styles.tituloMusica} title={tituloMusica}>
							{tituloMusica}
						</h2>
						<button
							type="button"
							className={
								ehFavoritoAtual
									? `${styles.btnFavoritar} ${styles.btnFavoritarAtivo}`
									: styles.btnFavoritar
							}
							onClick={alternarFavoritoAtual}
							title={
								ehFavoritoAtual
									? "Remover dos favoritos"
									: "Favoritar esta música"
							}
						>
							{ehFavoritoAtual ? "❤️" : "🤍"}
						</button>
					</div>
					{nomeOuvinte && (
						<p className={styles.ouvinteDestaque}>{nomeOuvinte}</p>
					)}
					<p className={styles.sub} title={proximaFaixa}>
						{proximaFaixa}
					</p>

					{/* BARRA DE UTILIDADES DO OUVINTE (WhatsApp, Sleep Timer, Minhas Favoritas) */}
					<div className={styles.barraUtilidadesOuvinte}>
						<button
							type="button"
							className={`${styles.btnUtilOuvinte} ${styles.btnUtilZap}`}
							onClick={compartilharWhatsAppAtual}
							title="Compartilhar música no WhatsApp"
						>
							<svg
								width="13"
								height="13"
								viewBox="0 0 24 24"
								fill="currentColor"
								style={{ display: "inline-block", verticalAlign: "middle" }}
							>
								<path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
							</svg>
							<span>WhatsApp</span>
						</button>

						<button
							type="button"
							className={
								segundosTimerSono > 0
									? `${styles.btnUtilOuvinte} ${styles.btnUtilTimer} ${styles.btnUtilTimerAtivo}`
									: `${styles.btnUtilOuvinte} ${styles.btnUtilTimer}`
							}
							onClick={() => setModalTimerAberto(true)}
							title="Definir timer para dormir"
						>
							<span>⏱️</span>
							<span>
								{segundosTimerSono > 0
									? `${Math.floor(segundosTimerSono / 60)}:${segundosTimerSono % 60 < 10 ? "0" : ""}${segundosTimerSono % 60}`
									: "Dormir"}
							</span>
						</button>

						<button
							type="button"
							className={`${styles.btnUtilOuvinte} ${styles.btnUtilFavs}`}
							onClick={() => setModalFavoritasAberto(true)}
							title="Ver minhas músicas favoritas"
						>
							<span>❤️</span>
							<span>Favoritas ({favoritas.length})</span>
						</button>
					</div>

					<div className={styles.controlsRow}>
						<Button
							intent="primary"
							variant="filled"
							className={styles.btnPedirMusica}
							onClick={() => setModalPedidoAberto(true)}
						>
							🎵 Pedir Música
						</Button>

						<div className={styles.volumeContainer}>
							<button
								type="button"
								className={styles.volumeIcon}
								onClick={mutarOuRestaurar}
								title="Mutar / Restaurar volume"
							>
								{getVolumeIcon(volumeMaster)}
							</button>
							<input
								type="range"
								className={styles.volumeSlider}
								min="0"
								max="1"
								step="0.01"
								value={volumeMaster}
								onChange={(e) => ajustarVolume(e.target.value)}
								aria-label="Volume da rádio"
							/>
						</div>

						<button
							type="button"
							className={styles.btnPlayRound}
							onClick={alternarReproducao}
							title="Pausar / Ouvir"
						>
							{estaTocando ? "⏸" : "▶"}
						</button>
					</div>

					<div className={styles.status}>{statusTexto}</div>
				</div>
			</div>

			<SongRequestModal
				isOpen={modalPedidoAberto}
				onClose={() => {
					setModalPedidoAberto(false);
					setFaixaInicialPedido(null);
				}}
				initialSong={faixaInicialPedido}
			/>

			<ShareModal
				isOpen={modalCompartilharAberto}
				onClose={() => setModalCompartilharAberto(false)}
			/>

			{/* Modal de Timer para Dormir */}
			<Modal
				isOpen={modalTimerAberto}
				onClose={() => setModalTimerAberto(false)}
				title="⏱️ Timer para Dormir"
				size="sm"
				closeLabel="Fechar timer"
				footer={
					<Button
						variant="outline"
						intent="neutral"
						isFullWidth
						onClick={() => setModalTimerAberto(false)}
					>
						Fechar
					</Button>
				}
			>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: "10px",
						textAlign: "center",
					}}
				>
					<p
						style={{
							fontSize: "12px",
							color: "#94a3b8",
							margin: "0 0 4px",
						}}
					>
						A rádio desligará o áudio automaticamente após o tempo escolhido.
					</p>
					<button
						type="button"
						className={styles.btnOpcaoTimer}
						onClick={() => definirTimerSono(15)}
					>
						🌙 15 Minutos
					</button>
					<button
						type="button"
						className={styles.btnOpcaoTimer}
						onClick={() => definirTimerSono(30)}
					>
						🌙 30 Minutos
					</button>
					<button
						type="button"
						className={styles.btnOpcaoTimer}
						onClick={() => definirTimerSono(45)}
					>
						🌙 45 Minutos
					</button>
					<button
						type="button"
						className={styles.btnOpcaoTimer}
						onClick={() => definirTimerSono(60)}
					>
						🌙 60 Minutos (1 Hora)
					</button>
					{segundosTimerSono > 0 && (
						<button
							type="button"
							className={styles.btnOpcaoTimer}
							style={{
								background: "rgba(239, 68, 68, 0.18)",
								borderColor: "#ef4444",
								color: "#ef4444",
							}}
							onClick={desativarTimerSono}
						>
							❌ Desativar Timer
						</button>
					)}
				</div>
			</Modal>

			{/* Modal de Minhas Músicas Favoritas */}
			<Modal
				isOpen={modalFavoritasAberto}
				onClose={() => setModalFavoritasAberto(false)}
				title="❤️ Minhas Músicas Favoritas"
				size="sm"
				closeLabel="Fechar favoritas"
				footer={
					<Button
						variant="outline"
						intent="neutral"
						isFullWidth
						onClick={() => setModalFavoritasAberto(false)}
					>
						Fechar
					</Button>
				}
			>
				<div
					style={{
						maxHeight: "280px",
						overflowY: "auto",
						display: "flex",
						flexDirection: "column",
						gap: "6px",
						paddingRight: "2px",
					}}
				>
					{favoritas.length === 0 ? (
						<div
							style={{
								fontSize: "12px",
								color: "#94a3b8",
								textAlign: "center",
								padding: "24px 10px",
								lineHeight: "1.5",
							}}
						>
							Você ainda não favoritou nenhuma música.
							<br />
							Toque no coraçãozinho <b>🤍</b> quando estiver tocando uma música
							que você ama para guardá-la aqui!
						</div>
					) : (
						favoritas.map((fav) => (
							<div
								key={fav.id || fav.titulo}
								className={styles.itemFavoritaLinha}
							>
								<span className={styles.itemFavTitulo} title={fav.titulo}>
									🎵 {fav.titulo}
								</span>
								<div
									style={{
										display: "flex",
										gap: "6px",
										alignItems: "center",
									}}
								>
									<button
										type="button"
										className={styles.btnFavPedir}
										onClick={() => handlePedirMusicaFavorita(fav)}
										title="Pedir esta música"
									>
										🎵 Pedir
									</button>
									<button
										type="button"
										className={styles.btnFavRemover}
										onClick={() => removerFavorita(fav.id || fav.titulo)}
										title="Remover dos favoritos"
									>
										🗑️
									</button>
								</div>
							</div>
						))
					)}
				</div>
			</Modal>
		</div>
	);
};

const RadioPlayerPage = () => (
	<RadioPlayerProvider>
		<RadioPlayerContent />
	</RadioPlayerProvider>
);

export default RadioPlayerPage;
