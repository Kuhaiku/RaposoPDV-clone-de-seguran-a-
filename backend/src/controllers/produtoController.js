// kuhaiku/raposopdv-clone-de-seguran-a-/RaposoPDV-clone-de-seguran-a--ecc43fce32c508b3c04deaa885b72392025744b2/backend/src/controllers/produtoController.js
const pool = require('../config/database');
const cloudinary = require('../config/cloudinary');
const csv = require('csv-parser');
const { Readable } = require('stream');

/**
 * Helper para formatar a data no formato DD-MM-YY
 * (Esta é a função que cria as pastas de período, ex: 10-11-25)
 */
function getHojeFormatado() {
  const today = new Date();
  const dia = String(today.getDate()).padStart(2, '0');
  const mes = String(today.getMonth() + 1).padStart(2, '0'); // Mês é 0-indexed
  const ano = String(today.getFullYear()).slice(-2);
  return `${dia}-${mes}-${ano}`; // Formato DD-MM-YY
}

// -----------------------------------------------------------------------------
// AÇÃO 1: CRIAR PRODUTO (Upload para pasta de período E ID do produto)
// -----------------------------------------------------------------------------
exports.criar = async (req, res) => {
    console.log('--- CHAMANDO: exports.criar ---');
    const empresa_id = req.empresaId;
    // Usa a nova coluna 'status'
    const { nome, descricao, preco, estoque, categoria, codigo } = req.body;
    const codigoFinal = codigo || '0';
    const files = req.files || [];
    let connection;

    if (!nome || !preco || !estoque) {
        return res.status(400).json({ message: 'Nome, preço e estoque são obrigatórios.' });
    }

    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // INSERE com status 'ativo'
        const [dbResult] = await connection.query(
            'INSERT INTO produtos (empresa_id, nome, descricao, preco, estoque, categoria, codigo, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [empresa_id, nome, descricao, preco, estoque, categoria, codigoFinal, 'ativo']
        );
        const produtoId = dbResult.insertId;

        // Lógica de upload de imagem
        if (files.length > 0) {
            const [empresaRows] = await connection.query('SELECT slug FROM empresas WHERE id = ?', [empresa_id]);
            if (empresaRows.length === 0 || !empresaRows[0].slug) {
                throw new Error('Diretório da empresa não encontrado.');
            }
            
            // --- LÓGICA DE PASTA DATADA (PERÍODO) ---
            const subfolderData = getHojeFormatado();
            // Caminho corrigido: slug / data / produtos / ID_DO_PRODUTO
            const folderPath = `raposopdv/${empresaRows[0].slug}/${subfolderData}/produtos/${produtoId}`;
            console.log(`[CRIAR] Uploading para pasta: ${folderPath}`);

            const uploadPromises = files.map(file => {
                return new Promise((resolve, reject) => {
                    const uploadStream = cloudinary.uploader.upload_stream(
                        { folder: folderPath },
                        (error, result) => {
                            if (error) reject(error);
                            else resolve(result);
                        }
                    );
                    uploadStream.end(file.buffer);
                });
            });

            const results = await Promise.all(uploadPromises);
            const fotosParaSalvar = results.map(result => [produtoId, result.secure_url, result.public_id]);
            await connection.query(
                'INSERT INTO produto_fotos (produto_id, url, public_id) VALUES ?',
                [fotosParaSalvar]
            );
        }

        await connection.commit();
        res.status(201).json({ message: 'Produto criado com sucesso!', produtoId: produtoId });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error during product creation:', error); 
        res.status(500).json({ message: error.message || 'Erro no servidor ao criar produto.' });
    } finally {
        if (connection) connection.release();
    }
};

