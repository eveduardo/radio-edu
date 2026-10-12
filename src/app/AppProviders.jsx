import { BrowserRouter } from "react-router-dom";
import { RecoilRoot } from "recoil";

/**
 * Todos os providers globais da aplicação ficam aqui.
 * Novos providers (auth, query client, etc.) devem ser adicionados neste arquivo.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children
 */
export const AppProviders = ({ children }) => {
	return (
		<BrowserRouter>
			<RecoilRoot>{children}</RecoilRoot>
		</BrowserRouter>
	);
};

