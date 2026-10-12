/**
 * Único ponto de leitura de variáveis de ambiente.
 * Defina os valores em `.env.local` (veja `.env.example`).
 */
export const ENV = Object.freeze({
	appName: import.meta.env.VITE_APP_NAME || "Flash FM — Radio Edu",
	apiUrl: import.meta.env.VITE_API_URL || "/radio-api",
	locutorPassword: import.meta.env.VITE_LOCUTOR_PASSWORD || "admin123",
	firebase: Object.freeze({
		apiKey:
			import.meta.env.VITE_FIREBASE_API_KEY ||
			"AIzaSyAwGGSG_a1pB9r1_TutnVfaeJ3uzqThzuE",
		authDomain:
			import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ||
			"radio-master-a7ce8.firebaseapp.com",
		databaseURL:
			import.meta.env.VITE_FIREBASE_DATABASE_URL ||
			"https://radio-master-a7ce8-default-rtdb.firebaseio.com",
		projectId:
			import.meta.env.VITE_FIREBASE_PROJECT_ID || "radio-master-a7ce8",
		storageBucket:
			import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ||
			"radio-master-a7ce8.firebasestorage.app",
		messagingSenderId:
			import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "789860569446",
		appId:
			import.meta.env.VITE_FIREBASE_APP_ID ||
			"1:789860569446:web:4db21d5be9e3d84c93f8a7",
	}),
	isDev: import.meta.env.DEV,
});
