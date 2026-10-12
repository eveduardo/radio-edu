import { getApps, initializeApp } from "firebase/app";
import { getDatabase, onValue, ref, update } from "firebase/database";
import { ENV } from "@/config";

const app =
	getApps().length > 0 ? getApps()[0] : initializeApp(ENV.firebase);

const database = getDatabase(app);
const mesaRef = ref(database, "mesa");

/**
 * Inscreve um listener em tempo real no nó `mesa` do Firebase Realtime Database.
 *
 * @param {(dados: Record<string, any>) => void} callback
 * @returns {() => void} Função para cancelar a inscrição
 */
export const subscribeToMesa = (callback) => {
	return onValue(
		mesaRef,
		(snapshot) => {
			const dados = snapshot.val();
			if (dados) {
				callback(dados);
			}
		},
		(err) => {
			if (ENV.isDev) {
				console.warn("[firebaseMesa] Erro ao escutar mesa:", err);
			}
		},
	);
};

/**
 * Atualiza parcialmente o estado da `mesa` no Firebase Realtime Database.
 *
 * @param {Record<string, any>} partialState
 * @returns {Promise<void>}
 */
export const updateMesa = (partialState) => {
	return update(mesaRef, partialState);
};
