import styles from "./PageLoader.module.css";

export const PageLoader = () => {
	return (
		<div className={styles.loader} role="status" aria-live="polite">
			Carregando...
		</div>
	);
};

