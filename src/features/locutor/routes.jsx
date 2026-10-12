import { lazy } from "react";
import { MdMic } from "react-icons/md";

const LocutorPage = lazy(() => import("./pages/LocutorPage"));

/** @type {import("@/app/router/routes").AppRoute[]} */
export const locutorRoutes = [
	{
		key: "locutor",
		path: "/locutor",
		label: "Locutor",
		icon: <MdMic />,
		order: 1,
		Component: LocutorPage,
	},
];
