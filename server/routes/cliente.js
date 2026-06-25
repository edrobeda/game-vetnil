const express = require('express')
const router = express.Router()
const pool = require('../db/connection')

const TENANT_ID = parseInt(process.env.TENANT_ID || '2')

// POST /api/cliente — cadastrar novo participante
router.post('/', async (req, res) => {
    const { nome, cpf, telefone, email, perfil } = req.body

    if (!nome || !cpf) {
        return res.status(400).json({ erro: 'Nome e CPF são obrigatórios.' })
    }

    const cpfLimpo = cpf.replace(/\D/g, '')
    if (cpfLimpo.length !== 11) {
        return res.status(400).json({ erro: 'CPF inválido.' })
    }

    try {
        const existente = await pool.query(
            'SELECT id FROM clientes WHERE cpf = $1 AND tenant_id = $2',
            [cpfLimpo, TENANT_ID]
        )
        if (existente.rows.length > 0) {
            return res.status(409).json({ erro: 'CPF já cadastrado.' })
        }

        if (email && email.trim() !== '') {
            const dupEmail = await pool.query(
                'SELECT id FROM clientes WHERE email = $1 AND tenant_id = $2',
                [email.trim(), TENANT_ID]
            )
            if (dupEmail.rows.length > 0) {
                return res.status(409).json({ erro: 'E-mail já cadastrado neste jogo.' })
            }
        }

        if (telefone && telefone.replace(/\D/g, '') !== '') {
            const telLimpo = telefone.replace(/\D/g, '')
            const dupTel = await pool.query(
                'SELECT id FROM clientes WHERE telefone = $1 AND tenant_id = $2',
                [telLimpo, TENANT_ID]
            )
            if (dupTel.rows.length > 0) {
                return res.status(409).json({ erro: 'Telefone já cadastrado neste jogo.' })
            }
        }

        const result = await pool.query(
            `INSERT INTO clientes (nome, cpf, email, perfil, telefone, tenant_id)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [nome, cpfLimpo, email || '', perfil || '', telefone ? telefone.replace(/\D/g, '') : null, TENANT_ID]
        )
        res.status(201).json({ id: result.rows[0].id })
    } catch (err) {
        if (err.code === '23505') {
            if (err.constraint?.includes('email')) return res.status(409).json({ erro: 'E-mail já cadastrado em outro jogo.' })
            if (err.constraint?.includes('telefone')) return res.status(409).json({ erro: 'Telefone já cadastrado em outro jogo.' })
        }
        console.error('Erro ao cadastrar:', err.message)
        res.status(500).json({ erro: 'Erro interno.' })
    }
})

// POST /api/cliente/validar — verifica CPF ou telefone existe e ainda não fez palpite
router.post('/validar', async (req, res) => {
    const { cpf, telefone } = req.body

    if (!cpf && !telefone) {
        return res.status(400).json({ erro: 'CPF ou telefone obrigatório.' })
    }

    let query, param

    if (cpf) {
        const cpfLimpo = cpf.replace(/\D/g, '')
        if (cpfLimpo.length !== 11) {
            return res.status(400).json({ erro: 'CPF inválido.' })
        }
        query = `SELECT c.id, c.nome,
                        (SELECT COUNT(*) FROM partidas p WHERE p.cliente_id = c.id AND p.tenant_id = $2) AS partidas
                 FROM clientes c
                 WHERE c.cpf = $1 AND c.tenant_id = $2`
        param = cpfLimpo
    } else {
        const telLimpo = telefone.replace(/\D/g, '')
        if (telLimpo.length < 10) {
            return res.status(400).json({ erro: 'Telefone inválido.' })
        }
        query = `SELECT c.id, c.nome,
                        (SELECT COUNT(*) FROM partidas p WHERE p.cliente_id = c.id AND p.tenant_id = $2) AS partidas
                 FROM clientes c
                 WHERE c.telefone = $1 AND c.tenant_id = $2`
        param = telLimpo
    }

    try {
        const result = await pool.query(query, [param, TENANT_ID])

        if (result.rows.length === 0) {
            const campo = cpf ? 'CPF' : 'Telefone'
            return res.status(404).json({ erro: `${campo} não cadastrado.` })
        }

        const cliente = result.rows[0]
        if (parseInt(cliente.partidas) > 0) {
            return res.status(403).json({ erro: 'Você já participou do jogo.' })
        }

        res.json({ id: cliente.id, nome: cliente.nome })
    } catch (err) {
        console.error('Erro ao validar:', err.message)
        res.status(500).json({ erro: 'Erro interno.' })
    }
})

// GET /api/cliente/status/:cpf — carteira de status do participante
router.get('/status/:cpf', async (req, res) => {
    const cpfLimpo = req.params.cpf.replace(/\D/g, '')

    try {
        const result = await pool.query(
            `SELECT
                c.id, c.nome, c.cpf,
                p.id          AS partida_id,
                p.status,
                p.codigo,
                p.quiz_acertos,
                p.params,
                p.jogado_em,
                p.entregue_em,
                p.operador,
                pr.nome       AS premio_nome,
                pr.subnome    AS premio_sub
             FROM clientes c
             LEFT JOIN partidas p  ON p.cliente_id = c.id AND p.tenant_id = $2
             LEFT JOIN premios  pr ON pr.id = p.premio_id
             WHERE c.cpf = $1 AND c.tenant_id = $2
             LIMIT 1`,
            [cpfLimpo, TENANT_ID]
        )

        if (result.rows.length === 0) {
            return res.status(404).json({ erro: 'CPF não encontrado.' })
        }

        const row = result.rows[0]

        res.json({
            cliente: { id: row.id, nome: row.nome, cpf: row.cpf },
            partida: row.partida_id ? {
                status:        row.status,
                codigo:        row.codigo,
                quiz_acertos:  row.quiz_acertos,
                jogado_em:     row.jogado_em,
                entregue_em:   row.entregue_em,
                operador:      row.operador,
                premio_nome:   row.premio_nome,
                premio_sub:    row.premio_sub,
                params:        row.params,
            } : null,
        })
    } catch (err) {
        console.error('Erro ao buscar status:', err.message)
        res.status(500).json({ erro: 'Erro interno.' })
    }
})

module.exports = router
