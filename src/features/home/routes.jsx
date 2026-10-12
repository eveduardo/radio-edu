import { lazy } from "react";
import { GoHomeFill } from "react-icons/go";

const HomePage = lazy(() => import("./pages/HomePage"));

/** @type {import("@/app/router/routes").AppRoute[]} */
export const homeRoutes = [
	{
		key: "home",
		path: "/",
		label: "Início",
		icon: <GoHomeFill />,
		order: 0,
		Component: HomePage,
	},
];

