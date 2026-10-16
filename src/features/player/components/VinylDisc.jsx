import clsx from "clsx";
import styles from "../pages/RadioPlayerPage.module.css";

/**
 * Toca-discos vintage da rádio com vinil giratório e braço fonocaptor articulado.
 *
 * @param {Object} props
 * @param {boolean} props.girando
 */
export const VinylDisc = ({ girando }) => {
	return (
		<div className={styles.tocaDiscosBox}>
			<div className={clsx(styles.disco, girando && styles.girando)}>
				<div className={styles.centroDisco}>
					<div className={styles.furoDisco} />
				</div>
			</div>
			<div className={styles.descansoBraco} title="Descanso do braço" />
			<svg
				className={styles.bracoTocaDiscos}
				viewBox="0 0 58 58"
				width="58"
				height="58"
				aria-hidden="true"
			>
				<defs>
					<linearGradient
						id="hasteMetalReact"
						x1="0%"
						y1="0%"
						x2="100%"
						y2="100%"
					>
						<stop offset="0%" stopColor="#ffffff" />
						<stop offset="40%" stopColor="#94a3b8" />
						<stop offset="70%" stopColor="#cbd5e1" />
						<stop offset="100%" stopColor="#475569" />
					</linearGradient>
				</defs>
				<circle
					cx="48"
					cy="8"
					r="4.8"
					fill="#334155"
					stroke="#64748b"
					strokeWidth="0.8"
				/>
				<circle
					cx="48"
					cy="8"
					r="2.2"
					fill="#e2e8f0"
					stroke="#1e293b"
					strokeWidth="0.5"
				/>
				<g
					className={clsx(
						styles.bracoHasteGrupo,
						girando && styles.bracoTocando,
					)}
				>
					<rect
						x="46"
						y="2"
						width="4"
						height="5"
						rx="1.5"
						fill="#1e293b"
						stroke="#64748b"
						strokeWidth="0.6"
					/>
					<path
						d="M 48 8 Q 48 24 38 42"
						fill="none"
						stroke="url(#hasteMetalReact)"
						strokeWidth="2"
						strokeLinecap="round"
					/>
					<path
						d="M 48 8 Q 48 24 38 42"
						fill="none"
						stroke="#ffffff"
						strokeWidth="0.6"
						strokeLinecap="round"
						opacity="0.8"
					/>
					<g transform="translate(38, 42) rotate(24)">
						<rect
							x="-3"
							y="0"
							width="6"
							height="8.5"
							rx="1.5"
							fill="#0f172a"
							stroke="#f59e0b"
							strokeWidth="0.75"
						/>
						<line
							x1="0"
							y1="4"
							x2="0"
							y2="8"
							stroke="#ef4444"
							strokeWidth="1.3"
							strokeLinecap="round"
						/>
						<circle cx="1.5" cy="2" r="0.6" fill="#fff" opacity="0.9" />
					</g>
				</g>
			</svg>
		</div>
	);
};

