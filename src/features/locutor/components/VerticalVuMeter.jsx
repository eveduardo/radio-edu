import { useEffect, useRef } from "react";
import styles from "../pages/LocutorPage.module.css";

const desenharVUMeterVertical = (ctx, canvas, intensidade) => {
	ctx.fillStyle = "#06090e";
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	const leds = 14;
	const alturaLed = 6;
	const espaco = 2;
	const ledsAcesos = Math.round(intensidade * leds);

	for (let i = 0; i < leds; i++) {
		const y = canvas.height - (i + 1) * (alturaLed + espaco);
		const estaAceso = i < ledsAcesos;

		let cor;
		if (i >= 11) cor = "#ef4444";
		else if (i >= 7) cor = "#facc15";
		else cor = "#22c55e";

		ctx.fillStyle = estaAceso ? cor : "#141c26";
		ctx.fillRect(2, y, canvas.width - 4, alturaLed);
	}
};

/**
 * VU Meter vertical de 14 LEDs usado nos canais de Microfone e Música da Mesa Master.
 *
 * @param {Object} props
 * @param {"mic" | "musica"} props.mode
 * @param {boolean} [props.aoVivo]
 * @param {number} props.faderValue
 * @param {React.RefObject<AnalyserNode>} [props.micAnalyserRef]
 * @param {React.RefObject<Uint8Array>} [props.micDataArrayRef]
 */
export const VerticalVuMeter = ({
	mode,
	aoVivo = false,
	faderValue,
	micAnalyserRef,
	micDataArrayRef,
}) => {
	const canvasRef = useRef(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");

		let animId = null;
		let animTick = 0;

		const animar = () => {
			animId = requestAnimationFrame(animar);
			animTick += 0.12;

			let nivel = 0;

			if (mode === "mic") {
				const analyser = micAnalyserRef?.current;
				const dataArray = micDataArrayRef?.current;
				if (aoVivo && analyser && dataArray) {
					analyser.getByteFrequencyData(dataArray);
					let soma = 0;
					for (let i = 0; i < dataArray.length; i++) {
						soma += dataArray[i];
					}
					const volReal = soma / dataArray.length / 128;
					nivel = Math.min(1, volReal * faderValue * 1.6);
				}
			} else if (faderValue > 0) {
				const onda = Math.sin(animTick * 1.2) * 0.35 + 0.55;
				const beat = Math.sin(animTick * 3.5) > 0.6 ? 0.25 : 0;
				nivel = Math.min(1, Math.max(0, (onda + beat) * faderValue));
			}

			desenharVUMeterVertical(ctx, canvas, nivel);
		};

		animar();

		return () => {
			if (animId) cancelAnimationFrame(animId);
		};
	}, [aoVivo, faderValue, micAnalyserRef, micDataArrayRef, mode]);

	return (
		<div className={styles.vuVerticalBox}>
			<canvas ref={canvasRef} width={12} height={120} />
		</div>
	);
};
