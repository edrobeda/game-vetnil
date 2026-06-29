import { useState, useEffect, useCallback, useMemo } from 'react'
import api from '../../services/api'
import Roleta from '../../components/Roleta'
import ModalPremio from '../../components/ModalPremio'
import useSom from '../../hooks/useSom'
import styles from './Jogo.module.css'

const TITLE            = import.meta.env.VITE_GAME_TITLE || 'Game Roleta'
const TITLE_DISPLAY    = TITLE.toUpperCase()
const QUIZ_MIN_ACERTOS = parseInt(import.meta.env.VITE_QUIZ_MIN_ACERTOS || '3')

function formatarCpf(v) {
    return v.replace(/\D/g, '').slice(0, 11)
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

// ─── Etapa 1: Start ───────────────────────────────────────────
function TelaStart({ onAvancar, playBotao }) {
    return (
        <div className={`${styles.tela} ${styles.telaStart}`}>
            <div className={styles.overlay}>
                <div className={styles.logoArea}>
                    <h1 className={styles.logoTexto}>{TITLE_DISPLAY}</h1>
                </div>
                <p className={styles.textoInicio}>Responda e<br />concorra a<br />prêmios!</p>
                <div className={styles.botaoArea}>
                    <button className={styles.btnGame} onClick={() => { playBotao(); onAvancar() }}>
                        VAMOS LÁ
                    </button>
                </div>
            </div>
        </div>
    )
}

// ─── Etapa 2: Identificação por CPF ──────────────────────────
function TelaIdentificacao({ onValidado, playBotao }) {
    const [cpf, setCpf]               = useState('')
    const [erro, setErro]             = useState('')
    const [carregando, setCarregando] = useState(false)

    async function handleContinuar() {
        setErro('')
        const limpo = cpf.replace(/\D/g, '')
        if (limpo.length !== 11) { setErro('CPF inválido.'); return }
        playBotao()

        if (limpo === '55555555555') {
            onValidado({ id: null, nome: 'Dev Teste' })
            return
        }

        setCarregando(true)
        try {
            const { data } = await api.post('/api/cliente/validar', { cpf })
            onValidado(data)
        } catch (err) {
            const status = err.response?.status
            if (status === 403) {
                setErro('Este CPF já participou.')
            } else if (status === 404) {
                setErro('CPF não cadastrado. Faça o cadastro primeiro.')
            } else {
                setErro(err.response?.data?.erro || 'Erro ao validar.')
            }
        } finally {
            setCarregando(false)
        }
    }

    return (
        <div className={`${styles.tela} ${styles.telaApresentacao}`}>
            <div className={styles.overlay}>
                <p className={styles.textoApresentacao}>Insira seu CPF para começar</p>
                <div className={styles.formArea}>
                    <input
                        className={styles.inputGame}
                        type='text'
                        placeholder='000.000.000-00'
                        value={cpf}
                        onChange={e => setCpf(formatarCpf(e.target.value))}
                        autoComplete='off'
                        inputMode='numeric'
                        autoFocus
                    />
                </div>
                {erro && <p className={styles.erroTexto}>{erro}</p>}
                <div className={styles.botaoArea}>
                    <button className={styles.btnGame} onClick={handleContinuar} disabled={carregando}>
                        {carregando ? 'Verificando...' : 'CONTINUAR'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ─── Etapa 3: Quiz (uma pergunta por vez) ─────────────────────
function TelaQuiz({ nomeParticipante, clienteId, onConcluido, playBotao, modoTeste }) {
    const [perguntas, setPerguntas]     = useState([])
    const [indice, setIndice]           = useState(0)
    const [selecionado, setSelecionado] = useState(null)
    const [respostas, setRespostas]     = useState([])
    const [carregando, setCarregando]   = useState(true)
    const [enviando, setEnviando]       = useState(false)
    const [erro, setErro]               = useState('')

    useEffect(() => {
        api.get('/api/quiz')
            .then(({ data }) => { setPerguntas(data); setCarregando(false) })
            .catch(() => { setErro('Erro ao carregar perguntas.'); setCarregando(false) })
    }, [])

    function handleProxima() {
        if (selecionado === null) { setErro('Selecione uma resposta.'); return }
        setErro('')
        playBotao()

        const novasRespostas = [...respostas, { quizId: perguntas[indice].id, respostaIndex: selecionado }]
        setRespostas(novasRespostas)
        setSelecionado(null)

        if (indice + 1 < perguntas.length) {
            setIndice(i => i + 1)
        } else {
            enviar(novasRespostas)
        }
    }

    async function enviar(lista) {
        setEnviando(true)
        try {
            const url = modoTeste ? '/api/quiz/testar' : '/api/quiz/responder'
            const body = modoTeste ? { respostas: lista } : { clienteId, respostas: lista }
            const { data } = await api.post(url, body)
            onConcluido({ ...data, total: perguntas.length })
        } catch (err) {
            setErro(err.response?.data?.erro || 'Erro ao enviar respostas.')
            setEnviando(false)
        }
    }

    const pergunta = perguntas[indice]

    // useMemo deve vir antes de qualquer early return
    const respostasEmbaralhadas = useMemo(() => {
        if (!pergunta) return []
        const comIdx = pergunta.respostas.map((r, i) => ({ ...r, _origIdx: i }))
        const ultima = comIdx.find(r => r.isUltima)
        const outras = comIdx.filter(r => !r.isUltima).sort(() => Math.random() - 0.5)
        return ultima ? [...outras, ultima] : outras
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [indice, perguntas.length])

    if (carregando) {
        return (
            <div className={`${styles.tela} ${styles.telaQuiz}`}>
                <div className={styles.overlay}>
                    <p style={{ color: 'white', fontSize: '2vh' }}>Carregando perguntas...</p>
                </div>
            </div>
        )
    }

    if (perguntas.length === 0) {
        return (
            <div className={`${styles.tela} ${styles.telaQuiz}`}>
                <div className={styles.overlay}>
                    <p className={styles.erroTexto}>Nenhuma pergunta cadastrada.</p>
                </div>
            </div>
        )
    }

    return (
        <div className={`${styles.tela} ${styles.telaQuiz}`}>
            <div className={styles.overlay}>
                <div className={styles.questionArea}>
                    <p className={styles.numeroPergunta}>
                        Pergunta {indice + 1} de {perguntas.length}
                    </p>
                    <p className={styles.textoPergunta}>{pergunta.pergunta}</p>
                </div>
                <div className={styles.respostasArea}>
                    {respostasEmbaralhadas.map((r) => (
                        <label
                            key={r._origIdx}
                            className={`${styles.linhaResposta} ${selecionado === r._origIdx ? styles.selecionada : ''}`}
                            onClick={() => setSelecionado(r._origIdx)}
                        >
                            <input type='radio' name='resposta' checked={selecionado === r._origIdx} onChange={() => setSelecionado(r._origIdx)} />
                            {r.texto}
                        </label>
                    ))}
                </div>
                {erro && <p className={styles.erroTexto}>{erro}</p>}
                <div className={styles.botaoArea}>
                    <button className={styles.btnGame} onClick={handleProxima} disabled={enviando}>
                        {enviando ? 'Enviando...' : indice + 1 < perguntas.length ? 'PRÓXIMA' : 'FINALIZAR'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ─── Etapa 4: Falha no quiz ───────────────────────────────────
function TelaFalha({ acertos, total, onReiniciar }) {
    return (
        <div className={`${styles.tela} ${styles.telaFalha}`}>
            <div className={styles.overlay}>
                <div className={styles.textoResultado}>
                    <h2>Quase lá!</h2>
                    <p>Você acertou <strong>{acertos}</strong> de {total} perguntas.</p>
                    <p style={{ marginTop: '1vh', opacity: 0.85 }}>
                        São necessários {QUIZ_MIN_ACERTOS} acertos para girar a roleta.
                    </p>
                </div>
                <div className={styles.botaoArea}>
                    <button className={`${styles.btnGame} ${styles.btnBranco}`} onClick={onReiniciar}>
                        INÍCIO
                    </button>
                </div>
            </div>
        </div>
    )
}

// ─── Etapa 5: Roleta ──────────────────────────────────────────
function TelaRoleta({ premios, premioForcado, onEncerrar, play, stop }) {
    const [premioExibido, setPremioExibido] = useState(null)

    function handlePremioSorteado(premio) {
        stop()
        play('sucessoRoleta')
        setPremioExibido(premio)
    }

    return (
        <div className={`${styles.tela} ${styles.telaRoleta}`}>
            <Roleta
                premios={premios}
                onPremioSorteado={handlePremioSorteado}
                onGirar={() => play('roleta')}
                premioForcado={premioForcado}
            />
            {premioExibido && (
                <ModalPremio premio={premioExibido} onFechar={onEncerrar} />
            )}
        </div>
    )
}

// ─── Página principal ─────────────────────────────────────────
export default function Jogo() {
    const { play, stop } = useSom()

    const [etapa, setEtapa]               = useState(1)
    const [clienteId, setClienteId]       = useState(null)
    const [nomeCliente, setNomeCliente]   = useState('')
    const [premioForcado, setPremio]      = useState(null)
    const [premios, setPremios]           = useState([])
    const [modoTeste, setModoTeste]       = useState(false)
    const [acertos, setAcertos]           = useState(0)
    const [totalPerguntas, setTotal]      = useState(0)

    const resetJogo = useCallback(() => {
        stop()
        setEtapa(1)
        setClienteId(null)
        setNomeCliente('')
        setPremio(null)
        setPremios([])
        setModoTeste(false)
        setAcertos(0)
        setTotal(0)
    }, [stop])

    function handleValidado(cliente) {
        setClienteId(cliente.id)
        setNomeCliente(cliente.nome)
        setModoTeste(cliente.id === null)
        setEtapa(3)
    }

    function handleQuizConcluido(data) {
        setAcertos(data.acertos ?? 0)
        setTotal(data.total ?? 0)
        if (data.aprovado === false) {
            setEtapa(4)
            return
        }
        setPremios(data.premios || [])
        setPremio({ id: data.premioId, nome: data.premioNome, subnome: data.premioSub })
        setEtapa(5)
    }

    return (
        <div className={styles.gameContent}>
            {etapa === 1 && (
                <TelaStart onAvancar={() => setEtapa(2)} playBotao={() => play('botao')} />
            )}
            {etapa === 2 && (
                <TelaIdentificacao onValidado={handleValidado} playBotao={() => play('botao')} />
            )}
            {etapa === 3 && clienteId !== undefined && (
                <TelaQuiz
                    nomeParticipante={nomeCliente}
                    clienteId={clienteId}
                    onConcluido={handleQuizConcluido}
                    playBotao={() => play('botao')}
                    modoTeste={modoTeste}
                />
            )}
            {etapa === 4 && (
                <TelaFalha acertos={acertos} total={totalPerguntas} onReiniciar={resetJogo} />
            )}
            {etapa === 5 && (
                <TelaRoleta
                    premios={premios}
                    premioForcado={premioForcado}
                    onEncerrar={resetJogo}
                    play={play}
                    stop={stop}
                />
            )}
        </div>
    )
}
