const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const port = 3000;

app.use(express.json());

// 🔍 Rastreador para ver os pedidos no terminal
app.use((req, res, next) => {
  console.log(`➡️ Pedido recebido: ${req.method} ${req.url}`);
  next();
});

// 📁 Pastas estáticas (Página web e os gráficos locais via node_modules)
app.use(express.static(path.join(__dirname, 'public')));
app.use('/node_modules', express.static(path.join(__dirname, 'node_modules')));

// 🔗 CONFIGURAÇÃO DO SUPABASE (Pooler IPv4)
const db = new Pool({
  user: 'postgres.unwpbwhqmmxlqbmynheo',
  host: 'aws-0-us-east-1.pooler.supabase.com',
  database: 'postgres',
  password: '@Byguiga071268',
  port: 6543,
  ssl: { rejectUnauthorized: false }
});

// 🛡️ Proteção crucial contra ECONNRESET
db.on('error', (err, client) => {
  console.error('⚠️ Aviso: Conexão com o Supabase oscilou, mas o erro foi tratado e o servidor continua ativo.');
});

// 🔌 Teste imediato de ligação ao iniciar o servidor
db.connect((err, client, release) => {
  if (err) {
    console.error('❌ Erro na ligação ao Supabase:', err.stack);
  } else {
    console.log('✅ Base de dados Supabase ligada com sucesso!');
    release(); // 🔓 Importante: liberta a conexão de volta para o pool
  }
});

// ==========================================
// ROTAS DE PÁGINAS HTML
// ==========================================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'AppWebCentral.html'));
});

app.get('/inclusao', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'WebInclusao.html'));
});

app.get('/alteracao', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'WebAlteracaoInicial.html'));
});

app.get('/relatorios', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'WebRelatoriosOperacional.html'));
});


// ==========================================
// ROTAS DE AUTENTICAÇÃO
// ==========================================

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    const emailLimpo = (email || '').trim().toLowerCase();

    const resultado = await db.query('SELECT * FROM usuarios WHERE LOWER("EMAIL") = $1', [emailLimpo]);

    if (resultado.rows.length === 0) {
      return res.json({ autorizado: false, mensagem: 'Usuário não encontrado.' });
    }

    const user = resultado.rows[0];

    if (!user.SENHA_ACESSO || user.STATUS === 'PRIMEIRO_ACESSO') {
      return res.json({ 
        autorizado: false, 
        statusAcesso: 'PRIMEIRO_ACESSO', 
        mensagem: 'Primeiro acesso detectado.' 
      });
    }

    if (user.SENHA_ACESSO !== senha) {
      return res.json({ autorizado: false, mensagem: 'Senha incorreta.' });
    }

    return res.json({
      autorizado: true,
      nome: user["NOME COMPLETO"],
      email: user.EMAIL,
      nivel: user.NIVEL
    });

  } catch (erro) {
    return res.status(500).json({ autorizado: false, mensagem: 'Erro no servidor: ' + erro.message });
  }
});

app.post('/api/auth/primeiro-acesso', async (req, res) => {
  try {
    const { email, novaSenha } = req.body;
    const emailLimpo = (email || '').trim().toLowerCase();

    await db.query(
      'UPDATE usuarios SET "SENHA_ACESSO" = $1, "STATUS" = $2 WHERE LOWER("EMAIL") = $3',
      [novaSenha, 'ATIVO', emailLimpo]
    );

    return res.json({ sucesso: true, mensagem: 'SUCESSO' });
  } catch (erro) {
    return res.status(500).json({ sucesso: false, mensagem: 'Erro ao salvar senha: ' + erro.message });
  }
});

const nodemailer = require('nodemailer');

// ⚙️ CONFIGURAÇÃO DO DISPARADOR DE E-MAIL (Exemplo usando Gmail)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'agnaldoribeiropardo@gmail.com',       // SEU E-MAIL (onde você vai receber o aviso)
    pass: 'jqks pfaq fryc pwzw'      // SUA SENHA DE APLICATIVO DO GMAIL
  }
});

// ==========================================
// 📋 ROTA DE SOLICITAÇÃO DE NOVO ACESSO
// ==========================================
app.post('/api/auth/solicitar', async (req, res) => {
  try {
    const { nome, email, setor } = req.body;

    if (!nome || !email || !setor) {
      return res.status(400).json({ sucesso: false, mensagem: 'Preencha todos os campos.' });
    }

    // 1. Verificar se o e-mail já existe na tabela de usuários
    const verificaQuery = `SELECT id FROM usuarios WHERE "EMAIL" = $1;`;
    const usuarioExistente = await db.query(verificaQuery, [email.toLowerCase()]);

    if (usuarioExistente.rows.length > 0) {
      return res.status(400).json({ sucesso: false, mensagem: 'Este e-mail já possui cadastro ou solicitação pendente no sistema.' });
    }

    // 2. Inserir o novo usuário na base de dados com status PENDENTE
    const insertQuery = `
      INSERT INTO usuarios ("NOME COMPLETO", "EMAIL", "NIVEL", "STATUS") 
      VALUES ($1, $2, $3, 'PENDENTE');
    `;
    await db.query(insertQuery, [nome.toUpperCase(), email.toLowerCase(), setor]);

    // 3. Disparar o e-mail automático para você (Desenvolvedor/Supervisor)
    const mailOptions = {
      from: 'agnaldoribeiropardo@gmail.com',
      to: 'agnaldoribeiropardo@gmail.com', // E-mail onde você deseja receber o alerta
      subject: '🚨 Nova Solicitação de Acesso - Diabetes Pré-Agenda',
      text: `Olá Agnaldo,\n\nUm novo usuário solicitou acesso ao sistema:\n\n` +
            `👤 Nome: ${nome.toUpperCase()}\n` +
            `📧 E-mail: ${email.toLowerCase()}\n` +
            `🔑 Nível Solicitado: ${setor}\n\n` +
            `O registro foi salvo como PENDENTE. Acesse o Painel Central (Gestão de Usuários) para ativá-lo e definir o acesso.\n\n` +
            `Atenciosamente,\nSistema Ipesaude+`
    };

    await transporter.sendMail(mailOptions);

    return res.json({ sucesso: true, mensagem: 'Solicitação enviada com sucesso! Aguarde a liberação do supervisor.' });
  } catch (erro) {
    console.error("Erro ao processar solicitação de acesso:", erro);
    return res.status(500).json({ sucesso: false, mensagem: 'Erro interno ao processar solicitação: ' + erro.message });
  }
});

