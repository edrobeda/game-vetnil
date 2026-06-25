import styles from './LGPD.module.css'

const TITLE = import.meta.env.VITE_GAME_TITLE || 'Game Roleta'

export default function LGPD() {
    return (
        <div className={styles.page}>
            <div className={styles.card}>
                <h1 className={styles.titulo}>Política de Privacidade</h1>
                <p className={styles.sub}>{TITLE}</p>

                <section className={styles.secao}>
                    <h2>Dados coletados</h2>
                    <p>Para participar desta atividade coletamos: <strong>nome completo, CPF, telefone</strong> e, opcionalmente, <strong>e-mail</strong>.</p>
                </section>

                <section className={styles.secao}>
                    <h2>Finalidade</h2>
                    <p>Os dados têm como única finalidade o controle de participação nesta atividade promocional e a entrega de prêmios.</p>
                </section>

                <section className={styles.secao}>
                    <h2>Uso e compartilhamento</h2>
                    <p>Seus dados <strong>não serão compartilhados com terceiros</strong> nem utilizados para fins comerciais, marketing ou qualquer outra finalidade além das descritas acima.</p>
                </section>

                <section className={styles.secao}>
                    <h2>Armazenamento</h2>
                    <p>Os dados ficam armazenados pelo período necessário para a execução e comprovação da atividade, sendo descartados após esse prazo.</p>
                </section>

                <section className={styles.secao}>
                    <h2>Seus direitos (LGPD)</h2>
                    <p>Conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018), você pode solicitar a qualquer momento o acesso, correção ou exclusão dos seus dados. Entre em contato com o organizador do evento.</p>
                </section>

                <button className={styles.btnVoltar} onClick={() => window.history.back()}>
                    ← Voltar
                </button>
            </div>
        </div>
    )
}
