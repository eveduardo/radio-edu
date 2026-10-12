import { Card, Section } from "@jposawa/ronin-ui";
import { ENV } from "@/config";

const HomePage = () => {
	return (
		<Section title={<h1>Bem-vindo à {ENV.appName}</h1>}>
			<Card variant="elevated">
				<p>Projeto inicial pronto. Crie novas funcionalidades em `src/features`.</p>
			</Card>
		</Section>
	);
};

export default HomePage;

