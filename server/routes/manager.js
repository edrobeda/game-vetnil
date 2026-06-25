const express = require('express')
const jwt = require('jsonwebtoken')
const pool = require('../db/connection')

const router = express.Router()
const SECRET = process.env.JWT_SECRET
const TENANT_ID = parseInt(process.env.TENANT_ID || '2')

function auth(req, res, next) {
    const token = req.headers['x-manager-token']
    if (!token) return res.status(401).json({ erro: 'Não autorizado.' })
    try {
        jwt.verify(token, SECRET)
        next()
    } catch {
        res.status(401).json({ erro: 'Token inválido ou expirado.' })
    }
}

// POST /api/manager/login
router.post('/login', (req, res) => {
    const { usuario, senha } = req.body
    if (usuario !== process.env.MANAGER_USER || senha !== process.env.MANAGER_PASS) {
        return res.status(401).json({ erro: 'Usuário ou senha incorretos.' })
    }
    const token = jwt.sign({ usuario }, SECRET, { expiresIn: '8h' })
    res.json({ token })
})

// GET /api/manager/stats
router.get('/stats', auth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                (SELECT COUNT(*) FROM clientes WHERE tenant_id = $1)                           AS total_clientes,
                (SELECT COUNT(*) FROM partidas WHERE tenant_id = $1)                           AS total_partidas,
                (SELECT COUNT(*) FROM partidas WHERE premio_id IS NOT NULL AND tenant_id = $1) AS premios_distribuidos,
                (SELECT COUNT(*) FROM partidas WHERE quiz_acertos IS NOT NULL AND tenant_id = $1) AS quiz_completos
        `, [TENANT_ID])
        res.json(result.rows[0])
    } catch (err) {
        res.status(500).json({ erro: err.message })
    }
})

// GET /api/manager/clientes
router.get('/clientes', auth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                c.id, c.nome, c.cpf, c.telefone, c.email, c.perfil,
                TO_CHAR(c.criado_em, 'DD/MM/YYYY HH24:MI') AS criado_em,
                p.status,
                p.codigo,
                p.params,
                pr.nome    AS premio_nome,
                pr.subnome AS premio_sub,
                TO_CHAR(p.jogado_em,   'DD/MM/YYYY HH24:MI') AS jogado_em,
                TO_CHAR(p.entregue_em, 'DD/MM/YYYY HH24:MI') AS entregue_em,
                p.operador,
                p.email_enviado
            FROM clientes c
            LEFT JOIN partidas p  ON p.cliente_id = c.id AND p.tenant_id = $1
            LEFT JOIN premios  pr ON pr.id = p.premio_id
            WHERE c.tenant_id = $1
            ORDER BY c.criado_em DESC
        `, [TENANT_ID])
        res.json(result.rows)
    } catch (err) {
        res.status(500).json({ erro: err.message })
    }
})

// GET /api/manager/premios
router.get('/premios', auth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.id, p.nome, p.subnome, p.chance, p.ativo, p.quantidade,
                   COUNT(pa.id) AS vezes_sorteado
            FROM premios p
            LEFT JOIN partidas pa ON pa.premio_id = p.id AND pa.tenant_id = $1
            WHERE p.tenant_id = $1
            GROUP BY p.id
            ORDER BY p.id
        `, [TENANT_ID])
        res.json(result.rows)
    } catch (err) {
        res.status(500).json({ erro: err.message })
    }
})

// GET /api/manager/quiz
router.get('/quiz', auth, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, pergunta, primeira, segunda, terceira, quarta, ultima_resposta, correta, ativo
             FROM quiz WHERE tenant_id = $1 ORDER BY id`,
            [TENANT_ID]
        )
        res.json(result.rows)
    } catch (err) {
        res.status(500).json({ erro: err.message })
    }
})

// POST /api/manager/premios
router.post('/premios', auth, async (req, res) => {
    const { nome, subnome, chance, quantidade } = req.body
    if (!nome || !chance) return res.status(400).json({ erro: 'nome e chance obrigatórios.' })
    try {
        const result = await pool.query(
            'INSERT INTO premios (nome, subnome, chance, quantidade, tenant_id) VALUES ($1,$2,$3,$4,$5) RETURNING *',
            [nome, subnome || null, parseInt(chance), quantidade ? parseInt(quantidade) : null, TENANT_ID]
        )
        res.status(201).json(result.rows[0])
    } catch (err) {
        res.status(500).json({ erro: err.message })
    }
})

