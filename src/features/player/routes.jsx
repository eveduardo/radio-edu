import { lazy } from "react";
import { MdRadio } from "react-icons/md";

const RadioPlayerPage = lazy(() => import("./pages/RadioPlayerPage"));

/** @type {import("@/app/router/routes").AppRoute[]} */
export const playerRoutes = [
	{
		key: "player",
		path: "/",
		label: "Rádio Ao Vivo",
		icon: <MdRadio />,
		order: 0,
		Component: RadioPlayerPage,
	},
];