// ==========================================
// ROTAS DE PACIENTES (Inclusão, Busca, Sugestões, Consulta Dinâmica, Alteração e Acionamentos)
// ==========================================

// 🔍 Rota de Busca Rápida (Shadow Search por CPF para Duplicidade)
app.get('/api/pacientes/busca', async (req, res) => {
  try {
    const cpfBuscado = (req.query.cpf || '').replace(/[^0-9]/g, '');
    
    if (!cpfBuscado || cpfBuscado.length !== 11) {
      return res.json({ sucesso: false, mensagem: 'CPF inválido para busca.' });
    }

    const resultado = await db.query(
      'SELECT * FROM pacientes WHERE regexp_replace("CPF", \'[^0-9]\', \'\', \'g\') = $1 ORDER BY "ID" DESC LIMIT 1', 
      [cpfBuscado]
    );

    if (resultado.rows.length === 0) {
      return res.json({ sucesso: false, dados: null });
    }

    const p = resultado.rows[0];
    return res.json({
      sucesso: true,
      dados: {
        id_exclusivo: p.ID || '',
        nome: (p.NOME || '').toUpperCase().trim(),
        cpf: p.CPF || '',
        carteira: p.CARTEIRA || '',
        data_solicitacao: p.DATA || '',
        especialidade: (p.ESPECIALIDADE || '').toUpperCase().trim(),
        status_atendimento: (p.STATUS || '').toUpperCase().trim()
      }
    });

  } catch (erro) {
    return res.status(500).json({ sucesso: false, mensagem: 'Erro no servidor ao buscar CPF: ' + erro.message });
  }
});

// 💾 Rota de Inclusão com Geração Automática de ID e Data Cadastro
app.post('/api/pacientes/inclusao', async (req, res) => {
  try {
    const p = req.body;

    const cpfLimpo = (p.colunaX || '').replace(/[^0-9]/g, '');
    const cartLimpa = (p.colunaC || '').replace(/[^0-9]/g, '');
    const dddLimpo = (p.colunaD || '').replace(/[^0-9]/g, '');
    const foneLimpo = (p.colunaE || '').replace(/[^0-9]/g, '');
    const nomeLimpo = (p.colunaB || '').trim();

    if (!p.colunaA || p.colunaA.trim().length < 10) {
      return res.status(400).json({ sucesso: false, mensagem: '⚠️ A DATA é obrigatória.' });
    }

    // 🛑 VALIDAÇÃO DE SEGURANÇA: Proibir datas anteriores a 2026
    const dataStrPura = p.colunaA.trim().split(' ')[0];
    let anoInformado = 0;
    if (dataStrPura.includes('/')) {
      const partes = dataStrPura.split('/');
      if (partes.length === 3) anoInformado = parseInt(partes[2], 10);
    } else if (dataStrPura.includes('-')) {
      const partes = dataStrPura.split('-');
      if (partes.length === 3) anoInformado = parseInt(partes[0], 10);
    }

    if (isNaN(anoInformado) || anoInformado < 2026) {
      return res.status(400).json({ 
        sucesso: false, 
        mensagem: '⚠️ Validação recusada: Não é permitido cadastrar datas anteriores ao ano de 2026.' 
      });
    }

    if (cpfLimpo.length !== 11) {
      return res.status(400).json({ sucesso: false, mensagem: '⚠️ O CPF deve ter 11 dígitos.' });
    }

    const novoIdExclusivo = 'ID-' + Date.now();

    const agora = new Date();
    const dia = String(agora.getDate()).padStart(2, '0');
    const mes = String(agora.getMonth() + 1).padStart(2, '0');
    const ano = agora.getFullYear();
    const horas = String(agora.getHours()).padStart(2, '0');
    const minutos = String(agora.getMinutes()).padStart(2, '0');
    const segundos = String(agora.getSeconds()).padStart(2, '0');
    const dataCadastroFormatada = `${dia}/${mes}/${ano} ${horas}:${minutos}:${segundos}`;

    const querySQL = `
      INSERT INTO pacientes (
        "ID", "DATA CADASTRO", "DATA", "NOME", "CARTEIRA", "DDD", "FONE",
        "ESPECIALIDADE", "PRIORIDADE", "TIPO", "SITUAÇÃO", "STATUS",
        "OBSERVAÇÃO", "CPF", "ATENDENTE"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING "ID";
    `;

    const valores = [
      novoIdExclusivo, dataCadastroFormatada, p.colunaA, nomeLimpo, cartLimpa, dddLimpo, foneLimpo,
      p.colunaF, p.colunaG, p.colunaH, p.colunaI, p.colunaJ,
      p.colunaT, cpfLimpo, p.operadorWebReal
    ];

    const resultado = await db.query(querySQL, valores);
    const idCadastrado = resultado.rows[0].ID;

    return res.json({
      sucesso: true,
      mensagem: `✅ Paciente cadastrado com sucesso! ID Exclusivo: ${idCadastrado}`
    });
  } catch (erro) {
    return res.status(500).json({ sucesso: false, mensagem: 'Erro no Servidor: ' + erro.message });
  }
});

