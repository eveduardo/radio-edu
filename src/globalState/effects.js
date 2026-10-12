/**
 * Persiste o valor do atom no localStorage.
 *
 * @param {string} storageKey
 * @returns {import("recoil").AtomEffect<any>}
 */
export const localStorageEffect =
	(storageKey) =>
	({ setSelf, onSet }) => {
		const savedValue = localStorage.getItem(storageKey);

		if (savedValue !== null) {
			try {
				setSelf(JSON.parse(savedValue));
			} catch {
				localStorage.removeItem(storageKey);
			}
		}

		onSet((newValue, _, isReset) => {
			if (isReset) {
				localStorage.removeItem(storageKey);
				return;
			}

			localStorage.setItem(storageKey, JSON.stringify(newValue));
		});
	};

