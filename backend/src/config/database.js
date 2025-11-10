const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // ADIÇÃO CRÍTICA: Garante que a conexão use UTF-8
  charset: 'utf8mb4'
});

// Testa a conexão para garantir que tudo está certo na inicialização
pool.getConnection()
    .then(connection => {
        console.log('Conexão com o banco de dados bem-sucedida!');
        connection.release(); // Libera a conexão de volta para o pool
    })
    .catch(err => {
        console.error('Erro ao conectar com o banco de dados:', err);
    });

module.exports = pool;