// 🔤 Rota para Listar Todos os Nomes (Sem limite para carregar a base completa)
app.get('/api/pacientes/todos-nomes', async (req, res) => {
  try {
    const query = `SELECT "ID" AS id, "NOME" AS nome, "CARTEIRA" AS carteira, "ESPECIALIDADE" AS especialidade FROM pacientes ORDER BY "NOME" ASC;`;
    const resultado = await db.query(query);

    const dadosFormatados = resultado.rows.map(p => ({
      id: p.id || '',
      nome: (p.nome || '').toUpperCase().trim(),
      carteira: p.carteira || '',
      especialidade: p.especialidade || ''
    }));

    return res.json({ sucesso: true, dados: dadosFormatados });
  } catch (erro) {
    return res.status(500).json({ sucesso: false, mensagem: erro.message });
  }
});

// 🔍 Sugestões para o Autocomplete / Consulta Dinâmica ao Digitar o Nome
app.get('/api/pacientes/sugestoes', async (req, res) => {
  try {
    const { termo } = req.query;
    if (!termo) return res.json({ sucesso: true, sugestoes: [] });

    const query = `SELECT DISTINCT "NOME" FROM pacientes WHERE UPPER("NOME") LIKE UPPER($1) ORDER BY "NOME" ASC LIMIT 10;`;
    const resultado = await db.query(query, [`%${termo}%`]);
    const sugestoes = resultado.rows.map(r => r.NOME);

    return res.json({ sucesso: true, sugestoes: sugestoes });
  } catch (erro) {
    return res.status(500).json({ sucesso: false, sugestoes: [], mensagem: erro.message });
  }
});
// Consulta Alfabética Geral
app.get('/api/pacientes/consulta-alfabetica', async (req, res) => {
  try {
    const { termo } = req.query;
    if (!termo) return res.json({ sucesso: true, dados: [] });

    const query = `SELECT "ID" AS id, "NOME" AS nome, "CPF" AS cpf, "CARTEIRA" AS carteira, "STATUS" AS status FROM pacientes WHERE UPPER("NOME") LIKE UPPER($1) ORDER BY "NOME" ASC LIMIT 50;`;
    const resultado = await db.query(query, [`${termo}%`]);
    return res.json({ sucesso: true, dados: resultado.rows });
  } catch (erro) {
    return res.status(500).json({ sucesso: false, mensagem: erro.message });
  }
});

