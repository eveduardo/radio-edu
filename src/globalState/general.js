import { atom } from "recoil";
import { withPrefix } from "@/helpers";
import { localStorageEffect } from "./effects";

/**
 * @typedef {"light" | "dark"} Theme
 */

/** @type {import("recoil").RecoilState<Theme>} */
export const themeAtom = atom({
	key: withPrefix("theme"),
	default: "dark",
	effects: [localStorageEffect(withPrefix("theme"))],
});

/** @type {import("recoil").RecoilState<number>} */
export const volumeAtom = atom({
	key: withPrefix("volume"),
	default: 1,
	effects: [localStorageEffect(withPrefix("volume"))],
});
