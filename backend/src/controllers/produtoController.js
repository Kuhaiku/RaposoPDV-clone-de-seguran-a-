// ./backend/src/controllers/produtoController.js
const pool = require('../config/database');
const cloudinary = require('../config/cloudinary');
const csv = require('csv-parser');
const { Readable } = require('stream');

/**
 * Helper para formatar a data no formato DD-MM-YY
 * (Esta é a função que cria as pastas de período)
 */
function getHojeFormatado() {
  const today = new Date();
  const dia = String(today.getDate()).padStart(2, '0');
  const mes = String(today.getMonth() + 1).padStart(2, '0'); // Mês é 0-indexed
  const ano = String(today.getFullYear()).slice(-2);
  return `${dia}-${mes}-${ano}`; // Formato DD-MM-YY
}

// Criar um novo produto
exports.criar = async (req, res) => {
    console.log('--- CHAMANDO: exports.criar ---');
    const empresa_id = req.empresaId;
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

        const [dbResult] = await connection.query(
            'INSERT INTO produtos (empresa_id, nome, descricao, preco, estoque, categoria, codigo) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [empresa_id, nome, descricao, preco, estoque, categoria, codigoFinal]
        );
        const produtoId = dbResult.insertId;

        // Lógica de upload de imagem
        if (files.length > 0) {
            const [empresaRows] = await connection.query('SELECT slug FROM empresas WHERE id = ?', [empresa_id]);
            if (empresaRows.length === 0 || !empresaRows[0].slug) {
                throw new Error('Diretório da empresa não encontrado.');
            }
            
            // --- MODIFICAÇÃO: Adiciona subpasta de data ---
            const subfolderData = getHojeFormatado();
            const folderPath = `raposopdv/${empresaRows[0].slug}/produtos/${subfolderData}`;
            console.log(`[CRIAR] Uploading para pasta: ${folderPath}`);
            // --- FIM DA MODIFICAÇÃO ---

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
        const [rows] = await pool.query(`
            SELECT p.id, p.nome, p.preco, p.estoque, p.codigo,
                   COALESCE((SELECT url FROM produto_fotos WHERE produto_id = p.id ORDER BY id LIMIT 1), p.foto_url) AS foto_url
            FROM produtos p
            WHERE p.ativo = 1 AND p.empresa_id = ?
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
    const { id } = req.params;
    const empresa_id = req.empresaId;
    const { nome, descricao, preco, estoque, categoria, codigo, fotosParaRemover } = req.body;
    const codigoFinal = codigo || '0';
    const files = req.files || [];
    let connection;

    console.log('req.body:', req.body);
    console.log('req.files:', req.files);
    console.log('fotosParaRemover (raw):', fotosParaRemover);

    if (!nome || preco === undefined || estoque === undefined) {
         return res.status(400).json({ message: 'Nome, preço e estoque são obrigatórios para atualizar.' });
    }

    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1. Lógica para REMOVER fotos existentes (Exclusão permanente do Cloudinary)
        // Esta é a ação de clicar no 'X' em uma foto no modal de Edição.
        if (fotosParaRemover) {
             let fotosARemoverArray = [];
             try {
                fotosARemoverArray = JSON.parse(fotosParaRemover);
             } catch (parseError) {
                 console.error("Erro ao parsear 'fotosParaRemover':", parseError);
             }

            if (Array.isArray(fotosARemoverArray) && fotosARemoverArray.length > 0) {
                 const publicIdsParaDeletar = fotosARemoverArray.map(f => f.public_id).filter(pid => pid); 

                 if (publicIdsParaDeletar.length > 0) {
                     console.log('[ATUALIZAR] Deletando fotos do Cloudinary:', publicIdsParaDeletar);
                     // DELETA do Cloudinary
                     await cloudinary.api.delete_resources(publicIdsParaDeletar);
                 }

                 const idsParaDeletarDB = fotosARemoverArray.map(f => f.id).filter(id => id !== null && id !== undefined); 

                 if (idsParaDeletarDB.length > 0) {
                     console.log('[ATUALIZAR] Deletando fotos do DB (produto_fotos):', idsParaDeletarDB);
                     // DELETA do banco de dados
                     await connection.query('DELETE FROM produto_fotos WHERE id IN (?) AND produto_id = ?', [idsParaDeletarDB, id]);
                 }
            }
        }

        // 2. Lógica para ADICIONAR novas fotos
        if (files.length > 0) {
            console.log(`[ATUALIZAR] Uploading ${files.length} new images...`);
            const [empresaRows] = await connection.query('SELECT slug FROM empresas WHERE id = ?', [empresa_id]);
            if (empresaRows.length === 0 || !empresaRows[0].slug) {
                throw new Error('Diretório da empresa não encontrado para upload.');
            }
            
            // --- MODIFICAÇÃO: Adiciona subpasta de data ---
            const subfolderData = getHojeFormatado();
            const folderPath = `raposopdv/${empresaRows[0].slug}/produtos/${subfolderData}`;
            console.log(`[ATUALIZAR] Uploading para pasta: ${folderPath}`);
            // --- FIM DA MODIFICAÇÃO ---

            const uploadPromises = files.map(file => {
                return new Promise((resolve, reject) => {
                    const uploadStream = cloudinary.uploader.upload_stream({ folder: folderPath }, (error, result) => {
                        if (error) {
                             console.error("Cloudinary upload error:", error);
                             reject(error);
                        } else {
                             console.log("Cloudinary upload success:", result.secure_url);
                             resolve(result);
                        }
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

        // 3. Atualiza os outros dados do produto
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

// --- MODIFICAÇÃO CHAVE 1: Inativar produto E MOVER FOTOS ---
// A rota 'DELETE /produtos/:id' (excluir) agora significa INATIVAR e MOVER
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
        const pastaDestino = `raposopdv/${slug}/apagados`;

        // 2. Buscar fotos do produto
        const [fotos] = await connection.query('SELECT id, public_id FROM produto_fotos WHERE produto_id = ?', [id]);
        console.log(`[INATIVAR] Encontradas ${fotos.length} fotos para o produto ${id}.`);

        // 3. Mover fotos no Cloudinary
        for (const foto of fotos) {
            if (foto.public_id && !foto.public_id.includes('/apagados/')) { // Só move se não estiver lá
                try {
                    const basePublicId = foto.public_id.split('/').pop();
                    const newPublicId = `${pastaDestino}/${basePublicId}`;
                    
                    console.log(`[INATIVAR] MOVENDO ${foto.public_id} para ${newPublicId}`);
                    // O 'rename' move o arquivo
                    const result = await cloudinary.uploader.rename(foto.public_id, newPublicId);
                    
                    // 4. Atualizar DB com nova URL e public_id
                    await connection.query(
                        'UPDATE produto_fotos SET url = ?, public_id = ? WHERE id = ?',
                        [result.secure_url, result.public_id, foto.id]
                    );
                } catch (renameError) {
                    console.error(`[INATIVAR] Erro ao mover foto ${foto.public_id}: ${renameError.message}`);
                }
            } else {
                console.log(`[INATIVAR] Ignorando foto ${foto.public_id} (já está em apagados ou não tem public_id).`);
            }
        }

        // 5. Inativar o produto no DB
        console.log(`[INATIVAR] Inativando produto ${id} no banco de dados.`);
        const [result] = await connection.query('UPDATE produtos SET ativo = 0 WHERE id = ? AND empresa_id = ?', [id, empresa_id]);
        if (result.affectedRows === 0) {
            throw new Error('Produto não encontrado ou não pertence a esta empresa.');
        }

        await connection.commit();
        res.status(200).json({ message: 'Produto inativado e fotos movidas para "apagados" com sucesso.' });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error(`Error inactivating product ID ${id}:`, error);
        res.status(500).json({ message: error.message || 'Erro ao inativar produto.' });
    } finally {
        if (connection) connection.release();
    }
};


// Listar produtos inativos
exports.listarInativos = async (req, res) => {
    const empresa_id = req.empresaId;
    try {
        const [rows] = await pool.query(`
            SELECT p.id, p.nome, p.preco, p.estoque, p.codigo,
                   COALESCE((SELECT url FROM produto_fotos WHERE produto_id = p.id ORDER BY id LIMIT 1), p.foto_url) AS foto_url
            FROM produtos p
            WHERE p.ativo = 0 AND p.empresa_id = ?
            ORDER BY p.nome ASC
        `, [empresa_id]);
        res.status(200).json(rows);
    } catch (error) {
        console.error(`Error listing inactive products for Empresa ID ${empresa_id}:`, error);
        res.status(500).json({ message: 'Erro ao listar produtos inativos.' });
    }
};

// --- MODIFICAÇÃO CHAVE 2: Reativar produto E MOVER FOTOS DE VOLTA ---
exports.reativar = async (req, res) => {
    console.log('--- CHAMANDO: exports.reativar ---');
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
        
        // Define a pasta de destino com a data ATUAL
        const subfolderData = getHojeFormatado();
        const pastaDestino = `raposopdv/${slug}/produtos/${subfolderData}`;

        // 2. Buscar fotos do produto (que estão na pasta 'apagados')
        const [fotos] = await connection.query('SELECT id, public_id FROM produto_fotos WHERE produto_id = ?', [id]);
        console.log(`[REATIVAR] Encontradas ${fotos.length} fotos para o produto ${id}.`);

        // 3. Mover fotos no Cloudinary
        for (const foto of fotos) {
            // Só move se AINDA estiver na pasta 'apagados'
            if (foto.public_id && foto.public_id.includes('/apagados/')) {
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
                 console.log(`[REATIVAR] Ignorando foto ${foto.public_id} (não está em apagados ou não tem public_id).`);
            }
        }

        // 5. Reativar o produto no DB
        console.log(`[REATIVAR] Ativando produto ${id} no banco de dados.`);
        const [result] = await connection.query('UPDATE produtos SET ativo = 1 WHERE id = ? AND empresa_id = ?', [id, empresa_id]);
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


// Inativar produtos em massa
exports.inativarEmMassa = async (req, res) => {
    console.log('--- CHAMANDO: exports.inativarEmMassa ---');
    const empresa_id = req.empresaId;
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: 'Nenhum ID de produto fornecido.' });
    }

    try {
        const numericIds = ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
        if (numericIds.length !== ids.length) {
             return res.status(400).json({ message: 'Um ou mais IDs fornecidos são inválidos.' });
        }
        if (numericIds.length === 0) {
             return res.status(400).json({ message: 'Nenhum ID de produto válido fornecido.' });
        }
        
        // NOTA: Esta função de inativação em massa NÃO moverá as fotos para 'apagados'
        // para evitar sobrecarga de API. Apenas a inativação individual (exports.excluir) faz isso.
        console.log(`[INATIVAR MASSA] Inativando ${numericIds.length} produtos (fotos NÃO serão movidas).`);

        const placeholders = numericIds.map(() => '?').join(',');
        const query = `UPDATE produtos SET ativo = 0 WHERE id IN (${placeholders}) AND empresa_id = ?`;

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

// Excluir produtos em massa permanentemente
// ESTA É A ÚNICA FUNÇÃO QUE DELETA FOTOS DO CLOUDINARY PERMANENTEMENTE
exports.excluirEmMassa = async (req, res) => {
    console.log('--- CHAMANDO: exports.excluirEmMassa (DELEÇÃO PERMANENTE) ---');
    const empresa_id = req.empresaId;
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: 'Nenhum ID de produto fornecido.' });
    }

    const numericIds = ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    if (numericIds.length !== ids.length) {
         return res.status(400).json({ message: 'Um ou mais IDs fornecidos são inválidos.' });
    }
     if (numericIds.length === 0) {
         return res.status(400).json({ message: 'Nenhum ID de produto válido fornecido.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        console.log("[EXCLUIR MASSA] Verificando vendas existentes...");
        const [vendaItens] = await connection.query(`SELECT DISTINCT produto_id FROM venda_itens WHERE produto_id IN (?) LIMIT 1`, [numericIds]);
        if (vendaItens.length > 0) {
            await connection.rollback();
            const relatedProductId = vendaItens[0].produto_id;
            return res.status(400).json({ message: `Não é possível excluir o produto ID ${relatedProductId} (e talvez outros) pois está associado a vendas existentes. Considere inativar.` });
        }

        console.log("[EXCLUIR MASSA] Buscando fotos para deletar...");
        const [fotosParaDeletar] = await connection.query(`SELECT public_id FROM produto_fotos WHERE produto_id IN (?)`, [numericIds]);
        const publicIdsParaDeletarCloudinary = fotosParaDeletar.map(f => f.public_id).filter(pid => pid); 

        console.log("[EXCLUIR MASSA] Deletando fotos do DB...");
        await connection.query(`DELETE FROM produto_fotos WHERE produto_id IN (?)`, [numericIds]);

        console.log("[EXCLUIR MASSA] Deletando produtos do DB...");
        const [result] = await connection.query(`DELETE FROM produtos WHERE id IN (?) AND empresa_id = ?`, [numericIds, empresa_id]);

         if (publicIdsParaDeletarCloudinary.length > 0) {
             console.log("[EXCLUIR MASSA] Deletando fotos do Cloudinary:", publicIdsParaDeletarCloudinary);
             try {
                 await cloudinary.api.delete_resources(publicIdsParaDeletarCloudinary);
                 console.log("[EXCLUIR MASSA] Fotos do Cloudinary deletadas.");
             } catch (cloudinaryError) {
                 console.error("[EXCLUIR MASSA] Erro ao deletar fotos do Cloudinary (DB já modificado):", cloudinaryError);
             }
         }

        await connection.commit();
        res.status(200).json({
            message: `${result.affectedRows} produto(s) excluído(s) permanentemente.`,
            excluidos: result.affectedRows
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error(`Error during batch deletion for Empresa ID ${empresa_id}:`, error);
        res.status(500).json({ message: error.message || 'Erro ao excluir produtos em massa.' });
    } finally {
        if (connection) connection.release();
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
                             'INSERT INTO produtos (empresa_id, nome, descricao, preco, estoque, categoria, codigo) VALUES (?, ?, ?, ?, ?, ?, ?)',
                             [empresa_id, nome, descricao, preco, estoque, categoria, codigo]
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