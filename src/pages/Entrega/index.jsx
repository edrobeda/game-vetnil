import { useState, useEffect, useRef } from 'react'
import jsQR from 'jsqr'
import api from '../../services/api'
import styles from './Entrega.module.css'

const TOKEN_KEY = 'entrega_token'

const STATUS_LABEL = {
    cadastrado:        { label: 'Aguardando',        cor: '#888'    },
    jogando:           { label: 'Jogou',              cor: '#B7C922' },
    premio_disponivel: { label: 'Prêmio disponível', cor: '#C3630A' },
    premio_entregue:   { label: 'Entregue',          cor: '#58A561' },
}

function entregaHeader() {
    return { headers: { 'x-entrega-token': sessionStorage.getItem(TOKEN_KEY) } }
}

// ─── Login ────────────────────────────────────────────────────
function TelaLogin({ onLogin }) {
    const [senha, setSenha]           = useState('')
    const [erro, setErro]             = useState('')
    const [carregando, setCarregando] = useState(false)

    async function handleSubmit(e) {
        e.preventDefault()
        setErro('')
        setCarregando(true)
        try {
            const { data } = await api.post('/api/entrega/auth', { senha })
            sessionStorage.setItem(TOKEN_KEY, data.token)
            onLogin()
        } catch (err) {
            setErro(err.response?.data?.erro || 'Senha incorreta.')
        } finally {
            setCarregando(false)
        }
    }

    return (
        <div className={styles.loginContainer}>
            <div className={styles.loginCard}>
                <h1 className={styles.loginTitulo}>Entrega de Prêmios</h1>
                <p className={styles.loginSub}>Balcão de Retirada</p>
                <form onSubmit={handleSubmit} className={styles.loginForm}>
                    <input className={styles.loginInput} type='password' placeholder='Senha'
                        value={senha} onChange={e => setSenha(e.target.value)} required autoFocus />
                    {erro && <p className={styles.loginErro}>{erro}</p>}
                    <button className={styles.loginBtn} type='submit' disabled={carregando}>
                        {carregando ? 'Entrando...' : 'ENTRAR'}
                    </button>
                </form>
            </div>
        </div>
    )
}

