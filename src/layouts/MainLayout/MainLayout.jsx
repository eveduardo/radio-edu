import { Outlet } from "react-router-dom";
import { useTheme } from "@/hooks";
import styles from "./MainLayout.module.css";

export const MainLayout = () => {
	const { theme } = useTheme();

	return (
		<div className={styles.layout} data-ronin-theme={theme}>
			<main className={styles.main}>
				<Outlet />
			</main>
		</div>
	);
};
