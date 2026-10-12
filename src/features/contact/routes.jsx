import { lazy } from "react";
import { MdOutlineMail } from "react-icons/md";

const ContactPage = lazy(() => import("./pages/ContactPage"));

/** @type {import("@/app/router/routes").AppRoute[]} */
export const contactRoutes = [
	{
		key: "contact",
		path: "/contato",
		label: "Contato",
		icon: <MdOutlineMail />,
		order: 1,
		Component: ContactPage,
	},
];

