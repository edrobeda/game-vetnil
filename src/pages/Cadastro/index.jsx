import { useState, useEffect, useRef } from 'react'
import { QRCode } from 'react-qr-code'
import api from '../../services/api'
import styles from './Cadastro.module.css'

const STORAGE_KEY = 'gr_cpf'

const PERFIS = [
    'Agrônomo', 'Criador/Proprietário de Animais', 'Estudante de Veterinária',
    'Lojista', 'Tratador de Cavalos', 'Veterinário de Equinos', 'Zootecnista', 'Outros',
]

const CHANCE_PESOS = { 1: 0.2, 2: 1, 3: 2, 4: 4, 5: 7, 6: 10 }
const CORES = ['#005844','#488B53','#58A561','#006742','#DC785A','#B7C922','#5C5B60','#C3630A','#AC0C17']
const DURACAO_SPIN = 9

function formatarCpf(v) {
    return v.replace(/\D/g, '').slice(0, 11)
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}
function formatarTel(v) {
    return v.replace(/\D/g, '').slice(0, 11)
        .replace(/(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{5})(\d{1,4})$/, '$1-$2')
}
function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5) }
function gerarGradiente(n, cores) {
    return 'conic-gradient(' + Array.from({ length: n }, (_, i) => {
        const ini = ((i / n) * 100).toFixed(2)
        const fim = (((i + 1) / n) * 100).toFixed(2)
        return `${cores[i % cores.length]} ${ini}% calc(${fim}% - 0.1%), white calc(${fim}% - 0.1%) ${fim}%`
    }).join(', ') + ')'
}

