import { homeRoutes } from "@/features/home";
import { contactRoutes } from "@/features/contact";

/**
 * @typedef {Object} AppRoute
 * @property {string} key - Identificador único da rota
 * @property {string} path - Caminho da rota
 * @property {React.ComponentType} Component - Página (preferencialmente lazy)
 * @property {string} [label] - Texto exibido no menu. Sem label, a rota não aparece no menu
 * @property {React.ReactNode} [icon] - Ícone opcional exibido no menu
 * @property {number} [order] - Ordem no menu
 */

/**
 * Registro central de rotas. Para adicionar uma feature nova,
 * crie `src/features/<nome>/routes.jsx` e inclua as rotas aqui.
 *
 * @type {AppRoute[]}
 */
export const ROUTES = [...homeRoutes, ...contactRoutes];

/** Rotas exibidas no menu principal, ordenadas por `order`. */
export const MENU_ROUTES = ROUTES.filter((route) => route.label).sort(
	(a, b) => (a.order ?? 0) - (b.order ?? 0),
);

