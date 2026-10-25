import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "@/app";

import "@/styles/global.css";

ReactDOM.createRoot(document.getElementById("root")).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);

if ("serviceWorker" in navigator && typeof window !== "undefined") {
	window.addEventListener("load", () => {
		navigator.serviceWorker
			.register("/sw.js")
			.then((reg) => {
				// Força verificação de atualização no servidor a cada carregamento
				reg.update().catch(() => {});
			})
			.catch(() => {});

		let recarregando = false;
		navigator.serviceWorker.addEventListener("controllerchange", () => {
			if (!recarregando) {
				recarregando = true;
				window.location.reload();
			}
		});
	});
}
