import { useEffect, useState } from "react";
import { Modal } from "@jposawa/ronin-ui";
import styles from "../pages/RadioPlayerPage.module.css";

/**
 * Modal de Compartilhamento da Rádio com QR Code dinâmico.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {() => void} props.onClose
 */
export const ShareModal = ({ isOpen, onClose }) => {
	const [urlCompartilhar, setUrlCompartilhar] = useState("");
	const [copiado, setCopiado] = useState(false);
	const [temShareNativo, setTemShareNativo] = useState(false);

	useEffect(() => {
		if (typeof window !== "undefined") {
			const url = window.location.href.split("?")[0].split("#")[0];
			setUrlCompartilhar(url || "https://datasystem-ce.com.br/radio/");
			setTemShareNativo(Boolean(navigator.share));
		}
	}, [isOpen]);

	const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&color=0d1b2a&bgcolor=ffffff&data=${encodeURIComponent(urlCompartilhar)}`;

	const handleCopiar = async () => {
		try {
			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(urlCompartilhar);
			} else {
				const tempInput = document.createElement("input");
				tempInput.value = urlCompartilhar;
				document.body.appendChild(tempInput);
				tempInput.select();
				document.execCommand("copy");
				document.body.removeChild(tempInput);
			}
			setCopiado(true);
			setTimeout(() => setCopiado(false), 2200);
		} catch {
			// ignore
		}
	};

	const handleWhatsApp = () => {
		const texto = `Estou ouvindo a Flash FM ao vivo! 📻🎶\nOuça você também pelo link:\n${urlCompartilhar}`;
		const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`;
		window.open(url, "_blank");
	};

	const handleShareNativo = async () => {
		if (navigator.share) {
			try {
				await navigator.share({
					title: "Flash FM — No ar em qualquer lugar",
					text: "Estou ouvindo a Flash FM ao vivo! 📻🎶 Ouça você também:",
					url: urlCompartilhar,
				});
			} catch {
				// Usuário cancelou
			}
		}
	};

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title="📱 Compartilhar Rádio"
			size="sm"
			closeLabel="Fechar modal de compartilhamento"
		>
			<div className={styles.shareModalBody}>
				<p className={styles.shareModalSub}>
					Aponte a câmera do celular para ouvir a <strong>Flash FM</strong> ao vivo em qualquer lugar!
				</p>

				<div className={styles.qrcodeWrapper}>
					<img
						src={qrCodeUrl}
						alt="QR Code Flash FM"
						className={styles.qrcodeImg}
					/>
					<div className={styles.qrcodeBadgeRadio}>📻 Flash FM • Ao Vivo</div>
				</div>

				<div className={styles.linkCopiarBox}>
					<input
						type="text"
						className={styles.inputLinkCompartilhar}
						readOnly
						value={urlCompartilhar}
					/>
					<button
						type="button"
						className={`${styles.btnCopiarLink} ${copiado ? styles.btnCopiarLinkCopiado : ""}`}
						onClick={handleCopiar}
					>
						<span>{copiado ? "✅" : "📋"}</span>
						<span>{copiado ? "Copiado!" : "Copiar"}</span>
					</button>
				</div>

				<div className={styles.botoesCompartilharAcoes}>
					<button
						type="button"
						className={styles.btnAcaoWhatsapp}
						onClick={handleWhatsApp}
					>
						<span>💬</span>
						<span>Enviar no WhatsApp</span>
					</button>

					{temShareNativo && (
						<button
							type="button"
							className={styles.btnAcaoNativo}
							onClick={handleShareNativo}
						>
							<span>📤</span>
							<span>Mais Opções de Compartilhar</span>
						</button>
					)}
				</div>
			</div>
		</Modal>
	);
};