// ==========================================
// ROTA DE BUSCA COMPLETA DE PACIENTES (BLINDADA)
// ==========================================
app.get('/api/pacientes/busca-completa', async (req, res) => {
  try {
    const { filtro, termo } = req.query;
    if (!filtro || !termo) {
      return res.status(400).json({ sucesso: false, mensagem: 'Filtro ou termo não informado.' });
    }

    let querySQL = `
      SELECT 
        "ID" AS id,
        "DATA" AS data,
        "NOME" AS nome,
        "CPF" AS cpf,
        "CARTEIRA" AS carteira,
        "DDD" AS ddd,
        "FONE" AS fone,
        "ESPECIALIDADE" AS especialidade,
        "PRIORIDADE" AS prioridade,
        "TIPO" AS tipo,
        "SITUAÇÃO" AS situacao,
        "STATUS" AS status_atendimento,
        "BUSCA 1" AS busca1,
        "DATA BUSCA 1" AS data_busca1,
        "USUARIO 1" AS auditor1,
        "BUSCA 2" AS busca2,
        "DATA BUSCA 2" AS data_busca2,
        "USUARIO 2" AS auditor2,
        "BUSCA 3" AS busca3,
        "DATA BUSCA 3" AS data_busca3,
        "USUARIO 3" AS auditor3,
        "OBSERVAÇÃO" AS observacao,
        "ATENDENTE" AS atendente,
        "DATA CADASTRO" AS data_cadastro,
        "DATA AGENDAMENTO" AS data_agendamento,
        "HORA AGENDAMENTO" AS hora_agendamento,
        "PROFISSIONAL" AS profissional
      FROM pacientes 
      WHERE 1=1
    `;
    let param = '';

    if (filtro === 'CPF') {
      const cpfLimpo = termo.replace(/[^0-9]/g, '');
      querySQL += ` AND REPLACE(REPLACE("CPF", '.', ''), '-', '') = $1`;
      param = cpfLimpo;
    } else if (filtro === 'carteira') {
      querySQL += ` AND "CARTEIRA" = $1`;
      param = termo;
    } else if (filtro === 'id') {
      querySQL += ` AND "ID" = $1`;
      param = termo;
    } else {
      querySQL += ` AND UPPER("NOME") LIKE UPPER($1)`;
      param = `%${termo}%`;
    }

    querySQL += ` ORDER BY "ID" DESC LIMIT 1;`;
    const resultado = await db.query(querySQL, [param]);

    if (resultado.rows.length === 0) {
      return res.json({ sucesso: false, dados: null });
    }

    const r = resultado.rows[0];

    const dadosFormatados = {
      id: r.id || '',
      data: r.data || '',
      nome: (r.nome || '').toUpperCase().trim(),
      cpf: r.cpf || '',
      carteira: r.carteira || '',
      ddd: r.ddd || '',
      telefone: r.fone || '',
      especialidade: (r.especialidade || '').toUpperCase().trim(),
      prioridade: (r.prioridade || '').toUpperCase().trim(),
      tipo: (r.tipo || '').toUpperCase().trim(),
      situacao: (r.situacao || '').toUpperCase().trim(),
      status_atendimento: r.status_atendimento || '',
      
      busca1: r.busca1 || '',
      data_busca1: r.data_busca1 || '',
      auditor1: r.auditor1 || '',
      
      busca2: r.busca2 || '',
      data_busca2: r.data_busca2 || '',
      auditor2: r.auditor2 || '',
      
      busca3: r.busca3 || '',
      data_busca3: r.data_busca3 || '',
      auditor3: r.auditor3 || '',
      
      observacao: r.observacao || '',
      atendente: r.atendente || '',
      data_cadastro: r.data_cadastro || '',

      data_agendamento: r.data_agendamento || '',
      hora_agendamento: r.hora_agendamento || '',
      profissional: r.profissional || ''
    };

    return res.json({ sucesso: true, dados: dadosFormatados });
  } catch (erro) {
    return res.status(500).json({ sucesso: false, mensagem: erro.message });
  }
});
// 🩺 Rota para Listar Profissionais Ativos para os Dropdowns
app.get('/api/profissionais', async (req, res) => {
  try {
    const query = `SELECT "ID" AS id, "NOME" AS nome, "ESPECIALIDADE MEDICO" AS especialidade FROM profissionais WHERE UPPER("STATUS") = 'ATIVO' ORDER BY "NOME" ASC;`;
    const resultado = await db.query(query);

    const dadosFormatados = resultado.rows.map(p => ({
      id: p.id || '',
      nome: (p.nome || '').toUpperCase().trim(),
      especialidade: (p.especialidade || '').toUpperCase().trim()
    }));

    return res.json({ sucesso: true, dados: dadosFormatados });
  } catch (erro) {
    return res.status(500).json({ sucesso: false, mensagem: 'Erro ao buscar profissionais: ' + erro.message });
  }
});
// ==========================================
// ROTA DE GRAVAÇÃO MASTER (SALVAR MASTER)
// ==========================================
app.post('/api/pacientes/salvar-master', async (req, res) => {
  try {
    const dados = req.body;
    if (!dados.id) {
      return res.status(400).json({ sucesso: false, mensagem: 'ID do paciente não informado.' });
    }

    const querySQLFinal = `
      UPDATE pacientes SET 
        "DATA" = $1, "NOME" = $2, "CARTEIRA" = $3, "DDD" = $4, "FONE" = $5,
        "ESPECIALIDADE" = $6, "PRIORIDADE" = $7, "TIPO" = $8, "SITUAÇÃO" = $9, "STATUS" = $10,
        "BUSCA 1" = $11, "DATA BUSCA 1" = $12, "USUARIO 1" = $13,
        "BUSCA 2" = $14, "DATA BUSCA 2" = $15, "USUARIO 2" = $16,
        "BUSCA 3" = $17, "DATA BUSCA 3" = $18, "USUARIO 3" = $19,
        "OBSERVAÇÃO" = $20, "CPF" = $21,
        "DATA AGENDAMENTO" = $22, "HORA AGENDAMENTO" = $23, "PROFISSIONAL" = $24
      WHERE "ID" = $25;
    `;

    const paramsSQL = [
      dados.colA, dados.colB, dados.colC, dados.colD, dados.colE,
      dados.colF, dados.colG, dados.colH, dados.colI, dados.colJ,
      dados.colK,                     // $11: BUSCA 1
      dados.colL, dados.colM,     // $12: DATA BUSCA 1, $13: USUARIO 1 (Operador 1)
      dados.colN,                     // $14: BUSCA 2
      dados.colO, dados.colP,     // $15: DATA BUSCA 2, $16: USUARIO 2 (Operador 2)
      dados.colQ,                     // $17: BUSCA 3
      dados.colR, dados.colS,     // $18: DATA BUSCA 3, $19: USUARIO 3 (Operador 3)
      dados.colT, dados.colX,     // $20: OBSERVAÇÃO, $21: CPF
      dados.dataAgendamento,          // $22: DATA AGENDAMENTO
      dados.horaAgendamento,          // $23: HORA AGENDAMENTO
      dados.profissional,             // $24: PROFISSIONAL
      dados.id                        // $25: ID EXCLUSIVO
    ];

    await db.query(querySQLFinal, paramsSQL);

    return res.json({ sucesso: true, mensagem: 'Alterações administrativas gravadas com sucesso no Supabase!' });
  } catch (erro) {
    return res.status(500).json({ sucesso: false, mensagem: erro.message });
  }
});
// 💾 Rota para Salvar a Retificação / Alteração Inicial (Com Regras de Segurança)
app.post('/api/pacientes/atualizar', async (req, res) => {
  try {
    const p = req.body;

    if (!p.id) {
      return res.status(400).json({ sucesso: false, mensagem: 'ID do prontuário não informado.' });
    }

    const buscaAtual = await db.query('SELECT * FROM pacientes WHERE "ID" = $1', [p.id]);
    if (buscaAtual.rows.length === 0) {
      return res.status(404).json({ sucesso: false, mensagem: 'Prontuário não encontrado no banco de dados.' });
    }

    const registro = buscaAtual.rows[0];
    const operadorLogado = (p.operador || '').trim().toLowerCase();
    const nivelLogado = (p.nivel || '').trim().toUpperCase();
    const atendenteOriginal = (registro.ATENDENTE || '').trim().toLowerCase();

    const ehMaster = nivelLogado === 'MASTER' || nivelLogado === 'ADMIN';
    const mesmoAtendente = atendenteOriginal !== '' && operadorLogado !== '' && atendenteOriginal === operadorLogado;

    if (!ehMaster && !mesmoAtendente && atendenteOriginal !== '') {
      return res.status(403).json({ 
        sucesso: false, 
        mensagem: 'Alteração só permitida ao atendente criador do cadastro ou através do Gerenciamento MASTER.' 
      });
    }

    const statusAtual = (registro.STATUS || '').toUpperCase();
    const busca1Preenchida = registro["BUSCA 1"] && registro["BUSCA 1"] !== '-' && registro["BUSCA 1"] !== '';
    const temBuscaComecada = statusAtual.includes('BUSCA') || statusAtual.includes('EM BUSCA') || busca1Preenchida;

    if (temBuscaComecada && !ehMaster) {
      return res.status(403).json({ 
        sucesso: false, 
        mensagem: 'Buscas já Iniciadas, alteração só permitida através do Gerenciamento MASTER.' 
      });
    }

    const cpfLimpo = (p.cpf || '').replace(/[^0-9]/g, '');
    const cartLimpa = (p.carteira || '').replace(/[^0-9]/g, '');
    const dddLimpo = (p.ddd || '').replace(/[^0-9]/g, '');
    const foneLimpo = (p.telefone || '').replace(/[^0-9]/g, '');
    const nomeLimpo = (p.nome || '').trim();

    const querySQL = `
      UPDATE pacientes SET 
        "NOME" = $1, 
        "CPF" = $2, 
        "CARTEIRA" = $3, 
        "DDD" = $4, 
        "FONE" = $5, 
        "ESPECIALIDADE" = $6, 
        "PRIORIDADE" = $7, 
        "TIPO" = $8, 
        "SITUAÇÃO" = $9, 
        "OBSERVAÇÃO" = $10 
      WHERE "ID" = $11;
    `;

    const valores = [
      nomeLimpo, cpfLimpo, cartLimpa, dddLimpo, foneLimpo,
      p.especialidade, p.prioridade, p.tipo, p.situacao,
      p.observacao, p.id
    ];

    await db.query(querySQL, valores);

    return res.json({
      sucesso: true,
      mensagem: `✅ Prontuário #${p.id} retificado e salvo com sucesso!`
    });

  } catch (erro) {
    return res.status(500).json({ sucesso: false, mensagem: 'Erro no Servidor ao atualizar: ' + erro.message });
  }
});

