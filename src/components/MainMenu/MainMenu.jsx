import { NavLink } from "react-router-dom";
import clsx from "clsx";
import styles from "./MainMenu.module.css";

/**
 * @param {Object} props
 * @param {import("@/app/router/routes").AppRoute[]} props.items
 */
export const MainMenu = ({ items }) => {
	return (
		<nav className={styles.mainMenu}>
			{items.map((item) => (
				<NavLink
					key={item.key}
					to={item.path}
					end
					className={({ isActive }) =>
						clsx(styles.menuItem, isActive && styles.active)
					}
				>
					{item.icon && <span className={styles.icon}>{item.icon}</span>}
					<span>{item.label}</span>
				</NavLink>
			))}
		</nav>
	);
};