// Listar todos os produtos ATIVOS da empresa logada
exports.listarTodos = async (req, res) => {
    const empresa_id = req.empresaId;
    const { sortBy = 'nome-asc' } = req.query;

    const ordenacaoMap = {
        'preco-asc': 'p.preco ASC',
        'preco-desc': 'p.preco DESC',
        'nome-asc': 'p.nome ASC',
        'id-asc': 'p.id ASC',
        'id-desc': 'p.id DESC'
    };
    const orderByClause = ordenacaoMap[sortBy] || 'p.nome ASC';

    try {
        // Busca onde status = 'ativo'
        const [rows] = await pool.query(`
            SELECT p.id, p.nome, p.preco, p.estoque, p.codigo,
                   COALESCE((SELECT url FROM produto_fotos WHERE produto_id = p.id ORDER BY id LIMIT 1), p.foto_url) AS foto_url
            FROM produtos p
            WHERE p.status = 'ativo' AND p.empresa_id = ?
            ORDER BY ${orderByClause}
        `, [empresa_id]);
        res.status(200).json(rows);
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Erro ao listar produtos.' });
    }
};

// Obter um produto específico por ID
exports.obterPorId = async (req, res) => {
    const { id } = req.params;
    const empresa_id = req.empresaId;
    try {
        const [rows] = await pool.query('SELECT * FROM produtos WHERE id = ? AND empresa_id = ?', [id, empresa_id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Produto não encontrado.' });
        }
        const [fotosRows] = await pool.query('SELECT id, url, public_id FROM produto_fotos WHERE produto_id = ?', [id]);
        let fotos = fotosRows;
        if (fotos.length === 0 && rows[0].foto_url) {
            fotos.push({ id: null, url: rows[0].foto_url, public_id: rows[0].foto_public_id });
        }
        const produto = { ...rows[0], fotos: fotos };
        res.status(200).json(produto);
    } catch (error) {
         console.error("Erro ao obter produto por ID:", error);
        res.status(500).json({ message: error.message || 'Erro ao obter produto.' });
    }
};


// Atualizar um produto existente
exports.atualizar = async (req, res) => {
    console.log('--- CHAMANDO: exports.atualizar ---');
    const { id } = req.params; // ID do produto
    const empresa_id = req.empresaId;
    const { nome, descricao, preco, estoque, categoria, codigo, fotosParaRemover } = req.body;
    const codigoFinal = codigo || '0';
    const files = req.files || [];
    let connection;

    if (!nome || preco === undefined || estoque === undefined) {
         return res.status(400).json({ message: 'Nome, preço e estoque são obrigatórios para atualizar.' });
    }

    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1. Lógica para REMOVER fotos (Exclusão permanente do Cloudinary)
        if (fotosParaRemover) {
             let fotosARemoverArray = [];
             try { fotosARemoverArray = JSON.parse(fotosParaRemover); } 
             catch (parseError) { console.error("Erro ao parsear 'fotosParaRemover':", parseError); }

            if (Array.isArray(fotosARemoverArray) && fotosARemoverArray.length > 0) {
                 const publicIdsParaDeletar = fotosARemoverArray.map(f => f.public_id).filter(pid => pid); 
                 if (publicIdsParaDeletar.length > 0) {
                     console.log('[ATUALIZAR] Deletando fotos do Cloudinary:', publicIdsParaDeletar);
                     await cloudinary.api.delete_resources(publicIdsParaDeletar);
                 }
                 const idsParaDeletarDB = fotosARemoverArray.map(f => f.id).filter(id => id !== null && id !== undefined); 
                 if (idsParaDeletarDB.length > 0) {
                     await connection.query('DELETE FROM produto_fotos WHERE id IN (?) AND produto_id = ?', [idsParaDeletarDB, id]);
                 }
            }
        }

        // 2. Lógica para ADICIONAR novas fotos (para pasta de período E ID do produto)
        if (files.length > 0) {
            console.log(`[ATUALIZAR] Uploading ${files.length} new images...`);
            const [empresaRows] = await connection.query('SELECT slug FROM empresas WHERE id = ?', [empresa_id]);
            if (empresaRows.length === 0 || !empresaRows[0].slug) {
                throw new Error('Diretório da empresa não encontrado para upload.');
            }
            
            // --- LÓGICA DE PASTA DATADA (PERÍODO) ---
            const subfolderData = getHojeFormatado();
            // Caminho corrigido: slug / data / produtos / ID_DO_PRODUTO
            const folderPath = `raposopdv/${empresaRows[0].slug}/${subfolderData}/produtos/${id}`;
            console.log(`[ATUALIZAR] Uploading para pasta: ${folderPath}`);

            const uploadPromises = files.map(file => {
                return new Promise((resolve, reject) => {
                    const uploadStream = cloudinary.uploader.upload_stream({ folder: folderPath }, (error, result) => {
                        if (error) { reject(error); } else { resolve(result); }
                    });
                    uploadStream.end(file.buffer);
                });
            });

            const results = await Promise.all(uploadPromises);
            const fotosParaSalvar = results.map(result => [id, result.secure_url, result.public_id]);
            if(fotosParaSalvar.length > 0) {
                await connection.query('INSERT INTO produto_fotos (produto_id, url, public_id) VALUES ?', [fotosParaSalvar]);
            }
        }

        // 3. Atualiza os outros dados do produto (NÃO mexe no status aqui)
        console.log(`[ATUALIZAR] Atualizando dados do produto ID ${id}...`);
        const [updateResult] = await connection.query(
            'UPDATE produtos SET nome = ?, descricao = ?, preco = ?, estoque = ?, categoria = ?, codigo = ? WHERE id = ? AND empresa_id = ?',
            [nome, descricao, preco, estoque, categoria, codigoFinal, id, empresa_id]
        );

         if (updateResult.affectedRows === 0) {
            await connection.rollback(); 
            return res.status(404).json({ message: 'Produto não encontrado ou não pertence a esta empresa.' });
        }

        await connection.commit();
        res.status(200).json({ message: 'Produto atualizado com sucesso!' });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error("Erro ao atualizar produto:", error);
        res.status(500).json({ message: error.message || 'Erro no servidor ao atualizar produto.' });
    } finally {
        if (connection) connection.release();
    }
};