// ⏳ Rota da Fila Operacional Cronológica (Utilizando estritamente o campo "DATA")
app.get('/api/pacientes/fila-cronologica', async (req, res) => {
  try {
    const query = `
      SELECT * FROM pacientes 
      WHERE "STATUS" IS NULL 
         OR TRIM("STATUS") = '' 
         OR UPPER("STATUS") IN ('EM BUSCA', 'AGUARDAR AGENDA', 'PENDENTE');
    `;
    
    const resultado = await db.query(query);

    // Conversor flexível para ler o formato DD/MM/YYYY do campo DATA
    const parseDataFlexivel = (strData) => {
      if (!strData) return new Date(0);
      const str = String(strData).trim().split(' ')[0]; // Ignora qualquer hora se houver acidentalmente
      
      if (str.includes('/')) {
        const partes = str.split('/');
        if (partes.length === 3) {
          const dia = partes[0].padStart(2, '0');
          const mes = partes[1].padStart(2, '0');
          const ano = partes[2];
          return new Date(`${ano}-${mes}-${dia}`);
        }
      }
      
      if (str.includes('-')) {
        const d = new Date(str);
        if (!isNaN(d.getTime())) return d;
      }

      return new Date(0);
    };

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const listaProcessada = resultado.rows.map(p => {
      // 🎯 PRIORIDADE ABSOLUTA AO CAMPO "DATA" OFICIAL DO SISTEMA
      const dataStr = p["DATA"] || p["DATA CADASTRO"] || '';
      const dataObj = parseDataFlexivel(dataStr);
      
      // Cálculo exato dos dias de espera com base na data oficial
      const diffTempo = hoje.getTime() - dataObj.getTime();
      const diasEspera = diffTempo > 0 ? Math.floor(diffTempo / (1000 * 60 * 60 * 24)) : 0;

      return {
        id: p.ID || '',
        nome: (p.NOME || '').toUpperCase().trim(),
        cpf: p.CPF || '',
        carteira: p.CARTEIRA || '',
        telefone: p.FONE || '',
        status: p.STATUS || 'PENDENTE',
        dataCadastro: dataStr || '-', // Vai exibir exatamente a data limpa do campo DATA
        dataObj: dataObj,
        diasEspera: diasEspera
      };
    });

    // Ordenação estrita do mais antigo para o mais recente com base no campo DATA
    listaProcessada.sort((a, b) => a.dataObj.getTime() - b.dataObj.getTime());

    return res.json({ sucesso: true, dados: listaProcessada });
  } catch (erro) {
    return res.status(500).json({ sucesso: false, mensagem: erro.message });
  }
});
// ==========================================
// 🩺 ROTAS DE GESTÃO DE PROFISSIONAIS
// ==========================================

// Listar para gerenciamento (com ID)
app.get('/api/profissionais/gerenciar', async (req, res) => {
  try {
    const query = `
      SELECT 
        "ID" AS id, 
        "NOME" AS nome, 
        "ESPECIALIDADE MEDICO" AS especialidade, 
        "STATUS" AS status 
      FROM profissionais 
      ORDER BY "NOME" ASC;
    `;
    const resultado = await db.query(query);
    return res.json({ sucesso: true, dados: resultado.rows });
  } catch (erro) {
    console.error("Erro ao listar profissionais:", erro);
    return res.status(500).json({ sucesso: false, mensagem: erro.message });
  }
});

