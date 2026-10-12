import { Switch } from "@jposawa/ronin-ui";
import { useTheme } from "@/hooks";

export const ThemeToggle = () => {
	const { theme, toggleTheme } = useTheme();

	return (
		<Switch label="Modo escuro" isChecked={theme === "dark"} onToggle={toggleTheme} />
	);
};