// -----------------------------------------------------------------------------
// AÇÃO 2: INATIVAR PRODUTO (Mover para pasta "inativos/{id}" DENTRO DO PERÍODO)
// -----------------------------------------------------------------------------
exports.excluir = async (req, res) => {
    console.log('--- CHAMANDO: exports.excluir (INATIVAR) ---');
    const { id } = req.params;
    const empresa_id = req.empresaId;
    let connection;

    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1. Buscar slug da empresa
        const [empresaRows] = await connection.query('SELECT slug FROM empresas WHERE id = ?', [empresa_id]);
        if (empresaRows.length === 0 || !empresaRows[0].slug) {
            throw new Error('Empresa não encontrada.');
        }
        const slug = empresaRows[0].slug;
        
        // ***** MODIFICAÇÃO CHAVE 1 *****
        const subfolderData = getHojeFormatado(); // Pega o período atual (data)
        // O destino base agora inclui o ID do produto
        const pastaDestino = `raposopdv/${slug}/${subfolderData}/inativos/${id}`;
        // ***** FIM DA MODIFICAÇÃO *****

        // 2. Buscar fotos do produto
        const [fotos] = await connection.query('SELECT id, public_id FROM produto_fotos WHERE produto_id = ?', [id]);
        console.log(`[INATIVAR] Encontradas ${fotos.length} fotos para o produto ${id}.`);

        // 3. Mover fotos no Cloudinary
        for (const foto of fotos) {
            // Só move se não estiver já em uma pasta 'inativos'
            if (foto.public_id && !foto.public_id.includes('/inativos/')) { 
                try {
                    // Pega SÓ o nome do arquivo (ex: abc.jpg)
                    const basePublicId = foto.public_id.split('/').pop();
                    // O novo ID será a pasta destino + nome do arquivo
                    const newPublicId = `${pastaDestino}/${basePublicId}`;
                    
                    console.log(`[INATIVAR] MOVENDO ${foto.public_id} para ${newPublicId}`);
                    // Renomeia (move) o arquivo
                    const result = await cloudinary.uploader.rename(foto.public_id, newPublicId);
                    
                    // 4. Atualizar DB com nova URL e public_id
                    await connection.query(
                        'UPDATE produto_fotos SET url = ?, public_id = ? WHERE id = ?',
                        [result.secure_url, result.public_id, foto.id]
                    );
                } catch (renameError) {
                    // ***** MODIFICAÇÃO CHAVE 2 *****
                    // Se der erro ao mover a foto, joga o erro para fora do loop
                    // Isso vai parar a execução e acionar o rollback da transação
                    console.error(`[INATIVAR] Erro ao mover foto ${foto.public_id}: ${renameError.message}`);
                    throw renameError; // <-- Joga o erro para o catch principal
                    // ***** FIM DA MODIFICAÇÃO *****
                }
            } else {
                console.log(`[INATIVAR] Ignorando foto ${foto.public_id} (já está em 'inativos' ou não tem public_id).`);
            }
        }

        // 5. Inativar o produto no DB (seta status = 'inativo')
        console.log(`[INATIVAR] Marcando produto ${id} como 'inativo' no banco de dados.`);
        const [result] = await connection.query("UPDATE produtos SET status = 'inativo' WHERE id = ? AND empresa_id = ?", [id, empresa_id]);
        if (result.affectedRows === 0) {
            throw new Error('Produto não encontrado ou não pertence a esta empresa.');
        }

        await connection.commit();
        res.status(200).json({ message: 'Produto inativado e fotos movidas para "inativos" com sucesso.' });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error(`Error inactivating product ID ${id}:`, error);
        res.status(500).json({ message: error.message || 'Erro ao inativar produto.' });
    } finally {
        if (connection) connection.release();
    }
};


