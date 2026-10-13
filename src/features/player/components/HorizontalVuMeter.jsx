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

			for (let b = 0; b < numBarras; b++) {
				let intensidade = 0;

				if (dadosPresentes && dataArray) {
					const idx = Math.min(Math.floor(b * 1.6), dataArray.length - 1);
					intensidade = dataArray[idx] / 255;
				} else if (estaTocando && player && !player.paused) {
					// Animação realista e orgânica de VU meter de rádio
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

