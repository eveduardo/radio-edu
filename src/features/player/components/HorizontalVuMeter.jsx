import { useEffect, useRef } from "react";
import styles from "../pages/RadioPlayerPage.module.css";

/**
 * VU Meter horizontal de 10 barras × 7 LEDs alimentado pelo Web Audio AnalyserNode.
 *
 * @param {Object} props
 * @param {boolean} props.estaTocando
 * @param {React.RefObject<HTMLAudioElement>} props.playerRef
 * @param {React.RefObject<AudioContext>} props.audioCtxRef
 * @param {React.RefObject<AnalyserNode>} props.analyserRef
 * @param {React.RefObject<Uint8Array>} props.dataArrayRef
 */
export const HorizontalVuMeter = ({
	estaTocando,
	playerRef,
	audioCtxRef,
	analyserRef,
	dataArrayRef,
}) => {
	const canvasRef = useRef(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");

		let animId = null;
		let animTick = 0;

		const desenhar = () => {
			animId = requestAnimationFrame(desenhar);
			animTick += 0.15;

			ctx.fillStyle = "#05070a";
			ctx.fillRect(0, 0, canvas.width, canvas.height);

			const numBarras = 10;
			const ledsPorBarra = 7;
			const larguraBarra = 9;
			const espacamento = 3;
			const alturaLed = 3;
			const espacamentoLed = 2;
			const margemEsquerda =
				(canvas.width -
					(numBarras * (larguraBarra + espacamento) - espacamento)) /
				2;

			const analyser = analyserRef.current;
			const audioCtx = audioCtxRef.current;
			const dataArray = dataArrayRef.current;
			const player = playerRef.current;

			let dadosPresentes = false;
			if (
				analyser &&
				audioCtx &&
				audioCtx.state === "running" &&
				estaTocando &&
				player &&
				!player.paused &&
				dataArray
			) {
				analyser.getByteFrequencyData(dataArray);
				let soma = 0;
				for (let i = 0; i < dataArray.length; i++) {
					soma += dataArray[i];
					if (soma > 15) break;
				}
				if (soma > 15) {
					dadosPresentes = true;
				}
			}

			// Faixas espectrais musicais calibradas para as 10 barras (do bumbo aos pratos)
			const totalBins = dataArray ? dataArray.length : 32;
			const faixas = [
				[0, 1], // Sub-bass (Bumbo / Kick)
				[2, 3], // Bass (Linha de contrabaixo)
				[4, 6], // Low-mid (Corpo da bateria e instrumentos)
				[7, 10], // Mid (Vocais principais)
				[11, 16], // High-mid (Guitarras e ataque)
				[17, 24], // Presença (Caixa e percussão)
				[25, 36], // Agudos baixos (Metais e sintetizadores)
				[37, 52], // Agudos médios (Chimbal)
				[53, 75], // Agudos altos (Pratos de condução)
				[76, 110], // Brilho / Ar (Harmônicos superiores)
			];

			for (let b = 0; b < numBarras; b++) {
				let intensidade = 0;

				if (dadosPresentes && dataArray) {
					const [ini, fim] = faixas[b];
					let pico = 0;
					const maxIdx = Math.min(fim, totalBins - 1);
					for (let i = Math.min(ini, maxIdx); i <= maxIdx; i++) {
						if (dataArray[i] > pico) {
							pico = dataArray[i];
						}
					}
					// Curva psicoacústica de compensação para agudos responderem no mesmo nível dos graves
					const compensacaoAgudos = 1 + b * 0.08;
					intensidade = Math.min(1, (pico / 235) * compensacaoAgudos);
				} else if (estaTocando && player && !player.paused) {
					// Animação rítmica caso Web Audio ainda esteja inicializando
					const onda = Math.sin(animTick * 1.4 + b * 0.75) * 0.35 + 0.45;
					const ruido = (Math.sin(animTick * 3.7 + b * 2.1) + 1) * 0.15;
					intensidade = Math.min(1, Math.max(0.1, onda + ruido));
				}

				const ledsAcesos = Math.round(intensidade * ledsPorBarra);

				for (let l = 0; l < ledsPorBarra; l++) {
					const x = margemEsquerda + b * (larguraBarra + espacamento);
					const y = canvas.height - 3 - l * (alturaLed + espacamentoLed);
					const estaAceso = l < ledsAcesos;

					let corAcesa;
					if (l >= 5) corAcesa = "#ff0033";
					else if (l >= 3) corAcesa = "#ffcc00";
					else corAcesa = "#00ff44";

					ctx.fillStyle = estaAceso ? corAcesa : "#151b24";
					ctx.fillRect(x, y, larguraBarra, alturaLed);
				}
			}
		};

		desenhar();

		return () => {
			if (animId) cancelAnimationFrame(animId);
		};
	}, [analyserRef, audioCtxRef, dataArrayRef, estaTocando, playerRef]);

	return (
		<div className={styles.vuMeterBox}>
			<canvas
				ref={canvasRef}
				width={130}
				height={40}
				className={styles.vuCanvas}
			/>
		</div>
	);
};