// Listar produtos INATIVOS (para a tela de Inativos)
exports.listarInativos = async (req, res) => {
    const empresa_id = req.empresaId;
    try {
        // Busca onde status = 'inativo' E TAMBÉM 'excluido'
        // A tela de "Inativos" agora mostra os dois, para permitir a exclusão permanente
        const [rows] = await pool.query(`
            SELECT p.id, p.nome, p.preco, p.estoque, p.codigo, p.status,
                   COALESCE((SELECT url FROM produto_fotos WHERE produto_id = p.id ORDER BY id LIMIT 1), p.foto_url) AS foto_url
            FROM produtos p
            WHERE (p.status = 'inativo' OR p.status = 'excluido') AND p.empresa_id = ?
            ORDER BY p.nome ASC
        `, [empresa_id]);
        res.status(200).json(rows);
    } catch (error) {
        console.error(`Error listing inactive products for Empresa ID ${empresa_id}:`, error);
        res.status(500).json({ message: 'Erro ao listar produtos inativos.' });
    }
};

// -----------------------------------------------------------------------------
// AÇÃO 3: REATIVAR PRODUTO (Mover de "inativos/{id}" para pasta de período E ID do produto)
// -----------------------------------------------------------------------------
exports.reativar = async (req, res) => {
    console.log('--- CHAMANDO: exports.reativar ---');
    const { id } = req.params; // ID do produto
    const empresa_id = req.empresaId;
    let connection;

    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1. Buscar slug da empresa
        const [empresaRows] = await connection.query('SELECT slug FROM empresas WHERE id = ?', [empresa_id]);
        if (empresaRows.length === 0 || !empresaRows[0].slug) {
            throw new Error('Empresa não encontrada.');
        }
        const slug = empresaRows[0].slug;
        
        // Define a pasta de destino com a data ATUAL (período de reativação) E ID
        const subfolderData = getHojeFormatado();
        const pastaDestino = `raposopdv/${slug}/${subfolderData}/produtos/${id}`;

        // 2. Buscar fotos do produto (que estão na pasta 'inativos')
        const [fotos] = await connection.query('SELECT id, public_id FROM produto_fotos WHERE produto_id = ?', [id]);
        console.log(`[REATIVAR] Encontradas ${fotos.length} fotos para o produto ${id}.`);

        // 3. Mover fotos no Cloudinary
        for (const foto of fotos) {
            // Só move se AINDA estiver na pasta 'inativos'
            if (foto.public_id && foto.public_id.includes('/inativos/')) {
                try {
                    const basePublicId = foto.public_id.split('/').pop();
                    const newPublicId = `${pastaDestino}/${basePublicId}`;
                    
                    console.log(`[REATIVAR] MOVENDO ${foto.public_id} para ${newPublicId}`);
                    const result = await cloudinary.uploader.rename(foto.public_id, newPublicId);
                    
                    // 4. Atualizar DB com nova URL e public_id
                    await connection.query(
                        'UPDATE produto_fotos SET url = ?, public_id = ? WHERE id = ?',
                        [result.secure_url, result.public_id, foto.id]
                    );
                } catch (renameError) {
                    console.error(`[REATIVAR] Erro ao mover foto ${foto.public_id}: ${renameError.message}`);
                }
            } else {
                 console.log(`[REATIVAR] Ignorando foto ${foto.public_id} (não está em 'inativos' ou não tem public_id).`);
            }
        }

        // 5. Reativar o produto no DB (seta status = 'ativo')
        console.log(`[REATIVAR] Marcando produto ${id} como 'ativo' no banco de dados.`);
        const [result] = await connection.query("UPDATE produtos SET status = 'ativo' WHERE id = ? AND empresa_id = ?", [id, empresa_id]);
        if (result.affectedRows === 0) {
            throw new Error('Produto inativo não encontrado ou não pertence a esta empresa.');
        }
        
        await connection.commit();
        res.status(200).json({ message: 'Produto reativado e fotos restauradas com sucesso.' });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error(`Error reactivating product ID ${id}:`, error);
        res.status(500).json({ message: error.message || 'Erro ao reativar produto.' });
    } finally {
        if (connection) connection.release();
    }
};


