const express = require('express')
const router  = express.Router()
const pool    = require('../db/connection')

const TENANT_ID      = parseInt(process.env.TENANT_ID || '2')
const MIN_ACERTOS    = parseInt(process.env.QUIZ_MIN_ACERTOS || '3')
const CHANCE_PESOS   = { 1: 0.2, 2: 1, 3: 2, 4: 4, 5: 7, 6: 10 }

function peso(p) { return CHANCE_PESOS[p.chance] ?? p.chance }

function sortearPremio(premios) {
    const total = premios.reduce((acc, p) => acc + peso(p), 0)
    let rand = Math.random() * total
    for (const p of premios) {
        rand -= peso(p)
        if (rand <= 0) return p
    }
    return premios[premios.length - 1]
}

const GAME_PREFIX = process.env.GAME_PREFIX || 'EVT'

function gerarCodigo() {
    const hex = Array.from({ length: 5 }, () => '0123456789ABCDEF'[Math.floor(Math.random() * 16)]).join('')
    return `${GAME_PREFIX}-${hex}`
}

// GET /api/quiz — perguntas sem revelar a resposta correta
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, pergunta, primeira, segunda, terceira, quarta, ultima_resposta
             FROM quiz
             WHERE ativo = true AND tenant_id = $1
             ORDER BY RANDOM()
             LIMIT 3`,
            [TENANT_ID]
        )

        const perguntas = result.rows.map((q) => {
            const respostas = []
            if (q.primeira)        respostas.push({ texto: q.primeira })
            if (q.segunda)         respostas.push({ texto: q.segunda })
            if (q.terceira)        respostas.push({ texto: q.terceira })
            if (q.quarta)          respostas.push({ texto: q.quarta })
            if (q.ultima_resposta) respostas.push({ texto: q.ultima_resposta, isUltima: true })
            return { id: q.id, pergunta: q.pergunta, respostas }
        })

        res.json(perguntas)
    } catch (err) {
        console.error('Erro ao buscar quiz:', err.message)
        res.status(500).json({ erro: 'Erro interno.' })
    }
})

// POST /api/quiz/responder — submete respostas, sorteia prêmio e cria partida
router.post('/responder', async (req, res) => {
    const { clienteId, respostas } = req.body

    if (!clienteId || !Array.isArray(respostas) || respostas.length === 0) {
        return res.status(400).json({ erro: 'clienteId e respostas são obrigatórios.' })
    }

    const client = await pool.connect()
    try {
        await client.query('BEGIN')

        // Valida cliente
        const clienteRes = await client.query(
            'SELECT id, nome FROM clientes WHERE id = $1 AND tenant_id = $2',
            [clienteId, TENANT_ID]
        )
        if (clienteRes.rows.length === 0) {
            await client.query('ROLLBACK')
            return res.status(404).json({ erro: 'Participante não encontrado.' })
        }

        // Garante que não jogou ainda
        const jaJogou = await client.query(
            'SELECT id FROM partidas WHERE cliente_id = $1 AND tenant_id = $2 FOR UPDATE',
            [clienteId, TENANT_ID]
        )
        if (jaJogou.rows.length > 0) {
            await client.query('ROLLBACK')
            return res.status(403).json({ erro: 'Participante já jogou.' })
        }

        // Busca gabaritos das perguntas respondidas
        const ids = respostas.map(r => r.quizId)
        const gabRes = await client.query(
            `SELECT id, correta, primeira, segunda, terceira, quarta, ultima_resposta
             FROM quiz WHERE id = ANY($1) AND tenant_id = $2`,
            [ids, TENANT_ID]
        )

        // Calcula acertos
        const COLUNAS = ['primeira', 'segunda', 'terceira', 'quarta', 'ultima_resposta']
        let acertos = 0
        for (const gab of gabRes.rows) {
            const resp = respostas.find(r => r.quizId === gab.id)
            if (!resp) continue
            const ativas = COLUNAS.filter(col => gab[col])
            const corretaColuna = COLUNAS[gab.correta - 1]
            const corretaIdx = ativas.indexOf(corretaColuna)
            if (resp.respostaIndex === corretaIdx) acertos++
        }

        // Caminho de falha: registra partida sem prêmio e encerra
        if (acertos < MIN_ACERTOS) {
            await client.query(
                `INSERT INTO partidas (cliente_id, tenant_id, quiz_acertos, premio_id, codigo, status)
                 VALUES ($1, $2, $3, NULL, NULL, 'sem_premio')`,
                [clienteId, TENANT_ID, acertos]
            )
            await client.query('COMMIT')
            return res.status(201).json({ acertos, aprovado: false })
        }

        // Caminho de sucesso: sorteia prêmio e gera código
        const premiosRes = await client.query(`
            SELECT p.id, p.nome, p.subnome, p.chance
            FROM premios p
            LEFT JOIN (
                SELECT premio_id, COUNT(*) AS sorteados
                FROM partidas WHERE premio_id IS NOT NULL AND tenant_id = $1
                GROUP BY premio_id
            ) s ON s.premio_id = p.id
            WHERE p.ativo = true AND p.tenant_id = $1
              AND (p.quantidade IS NULL OR COALESCE(s.sorteados, 0) < p.quantidade)
        `, [TENANT_ID])

        if (premiosRes.rows.length === 0) {
            await client.query('ROLLBACK')
            return res.status(422).json({ erro: 'Nenhum prêmio disponível no momento.' })
        }

        const premioSorteado = sortearPremio(premiosRes.rows)

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

        await client.query(
            `INSERT INTO partidas (cliente_id, tenant_id, quiz_acertos, premio_id, codigo, status)
             VALUES ($1, $2, $3, $4, $5, 'premio_disponivel')`,
            [clienteId, TENANT_ID, acertos, premioSorteado.id, codigo]
        )

        // Desativa prêmio se esgotou
        const contagem = await client.query(
            `SELECT p.quantidade, COUNT(pa.id) AS sorteados
             FROM premios p LEFT JOIN partidas pa ON pa.premio_id = p.id
             WHERE p.id = $1 GROUP BY p.id, p.quantidade`,
            [premioSorteado.id]
        )
        const row = contagem.rows[0]
        if (row?.quantidade && parseInt(row.sorteados) >= parseInt(row.quantidade)) {
            await client.query('UPDATE premios SET ativo = false WHERE id = $1', [premioSorteado.id])
        }

        await client.query('COMMIT')

        // Retorna todos os prêmios ativos para a roleta exibir
        const todosPremios = await pool.query(`
            SELECT p.id, p.nome, p.subnome, p.chance
            FROM premios p
            LEFT JOIN (
                SELECT premio_id, COUNT(*) AS sorteados
                FROM partidas WHERE premio_id IS NOT NULL AND tenant_id = $1
                GROUP BY premio_id
            ) s ON s.premio_id = p.id
            WHERE p.ativo = true AND p.tenant_id = $1
              AND (p.quantidade IS NULL OR COALESCE(s.sorteados, 0) < p.quantidade)
        `, [TENANT_ID])

        res.status(201).json({
            acertos,
            aprovado:   true,
            codigo,
            premioId:   premioSorteado.id,
            premioNome: premioSorteado.nome,
            premioSub:  premioSorteado.subnome,
            premios:    todosPremios.rows,
        })
    } catch (err) {
        await client.query('ROLLBACK')
        console.error('Erro no quiz/responder:', err.message)
        res.status(500).json({ erro: 'Erro interno.' })
    } finally {
        client.release()
    }
})

// POST /api/quiz/testar — avalia respostas sem gravar no banco (modo dev)
router.post('/testar', async (req, res) => {
    const { respostas } = req.body
    if (!Array.isArray(respostas) || respostas.length === 0) {
        return res.status(400).json({ erro: 'respostas são obrigatórias.' })
    }

    try {
        const ids = respostas.map(r => r.quizId)
        const gabRes = await pool.query(
            `SELECT id, correta, primeira, segunda, terceira, quarta, ultima_resposta
             FROM quiz WHERE id = ANY($1) AND tenant_id = $2`,
            [ids, TENANT_ID]
        )

        const COLUNAS = ['primeira', 'segunda', 'terceira', 'quarta', 'ultima_resposta']
        let acertos = 0
        for (const gab of gabRes.rows) {
            const resp = respostas.find(r => r.quizId === gab.id)
            if (!resp) continue
            const ativas = COLUNAS.filter(col => gab[col])
            const corretaColuna = COLUNAS[gab.correta - 1]
            const corretaIdx = ativas.indexOf(corretaColuna)
            if (resp.respostaIndex === corretaIdx) acertos++
        }

        if (acertos < MIN_ACERTOS) {
            return res.json({ acertos, aprovado: false })
        }

        const premiosRes = await pool.query(`
            SELECT p.id, p.nome, p.subnome, p.chance
            FROM premios p
            LEFT JOIN (
                SELECT premio_id, COUNT(*) AS sorteados
                FROM partidas WHERE premio_id IS NOT NULL AND tenant_id = $1
                GROUP BY premio_id
            ) s ON s.premio_id = p.id
            WHERE p.ativo = true AND p.tenant_id = $1
              AND (p.quantidade IS NULL OR COALESCE(s.sorteados, 0) < p.quantidade)
        `, [TENANT_ID])

        if (premiosRes.rows.length === 0) {
            return res.status(422).json({ erro: 'Nenhum prêmio disponível.' })
        }

        const premioSorteado = sortearPremio(premiosRes.rows)

        res.json({
            acertos,
            aprovado:   true,
            codigo:     'DEV-00000-TEST',
            premioId:   premioSorteado.id,
            premioNome: premioSorteado.nome,
            premioSub:  premioSorteado.subnome,
            premios:    premiosRes.rows,
        })
    } catch (err) {
        console.error('Erro no quiz/testar:', err.message)
        res.status(500).json({ erro: 'Erro interno.' })
    }
})

module.exports = router