// PUT /api/manager/premios/:id
router.put('/premios/:id', auth, async (req, res) => {
    const { nome, subnome, chance, ativo, quantidade } = req.body
    if (!nome || !chance) return res.status(400).json({ erro: 'nome e chance obrigatórios.' })
    try {
        const result = await pool.query(
            `UPDATE premios SET nome=$1, subnome=$2, chance=$3, ativo=$4, quantidade=$5
             WHERE id=$6 AND tenant_id=$7 RETURNING *`,
            [nome, subnome || null, parseInt(chance), ativo ?? true,
             quantidade ? parseInt(quantidade) : null, req.params.id, TENANT_ID]
        )
        res.json(result.rows[0])
    } catch (err) {
        res.status(500).json({ erro: err.message })
    }
})

// DELETE /api/manager/premios/:id
router.delete('/premios/:id', auth, async (req, res) => {
    try {
        const vinculado = await pool.query(
            'SELECT id FROM partidas WHERE premio_id = $1 AND tenant_id = $2 LIMIT 1',
            [req.params.id, TENANT_ID]
        )
        if (vinculado.rows.length > 0) {
            return res.status(409).json({ erro: 'Prêmio já foi sorteado — não pode ser removido.' })
        }
        await pool.query('DELETE FROM premios WHERE id = $1 AND tenant_id = $2', [req.params.id, TENANT_ID])
        res.json({ ok: true })
    } catch (err) {
        res.status(500).json({ erro: err.message })
    }
})

function validarQuiz({ pergunta, primeira, segunda, terceira, quarta, ultima_resposta, correta }) {
    if (!pergunta || !primeira || !segunda) return 'Pergunta, A e B são obrigatórios.'
    const respostas = [primeira, segunda, terceira, quarta, ultima_resposta].filter(r => r && r.trim())
    if (respostas.length < 2) return 'Mínimo de 2 respostas.'
    const corretaNum = parseInt(correta)
    const validas = [1, 2, terceira ? 3 : null, quarta ? 4 : null, ultima_resposta ? 5 : null].filter(Boolean)
    if (!validas.includes(corretaNum)) return 'Resposta correta inválida para as opções preenchidas.'
    return null
}