// -----------------------------------------------------------------------------
// AÇÃO 4: EXCLUIR PERMANENTEMENTE (Marcar como "excluido" e Deletar fotos)
// -----------------------------------------------------------------------------
exports.excluirEmMassa = async (req, res) => {
    console.log('--- CHAMANDO: exports.excluirEmMassa (MARCAR COMO EXCLUÍDO E DELETAR FOTOS) ---');
    const empresa_id = req.empresaId;
    const { ids } = req.body; // Recebe um array de IDs

    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: 'Nenhum ID de produto fornecido.' });
    }

    const numericIds = ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    if (numericIds.length !== ids.length || numericIds.length === 0) {
         return res.status(400).json({ message: 'IDs fornecidos são inválidos.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1. Busca fotos para deletar (DE ONDE ESTIVEREM, /inativos/ ou /produtos/)
        console.log("[EXCLUIR PERM] Buscando fotos para deletar...");
        const [fotosParaDeletar] = await connection.query(`SELECT public_id FROM produto_fotos WHERE produto_id IN (?)`, [numericIds]);
        const publicIdsParaDeletarCloudinary = fotosParaDeletar.map(f => f.public_id).filter(pid => pid); 

        // 2. Deleta as fotos do Cloudinary
         if (publicIdsParaDeletarCloudinary.length > 0) {
             console.log("[EXCLUIR PERM] Deletando fotos do Cloudinary:", publicIdsParaDeletarCloudinary);
             try {
                 // DELETA PERMANENTEMENTE DO CLOUDINARY
                 await cloudinary.api.delete_resources(publicIdsParaDeletarCloudinary);
                 console.log("[EXCLUIR PERM] Fotos do Cloudinary deletadas.");
             } catch (cloudinaryError) {
                 console.error("[EXCLUIR PERM] Erro ao deletar fotos do Cloudinary:", cloudinaryError);
             }
         }

        // 3. Deleta o registro das fotos no DB
        console.log("[EXCLUIR PERM] Deletando registros de fotos do DB...");
        await connection.query(`DELETE FROM produto_fotos WHERE produto_id IN (?)`, [numericIds]);

        // 4. MARCA OS PRODUTOS COMO 'excluido' no DB
        console.log("[EXCLUIR PERM] Marcando produtos como 'excluido' no DB...");
        const [result] = await connection.query(
            `UPDATE produtos SET status = 'excluido' WHERE id IN (?) AND empresa_id = ?`, 
            [numericIds, empresa_id]
        );

        await connection.commit();
        res.status(200).json({
            message: `${result.affectedRows} produto(s) marcado(s) como excluído(s) e fotos deletadas.`,
            excluidos: result.affectedRows
        });
    } catch (error) {
        // Se um produto com vendas for excluído, o DB vai reclamar por causa da FOREIGN KEY
        // na tabela 'venda_itens'.
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
             await connection.rollback();
             return res.status(400).json({ message: 'Erro: Um ou mais produtos estão associados a vendas existentes e não podem ser excluídos.' });
        }
        if (connection) await connection.rollback();
        console.error(`Error during batch exclusion for Empresa ID ${empresa_id}:`, error);
        res.status(500).json({ message: error.message || 'Erro ao excluir produtos.' });
    } finally {
        if (connection) connection.release();
    }
};