// Salvar ou Atualizar Profissional
app.post('/api/profissionais/salvar', async (req, res) => {
  try {
    const { id, nome, especialidade, status } = req.body;

    if (!nome || !especialidade) {
      return res.status(400).json({ sucesso: false, mensagem: 'Nome e Especialidade são obrigatórios.' });
    }

    if (id && id.trim() !== '') {
      // Atualizar existente
      const queryUpdate = `
        UPDATE profissionais 
        SET "NOME" = $1, "ESPECIALIDADE MEDICO" = $2, "STATUS" = $3 
        WHERE "ID" = $4;
      `;
      await db.query(queryUpdate, [nome, especialidade, status || 'ATIVO', id]);
      return res.json({ sucesso: true, mensagem: 'Profissional atualizado com sucesso!' });
    } else {
      // Inserir novo
      const queryInsert = `
        INSERT INTO profissionais ("NOME", "ESPECIALIDADE MEDICO", "STATUS") 
        VALUES ($1, $2, $3);
      `;
      await db.query(queryInsert, [nome, especialidade, status || 'ATIVO']);
      return res.json({ sucesso: true, mensagem: 'Profissional cadastrado com sucesso!' });
    }
  } catch (erro) {
    console.error("Erro ao salvar profissional:", erro);
    return res.status(500).json({ sucesso: false, mensagem: 'Erro ao gravar profissional: ' + erro.message });
  }
});
// ==========================================
// 👥 ROTAS DE GESTÃO DE UTILIZADORES E ACESSOS
// ==========================================

// Listar todos os utilizadores/solicitações
app.get('/api/usuarios/gerenciar', async (req, res) => {
  try {
    const query = `
      SELECT 
        id, 
        "NOME COMPLETO" AS nome, 
        "EMAIL" AS email, 
        "STATUS" AS status, 
        COALESCE("NIVEL", 'OPERADOR_BUSCA') AS nivel 
      FROM usuarios 
      ORDER BY "NOME COMPLETO" ASC;
    `;
    const resultado = await db.query(query);
    return res.json({ sucesso: true, dados: resultado.rows });
  } catch (erro) {
    return res.status(500).json({ sucesso: false, mensagem: erro.message });
  }
});

// Salvar ou Atualizar Utilizador (Aprovação / Edição Master)
app.post('/api/usuarios/salvar', async (req, res) => {
  try {
    const { id, nome, email, nivel, status } = req.body;

    if (!nome || !email) {
      return res.status(400).json({ sucesso: false, mensagem: 'Nome e E-mail são obrigatórios.' });
    }

    if (id && id.trim() !== '') {
      // Atualizar utilizador existente
      const queryUpdate = `
        UPDATE usuarios 
        SET "NOME COMPLETO" = $1, "EMAIL" = $2, "NIVEL" = $3, "STATUS" = $4 
        WHERE id = $5;
      `;
      await db.query(queryUpdate, [nome, email, nivel || 'OPERADOR_BUSCA', status || 'ATIVO', id]);
      return res.json({ sucesso: true, mensagem: 'Utilizador atualizado com sucesso!' });
    } else {
      // Inserir novo utilizador administrativo
      const queryInsert = `
        INSERT INTO usuarios ("NOME COMPLETO", "EMAIL", "NIVEL", "STATUS") 
        VALUES ($1, $2, $3, $4);
      `;
      await db.query(queryInsert, [nome, email, nivel || 'OPERADOR_BUSCA', status || 'ATIVO']);
      return res.json({ sucesso: true, mensagem: 'Utilizador cadastrado com sucesso!' });
    }
  } catch (erro) {
    return res.status(500).json({ sucesso: false, mensagem: 'Erro ao gravar utilizador: ' + erro.message });
  }
});

