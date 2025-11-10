const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path'); // Importa o módulo 'path' do Node.js

require('./config/database');
dotenv.config();

// Importa todas as nossas rotas
const superAdminRoutes = require('./routes/superAdminRoutes');
const empresaRoutes = require('./routes/empresaRoutes');
const usuarioRoutes = require('./routes/usuarioRoutes');
const clienteRoutes = require('./routes/clienteRoutes');
const produtoRoutes = require('./routes/produtoRoutes');
const vendaRoutes = require('./routes/vendaRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const caixaRoutes = require('./routes/caixaRoutes');
const publicRoutes = require('./routes/publicRoutes');
const pagamentoRoutes = require('./routes/pagamentoRoutes');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// --- ROTAS DA API ---
// Todas as nossas rotas de API continuam funcionando normalmente
app.use('/api/publico', publicRoutes);
app.use('/api/superadmin', superAdminRoutes);
app.use('/api/empresas', empresaRoutes);
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/clientes', clienteRoutes);
app.use('/api/produtos', produtoRoutes);
app.use('/api/vendas', vendaRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/caixa', caixaRoutes);
app.use('/api/pagamentos', pagamentoRoutes);

// --- SERVINDO O FRONTEND ---
// O servidor agora serve os arquivos estáticos da pasta 'frontend'
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

// Rota "catch-all" para direcionar para o login principal se nenhuma rota de API for encontrada
app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'superadmin-login.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});