// -----------------------------------------------------------------------------
// FUNÇÕES AUXILIARES (Inativar em Massa, CSV)
// -----------------------------------------------------------------------------

// Inativar produtos em massa (Apenas marca, não move fotos)
exports.inativarEmMassa = async (req, res) => {
    console.log('--- CHAMANDO: exports.inativarEmMassa (Apenas DB) ---');
    const empresa_id = req.empresaId;
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: 'Nenhum ID de produto fornecido.' });
    }

    try {
        const numericIds = ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
        if (numericIds.length !== ids.length || numericIds.length === 0) {
             return res.status(400).json({ message: 'IDs fornecidos são inválidos.' });
        }
        
        console.log(`[INATIVAR MASSA] Inativando ${numericIds.length} produtos (fotos NÃO serão movidas).`);
        const placeholders = numericIds.map(() => '?').join(',');
        // Seta o status para 'inativo'
        const query = `UPDATE produtos SET status = 'inativo' WHERE id IN (${placeholders}) AND empresa_id = ?`;

        const [result] = await pool.query(query, [...numericIds, empresa_id]);

        res.status(200).json({
            message: `${result.affectedRows} produto(s) inativado(s) com sucesso. (Obs: Fotos não movidas em massa)`,
            inativados: result.affectedRows
        });
    } catch (error) {
        console.error(`Error during batch inactivation for Empresa ID ${empresa_id}:`, error);
        res.status(500).json({ message: 'Erro ao inativar produtos em massa.' });
    }
};