// 💾 Rota Blindada: Acionamentos com Atualização Dinâmica de Datas, Usuários e Status
app.post('/api/pacientes/acionamento', async (req, res) => {
  try {
    const p = req.body;
    if (!p.id) {
      return res.status(400).json({ sucesso: false, mensagem: 'ID do prontuário não informado.' });
    }

    const atualRes = await db.query('SELECT * FROM pacientes WHERE "ID" = $1', [p.id]);
    if (atualRes.rows.length === 0) {
      return res.status(404).json({ sucesso: false, mensagem: 'Prontuário não encontrado no banco de dados.' });
    }
    const regAtual = atualRes.rows[0];

    const operadorLogado = (p.operador || 'Operador Web').trim();

    // Data e hora atual formatada (DD/MM/YYYY HH:MM:SS)
    const agora = new Date();
    const dia = String(agora.getDate()).padStart(2, '0');
    const mes = String(agora.getMonth() + 1).padStart(2, '0');
    const ano = agora.getFullYear();
    const horas = String(agora.getHours()).padStart(2, '0');
    const minutos = String(agora.getMinutes()).padStart(2, '0');
    const segundos = String(agora.getSeconds()).padStart(2, '0');
    const dataHoraAtual = `${dia}/${mes}/${ano} ${horas}:${minutos}:${segundos}`;

    // Valores atuais no banco
    const b1Antiga = (regAtual["BUSCA 1"] || '').trim();
    const u1Antigo = (regAtual["USUARIO 1"] || '').trim().toLowerCase();
    
    const b2Antiga = (regAtual["BUSCA 2"] || '').trim();
    const u2Antigo = (regAtual["USUARIO 2"] || '').trim().toLowerCase();
    
    const b3Antiga = (regAtual["BUSCA 3"] || '').trim();
    const u3Antigo = (regAtual["USUARIO 3"] || '').trim().toLowerCase();

    // Novos valores vindos da tela
    const novaBusca1 = p.busca1 !== undefined ? p.busca1.trim() : b1Antiga;
    const novaBusca2 = p.busca2 !== undefined ? p.busca2.trim() : b2Antiga;
    const novaBusca3 = p.busca3 !== undefined ? p.busca3.trim() : b3Antiga;

    // 🛑 TRAVA DE SEGURANÇA: Validar se o operador pode alterar a BUSCA 1
    if (novaBusca1 !== b1Antiga && b1Antiga !== '' && b1Antiga !== '-') {
      if (u1Antigo !== '' && u1Antigo !== operadorLogado.toLowerCase()) {
        return res.status(403).json({ 
          sucesso: false, 
          mensagem: `⚠️ Acesso negado. A Busca 1 foi registrada por outro usuário (${regAtual["USUARIO 1"]}) e só pode ser alterada por ele.` 
        });
      }
    }

    // 🛑 TRAVA DE SEGURANÇA: Validar se o operador pode alterar a BUSCA 2
    if (novaBusca2 !== b2Antiga && b2Antiga !== '' && b2Antiga !== '-') {
      if (u2Antigo !== '' && u2Antigo !== operadorLogado.toLowerCase()) {
        return res.status(403).json({ 
          sucesso: false, 
          mensagem: `⚠️ Acesso negado. A Busca 2 foi registrada por outro usuário (${regAtual["USUARIO 2"]}) e só pode ser alterada por ele.` 
        });
      }
    }

    // 🛑 TRAVA DE SEGURANÇA: Validar se o operador pode alterar a BUSCA 3
    if (novaBusca3 !== b3Antiga && b3Antiga !== '' && b3Antiga !== '-') {
      if (u3Antigo !== '' && u3Antigo !== operadorLogado.toLowerCase()) {
        return res.status(403).json({ 
          sucesso: false, 
          mensagem: `⚠️ Acesso negado. A Busca 3 foi registrada por outro usuário (${regAtual["USUARIO 3"]}) e só pode ser alterada por ele.` 
        });
      }
    }

    // ⚙️ Processamento Inteligente da BUSCA 1
    let busca1 = b1Antiga;
    let dataBusca1 = regAtual["DATA BUSCA 1"] || '';
    let usuario1 = regAtual["USUARIO 1"] || '';
    if (p.busca1 !== undefined) {
      if (novaBusca1 === '' || novaBusca1 === '-') {
        busca1 = ''; dataBusca1 = ''; usuario1 = '';
      } else if (novaBusca1 !== b1Antiga) {
        busca1 = novaBusca1;
        dataBusca1 = dataHoraAtual;
        usuario1 = operadorLogado;
      }
    }

    // ⚙️ Processamento Inteligente da BUSCA 2
    let busca2 = b2Antiga;
    let dataBusca2 = regAtual["DATA BUSCA 2"] || '';
    let usuario2 = regAtual["USUARIO 2"] || '';
    if (p.busca2 !== undefined) {
      if (novaBusca2 === '' || novaBusca2 === '-') {
        busca2 = ''; dataBusca2 = ''; usuario2 = '';
      } else if (novaBusca2 !== b2Antiga) {
        busca2 = novaBusca2;
        dataBusca2 = dataHoraAtual;
        usuario2 = operadorLogado;
      }
    }

    // ⚙️ Processamento Inteligente da BUSCA 3
    let busca3 = b3Antiga;
    let dataBusca3 = regAtual["DATA BUSCA 3"] || '';
    let usuario3 = regAtual["USUARIO 3"] || '';
    if (p.busca3 !== undefined) {
      if (novaBusca3 === '' || novaBusca3 === '-') {
        busca3 = ''; dataBusca3 = ''; usuario3 = '';
      } else if (novaBusca3 !== b3Antiga) {
        busca3 = novaBusca3;
        dataBusca3 = dataHoraAtual;
        usuario3 = operadorLogado;
      }
    }

    // 🔄 RECALCULO AUTOMÁTICO E DINÂMICO DO STATUS E DADOS DE AGENDAMENTO
    let statusAtendimento = regAtual["STATUS"] || 'EM BUSCA';
    let dataAgendamentoBD = regAtual["DATA AGENDAMENTO"] || '';
    let horaAgendamentoBD = regAtual["HORA AGENDAMENTO"] || '';
    let profissionalBD = regAtual["PROFISSIONAL"] || '';

    if (busca1 === 'EXITO' || busca2 === 'EXITO' || busca3 === 'EXITO') {
      statusAtendimento = 'AGENDADO';
      if (p.dataAgendamento !== undefined) dataAgendamentoBD = p.dataAgendamento.trim();
      if (p.horaAgendamento !== undefined) horaAgendamentoBD = p.horaAgendamento.trim();
      if (p.profissional !== undefined) profissionalBD = p.profissional.trim();
    } else if (busca3 === 'SEM SUCESSO - 3ª TENTATIVA') {
      statusAtendimento = 'ENCERRADO';
      dataAgendamentoBD = '';
      horaAgendamentoBD = '';
      profissionalBD = '';
    } else if (busca1 !== '' || busca2 !== '' || busca3 !== '') {
      statusAtendimento = 'EM BUSCA';
    }

    const observacao = p.observacao !== undefined ? p.observacao : (regAtual["OBSERVAÇÃO"] || '');

    const updateSQL = `
      UPDATE pacientes SET 
        "BUSCA 1" = $1, "DATA BUSCA 1" = $2, "USUARIO 1" = $3,
        "BUSCA 2" = $4, "DATA BUSCA 2" = $5, "USUARIO 2" = $6,
        "BUSCA 3" = $7, "DATA BUSCA 3" = $8, "USUARIO 3" = $9,
        "STATUS" = $10, "OBSERVAÇÃO" = $11,
        "DATA AGENDAMENTO" = $12, "HORA AGENDAMENTO" = $13, "PROFISSIONAL" = $14
      WHERE "ID" = $15;
    `;

    const valores = [
      busca1, dataBusca1, usuario1,
      busca2, dataBusca2, usuario2,
      busca3, dataBusca3, usuario3,
      statusAtendimento, observacao,
      dataAgendamentoBD, horaAgendamentoBD, profissionalBD,
      p.id
    ];

    await db.query(updateSQL, valores);

    return res.json({
      sucesso: true,
      mensagem: 'Acionamento, dados de agendamento e status gravados com sucesso!'
    });

  } catch (erro) {
    return res.status(500).json({ sucesso: false, mensagem: 'Erro interno ao gravar acionamento: ' + erro.message });
  }
});
// ==========================================
// ROTA MESTRE DE RELATÓRIOS E GRÁFICOS
// ==========================================

