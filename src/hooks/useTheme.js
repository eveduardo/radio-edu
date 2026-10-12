import { useCallback } from "react";
import { useRecoilState } from "recoil";
import { themeAtom } from "@/globalState";

export const useTheme = () => {
	const [theme, setTheme] = useRecoilState(themeAtom);

	const toggleTheme = useCallback(() => {
		setTheme((prev) => (prev === "dark" ? "light" : "dark"));
	}, [setTheme]);

	return { theme, setTheme, toggleTheme };
};

