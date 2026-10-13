/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext } from "react";
import { useRadioPlayer } from "../hooks/useRadioPlayer";

const RadioPlayerContext = createContext(null);

/**
 * Mantém o motor de áudio sincronizado ativo durante toda a sessão
 * (mesmo ao alternar entre a tela da Rádio e a Mesa do Locutor).
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children
 */
export const RadioPlayerProvider = ({ children }) => {
	const radio = useRadioPlayer();

	return (
		<RadioPlayerContext.Provider value={radio}>
			{children}
			<audio
				ref={radio.playerRef}
				autoPlay
				preload="auto"
				crossOrigin="anonymous"
				onEnded={radio.handleTrackEnded}
				onError={radio.handleTrackError}
			/>
			<audio ref={radio.playerHoraRef} preload="auto" crossOrigin="anonymous" />
			<audio ref={radio.playerVozRef} preload="auto" crossOrigin="anonymous" />
			<audio
				ref={radio.playerVinhetaRef}
				preload="auto"
				crossOrigin="anonymous"
			/>
		</RadioPlayerContext.Provider>
	);
};

export const useRadioPlayerContext = () => {
	const context = useContext(RadioPlayerContext);
	if (!context) {
		throw new Error(
			"useRadioPlayerContext deve ser usado dentro de um RadioPlayerProvider",
		);
	}
	return context;
};

