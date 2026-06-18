const express = require('express')
const router = express.Router()
const pool = require('../db/connection')

const TENANT_ID = parseInt(process.env.TENANT_ID || '2')

// Pesos do sorteio — escala não-linear (mesmos valores do frontend)
const CHANCE_PESOS = { 1: 0.2, 2: 1, 3: 2, 4: 4, 5: 7, 6: 10 }

function peso(p) {
    return CHANCE_PESOS[p.chance] ?? p.chance
}

function sortearPremio(premios) {
    const total = premios.reduce((acc, p) => acc + peso(p), 0)
    let rand = Math.random() * total
    for (const p of premios) {
        rand -= peso(p)
        if (rand <= 0) return p
    }
    return premios[premios.length - 1]
}

function gerarCodigo() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    const num = String(Math.floor(10000 + Math.random() * 90000))
    const suffix = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    return `EVT-${num}-${suffix}`
}

// POST /api/palpite — submete palpite, sorteia prize server-side
router.post('/', async (req, res) => {
    const { clienteId, palpite } = req.body

    if (!clienteId) {
        return res.status(400).json({ erro: 'clienteId obrigatório.' })
    }

    const client = await pool.connect()
    try {
        await client.query('BEGIN')

        // Verifica cliente existe no tenant
        const clienteRes = await client.query(
            'SELECT id, nome FROM clientes WHERE id = $1 AND tenant_id = $2',
            [clienteId, TENANT_ID]
        )
        if (clienteRes.rows.length === 0) {
            await client.query('ROLLBACK')
            return res.status(404).json({ erro: 'Participante não encontrado.' })
        }

        // Verifica se já fez palpite (partida existente)
        const jaJogou = await client.query(
            'SELECT id FROM partidas WHERE cliente_id = $1 AND tenant_id = $2 FOR UPDATE',
            [clienteId, TENANT_ID]
        )
        if (jaJogou.rows.length > 0) {
            await client.query('ROLLBACK')
            return res.status(403).json({ erro: 'Palpite já registrado.' })
        }

        // Busca prêmios ativos com estoque disponível
        const premiosRes = await client.query(`
            SELECT p.id, p.nome, p.subnome, p.chance
            FROM premios p
            LEFT JOIN (
                SELECT premio_id, COUNT(*) AS sorteados
                FROM partidas
                WHERE premio_id IS NOT NULL AND tenant_id = $1
                GROUP BY premio_id
            ) s ON s.premio_id = p.id
            WHERE p.ativo = true AND p.tenant_id = $1
              AND (p.quantidade IS NULL OR COALESCE(s.sorteados, 0) < p.quantidade)
        `, [TENANT_ID])

        if (premiosRes.rows.length === 0) {
            await client.query('ROLLBACK')
            return res.status(422).json({ erro: 'Nenhum prêmio disponível no momento.' })
        }

        // Sorteio server-side
        const premioSorteado = sortearPremio(premiosRes.rows)

        // Gera código único
        let codigo = null
        for (let i = 0; i < 5; i++) {
            const tentativa = gerarCodigo()
            const existe = await client.query('SELECT id FROM partidas WHERE codigo = $1', [tentativa])
            if (existe.rows.length === 0) { codigo = tentativa; break }
        }
        if (!codigo) {
            await client.query('ROLLBACK')
            return res.status(500).json({ erro: 'Erro ao gerar código.' })
        }

        // Registra partida com prêmio já determinado
        const partida = await client.query(
            `INSERT INTO partidas (cliente_id, tenant_id, quiz_acertos, premio_id, codigo, status, params)
             VALUES ($1, $2, 0, $3, $4, 'premio_disponivel', $5)
             RETURNING id`,
            [clienteId, TENANT_ID, premioSorteado.id, codigo, JSON.stringify({ palpite: palpite ?? null })]
        )

        // Desativa prêmio se esgotou
        const contagem = await client.query(`
            SELECT p.quantidade, COUNT(pa.id) AS sorteados
            FROM premios p
            LEFT JOIN partidas pa ON pa.premio_id = p.id
            WHERE p.id = $1
            GROUP BY p.id, p.quantidade
        `, [premioSorteado.id])
        const row = contagem.rows[0]
        if (row?.quantidade && parseInt(row.sorteados) >= parseInt(row.quantidade)) {
            await client.query('UPDATE premios SET ativo = false WHERE id = $1', [premioSorteado.id])
        }

        await client.query('COMMIT')

        res.status(201).json({
            partidaId: partida.rows[0].id,
            codigo,
            premioId: premioSorteado.id,
            premioNome: premioSorteado.nome,
            premioSub: premioSorteado.subnome,
            premios: premiosRes.rows,
        })
    } catch (err) {
        await client.query('ROLLBACK')
        console.error('Erro no palpite:', err.message)
        res.status(500).json({ erro: 'Erro interno.' })
    } finally {
        client.release()
    }
})

module.exports = router
