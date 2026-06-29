import { useRef, useState, useMemo, useEffect } from 'react'
import { CHANCE_PESOS } from '../../constants/chances'
import styles from './Roleta.module.css'

const DURACAO_SPIN = 9 // segundos
const PRIMARY = import.meta.env.VITE_PRIMARY_COLOR || '#005844'

function hexToHsl(hex) {
    const h = hex.replace('#', '')
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
    const r = parseInt(full.slice(0, 2), 16) / 255
    const g = parseInt(full.slice(2, 4), 16) / 255
    const b = parseInt(full.slice(4, 6), 16) / 255
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    let hue = 0, sat = 0
    const lig = (max + min) / 2
    if (max !== min) {
        const d = max - min
        sat = lig > 0.5 ? d / (2 - max - min) : d / (max + min)
        switch (max) {
            case r: hue = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
            case g: hue = ((b - r) / d + 2) / 6; break
            case b: hue = ((r - g) / d + 4) / 6; break
        }
    }
    return [hue * 360, sat * 100, lig * 100]
}

function gerarVariacoes(hex, n) {
    const [h, s, l] = hexToHsl(hex)
    // Distribui lightness de 18% a 70%, intercala adjacentes para contraste visual
    const spread = Array.from({ length: n }, (_, i) => 18 + (i / Math.max(n - 1, 1)) * 52)
    const result = []
    let lo = 0, hi = n - 1
    while (lo <= hi) {
        result.push(spread[lo++])
        if (lo <= hi) result.push(spread[hi--])
    }
    return result.map((newL, i) => {
        const newS = Math.min(100, Math.max(20, s + (i % 2 === 0 ? 4 : -4)))
        return `hsl(${Math.round(h)}, ${Math.round(newS)}%, ${Math.round(newL)}%)`
    })
}

function peso(p) {
    return CHANCE_PESOS[p.chance] ?? p.chance
}

function sortearVencedor(premios) {
    const total = premios.reduce((acc, p) => acc + peso(p), 0)
    let rand = Math.random() * total
    for (let i = 0; i < premios.length; i++) {
        rand -= peso(premios[i])
        if (rand <= 0) return i
    }
    return premios.length - 1
}

function gerarGradiente(n, cores) {
    const partes = Array.from({ length: n }, (_, i) => {
        const ini = ((i / n) * 100).toFixed(2)
        const fim = (((i + 1) / n) * 100).toFixed(2)
        return `${cores[i % cores.length]} ${ini}% calc(${fim}% - 0.4%), white calc(${fim}% - 0.4%) ${fim}%`
    })
    return `conic-gradient(${partes.join(', ')})`
}

// premioForcado: { id, nome, subnome } — quando definido, roleta só exibe (sem sorteio client-side)
export default function Roleta({ premios, onPremioSorteado, onGirar, premioForcado }) {
    const wheelRef = useRef(null)
    const [girando, setGirando] = useState(false)
    const cores = useMemo(() => gerarVariacoes(PRIMARY, premios.length || 9), [premios.length])
    const gradiente = useMemo(() => gerarGradiente(premios.length, cores), [premios.length, cores])
    const sectorAngle = premios.length > 0 ? 360 / premios.length : 0

    // Modo display: quando há premioForcado, aguarda 2s e gira automaticamente
    useEffect(() => {
        if (!premioForcado || !wheelRef.current || girando || premios.length === 0) return

        const indexVencedor = premios.findIndex(p => p.id === premioForcado.id)
        if (indexVencedor < 0) return

        const delay = setTimeout(() => {
            setGirando(true)
            if (onGirar) onGirar()

            const angulo = 10 * 360 - (indexVencedor + 0.5) * sectorAngle
            wheelRef.current.style.transition = `transform ${DURACAO_SPIN}s cubic-bezier(0.05, 0.05, 0.05, 0.95)`
            wheelRef.current.style.transform = `translate(-50%, -50%) rotate(${angulo}deg)`
        }, 2000)

        const timer = setTimeout(() => {
            onPremioSorteado(premioForcado)
        }, 2000 + DURACAO_SPIN * 1000 + 600)

        return () => { clearTimeout(delay); clearTimeout(timer) }
    }, [premioForcado, premios])  // eslint-disable-line

    function girar() {
        if (girando || !wheelRef.current || premioForcado) return
        setGirando(true)
        if (onGirar) onGirar()

        const indexVencedor = sortearVencedor(premios)
        const angulo = 10 * 360 - (indexVencedor + 0.5) * sectorAngle

        wheelRef.current.style.transition = `transform ${DURACAO_SPIN}s cubic-bezier(0.05, 0.05, 0.05, 0.95)`
        wheelRef.current.style.transform = `translate(-50%, -50%) rotate(${angulo}deg)`

        setTimeout(() => {
            onPremioSorteado(premios[indexVencedor])
        }, DURACAO_SPIN * 1000 + 600)
    }

    if (premios.length === 0) {
        return <div style={{ color: 'var(--primary)', textAlign: 'center', paddingTop: '40vh', fontSize: '2.2vh' }}>Carregando prêmios...</div>
    }

    const labelRadius = 35.22 // % of circle width (31/88 * 100)

    return (
        <div className={styles.roletaPlace}>
            <div className={styles.ponteiro} />

            <div
                ref={wheelRef}
                className={styles.circle}
                style={{ background: gradiente }}
            >
                {premios.map((premio, i) => {
                    const rad = (sectorAngle * (i + 0.5)) * (Math.PI / 180)
                    const x = Math.sin(rad) * labelRadius
                    const y = -Math.cos(rad) * labelRadius
                    const rotTexto = sectorAngle * (i + 0.5)

                    return (
                        <div
                            key={i}
                            className={styles.setorLabel}
                            style={{
                                left: `calc(50% + ${x.toFixed(2)}%)`,
                                top: `calc(50% + ${y.toFixed(2)}%)`,
                                transform: `translate(-50%, -50%) rotate(${rotTexto}deg)`,
                            }}
                        >
                            <span className={styles.labelNome}>{premio.nome}</span>
                            {premio.subnome && (
                                <span className={styles.labelSub}>{premio.subnome}</span>
                            )}
                        </div>
                    )
                })}
            </div>

            <div className={styles.centro} />

            {/* Botão só aparece em modo livre (sem premioForcado) */}
            {!premioForcado && (
                <div className={styles.botaoArea}>
                    <button
                        className={styles.btnGirar}
                        onClick={girar}
                        disabled={girando}
                    >
                        {girando ? 'GIRANDO...' : 'GIRAR'}
                    </button>
                </div>
            )}

            {/* Modo display: instrução visual enquanto não gira */}
            {premioForcado && !girando && (
                <div className={styles.botaoArea}>
                    <p style={{ color: 'var(--primary)', fontSize: '2.5vh', textAlign: 'center', fontWeight: 600 }}>
                        Aguarde o resultado...
                    </p>
                </div>
            )}
        </div>
    )
}
