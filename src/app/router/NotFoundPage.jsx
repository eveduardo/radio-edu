import { useNavigate } from "react-router-dom";
import { Button, Card } from "@jposawa/ronin-ui";

export const NotFoundPage = () => {
	const navigate = useNavigate();

	return (
		<Card
			header={<h1>Página não encontrada</h1>}
			footer={
				<Button intent="primary" onClick={() => navigate("/")}>
					Voltar ao início
				</Button>
			}
		>
			<p>O endereço acessado não existe.</p>
		</Card>
	);
};

