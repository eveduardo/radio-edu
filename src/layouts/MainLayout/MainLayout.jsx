import { Outlet } from "react-router-dom";
import { MainMenu } from "@/components";
import { MENU_ROUTES } from "@/app/router/routes";
import { RadioPlayerProvider } from "@/features/player";
import { useTheme } from "@/hooks";
import styles from "./MainLayout.module.css";

export const MainLayout = () => {
	const { theme } = useTheme();

	return (
		<RadioPlayerProvider>
			<div className={styles.layout} data-ronin-theme={theme}>
				<MainMenu items={MENU_ROUTES} />
				<main className={styles.main}>
					<Outlet />
				</main>
			</div>
		</RadioPlayerProvider>
	);
};