app.post('/api/relatorios/processar', async (req, res) => {
  try {
    const { subRelatorio, mes, ano, prioridade, status, especialidade, tipo, situacao } = req.body;

    let query = 'SELECT * FROM pacientes WHERE 1=1';
    const params = [];
    let idx = 1;

    if (mes) {
      query += ` AND SUBSTRING("DATA", 4, 2) = $${idx++}`;
      params.push(mes);
    }
    if (ano) {
      query += ` AND SUBSTRING("DATA", 7, 4) = $${idx++}`;
      params.push(ano);
    }
    if (prioridade) {
      query += ` AND UPPER("PRIORIDADE") = UPPER($${idx++})`;
      params.push(prioridade);
    }
    if (status) {
      query += ` AND UPPER("STATUS") = UPPER($${idx++})`;
      params.push(status);
    }
    if (especialidade) {
      query += ` AND UPPER("ESPECIALIDADE") = UPPER($${idx++})`;
      params.push(especialidade);
    }
    if (tipo) {
      query += ` AND UPPER("TIPO") = UPPER($${idx++})`;
      params.push(tipo);
    }
    if (situacao) {
      query += ` AND UPPER("SITUAÇÃO") = UPPER($${idx++})`;
      params.push(situacao);
    }

    const subRelLimpo = (subRelatorio || 'geral').trim();
    if (subRelLimpo === 'pendentes') {
      query += ` AND UPPER("STATUS") IN ('EM BUSCA', 'AGUARDAR AGENDA')`;
    } else if (subRelLimpo === 'concluidos') {
      query += ` AND UPPER("STATUS") IN ('AGENDADO', 'ENCERRADO')`;
    } else if (subRelLimpo === 'endo_ped') {
      query += ` AND UPPER("ESPECIALIDADE") LIKE '%ENDO PED%'`;
    }

    query += ' ORDER BY "ID" DESC';

    const resultado = await db.query(query, params);
    const registros = resultado.rows;

    let contadores = { total: registros.length, emBusca: 0, agendado: 0, aguardando: 0, encerrado: 0 };
    registros.forEach(r => {
      const st = (r.STATUS || '').toUpperCase().trim();
      if (st.includes('BUSCA')) contadores.emBusca++;
      else if (st.includes('AGENDADO')) contadores.agendado++;
      else if (st.includes('AGUARDAR')) contadores.aguardando++;
      else if (st.includes('ENCERRADO')) contadores.encerrado++;
    });

    let dadosTabela = registros.map(r => {
      const ddd = r.DDD ? String(r.DDD).trim() : '';
      const fone = r.FONE ? String(r.FONE).trim() : '';
      const foneUnificado = (ddd !== '' && fone !== '') ? `(${ddd}) ${fone}` : (fone || '-');

      let cpfLimpo = r.CPF ? String(r.CPF).replace(/[^0-9]/g, '') : '';
      let cpfMascarado = '-';
      if (cpfLimpo.length === 11) {
        cpfMascarado = `${cpfLimpo.substring(0,3)}.${cpfLimpo.substring(3,6)}.${cpfLimpo.substring(6,9)}-${cpfLimpo.substring(9,11)}`;
      } else if (cpfLimpo !== '') {
        cpfMascarado = cpfLimpo;
      }

      return {
        id: r.ID || '',
        data: r.DATA || '',
        nome: (r.NOME || '').toUpperCase().trim(),
        cpf: cpfMascarado,
        carteira: r.CARTEIRA || '',
        telefone: foneUnificado,
        especialidade: (r.ESPECIALIDADE || '').toUpperCase().trim(),
        prioridade: (r.PRIORIDADE || '').toUpperCase().trim(),
        tipo: (r.TIPO || '').toUpperCase().trim(),
        situacao: (r.SITUAÇÃO || '').toUpperCase().trim(),
        status: (r.STATUS || 'AGUARDAR AGENDA').toUpperCase().trim(),
        colunaU: r.ATENDENTE || '',
        busca1: r["BUSCA 1"] || '-',
        dataBusca1: r["DATA BUSCA 1"] || '-',
        user1: r["USUARIO 1"] || '-',
        busca2: r["BUSCA 2"] || '-',
        dataBusca2: r["DATA BUSCA 2"] || '-',
        user2: r["USUARIO 2"] || '-',
        busca3: r["BUSCA 3"] || '-',
        dataBusca3: r["DATA BUSCA 3"] || '-',
        user3: r["USUARIO 3"] || '-',
        // 🆕 Novos campos de agendamento integrados:
        dataAgendamento: r["DATA AGENDAMENTO"] || '-',
        horaAgendamento: r["HORA AGENDAMENTO"] || '-',
        profissional: (r["PROFISSIONAL"] || '-').toUpperCase().trim()
      };
    });

    return res.json({
      sucesso: true,
      totalRegistros: dadosTabela.length,
      contadores: contadores,
      dadosTabela: dadosTabela
    });

  } catch (erro) {
    return res.status(500).json({ sucesso: false, erro: 'Erro no motor de relatórios do servidor: ' + erro.message });
  }
});


app.listen(port, () => {
  console.log(`🚀 Servidor a correr perfeitamente em http://localhost:${port}`);
});
