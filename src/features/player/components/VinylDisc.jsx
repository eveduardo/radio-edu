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
				viewBox="0 0 64 56"
				width="64"
				height="56"
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
				{/* Eixo / Pivô posicionado fora do disco de vinil */}
				<circle
					cx="56"
					cy="7"
					r="3.8"
					fill="#334155"
					stroke="#64748b"
					strokeWidth="0.7"
				/>
				<circle
					cx="56"
					cy="7"
					r="1.8"
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
						x="54.5"
						y="2"
						width="3"
						height="4.5"
						rx="1"
						fill="#1e293b"
						stroke="#64748b"
						strokeWidth="0.5"
					/>
					<path
						d="M 56 7 Q 54 22 37 39"
						fill="none"
						stroke="url(#hasteMetalReact)"
						strokeWidth="1.3"
						strokeLinecap="round"
					/>
					<path
						d="M 56 7 Q 54 22 37 39"
						fill="none"
						stroke="#ffffff"
						strokeWidth="0.4"
						strokeLinecap="round"
						opacity="0.8"
					/>
					<g transform="translate(37, 39) rotate(22)">
						<rect
							x="-2.2"
							y="0"
							width="4.4"
							height="6.8"
							rx="1.2"
							fill="#0f172a"
							stroke="#f59e0b"
							strokeWidth="0.6"
						/>
						<line
							x1="0"
							y1="2.5"
							x2="0"
							y2="6.2"
							stroke="#ef4444"
							strokeWidth="1"
							strokeLinecap="round"
						/>
						<circle cx="1" cy="1.5" r="0.4" fill="#fff" opacity="0.9" />
					</g>
				</g>
			</svg>
		</div>
	);
};