// POST /api/manager/quiz
router.post('/quiz', auth, async (req, res) => {
    const { pergunta, primeira, segunda, terceira, quarta, ultima_resposta, correta } = req.body
    const erro = validarQuiz(req.body)
    if (erro) return res.status(400).json({ erro })
    try {
        const result = await pool.query(
            `INSERT INTO quiz (pergunta, primeira, segunda, terceira, quarta, ultima_resposta, correta, tenant_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
            [pergunta, primeira, segunda, terceira || null, quarta || null,
             ultima_resposta || null, parseInt(correta), TENANT_ID]
        )
        res.status(201).json(result.rows[0])
    } catch (err) {
        res.status(500).json({ erro: err.message })
    }
})

// PUT /api/manager/quiz/:id
router.put('/quiz/:id', auth, async (req, res) => {
    const { pergunta, primeira, segunda, terceira, quarta, ultima_resposta, correta, ativo } = req.body
    const erro = validarQuiz(req.body)
    if (erro) return res.status(400).json({ erro })
    try {
        const result = await pool.query(
            `UPDATE quiz SET pergunta=$1, primeira=$2, segunda=$3, terceira=$4, quarta=$5,
             ultima_resposta=$6, correta=$7, ativo=$8
             WHERE id=$9 AND tenant_id=$10 RETURNING *`,
            [pergunta, primeira, segunda, terceira || null, quarta || null,
             ultima_resposta || null, parseInt(correta), ativo ?? true, req.params.id, TENANT_ID]
        )
        res.json(result.rows[0])
    } catch (err) {
        res.status(500).json({ erro: err.message })
    }
})

// DELETE /api/manager/quiz/:id
router.delete('/quiz/:id', auth, async (req, res) => {
    try {
        await pool.query('DELETE FROM quiz WHERE id = $1 AND tenant_id = $2', [req.params.id, TENANT_ID])
        res.json({ ok: true })
    } catch (err) {
        res.status(500).json({ erro: err.message })
    }
})

// DELETE /api/manager/clientes/:id
router.delete('/clientes/:id', auth, async (req, res) => {
    const force = req.query.force === 'true'
    try {
        const temPartida = await pool.query(
            'SELECT id FROM partidas WHERE cliente_id = $1 AND tenant_id = $2 LIMIT 1',
            [req.params.id, TENANT_ID]
        )
        if (temPartida.rows.length > 0 && !force) {
            return res.status(409).json({ erro: 'Cliente já possui partida registrada.', podeForcar: true })
        }
        if (force) {
            await pool.query('DELETE FROM partidas WHERE cliente_id = $1 AND tenant_id = $2', [req.params.id, TENANT_ID])
        }
        await pool.query('DELETE FROM clientes WHERE id = $1 AND tenant_id = $2', [req.params.id, TENANT_ID])
        res.json({ ok: true })
    } catch (err) {
        res.status(500).json({ erro: err.message })
    }
})

// POST /api/manager/cliente — cadastrar cliente
router.post('/cliente', auth, async (req, res) => {
    const { nome, cpf, telefone, email, perfil } = req.body
    if (!nome || !cpf) return res.status(400).json({ erro: 'Nome e CPF são obrigatórios.' })
    const cpfLimpo = cpf.replace(/\D/g, '')
    if (cpfLimpo.length !== 11) return res.status(400).json({ erro: 'CPF inválido.' })
    try {
        const existe = await pool.query(
            'SELECT id FROM clientes WHERE cpf = $1 AND tenant_id = $2',
            [cpfLimpo, TENANT_ID]
        )
        if (existe.rows.length > 0) return res.status(409).json({ erro: 'CPF já cadastrado.' })
        const result = await pool.query(
            'INSERT INTO clientes (nome, cpf, telefone, email, perfil, tenant_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
            [nome, cpfLimpo, telefone || null, email || null, perfil || null, TENANT_ID]
        )
        res.status(201).json({ id: result.rows[0].id })
    } catch (err) {
        res.status(500).json({ erro: err.message })
    }
})

// GET /api/manager/entrega/:codigo
router.get('/entrega/:codigo', auth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                p.id AS partida_id, p.status, p.codigo, p.params,
                TO_CHAR(p.jogado_em,   'DD/MM/YYYY HH24:MI') AS jogado_em,
                TO_CHAR(p.entregue_em, 'DD/MM/YYYY HH24:MI') AS entregue_em,
                p.operador,
                c.nome, c.cpf,
                pr.nome    AS premio_nome,
                pr.subnome AS premio_sub
            FROM partidas p
            JOIN clientes c  ON c.id  = p.cliente_id
            JOIN premios  pr ON pr.id = p.premio_id
            WHERE p.codigo = $1 AND p.tenant_id = $2
        `, [req.params.codigo.trim().toUpperCase(), TENANT_ID])

        if (result.rows.length === 0) {
            return res.status(404).json({ erro: 'Código não encontrado.' })
        }
        res.json(result.rows[0])
    } catch (err) {
        res.status(500).json({ erro: err.message })
    }
})

// POST /api/manager/entrega/:codigo/confirmar
router.post('/entrega/:codigo/confirmar', auth, async (req, res) => {
    const { operador } = req.body
    try {
        const partida = await pool.query(
            'SELECT id, status FROM partidas WHERE codigo = $1 AND tenant_id = $2',
            [req.params.codigo.trim().toUpperCase(), TENANT_ID]
        )
        if (partida.rows.length === 0) return res.status(404).json({ erro: 'Código não encontrado.' })
        if (partida.rows[0].status === 'premio_entregue') {
            return res.status(409).json({ erro: 'Prêmio já foi entregue.' })
        }
        await pool.query(
            `UPDATE partidas SET status = 'premio_entregue', entregue_em = NOW(), operador = $1
             WHERE id = $2`,
            [operador || 'operador', partida.rows[0].id]
        )
        res.json({ ok: true })
    } catch (err) {
        res.status(500).json({ erro: err.message })
    }
})

module.exports = router
