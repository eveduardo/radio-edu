import { useState } from "react";
import clsx from "clsx";
import { Badge, Button } from "@jposawa/ronin-ui";
import {
	RadioPlayerProvider,
	useRadioPlayerContext,
} from "../context/RadioPlayerContext";
import { VinylDisc } from "../components/VinylDisc";
import { HorizontalVuMeter } from "../components/HorizontalVuMeter";
import { SongRequestModal } from "../components/SongRequestModal";
import styles from "./RadioPlayerPage.module.css";

const getVolumeIcon = (val) => {
	if (val === 0) return "🔇";
	if (val < 0.5) return "🔉";
	return "🔊";
};

const RadioPlayerContent = () => {
	const [modalPedidoAberto, setModalPedidoAberto] = useState(false);

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

	return (
		<div className={styles.radioScreen}>
			<div className={styles.logoTopo}>
				<img src="/img/logoFM.jpg" alt="Flash FM" />
			</div>

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
					<h2 className={styles.tituloMusica} title={tituloMusica}>
						{tituloMusica}
					</h2>
					{nomeOuvinte && (
						<p className={styles.ouvinteDestaque}>{nomeOuvinte}</p>
					)}
					<p className={styles.sub} title={proximaFaixa}>
						{proximaFaixa}
					</p>

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
				onClose={() => setModalPedidoAberto(false)}
			/>
		</div>
	);
};

const RadioPlayerPage = () => (
	<RadioPlayerProvider>
		<RadioPlayerContent />
	</RadioPlayerProvider>
);

export default RadioPlayerPage;
