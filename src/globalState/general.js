import { atom } from "recoil";
import { withPrefix } from "@/helpers";
import { localStorageEffect } from "./effects";

/**
 * @typedef {"light" | "dark"} Theme
 */

const getInitialTheme = () => {
	if (typeof window === "undefined" || !window.matchMedia) {
		return "light";
	}

	return window.matchMedia("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
};

/** @type {import("recoil").RecoilState<Theme>} */
export const themeAtom = atom({
	key: withPrefix("theme"),
	default: getInitialTheme(),
	effects: [localStorageEffect(withPrefix("theme"))],
});
