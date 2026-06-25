import { useState, useEffect, useCallback } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import api from './services/api'
import Cadastro from './pages/Cadastro'
import Jogo     from './pages/Jogo'
import Manager  from './pages/Manager'
import Entrega  from './pages/Entrega'
import LGPD     from './pages/LGPD'

const POLL_MS = 60_000

const tela = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    width: '100vw',
    background: 'var(--primary)',
    color: '#fff',
    fontFamily: 'inherit',
    textAlign: 'center',
    padding: '2rem',
    gap: '1.25rem',
}

const iconStyle = { opacity: 0.55 }

const MOTIVO_MSG = {
    agendado:             { titulo: 'Evento ainda não iniciado',  sub: 'O evento ainda não começou. Volte mais tarde.' },
    encerrado:            { titulo: 'Evento encerrado',           sub: 'Este evento já foi encerrado. Obrigado pela participação!' },
    evento_nao_encontrado:{ titulo: 'Evento não encontrado',      sub: 'Nenhum evento vinculado a esta chave.' },
}

function IconClock() {
    return (
        <svg style={iconStyle} width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
        </svg>
    )
}

function IconLock() {
    return (
        <svg style={iconStyle} width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
    )
}

function IconBlock() {
    return (
        <svg style={iconStyle} width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
        </svg>
    )
}

function IconSignalOff() {
    return (
        <svg style={iconStyle} width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="1" y1="1" x2="23" y2="23"/>
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
            <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
            <line x1="12" y1="20" x2="12.01" y2="20"/>
        </svg>
    )
}

function TelaCarregando() {
    return (
        <div style={tela}>
            <IconClock />
            <p style={{ fontSize: '1.1rem', opacity: 0.75, margin: 0 }}>Verificando disponibilidade...</p>
        </div>
    )
}

function TelaRevogada() {
    return (
        <div style={tela}>
            <IconLock />
            <div>
                <h2 style={{ margin: '0 0 8px', fontSize: '1.4rem', fontWeight: 700 }}>Acesso encerrado</h2>
                <p style={{ margin: 0, opacity: 0.7, maxWidth: 300, fontSize: '0.95rem', lineHeight: 1.55 }}>
                    A sessão foi revogada. Entre em contato com o organizador do evento.
                </p>
            </div>
        </div>
    )
}

function TelaInativa({ motivo }) {
    const msg = MOTIVO_MSG[motivo] ?? { titulo: 'Jogo indisponível', sub: 'Este jogo não está disponível no momento.' }
    return (
        <div style={tela}>
            <IconBlock />
            <div>
                <h2 style={{ margin: '0 0 8px', fontSize: '1.4rem', fontWeight: 700 }}>{msg.titulo}</h2>
                <p style={{ margin: 0, opacity: 0.7, maxWidth: 320, fontSize: '0.95rem', lineHeight: 1.55 }}>{msg.sub}</p>
            </div>
        </div>
    )
}

function TelaErro({ onRetry }) {
    return (
        <div style={tela}>
            <IconSignalOff />
            <div>
                <h2 style={{ margin: '0 0 8px', fontSize: '1.4rem', fontWeight: 700 }}>Sem conexão</h2>
                <p style={{ margin: 0, opacity: 0.7, maxWidth: 300, fontSize: '0.95rem', lineHeight: 1.55 }}>
                    Não foi possível conectar ao servidor.
                </p>
            </div>
            <button
                onClick={onRetry}
                style={{
                    marginTop: '0.25rem', padding: '0.75rem 2.5rem',
                    background: 'rgba(255,255,255,0.15)', color: '#fff',
                    border: '1px solid rgba(255,255,255,0.35)', borderRadius: 10,
                    fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer',
                    fontFamily: 'inherit',
                }}
            >
                Tentar novamente
            </button>
        </div>
    )
}

export default function App() {
    const location = useLocation()
    const [status, setStatus] = useState('carregando')
    const [motivo, setMotivo] = useState(null)

    if (location.pathname === '/lgpd') return <LGPD />

    const verificarStatus = useCallback(async () => {
        try {
            const { data } = await api.get('/api/game/status')
            setStatus(data.ativo ? 'ativo' : 'inativo')
            setMotivo(data.motivo)
        } catch (err) {
            if (err.response?.status === 401) {
                setStatus('revogado')
            } else {
                setStatus(prev => prev === 'carregando' ? 'erro' : prev)
            }
        }
    }, [])

    useEffect(() => {
        verificarStatus()
        const id = setInterval(verificarStatus, POLL_MS)
        return () => clearInterval(id)
    }, [verificarStatus])

    if (status === 'carregando') return <TelaCarregando />
    if (status === 'revogado')   return <TelaRevogada />
    if (status === 'inativo')    return <TelaInativa motivo={motivo} />
    if (status === 'erro')       return <TelaErro onRetry={verificarStatus} />

    return (
        <Routes>
            <Route path='/'         element={<Navigate to='/cadastro' replace />} />
            <Route path='/cadastro' element={<Cadastro />} />
            <Route path='/jogo'     element={<Jogo />} />
            <Route path='/manager'  element={<Manager />} />
            <Route path='/entrega'  element={<Entrega />} />
        </Routes>
    )
}
