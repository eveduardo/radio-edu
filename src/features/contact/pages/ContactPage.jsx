import { useState } from "react";
import { Button, Card, Input, Section } from "@jposawa/ronin-ui";
import styles from "./ContactPage.module.css";

const INITIAL_FORM = { name: "", email: "", message: "" };

const ContactPage = () => {
	const [form, setForm] = useState(INITIAL_FORM);

	/** @param {keyof typeof INITIAL_FORM} field */
	const handleChange = (field) => (value) => {
		setForm((prev) => ({ ...prev, [field]: value }));
	};

	const handleSubmit = (event) => {
		event.preventDefault();
		// TODO: integrar com a API (ver src/services)
		console.log("[ContactPage] submit", form);
		setForm(INITIAL_FORM);
	};

	return (
		<Section title={<h1>Contato</h1>}>
			<Card>
				<form className={styles.form} onSubmit={handleSubmit}>
					<Input
						label="Nome"
						value={form.name}
						onValueChange={handleChange("name")}
						required
					/>
					<Input
						label="E-mail"
						type="email"
						value={form.email}
						onValueChange={handleChange("email")}
						required
					/>
					<Input
						label="Mensagem"
						value={form.message}
						onValueChange={handleChange("message")}
					/>
					<Button type="submit" intent="primary">
						Enviar
					</Button>
				</form>
			</Card>
		</Section>
	);
};

export default ContactPage;

