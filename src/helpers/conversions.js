import { APP_KEY } from "@/constants";

/**
 * @param {string} baseString
 */
const baseCapitalize = (baseString) => {
	if (!baseString) {
		console.warn("[baseCapitalize] Received empty string");
		return "";
	}

	const capitalizedString = `${baseString[0].toUpperCase()}${baseString.slice(1)}`;

	return capitalizedString;
};

/**
 * @param {string} baseString
 * @param {Object} options
 * @param {boolean} [options.allWords=false] - Whether to capitalize all words in the string
 * @param {string} [options.separator=" "] - The separator used to split words when allWords is true
 * @param {boolean} [options.showDebug=false] - Whether to log debug information to the console
 * @returns {string} The capitalized string
 */
export const capitalize = (baseString, options = {}) => {
	if (!baseString) {
		console.warn("[stringCapitalize] Received empty string");
		return "";
	}

	const { allWords = false, separator = " ", showDebug = false } = options;

	if (!allWords) {
		return baseCapitalize(baseString);
	}

	const wordsList = baseString.split(separator);

	const capitalizedWordsList = wordsList.map((word) => baseCapitalize(word));

	const capitalizedString = capitalizedWordsList.join(separator);

	if (showDebug) {
		console.log("[stringCapitalize] results", {
			wordsList,
			capitalizedWordsList,
			capitalizedString,
			separator,
			allWords,
			baseString,
		});
	}

	return capitalizedString;
};

/**
 * Adds a prefix to a given string with an optional separator.
 *
 * @param {string} baseString - The string to which the prefix will be added.
 * @param {Object} options - Optional settings for the prefixing.
 * @param {string} [options.separator="_"] - The separator to use between the prefix and the base string.
 * @returns {string} The resulting string with the prefix added.
 */
export const withPrefix = (baseString, options = {}) => {
	const { separator = "_" } = options;
	const prefixedString = `${APP_KEY}${separator}${baseString}`;

	return prefixedString;
};
