import { useEffect } from 'react'
import styles from './ModalPremio.module.css'

const AUTO_FECHAR_MS = 8000

export default function ModalPremio({ premio, onFechar }) {
    useEffect(() => {
        const t = setTimeout(onFechar, AUTO_FECHAR_MS)
        return () => clearTimeout(t)
    }, [onFechar])

    return (
        <div className={styles.overlay}>
            <div className={styles.modal}>
                <p className={styles.parabens}>Parabéns!</p>
                <p className={styles.textoVocê}>Você ganhou</p>
                <p className={styles.nomePremio}>{premio.nome}</p>
                {premio.subnome && (
                    <p className={styles.subPremio}>{premio.subnome}</p>
                )}
                <p className={styles.obs}>
                    Retire seu prêmio no stand
                </p>
                <button className={styles.btnFechar} onClick={onFechar}>
                    ENCERRAR
                </button>
            </div>
        </div>
    )
}
