import { useState, useEffect, useCallback, useRef } from 'react'
import jsQR from 'jsqr'
import api from '../../services/api'
import { CHANCE_PESOS, CHANCE_LABEL, CHANCE_OPTIONS } from '../../constants/chances'
import styles from './Manager.module.css'

const TOKEN_KEY = 'manager_token'
const LETRAS = ['A', 'B', 'C', 'D', 'E']

function authHeader() {
    return { headers: { 'x-manager-token': sessionStorage.getItem(TOKEN_KEY) } }
}

// ─── Login ────────────────────────────────────────────────────
function TelaLogin({ onLogin }) {
    const [usuario, setUsuario] = useState('')
    const [senha, setSenha] = useState('')
    const [erro, setErro] = useState('')
    const [carregando, setCarregando] = useState(false)

    async function handleSubmit(e) {
        e.preventDefault()
        setErro('')
        setCarregando(true)
        try {
            const { data } = await api.post('/api/manager/login', { usuario, senha })
            sessionStorage.setItem(TOKEN_KEY, data.token)
            onLogin()
        } catch (err) {
            setErro(err.response?.data?.erro || 'Erro ao autenticar.')
        } finally {
            setCarregando(false)
        }
    }

    return (
        <div className={styles.loginContainer}>
            <div className={styles.loginCard}>
                <h1 className={styles.loginTitulo}>Gerenciamento</h1>
                <p className={styles.loginSub}>Game Roleta</p>
                <form onSubmit={handleSubmit} className={styles.loginForm}>
                    <input className={styles.loginInput} type='text' placeholder='Usuário'
                        value={usuario} onChange={e => setUsuario(e.target.value)} required autoComplete='off' />
                    <input className={styles.loginInput} type='password' placeholder='Senha'
                        value={senha} onChange={e => setSenha(e.target.value)} required />
                    {erro && <p className={styles.loginErro}>{erro}</p>}
                    <button className={styles.loginBtn} type='submit' disabled={carregando}>
                        {carregando ? 'Entrando...' : 'ENTRAR'}
                    </button>
                </form>
            </div>
        </div>
    )
}

// ─── Stats ────────────────────────────────────────────────────
function Cards({ stats }) {
    const itens = [
        { label: 'Cadastros', valor: stats.total_clientes },
        { label: 'Jogaram', valor: stats.total_partidas },
        { label: 'Prêmios entregues', valor: stats.premios_distribuidos },
        { label: 'Quiz completo', valor: stats.quiz_completos },
    ]
    return (
        <div className={styles.cards}>
            {itens.map(({ label, valor }) => (
                <div key={label} className={styles.card}>
                    <span className={styles.cardValor}>{valor ?? '—'}</span>
                    <span className={styles.cardLabel}>{label}</span>
                </div>
            ))}
        </div>
    )
}

const STATUS_LABEL = {
    cadastrado:        { label: 'Aguardando',        cor: '#888'    },
    jogando:           { label: 'Jogou',              cor: '#B7C922' },
    sem_premio:        { label: 'Perdeu',             cor: '#e53935' },
    premio_disponivel: { label: 'Prêmio disponível', cor: '#C3630A' },
    premio_entregue:   { label: 'Entregue',          cor: '#58A561' },
}

const PERFIS = [
    'Agrônomo','Criador/Proprietário de Animais','Estudante de Veterinária',
    'Lojista','Tratador de Cavalos','Veterinário de Equinos','Zootecnista','Outros',
]

function formatarCpf(v) {
    return v.replace(/\D/g,'').slice(0,11)
        .replace(/(\d{3})(\d)/,'$1.$2')
        .replace(/(\d{3})(\d)/,'$1.$2')
        .replace(/(\d{3})(\d{1,2})$/,'$1-$2')
}