// ─── Mini Roleta inline (display only) ───────────────────────
function RoletaInline({ premios, premioForcado, onFim, titulo }) {
    const wheelRef = useRef(null)
    const [girou, setGirou] = useState(false)
    const cores = useRef(shuffle(CORES)).current
    const gradiente = gerarGradiente(premios.length, cores)
    const sectorAngle = premios.length > 0 ? 360 / premios.length : 0

    function girar() {
        if (girou || !wheelRef.current || premios.length === 0) return
        const idx = premios.findIndex(p => p.id === premioForcado.id)
        if (idx < 0) return
        setGirou(true)
        const angulo = 10 * 360 - (idx + 0.5) * sectorAngle
        wheelRef.current.style.transition = `transform ${DURACAO_SPIN}s cubic-bezier(0.05,0.05,0.05,0.95)`
        wheelRef.current.style.transform = `translate(-50%,-50%) rotate(${angulo}deg)`
        setTimeout(onFim, DURACAO_SPIN * 1000 + 600)
    }

    useEffect(() => {
        if (!premioForcado || premios.length === 0) return
        const t = setTimeout(girar, 2000)
        return () => clearTimeout(t)
    }, [premioForcado, premios]) // eslint-disable-line

    return (
        <div className={styles.roletaBox}>
        {titulo && <h2 style={{ color: '#fff', fontSize: '2.8vh', fontWeight: 700, margin: 0, textAlign: 'center' }}>{titulo}</h2>}
        <div className={styles.roletaWrap}>
            {/* Ponteiro */}
            <div style={{
                position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)',
                width: 0, height: 0,
                borderLeft: '14px solid transparent', borderRight: '14px solid transparent',
                borderTop: '28px solid #C3630A', zIndex: 10,
            }} />
            {/* Roda */}
            <div ref={wheelRef} style={{
                position: 'absolute', top: '50%', left: '50%',
                width: '100%', height: '100%',
                borderRadius: '50%', background: gradiente,
                transform: 'translate(-50%,-50%)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            }}>
                {premios.map((p, i) => {
                    const rad = (sectorAngle * (i + 0.5)) * (Math.PI / 180)
                    // posicionamento em % do container — escala com qualquer tamanho
                    const x = Math.sin(rad) * 34
                    const y = -Math.cos(rad) * 34
                    return (
                        <div key={i} style={{
                            position: 'absolute',
                            left: `calc(50% + ${x}%)`,
                            top: `calc(50% + ${y}%)`,
                            transform: `translate(-50%,-50%) rotate(${sectorAngle * (i + 0.5)}deg)`,
                            textAlign: 'center', pointerEvents: 'none', width: '22%',
                        }}>
                            <div style={{ color: '#fff', fontWeight: 700, fontSize: '1.5rem', textShadow: '0 1px 2px rgba(0,0,0,0.7)', lineHeight: 1.1 }}>
                                {p.nome}
                            </div>
                            {p.subnome && (
                                <div style={{ color: '#fff', fontWeight: 500, fontSize: '1rem', textShadow: '0 1px 2px rgba(0,0,0,0.7)', lineHeight: 1.1, opacity: 0.9 }}>
                                    {p.subnome}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
            {/* Centro */}
            <div style={{
                position: 'absolute', top: '50%', left: '50%',
                width: '12%', height: '12%',
                background: '#fff', borderRadius: '50%',
                transform: 'translate(-50%,-50%)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)', zIndex: 5,
            }} />
        </div>
        </div>
    )
}

// ─── Tela 0: Boas-vindas ─────────────────────────────────────
function TelaBoasVindas({ onAvancar }) {
    return (
        <div className={styles.container}>
            <div className={styles.card}>
                <div style={{ fontSize: '4vh', marginBottom: '1vh' }}>🔬</div>
                <h1 className={styles.titulo} style={{ fontSize: '3vh' }}>Bem-vindo à Vetnil!</h1>
                <p className={styles.subtitulo} style={{ marginBottom: '2.5vh' }}>
                    Participe da nossa ação e concorra a um <strong>Super Microscópio</strong>!
                </p>

                <div style={{ width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '1.5vh', marginBottom: '3vh' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.2vw' }}>
                        <span style={{ fontSize: '2.2vh', minWidth: '2.8vh' }}>1️⃣</span>
                        <p style={{ margin: 0, fontSize: '1.8vh', color: '#444', lineHeight: 1.4 }}>
                            <strong>Cadastro</strong> — informe seus dados para participar
                        </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.2vw' }}>
                        <span style={{ fontSize: '2.2vh', minWidth: '2.8vh' }}>2️⃣</span>
                        <p style={{ margin: 0, fontSize: '1.8vh', color: '#444', lineHeight: 1.4 }}>
                            <strong>Palpite</strong> — dê o seu palpite e participe do sorteio
                        </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.2vw' }}>
                        <span style={{ fontSize: '2.2vh', minWidth: '2.8vh' }}>3️⃣</span>
                        <p style={{ margin: 0, fontSize: '1.8vh', color: '#444', lineHeight: 1.4 }}>
                            <strong>Roleta</strong> — gire e descubra seu prêmio na hora!
                        </p>
                    </div>
                </div>

                <div style={{
                    background: '#f0f7f4', borderRadius: '1vh', padding: '1.5vh 3vw',
                    width: '100%', marginBottom: '2.5vh',
                }}>
                    <p style={{ margin: 0, fontSize: '1.6vh', color: '#005844', lineHeight: 1.5, textAlign: 'center' }}>
                        O prêmio é retirado <strong>no stand da Vetnil</strong> nesta feira,<br />
                        mediante apresentação do seu <strong>CPF</strong>.
                    </p>
                </div>

                <button className={styles.botao} onClick={onAvancar}>
                    QUERO PARTICIPAR
                </button>
            </div>
        </div>
    )
}

// ─── Tela 1: Identificação ────────────────────────────────────
function TelaIdentificacao({ onEncontrado, onNaoEncontrado }) {
    const [cpf, setCpf]           = useState('')
    const [buscando, setBuscando] = useState(false)
    const [erro, setErro]         = useState('')

    async function handleContinuar(e) {
        e.preventDefault()
        const limpo = cpf.replace(/\D/g, '')
        if (limpo.length !== 11) { setErro('CPF inválido.'); return }
        setErro('')
        setBuscando(true)
        try {
            const { data } = await api.get(`/api/cliente/status/${limpo}`)
            localStorage.setItem(STORAGE_KEY, limpo)
            onEncontrado(data)
        } catch (err) {
            if (err.response?.status === 404) {
                onNaoEncontrado(cpf)
            } else {
                setErro(err.response?.data?.erro || 'Erro ao verificar.')
            }
        } finally {
            setBuscando(false)
        }
    }

    return (
        <div className={styles.container}>
            <div className={styles.card}>
                <h1 className={styles.titulo}>Bem-vindo!</h1>
                <p className={styles.subtitulo}>Digite seu CPF para participar</p>
                <form onSubmit={handleContinuar} className={styles.form}>
                    <div className={styles.campo}>
                        <label htmlFor='cpf'>CPF</label>
                        <input id='cpf' type='text' value={cpf}
                            onChange={e => setCpf(formatarCpf(e.target.value))}
                            placeholder='000.000.000-00' autoComplete='off' inputMode='numeric' />
                    </div>
                    {erro && <p className={styles.erro}>{erro}</p>}
                    <button type='submit' className={styles.botao} disabled={buscando}>
                        {buscando ? 'Verificando...' : 'CONTINUAR'}
                    </button>
                </form>
            </div>
        </div>
    )
}

// ─── Tela 2: Cadastro ─────────────────────────────────────────
function TelaCadastro({ cpfInicial, onCadastrado }) {
    const [form, setForm] = useState({ nome: '', cpf: cpfInicial || '', telefone: '', email: '', perfil: '' })
    const [erro, setErro]             = useState('')
    const [carregando, setCarregando] = useState(false)

    function handleChange(e) {
        const { name, value } = e.target
        setForm(prev => ({
            ...prev,
            [name]: name === 'cpf' ? formatarCpf(value) : name === 'telefone' ? formatarTel(value) : value,
        }))
    }

    async function handleSubmit(e) {
        e.preventDefault()
        if (!form.nome || !form.cpf || !form.telefone) { setErro('Nome, CPF e telefone são obrigatórios.'); return }
        setErro('')
        setCarregando(true)
        try {
            const { data } = await api.post('/api/cliente', form)
            const limpo = form.cpf.replace(/\D/g, '')
            localStorage.setItem(STORAGE_KEY, limpo)
            onCadastrado({ id: data.id, nome: form.nome, cpf: limpo, partida: null })
        } catch (err) {
            setErro(err.response?.data?.erro || 'Erro ao cadastrar.')
        } finally {
            setCarregando(false)
        }
    }

    return (
        <div className={styles.container}>
            <div className={styles.card}>
                <h1 className={styles.titulo}>Cadastro</h1>
                <p className={styles.subtitulo}>Preencha seus dados para participar</p>
                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.campo}>
                        <label>CPF *</label>
                        <input name='cpf' value={form.cpf} onChange={handleChange} placeholder='000.000.000-00' inputMode='numeric' autoComplete='off' />
                    </div>
                    <div className={styles.campo}>
                        <label>Nome completo *</label>
                        <input name='nome' value={form.nome} onChange={handleChange} autoComplete='off' />
                    </div>
                    <div className={styles.campo}>
                        <label>Telefone *</label>
                        <input name='telefone' value={form.telefone} onChange={handleChange} placeholder='(00) 00000-0000' inputMode='tel' autoComplete='off' />
                    </div>
                    <div className={styles.campo}>
                        <label>E-mail <span className={styles.opcional}>(opcional)</span></label>
                        <input name='email' type='email' value={form.email} onChange={handleChange} autoComplete='off' />
                    </div>
                    <div className={styles.campo}>
                        <label>Perfil <span className={styles.opcional}>(opcional)</span></label>
                        <select name='perfil' value={form.perfil} onChange={handleChange}>
                            <option value=''>Selecione...</option>
                            {PERFIS.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                    {erro && <p className={styles.erro}>{erro}</p>}
                    <button type='submit' className={styles.botao} disabled={carregando}>
                        {carregando ? 'Cadastrando...' : 'CADASTRAR'}
                    </button>
                </form>
            </div>
        </div>
    )
}

// ─── Tela 3: Palpite ─────────────────────────────────────────
function TelaPalpite({ nomeCliente, clienteId, onPalpiteEnviado }) {
    const [resposta, setResposta] = useState('')
    const [enviando, setEnviando] = useState(false)
    const [erro, setErro]         = useState('')

    async function handleEnviar(e) {
        e.preventDefault()
        if (!resposta.trim()) { setErro('Informe seu palpite.'); return }
        setErro('')
        setEnviando(true)
        try {
            const { data } = await api.post('/api/palpite', { clienteId, palpite: resposta.trim() })
            onPalpiteEnviado(data, resposta.trim())
        } catch (err) {
            setErro(err.response?.data?.erro || 'Erro ao enviar palpite.')
            setEnviando(false)
        }
    }

    return (
        <div className={styles.container}>
            <div className={styles.card}>
                <h1 className={styles.titulo}>Seu Palpite</h1>
                <p className={styles.subtitulo}>Olá, {nomeCliente}! Quantas células você vê no recipiente?</p>

                {/* Espaço para imagem do evento */}
                <div style={{
                    width: '100%', aspectRatio: '16/9',
                    background: '#f0f0f0', borderRadius: '1vh',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: '2vh', color: '#aaa', fontSize: '1.6vh',
                }}>
                    [imagem do recipiente]
                </div>

                <form onSubmit={handleEnviar} className={styles.form}>
                    <div className={styles.campo}>
                        <label>Quantidade de células</label>
                        <input
                            type='number' inputMode='numeric'
                            placeholder='Ex: 150'
                            value={resposta}
                            onChange={e => setResposta(e.target.value)}
                            autoComplete='off'
                            style={{ fontSize: '3vh', textAlign: 'center', fontWeight: 700 }}
                        />
                    </div>
                    {erro && <p className={styles.erro}>{erro}</p>}
                    <button type='submit' className={styles.botao} disabled={enviando}>
                        {enviando ? 'Enviando...' : 'CONFIRMAR PALPITE'}
                    </button>
                </form>
            </div>
        </div>
    )
}

// ─── Tela 4: Roleta ──────────────────────────────────────────
function TelaRoleta({ premios, premioForcado, onFim }) {
    const [encerrado, setEncerrado] = useState(false)

    return (
        <div className={styles.telaRoleta}>
            <RoletaInline
                premios={premios}
                premioForcado={premioForcado}
                titulo={encerrado ? '🎉 Parabéns!' : 'Gire a roleta!'}
                onFim={() => { setEncerrado(true); setTimeout(onFim, 1200) }}
            />
        </div>
    )
}

// ─── Tela 5: Resultado ────────────────────────────────────────
function TelaResultado({ partida, nomeCliente, onReiniciar }) {
    return (
        <div className={styles.container}>
            <div className={styles.card}>
                <div className={styles.statusIcone}>🎉</div>
                <h2 className={styles.statusTitulo}>Você ganhou!</h2>
                <p className={styles.premioNome}>{partida.premio_nome || partida.premioNome}</p>
                {(partida.premio_sub || partida.premioSub) && (
                    <p className={styles.premioSub}>{partida.premio_sub || partida.premioSub}</p>
                )}
                {(partida.palpite ?? partida.params?.palpite) && (
                    <p style={{ fontSize: '1.6vh', color: '#888', margin: '0.5vh 0 0' }}>
                        Seu palpite: <strong style={{ color: '#005844' }}>{partida.palpite ?? partida.params?.palpite} células</strong>
                    </p>
                )}
                <div className={styles.codigoBox}>
                    <span className={styles.codigoLabel}>Código</span>
                    <span className={styles.codigo}>{partida.codigo}</span>
                </div>
                <div className={styles.qrBox}>
                    <QRCode value={partida.codigo} size={200} />
                </div>
                <p className={styles.statusDica}>
                    Apresente este QR Code ou código no balcão de retirada.
                </p>
                <div className={styles.nomeCliente}>{nomeCliente}</div>
                <button className={styles.botaoSecundario} onClick={onReiniciar} style={{ marginTop: '2vh' }}>
                    Início
                </button>
            </div>
        </div>
    )
}

// ─── Página principal ─────────────────────────────────────────
export default function Cadastro() {
    // telas: boasvindas | identificacao | cadastro | palpite | roleta | resultado
    const [tela, setTela]                   = useState('boasvindas')
    const [clienteId, setClienteId]         = useState(null)
    const [nomeCliente, setNomeCliente]     = useState('')
    const [cpfPendente, setCpfPendente]     = useState('')
    const [premios, setPremios]             = useState([])
    const [premioForcado, setPremioForcado] = useState(null)
    const [partida, setPartida]             = useState(null)

    function irParaPalpite(id, nome) {
        setClienteId(id)
        setNomeCliente(nome)
        setTela('palpite')
    }

    function handleEncontrado(dados) {
        const { cliente, partida: p } = dados
        if (p && p.status === 'premio_disponivel') {
            // Já jogou e ganhou — vai direto pro resultado
            setNomeCliente(cliente.nome)
            setPartida({ ...p, premio_nome: p.premio_nome, premio_sub: p.premio_sub })
            setTela('resultado')
        } else if (p) {
            // Já jogou — mostra o resultado
            setNomeCliente(cliente.nome)
            setPartida(p)
            setTela('resultado')
        } else {
            // Cadastrado mas ainda não jogou
            irParaPalpite(cliente.id, cliente.nome)
        }
    }

    function handleNaoEncontrado(cpf) {
        setCpfPendente(cpf)
        setTela('cadastro')
    }

    function handleCadastrado(dados) {
        irParaPalpite(dados.id, dados.nome)
    }

    function handlePalpiteEnviado(data, palpite) {
        setPremios(data.premios || [])
        setPremioForcado({ id: data.premioId, nome: data.premioNome, subnome: data.premioSub })
        setPartida({ codigo: data.codigo, premio_nome: data.premioNome, premio_sub: data.premioSub, palpite })
        setTela('roleta')
    }

    function reiniciar() {
        localStorage.removeItem(STORAGE_KEY)
        setTela('identificacao')
        setClienteId(null)
        setNomeCliente('')
        setCpfPendente('')
        setPremios([])
        setPremioForcado(null)
        setPartida(null)
    }

    if (tela === 'boasvindas') return (
        <TelaBoasVindas onAvancar={() => setTela('identificacao')} />
    )
    if (tela === 'identificacao') return (
        <TelaIdentificacao onEncontrado={handleEncontrado} onNaoEncontrado={handleNaoEncontrado} />
    )
    if (tela === 'cadastro') return (
        <TelaCadastro cpfInicial={cpfPendente} onCadastrado={handleCadastrado} />
    )
    if (tela === 'palpite') return (
        <TelaPalpite nomeCliente={nomeCliente} clienteId={clienteId} onPalpiteEnviado={handlePalpiteEnviado} />
    )
    if (tela === 'roleta') return (
        <TelaRoleta
            premios={premios}
            premioForcado={premioForcado}
            onFim={() => setTela('resultado')}
        />
    )
    if (tela === 'resultado') return (
        <TelaResultado partida={partida} nomeCliente={nomeCliente} onReiniciar={reiniciar} />
    )

    return null
}