// ─── Busca e confirmação ──────────────────────────────────────
function TelaBusca({ onLogout }) {
    const [codigo, setCodigo]         = useState('')
    const [partida, setPartida]       = useState(null)
    const [operador, setOperador]     = useState('')
    const [erro, setErro]             = useState('')
    const [msg, setMsg]               = useState('')
    const [buscando, setBuscando]         = useState(false)
    const [confirmando, setConfirmando]   = useState(false)
    const [camera, setCamera]         = useState(false)
    const videoRef = useRef(null)
    const animRef  = useRef(null)

    async function buscarCodigo(cod) {
        const c = (cod || codigo).trim().toUpperCase()
        if (!c) return
        setBuscando(true)
        setErro('')
        setPartida(null)
        setMsg('')
        try {
            const { data } = await api.get(`/api/entrega/${c}`, entregaHeader())
            setPartida(data)
            setCodigo(c)
        } catch (err) {
            if (err.response?.status === 401) { sessionStorage.removeItem(TOKEN_KEY); onLogout() }
            else setErro(err.response?.data?.erro || 'Código não encontrado.')
        } finally {
            setBuscando(false)
        }
    }

    async function confirmar() {
        if (!operador.trim()) { setErro('Informe o nome do operador.'); return }
        setConfirmando(true)
        setErro('')
        try {
            await api.post(`/api/entrega/${partida.codigo}/confirmar`, { operador }, entregaHeader())
            setMsg('Prêmio entregue com sucesso!')
            setPartida(p => ({ ...p, status: 'premio_entregue' }))
        } catch (err) {
            setErro(err.response?.data?.erro || 'Erro ao confirmar.')
        } finally {
            setConfirmando(false)
        }
    }

    function cancelar() {
        setPartida(null)
        setCodigo('')
        setErro('')
        setMsg('')
        setOperador('')
    }

    useEffect(() => {
        if (!camera) { cancelAnimationFrame(animRef.current); return }
        let stream = null
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d', { willReadFrequently: true })

        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
            .then(s => {
                stream = s
                if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play() }
                scan()
            })
            .catch(() => { setErro('Câmera não disponível.'); setCamera(false) })

        function scan() {
            if (!videoRef.current || videoRef.current.readyState < 2) {
                animRef.current = requestAnimationFrame(scan); return
            }
            canvas.width  = videoRef.current.videoWidth
            canvas.height = videoRef.current.videoHeight
            ctx.drawImage(videoRef.current, 0, 0)
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
            const qr  = jsQR(img.data, img.width, img.height)
            if (qr?.data) {
                setCamera(false)
                stream?.getTracks().forEach(t => t.stop())
                buscarCodigo(qr.data)
                return
            }
            animRef.current = requestAnimationFrame(scan)
        }

        return () => { cancelAnimationFrame(animRef.current); stream?.getTracks().forEach(t => t.stop()) }
    }, [camera])

    return (
        <div className={styles.wrap}>
            <header className={styles.header}>
                <span className={styles.headerDot} />
                <h1 className={styles.headerTitulo}>Entrega de Prêmios</h1>
                <button className={styles.btnSair}
                    onClick={() => { sessionStorage.removeItem(TOKEN_KEY); onLogout() }}>
                    Sair
                </button>
            </header>

            <main className={styles.main}>
                {!partida && (
                    <>
                        <div className={styles.busca}>
                            <input
                                className={styles.buscaInput}
                                placeholder='Digite o código (ex: EVT-12345-ABCD)'
                                value={codigo}
                                onChange={e => setCodigo(e.target.value.toUpperCase())}
                                onKeyDown={e => e.key === 'Enter' && buscarCodigo()}
                                autoFocus
                            />
                            <div className={styles.botoesBusca}>
                                <button className={styles.btnBuscar} onClick={() => buscarCodigo()} disabled={buscando}>
                                    {buscando ? '...' : 'Buscar'}
                                </button>
                                <button
                                    className={`${styles.btnCamera} ${camera ? styles.btnCameraAtiva : ''}`}
                                    onClick={() => setCamera(c => !c)}
                                    title='Escanear QR Code'
                                >📷</button>
                            </div>
                        </div>

                        {camera && (
                            <div className={styles.cameraBox}>
                                <video ref={videoRef} className={styles.cameraVideo} muted playsInline />
                                <p className={styles.cameraDica}>Aponte para o QR Code do participante</p>
                            </div>
                        )}

                        {erro && <p className={styles.erro}>{erro}</p>}
                    </>
                )}

                {partida && (
                    <div className={styles.card}>
                        <div className={styles.cardTopo}>
                            <span className={styles.cardCodigo}>{partida.codigo}</span>
                            <span style={{ color: STATUS_LABEL[partida.status]?.cor ?? '#888', fontWeight: 600, fontSize: '1.4vh' }}>
                                {STATUS_LABEL[partida.status]?.label ?? partida.status}
                            </span>
                        </div>

                        <div className={styles.info}>
                            <div className={styles.linha}><span>Nome</span><strong>{partida.nome}</strong></div>
                            <div className={styles.linha}>
                                <span>CPF</span>
                                <strong className={styles.mono}>
                                    {partida.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.***-**')}
                                </strong>
                            </div>

                            <h3 style={{textAlign:'center',margin: 0,padding: 0}}>
                                <span>Prêmio</span>
                            </h3>
                            <h1 style={{textAlign:'center',margin: 0,padding: 0}}>
                                <strong>{partida.premio_nome}</strong>
                            </h1>
                            <h2 style={{textAlign:'center',margin: 0,padding: 0}}>
                                 {partida.premio_sub && <strong><span className={styles.premioSub}>{partida.premio_sub}</span></strong>}
                            </h2>
                            
                            <div className={styles.linha}><span>Sorteado em</span><strong>{partida.jogado_em ?? '—'}</strong></div>
                            {partida.entregue_em && (
                                <div className={styles.linha}><span>Entregue em</span><strong>{partida.entregue_em}</strong></div>
                            )}
                            {partida.operador && (
                                <div className={styles.linha}><span>Operador</span><strong>{partida.operador}</strong></div>
                            )}
                        </div>

                        {msg && <p className={styles.sucesso}>{msg}</p>}
                        {erro && <p className={styles.erro}>{erro}</p>}

                        {partida.status === 'premio_disponivel' && !msg && (
                            <>
                                <input
                                    className={styles.buscaInput}
                                    placeholder='Nome do operador *'
                                    value={operador}
                                    onChange={e => setOperador(e.target.value)}
                                    style={{ marginTop: '1.5vh' }}
                                />
                                <div className={styles.acoes}>
                                    <button className={styles.btnEntregar} onClick={confirmar} disabled={confirmando}>
                                        {confirmando ? 'Confirmando...' : '✓ Entregar'}
                                    </button>
                                    <button className={styles.btnCancelar} onClick={cancelar}>Cancelar</button>
                                </div>
                            </>
                        )}

                        {(partida.status !== 'premio_disponivel' || msg) && (
                            <button className={styles.btnCancelar} onClick={cancelar} style={{ marginTop: '1.5vh' }}>
                                Nova consulta
                            </button>
                        )}
                    </div>
                )}
            </main>
        </div>
    )
}

// ─── Página principal ─────────────────────────────────────────
export default function Entrega() {
    const [autenticado, setAutenticado] = useState(() => !!sessionStorage.getItem(TOKEN_KEY))
    if (!autenticado) return <TelaLogin onLogin={() => setAutenticado(true)} />
    return <TelaBusca onLogout={() => setAutenticado(false)} />
}
