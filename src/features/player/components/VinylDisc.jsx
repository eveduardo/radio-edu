import clsx from "clsx";
import styles from "../pages/RadioPlayerPage.module.css";

/**
 * Disco de vinil animado da rádio.
 *
 * @param {Object} props
 * @param {boolean} props.girando
 */
export const VinylDisc = ({ girando }) => {
	return (
		<div className={clsx(styles.disco, girando && styles.girando)}>
			<div className={styles.centroDisco}>
				<div className={styles.furoDisco} />
			</div>
		</div>
	);
};

