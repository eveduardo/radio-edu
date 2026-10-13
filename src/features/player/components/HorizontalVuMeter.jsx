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
	const niveisBarrasRef = useRef(new Float32Array(10));

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		const niveisBarras = niveisBarrasRef.current;

		let animId = null;

		const desenhar = () => {
			animId = requestAnimationFrame(desenhar);

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

			let temSinalReal = false;
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
					if (soma > 20) {
						temSinalReal = true;
						break;
					}
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

			const tempoAtual = player ? player.currentTime || 0 : 0;

			for (let b = 0; b < numBarras; b++) {
				let intensidadeAlvo = 0;

				if (temSinalReal && dataArray) {
					const [ini, fim] = faixas[b];
					let pico = 0;
					const maxIdx = Math.min(fim, totalBins - 1);
					for (let i = Math.min(ini, maxIdx); i <= maxIdx; i++) {
						if (dataArray[i] > pico) {
							pico = dataArray[i];
						}
					}
					// Curva psicoacústica de compensação para agudos responderem no mesmo nível dos graves
					const compensacaoAgudos = 1 + b * 0.10;
					intensidadeAlvo = Math.min(1, (pico / 225) * compensacaoAgudos);
				} else if (estaTocando && player && !player.paused) {
					// Animação rítmica sintonizada com a cadência musical enquanto Web Audio conecta
					const batidaBumbo =
						Math.pow(Math.max(0, Math.sin(tempoAtual * Math.PI * 2)), 3) * 0.75;
					const batidaCaixa =
						Math.pow(
							Math.max(0, Math.sin((tempoAtual + 0.5) * Math.PI * 2)),
							4,
						) * 0.65;
					if (b <= 3) {
						intensidadeAlvo = Math.min(
							1,
							batidaBumbo + (Math.sin(tempoAtual * 3.2 + b) + 1) * 0.15,
						);
					} else if (b <= 6) {
						intensidadeAlvo = Math.min(
							1,
							batidaCaixa + (Math.sin(tempoAtual * 4.8 + b) + 1) * 0.12,
						);
					} else {
						intensidadeAlvo = Math.min(
							1,
							(Math.sin(tempoAtual * 7.5 + b * 2) + 1) * 0.28,
						);
					}
				}

				// Balística de VU Meter: subida rápida no ataque e decaimento exponencial suave
				if (intensidadeAlvo > niveisBarras[b]) {
					niveisBarras[b] = intensidadeAlvo;
				} else {
					niveisBarras[b] = Math.max(0, niveisBarras[b] * 0.83);
				}

				const ledsAcesos = Math.round(niveisBarras[b] * ledsPorBarra);

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