// ─── Formulário: adicionar cliente ────────────────────────────
function FormAdicionarCliente({ onSalvo, onCancelar }) {
    const [form, setForm] = useState({ nome:'', cpf:'', telefone:'', email:'', perfil:'' })
    const [erro, setErro] = useState('')
    const [salvando, setSalvando] = useState(false)

    function set(e) {
        const { name, value } = e.target
        setForm(p => ({ ...p, [name]: name === 'cpf' ? formatarCpf(value) : value }))
    }

    async function handleSubmit(e) {
        e.preventDefault()
        setErro('')
        setSalvando(true)
        try {
            await api.post('/api/manager/cliente', form, authHeader())
            onSalvo()
        } catch (err) {
            setErro(err.response?.data?.erro || 'Erro ao salvar.')
        } finally {
            setSalvando(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className={styles.formInline}>
            <input name='cpf' className={styles.formInput} placeholder='CPF *'
                value={form.cpf} onChange={set} required />
            <input name='nome' className={styles.formInput} placeholder='Nome *'
                value={form.nome} onChange={set} required />
            <input name='telefone' className={styles.formInput} placeholder='Telefone *'
                value={form.telefone} onChange={set} required />
            <input name='email' className={styles.formInput} placeholder='E-mail (opcional)'
                value={form.email} onChange={set} />
            <select name='perfil' className={styles.formInput} value={form.perfil} onChange={set}>
                <option value=''>Perfil (opcional)</option>
                {PERFIS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            {erro && <span className={styles.formErro}>{erro}</span>}
            <div className={styles.formAcoes}>
                <button type='submit' className={styles.btnSalvar} disabled={salvando}>
                    {salvando ? 'Salvando...' : 'Salvar'}
                </button>
                <button type='button' className={styles.btnCancelar} onClick={onCancelar}>Cancelar</button>
            </div>
        </form>
    )
}

// ─── Aba Entrega ──────────────────────────────────────────────
function TabEntrega() {
    const [codigo, setCodigo] = useState('')
    const [partida, setPartida] = useState(null)
    const [operador, setOperador] = useState('')
    const [erro, setErro] = useState('')
    const [msg, setMsg] = useState('')
    const [buscando, setBuscando] = useState(false)
    const [confirmando, setConfirmando] = useState(false)
    const [camera, setCamera] = useState(false)

    const videoRef = useRef(null)
    const animRef = useRef(null)

    // busca por código
    async function buscarCodigo(cod) {
        const c = (cod || codigo).trim().toUpperCase()
        if (!c) return
        setBuscando(true)
        setErro('')
        setPartida(null)
        setMsg('')
        try {
            const { data } = await api.get(`/api/manager/entrega/${c}`, authHeader())
            setPartida(data)
            setCodigo(c)
        } catch (err) {
            setErro(err.response?.data?.erro || 'Código não encontrado.')
        } finally {
            setBuscando(false)
        }
    }

    // confirma entrega
    async function confirmar() {
        if (!operador.trim()) { setErro('Informe o nome do operador.'); return }
        setConfirmando(true)
        setErro('')
        try {
            await api.post(`/api/manager/entrega/${partida.codigo}/confirmar`, { operador }, authHeader())
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

    // câmera QR
    useEffect(() => {
        if (!camera) {
            cancelAnimationFrame(animRef.current)
            return
        }
        let stream = null
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d', { willReadFrequently: true })

        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
            .then(s => {
                stream = s
                if (videoRef.current) {
                    videoRef.current.srcObject = s
                    videoRef.current.play()
                }
                scan()
            })
            .catch(() => { setErro('Câmera não disponível.'); setCamera(false) })

        function scan() {
            if (!videoRef.current || videoRef.current.readyState < 2) {
                animRef.current = requestAnimationFrame(scan)
                return
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

        return () => {
            cancelAnimationFrame(animRef.current)
            stream?.getTracks().forEach(t => t.stop())
        }
    }, [camera])

    return (
        <div className={styles.entregaWrap}>

            {/* ── Busca ── */}
            {!partida && (
                <>
                    <div className={styles.entregaBusca}>
                        <input
                            className={styles.entregaInput}
                            placeholder='Digite o código  (ex: EVT-12345-ABCD)'
                            value={codigo}
                            onChange={e => setCodigo(e.target.value.toUpperCase())}
                            onKeyDown={e => e.key === 'Enter' && buscarCodigo()}
                        />
                        <button className={styles.btnSalvar} onClick={() => buscarCodigo()} disabled={buscando}>
                            {buscando ? '...' : 'Buscar'}
                        </button>
                        <button
                            className={`${styles.btnEditar} ${camera ? styles.btnCameraAtiva : ''}`}
                            onClick={() => setCamera(c => !c)}
                            title='Escanear QR Code'
                        >
                            📷
                        </button>
                    </div>

                    {camera && (
                        <div className={styles.cameraBox}>
                            <video ref={videoRef} className={styles.cameraVideo} muted playsInline />
                            <p className={styles.cameraDica}>Aponte para o QR Code do participante</p>
                        </div>
                    )}

                    {erro && <p className={styles.entregaErro}>{erro}</p>}
                </>
            )}

            {/* ── Resultado ── */}
            {partida && (
                <div className={styles.entregaCard}>
                    <div className={styles.entregaStatus}>
                        <span className={styles.entregaCodigo}>{partida.codigo}</span>
                        <span style={{
                            color: STATUS_LABEL[partida.status]?.cor ?? '#888',
                            fontWeight: 600, fontSize: '1.4vh'
                        }}>
                            {STATUS_LABEL[partida.status]?.label ?? partida.status}
                        </span>
                    </div>

                    <div className={styles.entregaInfo}>
                        <div className={styles.entregaLinha}>
                            <span>Nome</span><strong>{partida.nome}</strong>
                        </div>
                        <div className={styles.entregaLinha}>
                            <span>CPF</span>
                            <strong className={styles.mono}>
                                {partida.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.***-**')}
                            </strong>
                        </div>
                        <div className={styles.entregaLinha}>
                            <span>Prêmio</span>
                            <strong>{partida.premio_nome}{partida.premio_sub ? ` — ${partida.premio_sub}` : ''}</strong>
                        </div>
                        <div className={styles.entregaLinha}>
                            <span>Sorteado em</span><strong>{partida.jogado_em ?? '—'}</strong>
                        </div>
                        {partida.entregue_em && (
                            <div className={styles.entregaLinha}>
                                <span>Entregue em</span><strong>{partida.entregue_em}</strong>
                            </div>
                        )}
                        {partida.operador && (
                            <div className={styles.entregaLinha}>
                                <span>Operador</span><strong>{partida.operador}</strong>
                            </div>
                        )}
                    </div>

                    {msg && <p className={styles.entregaSucesso}>{msg}</p>}
                    {erro && <p className={styles.entregaErro}>{erro}</p>}

                    {partida.status === 'premio_disponivel' && !msg && (
                        <>
                            <input
                                className={styles.entregaInput}
                                placeholder='Nome do operador *'
                                value={operador}
                                onChange={e => setOperador(e.target.value)}
                                style={{ marginTop: '1.5vh' }}
                            />
                            <div className={styles.entregaAcoes}>
                                <button className={styles.btnEntregar} onClick={confirmar} disabled={confirmando}>
                                    {confirmando ? 'Confirmando...' : '✓ Entregar'}
                                </button>
                                <button className={styles.btnCancelar} onClick={cancelar}>
                                    Cancelar
                                </button>
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
        </div>
    )
}

// ─── Tabela clientes ──────────────────────────────────────────
function TabelaClientes({ clientes, onAtualizar }) {
    const [adicionando, setAdicionando] = useState(false)

    async function enviarEmail(clienteId) {
        if (!confirm('Enviar email para este participante?')) return
        try {
            await api.post(`/api/email/enviar/${clienteId}`, {}, authHeader())
            alert('Email enviado com sucesso!')
            onAtualizar()
        } catch (err) {
            alert(err.response?.data?.erro || 'Erro ao enviar email.')
        }
    }

    async function remover(id) {
        if (!confirm('Remover este cliente?')) return
        try {
            await api.delete(`/api/manager/clientes/${id}`, authHeader())
            onAtualizar()
        } catch (err) {
            const data = err.response?.data
            if (data?.podeForcar) {
                const confirmar = confirm(
                    `${data.erro}\n\nDeseja forçar a remoção e apagar também os dados da partida? Esta ação não pode ser desfeita.`
                )
                if (!confirmar) return
                try {
                    await api.delete(`/api/manager/clientes/${id}?force=true`, authHeader())
                    onAtualizar()
                } catch (e2) {
                    alert(e2.response?.data?.erro || 'Erro ao forçar remoção.')
                }
            } else {
                alert(data?.erro || 'Erro ao remover.')
            }
        }
    }

    return (
        <>
        <div className={styles.tabelaHeader}>
            {!adicionando && (
                <button className={styles.btnAdicionar} onClick={() => setAdicionando(true)}>
                    + Adicionar cliente
                </button>
            )}
        </div>
        {adicionando && (
            <FormAdicionarCliente
                onSalvo={() => { setAdicionando(false); onAtualizar() }}
                onCancelar={() => setAdicionando(false)}
            />
        )}
        <div className={styles.tableWrap}>
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th>Nome</th><th>CPF</th><th>Telefone</th><th>Cadastro</th>
                        <th>Status</th><th>Código</th><th>Palpite</th><th>Prêmio</th><th>Jogou em</th><th>Entregue em</th><th></th>
                    </tr>
                </thead>
                <tbody>
                    {clientes.map(c => {
                        const st = STATUS_LABEL[c.status ?? 'cadastrado'] ?? STATUS_LABEL.cadastrado
                        return (
                            <tr key={c.id}>
                                <td>{c.nome}</td>
                                <td className={styles.mono}>{c.cpf}</td>
                                <td className={styles.mono}>{c.telefone ?? '—'}</td>
                                <td className={styles.mono}>{c.criado_em}</td>
                                <td>
                                    <span style={{ color: st.cor, fontWeight: 600, fontSize: '1.3vh' }}>
                                        {st.label}
                                    </span>
                                </td>
                                <td className={styles.mono}>{c.codigo ?? '—'}</td>
                                <td className={styles.centro}>
                                    {c.params?.palpite
                                        ? <strong>{c.params.palpite}</strong>
                                        : <span className={styles.vazio}>—</span>}
                                </td>
                                <td>
                                    {c.premio_nome
                                        ? <><strong>{c.premio_nome}</strong>{c.premio_sub ? ` — ${c.premio_sub}` : ''}</>
                                        : <span className={styles.vazio}>—</span>}
                                </td>
                                <td className={styles.mono}>{c.jogado_em ?? '—'}</td>
                                <td className={styles.mono}>{c.entregue_em ?? '—'}</td>
                                <td className={styles.centro}>
                                    {c.email && ['premio_disponivel', 'premio_entregue'].includes(c.status) && (
                                        <button
                                            className={styles.btnEmail}
                                            onClick={() => enviarEmail(c.id)}
                                            title={c.email_enviado ? 'Email já enviado — reenviar?' : 'Enviar email com código'}
                                            style={{ opacity: c.email_enviado ? 0.5 : 1 }}
                                        >
                                            {c.email_enviado ? '✉ ✓' : '✉'}
                                        </button>
                                    )}
                                    <button className={styles.btnRemover} onClick={() => remover(c.id)}>
                                        Remover
                                    </button>
                                </td>
                            </tr>
                        )
                    })}
                    {clientes.length === 0 && (
                        <tr><td colSpan={11} className={styles.vazio}>Nenhum cadastro ainda.</td></tr>
                    )}
                </tbody>
            </table>
        </div>
        </>
    )
}

// ─── Info box de chances ──────────────────────────────────────
function InfoChances({ premios }) {
    const ativos = premios.filter(p => p.ativo)
    const totalPeso = ativos.reduce((acc, p) => acc + (CHANCE_PESOS[parseInt(p.chance)] ?? parseInt(p.chance)), 0)

    if (ativos.length === 0) return null

    const niveis = Object.entries(CHANCE_LABEL)
        .map(([v, label]) => ({ label, valor: parseInt(v) }))
        .filter(n => ativos.some(p => parseInt(p.chance) === n.valor))

    const igual = (1 / ativos.length * 100).toFixed(1)

    return (
        <div className={styles.infoChances}>
            <span className={styles.infoTitulo}>
                📊 Distribuição com {ativos.length} prêmio{ativos.length !== 1 ? 's' : ''} ativo{ativos.length !== 1 ? 's' : ''}
                <span className={styles.infoSub}> (distribuição igual seria {igual}% cada)</span>
            </span>
            <div className={styles.infoNiveis}>
                {niveis.map(n => {
                    const pct = (CHANCE_PESOS[n.valor] / totalPeso * 100).toFixed(1)
                    const diff = (CHANCE_PESOS[n.valor] / totalPeso * 100 - 100 / ativos.length).toFixed(1)
                    const sinal = diff >= 0 ? '+' : ''
                    return (
                        <span key={n.valor} className={`${styles.infoNivel} ${styles[`chance${n.valor}`]}`}>
                            {n.label}: <strong>{pct}%</strong>
                            <span className={styles.infoDiff}> ({sinal}{diff}%)</span>
                        </span>
                    )
                })}
            </div>
            <span className={styles.infoObs}>
                Valores por prêmio individual. Quanto mais prêmios, menor a diferença entre os níveis.
            </span>
        </div>
    )
}

// ─── Linha editável: prêmio ───────────────────────────────────
function LinhaEditPremio({ premio, onSalvo, onCancelar }) {
    const [form, setForm] = useState({
        nome: premio.nome,
        subnome: premio.subnome ?? '',
        chance: String(premio.chance),
        quantidade: premio.quantidade ?? '',
        ativo: premio.ativo,
    })
    const [salvando, setSalvando] = useState(false)
    const [erro, setErro] = useState('')

    async function handleSalvar() {
        setSalvando(true)
        setErro('')
        try {
            await api.put(`/api/manager/premios/${premio.id}`, form, authHeader())
            onSalvo()
        } catch (err) {
            setErro(err.response?.data?.erro || 'Erro.')
        } finally {
            setSalvando(false)
        }
    }

    return (
        <tr className={styles.linhaEdit}>
            <td className={styles.centro}>{premio.id}</td>
            <td><input className={styles.cellInput} value={form.nome}
                onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} /></td>
            <td><input className={styles.cellInput} value={form.subnome} placeholder='—'
                onChange={e => setForm(p => ({ ...p, subnome: e.target.value }))} /></td>
            <td>
                <select className={styles.cellInput} value={form.chance}
                    onChange={e => setForm(p => ({ ...p, chance: e.target.value }))}>
                    {CHANCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
            </td>
            <td className={styles.centro}>{premio.vezes_sorteado}x</td>
            <td>
                <input className={styles.cellInput} type='number' min='1' placeholder='∞'
                    value={form.quantidade}
                    onChange={e => setForm(p => ({ ...p, quantidade: e.target.value }))}
                    style={{ width: '6vw' }} />
            </td>
            <td>
                <select className={styles.cellInput} value={String(form.ativo)}
                    onChange={e => setForm(p => ({ ...p, ativo: e.target.value === 'true' }))}>
                    <option value='true'>Sim</option>
                    <option value='false'>Não</option>
                </select>
            </td>
            <td className={styles.centro}>
                {erro && <span className={styles.cellErro}>{erro}</span>}
                <button className={styles.btnSalvar} onClick={handleSalvar} disabled={salvando}>
                    {salvando ? '...' : '✓'}
                </button>
                <button className={styles.btnCancelar} onClick={onCancelar}>✕</button>
            </td>
        </tr>
    )
}

// ─── Simulador de sorteio ─────────────────────────────────────
function sortearUm(lista) {
    const total = lista.reduce((acc, p) => acc + (CHANCE_PESOS[p.chance] ?? p.chance), 0)
    let rand = Math.random() * total
    for (const p of lista) {
        rand -= (CHANCE_PESOS[p.chance] ?? p.chance)
        if (rand <= 0) return p
    }
    return lista[lista.length - 1]
}

function SimuladorSorteio({ premios }) {
    const ativos = premios.filter(p => p.ativo)
    const [n, setN] = useState(100)
    const [resultado, setResultado] = useState(null)

    function simular() {
        if (ativos.length === 0) return
        const contagem = {}
        ativos.forEach(p => { contagem[p.id] = 0 })
        for (let i = 0; i < n; i++) {
            const s = sortearUm(ativos)
            contagem[s.id] = (contagem[s.id] || 0) + 1
        }
        setResultado(contagem)
    }

    if (ativos.length === 0) return null

    const totalPeso = ativos.reduce((acc, p) => acc + (CHANCE_PESOS[p.chance] ?? p.chance), 0)

    const maxPct = resultado
        ? Math.max(
            ...ativos.map(p => resultado[p.id] / n * 100),
            ...ativos.map(p => CHANCE_PESOS[p.chance] / totalPeso * 100)
          )
        : 100
    const scale = 90 / (maxPct || 1)

    const ordenados = resultado
        ? [...ativos].sort((a, b) => (resultado[b.id] || 0) - (resultado[a.id] || 0))
        : ativos

    return (
        <div className={styles.simulador}>
            <div className={styles.simHeader}>
                <span className={styles.simTitulo}>🎲 Simulador de Sorteio</span>
                <div className={styles.simControles}>
                    <input
                        type='number' min='1' max='100000'
                        value={n}
                        onChange={e => setN(Math.max(1, Math.min(100000, parseInt(e.target.value) || 100)))}
                        className={styles.simInput}
                    />
                    <span className={styles.simLabel}>sorteios</span>
                    <button className={styles.simBtn} onClick={simular}>Simular</button>
                </div>
            </div>

            {resultado && (
                <div className={styles.simResultados}>
                    {ordenados.map(p => {
                        const real    = resultado[p.id] || 0
                        const pctReal = real / n * 100
                        const pctEsp  = CHANCE_PESOS[p.chance] / totalPeso * 100
                        const diff    = pctReal - pctEsp
                        const barW    = pctReal * scale
                        const markL   = pctEsp * scale

                        return (
                            <div key={p.id} className={styles.simLinha}>
                                <span className={styles.simNome} title={p.nome}>{p.nome}</span>
                                <div className={styles.simBarraWrap}>
                                    <div className={styles.simBarra} style={{ width: `${barW}%` }} />
                                    <div className={styles.simMarca} style={{ left: `${markL}%` }} />
                                </div>
                                <span className={styles.simCount}>{real}×</span>
                                <span className={styles.simPct}>{pctReal.toFixed(1)}%</span>
                                <span className={`${styles.simDiff} ${diff >= 0 ? styles.simDiffPos : styles.simDiffNeg}`}>
                                    {diff >= 0 ? '+' : ''}{diff.toFixed(1)}%
                                </span>
                            </div>
                        )
                    })}
                    <div className={styles.simLegenda}>
                        <span className={styles.simLegReal}>&#9632; Real</span>
                        <span className={styles.simLegEsp}>&#124; Esperado</span>
                        <span className={styles.simObs}>Esperado calculado com pesos atuais dos prêmios ativos</span>
                    </div>
                </div>
            )}
        </div>
    )
}

// ─── Tabela prêmios ───────────────────────────────────────────
function TabelaPremios({ premios, onAtualizar, onRemover }) {
    const [adicionando, setAdicionando] = useState(false)
    const [editandoId, setEditandoId] = useState(null)

    async function handleSubmitNovo(e) {
        e.preventDefault()
        const fd = Object.fromEntries(new FormData(e.target))
        try {
            await api.post('/api/manager/premios', fd, authHeader())
            setAdicionando(false)
            onAtualizar()
        } catch (err) {
            alert(err.response?.data?.erro || 'Erro ao salvar.')
        }
    }

    return (
        <>
            <InfoChances premios={premios} />
            <SimuladorSorteio premios={premios} />

            <div className={styles.tabelaHeader}>
                {!adicionando && (
                    <button className={styles.btnAdicionar} onClick={() => setAdicionando(true)}>
                        + Adicionar prêmio
                    </button>
                )}
            </div>
            {adicionando && (
                <form onSubmit={handleSubmitNovo} className={styles.formInline}>
                    <input name='nome' className={styles.formInput} placeholder='Nome *' required />
                    <input name='subnome' className={styles.formInput} placeholder='Subnome (opcional)' />
                    <select name='chance' className={styles.formInput} defaultValue='4'>
                        {CHANCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <input name='quantidade' type='number' min='1' className={styles.formInput}
                        placeholder='Limite (∞ se vazio)' />
                    <div className={styles.formAcoes}>
                        <button type='submit' className={styles.btnSalvar}>Salvar</button>
                        <button type='button' className={styles.btnCancelar} onClick={() => setAdicionando(false)}>Cancelar</button>
                    </div>
                </form>
            )}
            <div className={styles.tableWrap}>
                <table className={styles.table}>
                    <thead>
                        <tr><th>#</th><th>Nome</th><th>Subnome</th><th>Chance</th><th>Sorteado</th><th>Limite</th><th>Ativo</th><th></th></tr>
                    </thead>
                    <tbody>
                        {premios.map(p => editandoId === p.id
                            ? <LinhaEditPremio key={p.id} premio={p}
                                onSalvo={() => { setEditandoId(null); onAtualizar() }}
                                onCancelar={() => setEditandoId(null)} />
                            : (
                                <tr key={p.id}>
                                    <td className={styles.centro}>{p.id}</td>
                                    <td><strong>{p.nome}</strong></td>
                                    <td>{p.subnome ?? '—'}</td>
                                    <td className={styles.centro}>
                                        <span className={`${styles.badge} ${styles[`chance${p.chance}`]}`}>
                                            {CHANCE_LABEL[p.chance]}
                                        </span>
                                    </td>
                                    <td className={styles.centro}>{p.vezes_sorteado}x</td>
                                    <td className={styles.centro}>
                                        {p.quantidade
                                            ? <span className={parseInt(p.vezes_sorteado) >= parseInt(p.quantidade) ? styles.inativo : styles.ativo}>
                                                {p.vezes_sorteado}/{p.quantidade}
                                              </span>
                                            : <span className={styles.vazio}>∞</span>
                                        }
                                    </td>
                                    <td className={styles.centro}>
                                        <span className={p.ativo ? styles.ativo : styles.inativo}>
                                            {p.ativo ? 'Sim' : 'Não'}
                                        </span>
                                    </td>
                                    <td className={styles.acoesCelula}>
                                        <button className={styles.btnEditar} onClick={() => setEditandoId(p.id)}>Editar</button>
                                        <button className={styles.btnRemover} onClick={() => onRemover(p.id)}>Remover</button>
                                    </td>
                                </tr>
                            )
                        )}
                        {premios.length === 0 && (
                            <tr><td colSpan={8} className={styles.vazio}>Nenhum prêmio cadastrado.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </>
    )
}

// retorna só as opções com conteúdo preenchido
function opcoesCorreta(form) {
    return [
        { value: '1', label: 'A', filled: !!form.primeira },
        { value: '2', label: 'B', filled: !!form.segunda  },
        { value: '3', label: 'C', filled: !!form.terceira },
        { value: '4', label: 'D', filled: !!form.quarta   },
        { value: '5', label: 'E', filled: !!form.ultima_resposta },
    ].filter(o => o.filled)
}

function ajustarCorreta(prev, campo, valor) {
    const novo = { ...prev, [campo]: valor }
    const opcoes = opcoesCorreta(novo)
    if (!opcoes.find(o => o.value === novo.correta)) {
        novo.correta = opcoes[0]?.value ?? '1'
    }
    return novo
}

// ─── Formulário nova pergunta ─────────────────────────────────
function FormQuiz({ onSalvo, onCancelar }) {
    const [form, setForm] = useState({
        pergunta: '', primeira: '', segunda: '', terceira: '', quarta: '',
        ultima_resposta: '', correta: '1',
    })
    const [erro, setErro] = useState('')
    const [salvando, setSalvando] = useState(false)

    function set(campo, valor) { setForm(prev => ajustarCorreta(prev, campo, valor)) }

    async function handleSubmit(e) {
        e.preventDefault()
        setErro('')
        setSalvando(true)
        try {
            await api.post('/api/manager/quiz', form, authHeader())
            onSalvo()
        } catch (err) {
            setErro(err.response?.data?.erro || 'Erro ao salvar.')
        } finally {
            setSalvando(false)
        }
    }

    const campos = [
        { key: 'pergunta',        label: 'Pergunta *',               area: true, req: true  },
        { key: 'primeira',        label: 'Resposta A *',                          req: true  },
        { key: 'segunda',         label: 'Resposta B *',                          req: true  },
        { key: 'terceira',        label: 'Resposta C (opcional)'                             },
        { key: 'quarta',          label: 'Resposta D (opcional)'                             },
        { key: 'ultima_resposta', label: 'Última resposta E (opcional)'                      },
    ]

    return (
        <form onSubmit={handleSubmit} className={styles.formInline}>
            {campos.map(({ key, label, area, req }) => (
                area
                    ? <textarea key={key} className={`${styles.formInput} ${styles.formArea}`}
                        placeholder={label} value={form[key]} rows={2} required={req}
                        onChange={e => set(key, e.target.value)} />
                    : <input key={key} className={styles.formInput} placeholder={label}
                        value={form[key]} required={req}
                        onChange={e => set(key, e.target.value)} />
            ))}
            <div className={styles.formCorreta}>
                <label className={styles.formLabel}>Resposta correta:</label>
                <select className={styles.formInput} value={form.correta}
                    onChange={e => setForm(p => ({ ...p, correta: e.target.value }))}>
                    {opcoesCorreta(form).map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                </select>
            </div>
            {erro && <span className={styles.formErro}>{erro}</span>}
            <div className={styles.formAcoes}>
                <button type='submit' className={styles.btnSalvar} disabled={salvando}>
                    {salvando ? 'Salvando...' : 'Salvar'}
                </button>
                <button type='button' className={styles.btnCancelar} onClick={onCancelar}>Cancelar</button>
            </div>
        </form>
    )
}

// ─── Linha editável: quiz ─────────────────────────────────────
function LinhaEditQuiz({ q, onSalvo, onCancelar }) {
    const [form, setForm] = useState({
        pergunta: q.pergunta, primeira: q.primeira, segunda: q.segunda,
        terceira: q.terceira, quarta: q.quarta,
        ultima_resposta: q.ultima_resposta ?? '',
        correta: String(q.correta), ativo: q.ativo,
    })
    const [salvando, setSalvando] = useState(false)
    const [erro, setErro] = useState('')

    function set(campo, valor) { setForm(prev => ajustarCorreta(prev, campo, valor)) }

    async function handleSalvar() {
        setSalvando(true); setErro('')
        try {
            await api.put(`/api/manager/quiz/${q.id}`, form, authHeader())
            onSalvo()
        } catch (err) {
            setErro(err.response?.data?.erro || 'Erro.')
        } finally {
            setSalvando(false)
        }
    }

    return (
        <tr className={styles.linhaEdit}>
            <td className={styles.centro}>{q.id}</td>
            <td><textarea className={styles.cellInput} value={form.pergunta} rows={2}
                onChange={e => set('pergunta', e.target.value)} /></td>
            {[
                { k: 'primeira', req: true },
                { k: 'segunda',  req: true },
                { k: 'terceira', req: false },
                { k: 'quarta',   req: false },
            ].map(({ k, req }) => (
                <td key={k}><input className={styles.cellInput} value={form[k] ?? ''}
                    placeholder={req ? '' : '—'}
                    onChange={e => set(k, e.target.value)} /></td>
            ))}
            <td><input className={styles.cellInput} value={form.ultima_resposta} placeholder='—'
                onChange={e => set('ultima_resposta', e.target.value)} /></td>
            <td>
                <select className={styles.cellInput} value={form.correta}
                    onChange={e => setForm(p => ({ ...p, correta: e.target.value }))}>
                    {opcoesCorreta(form).map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                </select>
            </td>
            <td>
                <select className={styles.cellInput} value={String(form.ativo)}
                    onChange={e => set('ativo', e.target.value === 'true')}>
                    <option value='true'>Sim</option>
                    <option value='false'>Não</option>
                </select>
            </td>
            <td className={styles.acoesCelula}>
                {erro && <span className={styles.cellErro}>{erro}</span>}
                <button className={styles.btnSalvar} onClick={handleSalvar} disabled={salvando}>
                    {salvando ? '...' : '✓'}
                </button>
                <button className={styles.btnCancelar} onClick={onCancelar}>✕</button>
            </td>
        </tr>
    )
}

// ─── Tabela quiz ──────────────────────────────────────────────
function TabelaQuiz({ perguntas, onAtualizar, onRemover }) {
    const [adicionando, setAdicionando] = useState(false)
    const [editandoId, setEditandoId] = useState(null)

    return (
        <>
            <div className={styles.tabelaHeader}>
                {!adicionando && (
                    <button className={styles.btnAdicionar} onClick={() => setAdicionando(true)}>
                        + Adicionar pergunta
                    </button>
                )}
            </div>
            {adicionando && (
                <FormQuiz
                    onSalvo={() => { setAdicionando(false); onAtualizar() }}
                    onCancelar={() => setAdicionando(false)}
                />
            )}
            <div className={styles.tableWrap}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>#</th><th>Pergunta</th><th>A</th><th>B</th><th>C</th><th>D</th>
                            <th>E (última)</th><th>Correta</th><th>Ativo</th><th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {perguntas.map(q => editandoId === q.id
                            ? <LinhaEditQuiz key={q.id} q={q}
                                onSalvo={() => { setEditandoId(null); onAtualizar() }}
                                onCancelar={() => setEditandoId(null)} />
                            : (
                                <tr key={q.id}>
                                    <td className={styles.centro}>{q.id}</td>
                                    <td className={styles.perguntaCell}>{q.pergunta}</td>
                                    {[q.primeira, q.segunda, q.terceira, q.quarta].map((r, i) => (
                                        <td key={i} className={q.correta === i + 1 ? styles.correta : ''}>{r}</td>
                                    ))}
                                    <td className={q.correta === 5 ? styles.correta : styles.vazio}>
                                        {q.ultima_resposta || '—'}
                                    </td>
                                    <td className={styles.centro}>
                                        <strong className={styles.correta}>{LETRAS[q.correta - 1]}</strong>
                                    </td>
                                    <td className={styles.centro}>
                                        <span className={q.ativo ? styles.ativo : styles.inativo}>
                                            {q.ativo ? 'Sim' : 'Não'}
                                        </span>
                                    </td>
                                    <td className={styles.acoesCelula}>
                                        <button className={styles.btnEditar} onClick={() => setEditandoId(q.id)}>Editar</button>
                                        <button className={styles.btnRemover} onClick={() => onRemover(q.id)}>Remover</button>
                                    </td>
                                </tr>
                            )
                        )}
                        {perguntas.length === 0 && (
                            <tr><td colSpan={10} className={styles.vazio}>Nenhuma pergunta cadastrada.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </>
    )
}

// ─── Dashboard ────────────────────────────────────────────────
const ABAS = ['Clientes', 'Prêmios', 'Quiz', 'Entrega']

function Dashboard({ onLogout }) {
    const [aba, setAba] = useState('Clientes')
    const [stats, setStats] = useState({})
    const [clientes, setClientes] = useState([])
    const [premios, setPremios] = useState([])
    const [quiz, setQuiz] = useState([])
    const [carregando, setCarregando] = useState(false)
    const [erro, setErro] = useState('')

    const carregar = useCallback(async () => {
        setCarregando(true)
        setErro('')
        try {
            const [resStats, resClientes, resPremios, resQuiz] = await Promise.all([
                api.get('/api/manager/stats', authHeader()),
                api.get('/api/manager/clientes', authHeader()),
                api.get('/api/manager/premios', authHeader()),
                api.get('/api/manager/quiz', authHeader()),
            ])
            setStats(resStats.data)
            setClientes(resClientes.data)
            setPremios(resPremios.data)
            setQuiz(resQuiz.data)
        } catch (err) {
            if (err.response?.status === 401) { sessionStorage.removeItem(TOKEN_KEY); onLogout() }
            else setErro('Erro ao carregar dados.')
        } finally {
            setCarregando(false)
        }
    }, [onLogout])

    useEffect(() => { carregar() }, [carregar])

    async function removerPremio(id) {
        if (!id) { carregar(); return }
        if (!confirm('Remover este prêmio?')) return
        try {
            await api.delete(`/api/manager/premios/${id}`, authHeader())
            carregar()
        } catch (err) {
            alert(err.response?.data?.erro || 'Erro ao remover.')
        }
    }

    async function removerQuiz(id) {
        if (!id) { carregar(); return }
        if (!confirm('Remover esta pergunta?')) return
        try {
            await api.delete(`/api/manager/quiz/${id}`, authHeader())
            carregar()
        } catch (err) {
            alert(err.response?.data?.erro || 'Erro ao remover.')
        }
    }

    return (
        <div className={styles.dashboard}>
            <header className={styles.header}>
                <div className={styles.headerTitulo}>
                    <span className={styles.headerDot} />
                    <h1>Game Roleta — Gerenciamento</h1>
                </div>
                <div className={styles.headerAcoes}>
                    <button className={styles.btnAtualizar} onClick={carregar} disabled={carregando}>
                        {carregando ? 'Atualizando...' : '↻ Atualizar'}
                    </button>
                    <button className={styles.btnSair} onClick={() => { sessionStorage.removeItem(TOKEN_KEY); onLogout() }}>
                        Sair
                    </button>
                </div>
            </header>

            {erro && <p className={styles.erroFaixa}>{erro}</p>}

            <Cards stats={stats} />

            <nav className={styles.abas}>
                {ABAS.map(a => (
                    <button key={a} className={`${styles.aba} ${aba === a ? styles.abaAtiva : ''}`}
                        onClick={() => setAba(a)}>
                        {a}
                        {a !== 'Entrega' && (
                            <span className={styles.abaCount}>
                                {a === 'Clientes' ? clientes.length : a === 'Prêmios' ? premios.length : quiz.length}
                            </span>
                        )}
                    </button>
                ))}
            </nav>

            <main className={styles.conteudo}>
                {aba === 'Clientes' && <TabelaClientes clientes={clientes} onAtualizar={carregar} />}
                {aba === 'Prêmios'  && <TabelaPremios  premios={premios}   onAtualizar={carregar} onRemover={removerPremio} />}
                {aba === 'Quiz'     && <TabelaQuiz     perguntas={quiz}    onAtualizar={carregar} onRemover={removerQuiz} />}
                {aba === 'Entrega'  && <TabEntrega />}
            </main>
        </div>
    )
}

// ─── Página principal ─────────────────────────────────────────
export default function Manager() {
    const [autenticado, setAutenticado] = useState(() => !!sessionStorage.getItem(TOKEN_KEY))

    if (!autenticado) return <TelaLogin onLogin={() => setAutenticado(true)} />
    return <Dashboard onLogout={() => setAutenticado(false)} />
}
