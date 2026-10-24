import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "@/app";

import "@/styles/global.css";

ReactDOM.createRoot(document.getElementById("root")).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);

if ('serviceWorker' in navigator && typeof window !== 'undefined') {
	window.addEventListener('load', () => {
		navigator.serviceWorker.register('/sw.js').catch(() => {});
	});
}
