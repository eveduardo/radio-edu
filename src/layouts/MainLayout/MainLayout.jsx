import { Outlet } from "react-router-dom";
import { MainMenu, ThemeToggle } from "@/components";
import { MENU_ROUTES } from "@/app/router/routes";
import { useTheme } from "@/hooks";
import { ENV } from "@/config";
import styles from "./MainLayout.module.css";

export const MainLayout = () => {
	const { theme } = useTheme();

	return (
		<div className={styles.layout} data-ronin-theme={theme}>
			<MainMenu items={MENU_ROUTES} />
			<div className={styles.content}>
				<header className={styles.header}>
					<strong className={styles.brand}>{ENV.appName}</strong>
					<ThemeToggle />
				</header>
				<main className={styles.main}>
					<Outlet />
				</main>
			</div>
		</div>
	);
};