// Importar produtos via CSV
exports.importarCSV = async (req, res) => {
    console.log('--- CHAMANDO: exports.importarCSV ---');
    const empresa_id = req.empresaId;

    if (!req.file) {
        return res.status(400).json({ message: 'Nenhum arquivo CSV enviado.' });
    }

    const produtos = [];
    const fileContent = req.file.buffer.toString('utf8');
    const stream = Readable.from(fileContent);

    stream
        .pipe(csv({
            mapHeaders: ({ header }) => header.trim().toLowerCase(),
        }))
        .on('error', (error) => {
            console.error("Error parsing CSV stream:", error);
            if (error.message.includes("header 'nome'")) {
                 res.status(400).json({ message: 'Erro ao processar CSV: Cabeçalho inválido ou ausente. Verifique se a primeira linha contém as colunas corretas (nome, preco, estoque, etc.).' });
            } else {
                 res.status(400).json({ message: `Erro ao processar CSV: ${error.message}` });
            }
        })
        .on('headers', (headers) => {
             console.log('CSV Headers:', headers);
             if (!headers.includes('nome') || !headers.includes('preco') || !headers.includes('estoque')) {
                  console.error("CSV import failed: Missing required headers (nome, preco, estoque).");
                  stream.destroy(); 
                  if (!res.headersSent) {
                    res.status(400).json({ message: 'Cabeçalho inválido no arquivo CSV. As colunas "nome", "preco" e "estoque" são obrigatórias.' });
                  }
             }
        })
        .on('data', (row) => {
            if (row.nome && row.preco && row.estoque) {
                produtos.push(row);
            } else {
                 console.warn("Skipping CSV row due to missing data:", row);
            }
        })
        .on('end', async () => {
             console.log(`CSV parsing finished. Found ${produtos.length} valid product rows.`);
            if (res.headersSent) {
                 return;
            }
            if (produtos.length === 0) {
                return res.status(400).json({ message: 'O arquivo CSV está vazio ou não contém dados de produto válidos nas linhas.' });
            }
            let connection; 
             try {
                 connection = await pool.getConnection(); 
                 await connection.beginTransaction();
                 console.log(`[CSV] Starting DB insertion for ${produtos.length} products...`);
                 let insertedCount = 0;
                 let skippedCount = 0;
                 for (const produto of produtos) {
                     const nome = String(produto.nome || '').trim();
                     const precoStr = String(produto.preco || '0').replace(',', '.'); 
                     const preco = parseFloat(precoStr);
                     const estoqueStr = String(produto.estoque || '0');
                     const estoque = parseInt(estoqueStr, 10);
                     const categoria = String(produto.categoria || '').trim() || null; 
                     const descricao = String(produto.descricao || '').trim() || null;
                     const codigo = String(produto.codigo || '0').trim();
                     const foto_url = String(produto.foto_url || '').trim() || null;
                     const foto_public_id = String(produto.foto_public_id || '').trim() || null;
                     if (!nome || isNaN(preco) || isNaN(estoque) || preco < 0 || estoque < 0) {
                          console.warn(`[CSV] Skipping invalid product data during DB insertion:`, { nome, preco, estoque, raw: produto });
                          skippedCount++;
                          continue; 
                     }
                     try {
                         const [result] = await connection.query(
                             'INSERT INTO produtos (empresa_id, nome, descricao, preco, estoque, categoria, codigo, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                             [empresa_id, nome, descricao, preco, estoque, categoria, codigo, 'ativo'] // Adiciona status 'ativo'
                         );
                         const insertedProductId = result.insertId;
                         insertedCount++;
                         if (foto_url) {
                             await connection.query(
                                 'INSERT INTO produto_fotos (produto_id, url, public_id) VALUES (?, ?, ?)',
                                 [insertedProductId, foto_url, foto_public_id]
                             );
                         }
                     } catch (dbError) {
                          console.error(`[CSV] Error inserting product "${nome}" into DB:`, dbError.message);
                          skippedCount++;
                     }
                 }
                 await connection.commit();
                 console.log(`[CSV] Import finished. Inserted: ${insertedCount}, Skipped: ${skippedCount}`);
                 let message = `${insertedCount} produto(s) importado(s) com sucesso!`;
                 if (skippedCount > 0) {
                     message += ` ${skippedCount} linha(s) foram ignoradas devido a dados inválidos ou erros.`;
                 }
                 res.status(201).json({ message: message });
            } catch (error) {
                 if (connection) await connection.rollback(); 
                 console.error('[CSV] Error during DB operation:', error);
                 res.status(500).json({ message: error.message || 'Erro ao salvar produtos do CSV no banco de dados.' });
            } finally {
                 if (connection) connection.release(); 
            }
        });
};