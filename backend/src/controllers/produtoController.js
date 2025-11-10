// ./backend/src/controllers/produtoController.js
const pool = require('../config/database');
const cloudinary = require('../config/cloudinary');
const csv = require('csv-parser');
const { Readable } = require('stream');

// Criar um novo produto
exports.criar = async (req, res) => {
    // <<<--- ADICIONADO LOGGING --->>>
    console.log('--- Received request to create product ---');
    console.log('req.body:', req.body); // Mostra os campos de texto recebidos
    console.log('req.files:', req.files); // Mostra os arquivos recebidos
    // <<<--- FIM LOGGING --->>>

    const empresa_id = req.empresaId;
    const { nome, descricao, preco, estoque, categoria, codigo } = req.body;
    const codigoFinal = codigo || '0';
    const files = req.files || [];
    let connection;

    // Validação de campos obrigatórios
    if (!nome || !preco || !estoque) {
        // <<<--- ADICIONADO LOGGING ANTES DO ERRO --->>>
        console.error('Validation failed: Missing required fields (nome, preco, or estoque).');
        console.error('Received data:', { nome, preco, estoque });
        // <<<--- FIM LOGGING --->>>
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

        // Lógica de upload de imagem (inalterada)
        if (files.length > 0) {
            const [empresaRows] = await connection.query('SELECT slug FROM empresas WHERE id = ?', [empresa_id]);
            if (empresaRows.length === 0 || !empresaRows[0].slug) {
                throw new Error('Diretório da empresa não encontrado.');
            }
            const folderPath = `raposopdv/${empresaRows[0].slug}/produtos`;

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
        console.error('Error during product creation:', error); // Log detalhado do erro
        // Envia a mensagem de erro específica, se houver, ou uma genérica
        res.status(500).json({ message: error.message || 'Erro no servidor ao criar produto.' });
    } finally {
        if (connection) connection.release();
    }
};

// ATENÇÃO: O restante das funções (listarTodos, obterPorId, atualizar, etc.) continua abaixo...
// Certifique-se de que o código abaixo desta função não foi removido acidentalmente.

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

        // CORREÇÃO: Busca mais detalhes das fotos
        const [fotosRows] = await pool.query('SELECT id, url, public_id FROM produto_fotos WHERE produto_id = ?', [id]);

        let fotos = fotosRows;
        // Se não houver fotos na tabela produto_fotos, mas houver na coluna antiga, usa a antiga
        // Idealmente, você migraria os dados da coluna antiga para a nova tabela
        if (fotos.length === 0 && rows[0].foto_url) {
            // Adiciona a foto antiga como se fosse da nova tabela (para compatibilidade)
            fotos.push({ id: null, url: rows[0].foto_url, public_id: rows[0].foto_public_id });
        }


        const produto = { ...rows[0], fotos: fotos };
        res.status(200).json(produto);
    } catch (error) {
         console.error("Erro ao obter produto por ID:", error); // Log do erro
        res.status(500).json({ message: error.message || 'Erro ao obter produto.' });
    }
};


// Atualizar um produto existente
exports.atualizar = async (req, res) => {
    const { id } = req.params;
    const empresa_id = req.empresaId;
    const { nome, descricao, preco, estoque, categoria, codigo, fotosParaRemover } = req.body;
    const codigoFinal = codigo || '0';
    const files = req.files || [];
    let connection;

     // <<<--- ADD LOGGING HERE --->>>
    console.log('--- Received request to update product ---');
    console.log('req.body:', req.body);
    console.log('req.files:', req.files);
    console.log('fotosParaRemover (raw):', fotosParaRemover);
    // <<<--- END LOGGING --->>>

    // Validação básica (pode adicionar mais se necessário)
    if (!nome || preco === undefined || estoque === undefined) {
         console.error('Validation failed: Missing required fields for update (nome, preco, or estoque).');
         console.error('Received data:', { nome, preco, estoque });
         return res.status(400).json({ message: 'Nome, preço e estoque são obrigatórios para atualizar.' });
    }


    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1. Lógica para REMOVER fotos existentes
        if (fotosParaRemover) {
             let fotosARemoverArray = [];
             try {
                // Tenta parsear o JSON que vem do frontend
                fotosARemoverArray = JSON.parse(fotosParaRemover);
                console.log('Parsed fotosParaRemover:', fotosARemoverArray); // Log após parse
             } catch (parseError) {
                 console.error("Erro ao parsear 'fotosParaRemover':", parseError);
                 // Decide se quer lançar um erro ou apenas ignorar a remoção
                 // throw new Error("Formato inválido para 'fotosParaRemover'.");
                 // Ou apenas loga e continua:
                 console.warn("Continuando sem remover fotos devido a erro no parse.");
             }


            if (Array.isArray(fotosARemoverArray) && fotosARemoverArray.length > 0) {
                 // Filtra para garantir que temos public_id válidos
                 const publicIdsParaDeletar = fotosARemoverArray
                     .map(f => f.public_id)
                     .filter(pid => pid); // Remove null/undefined public_id

                 if (publicIdsParaDeletar.length > 0) {
                     console.log('Attempting to delete from Cloudinary:', publicIdsParaDeletar);
                     // Deleta do Cloudinary
                     await cloudinary.api.delete_resources(publicIdsParaDeletar);
                 } else {
                      console.log("Nenhum public_id válido encontrado em fotosParaRemover para deletar do Cloudinary.");
                 }


                 // Filtra para garantir que temos IDs válidos para deletar do DB
                 const idsParaDeletarDB = fotosARemoverArray
                    .map(f => f.id)
                    .filter(id => id !== null && id !== undefined); // Remove null/undefined ids


                 if (idsParaDeletarDB.length > 0) {
                      console.log('Attempting to delete from DB (produto_fotos):', idsParaDeletarDB);
                     // Deleta do banco de dados (apenas IDs que não são null)
                     await connection.query('DELETE FROM produto_fotos WHERE id IN (?) AND produto_id = ?', [idsParaDeletarDB, id]);
                 } else {
                      console.log("Nenhum ID válido encontrado em fotosParaRemover para deletar do banco de dados.");
                 }

            }
        }

        // 2. Lógica para ADICIONAR novas fotos
        if (files.length > 0) {
            console.log(`Uploading ${files.length} new images...`);
            const [empresaRows] = await connection.query('SELECT slug FROM empresas WHERE id = ?', [empresa_id]);
            if (empresaRows.length === 0 || !empresaRows[0].slug) {
                throw new Error('Diretório da empresa não encontrado para upload.');
            }
            const folderPath = `raposopdv/${empresaRows[0].slug}/produtos`;

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
                console.log('Inserting new photos into DB:', fotosParaSalvar);
                await connection.query('INSERT INTO produto_fotos (produto_id, url, public_id) VALUES ?', [fotosParaSalvar]);
            }
        }

        // 3. Atualiza os outros dados do produto
        console.log(`Updating product text fields for ID ${id}...`);
        const [updateResult] = await connection.query(
            'UPDATE produtos SET nome = ?, descricao = ?, preco = ?, estoque = ?, categoria = ?, codigo = ? WHERE id = ? AND empresa_id = ?',
            [nome, descricao, preco, estoque, categoria, codigoFinal, id, empresa_id]
        );

         if (updateResult.affectedRows === 0) {
            // Se não atualizou, pode ser que o produto não exista ou não pertença à empresa
            await connection.rollback(); // Desfaz qualquer alteração de foto
            return res.status(404).json({ message: 'Produto não encontrado ou não pertence a esta empresa.' });
        }


        await connection.commit();
        console.log(`Product ID ${id} updated successfully.`);
        res.status(200).json({ message: 'Produto atualizado com sucesso!' });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error("Erro ao atualizar produto:", error);
        res.status(500).json({ message: error.message || 'Erro no servidor ao atualizar produto.' });
    } finally {
        if (connection) connection.release();
    }
};

// Excluir (Inativar) um produto
exports.excluir = async (req, res) => {
    const { id } = req.params;
    const empresa_id = req.empresaId;
    console.log(`--- Received request to inactivate product ID: ${id} for Empresa ID: ${empresa_id} ---`);
    try {
        const [result] = await pool.query('UPDATE produtos SET ativo = 0 WHERE id = ? AND empresa_id = ?', [id, empresa_id]);
        if (result.affectedRows === 0) {
            console.warn(`Product ID ${id} not found or does not belong to Empresa ID ${empresa_id}.`);
            return res.status(404).json({ message: 'Produto não encontrado ou não pertence a esta empresa.' });
        }
        console.log(`Product ID ${id} inactivated successfully.`);
        res.status(200).json({ message: 'Produto inativado com sucesso.' });
    } catch (error) {
        console.error(`Error inactivating product ID ${id}:`, error);
        res.status(500).json({ message: 'Erro ao inativar produto.' });
    }
};


// Listar produtos inativos
exports.listarInativos = async (req, res) => {
    const empresa_id = req.empresaId;
    console.log(`--- Received request to list inactive products for Empresa ID: ${empresa_id} ---`);
    try {
        const [rows] = await pool.query(`
            SELECT p.id, p.nome, p.preco, p.estoque, p.codigo,
                   COALESCE((SELECT url FROM produto_fotos WHERE produto_id = p.id ORDER BY id LIMIT 1), p.foto_url) AS foto_url
            FROM produtos p
            WHERE p.ativo = 0 AND p.empresa_id = ?
            ORDER BY p.nome ASC
        `, [empresa_id]);
        console.log(`Found ${rows.length} inactive products.`);
        res.status(200).json(rows);
    } catch (error) {
        console.error(`Error listing inactive products for Empresa ID ${empresa_id}:`, error);
        res.status(500).json({ message: 'Erro ao listar produtos inativos.' });
    }
};

// Reativar um produto
exports.reativar = async (req, res) => {
    const { id } = req.params;
    const empresa_id = req.empresaId;
     console.log(`--- Received request to reactivate product ID: ${id} for Empresa ID: ${empresa_id} ---`);
    try {
        const [result] = await pool.query('UPDATE produtos SET ativo = 1 WHERE id = ? AND empresa_id = ?', [id, empresa_id]);
        if (result.affectedRows === 0) {
             console.warn(`Product ID ${id} not found or does not belong to Empresa ID ${empresa_id} for reactivation.`);
            return res.status(404).json({ message: 'Produto inativo não encontrado ou não pertence a esta empresa.' });
        }
         console.log(`Product ID ${id} reactivated successfully.`);
        res.status(200).json({ message: 'Produto reativado com sucesso.' });
    } catch (error) {
        console.error(`Error reactivating product ID ${id}:`, error);
        res.status(500).json({ message: 'Erro ao reativar produto.' });
    }
};

// Inativar produtos em massa
exports.inativarEmMassa = async (req, res) => {
    const empresa_id = req.empresaId;
    const { ids } = req.body;
     console.log(`--- Received request to batch inactivate products for Empresa ID: ${empresa_id} ---`);
     console.log('Product IDs:', ids);


    if (!Array.isArray(ids) || ids.length === 0) {
         console.warn("Batch inactivation failed: No product IDs provided.");
        return res.status(400).json({ message: 'Nenhum ID de produto fornecido.' });
    }

    try {
        // Validação extra: Garante que todos os IDs são números
        const numericIds = ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
        if (numericIds.length !== ids.length) {
             console.warn("Batch inactivation failed: Some provided IDs were not valid numbers.");
             return res.status(400).json({ message: 'Um ou mais IDs fornecidos são inválidos.' });
        }
        if (numericIds.length === 0) {
             console.warn("Batch inactivation failed: No valid numeric IDs provided after filtering.");
             return res.status(400).json({ message: 'Nenhum ID de produto válido fornecido.' });
        }


        const placeholders = numericIds.map(() => '?').join(',');
        const query = `UPDATE produtos SET ativo = 0 WHERE id IN (${placeholders}) AND empresa_id = ?`;

        const [result] = await pool.query(query, [...numericIds, empresa_id]);
        console.log(`${result.affectedRows} product(s) inactivated successfully.`);

        res.status(200).json({
            message: `${result.affectedRows} produto(s) inativado(s) com sucesso.`,
            inativados: result.affectedRows
        });
    } catch (error) {
        console.error(`Error during batch inactivation for Empresa ID ${empresa_id}:`, error);
        res.status(500).json({ message: 'Erro ao inativar produtos em massa.' });
    }
};

// Excluir produtos em massa permanentemente
exports.excluirEmMassa = async (req, res) => {
    const empresa_id = req.empresaId;
    const { ids } = req.body;
    console.log(`--- Received request to batch delete products for Empresa ID: ${empresa_id} ---`);
    console.log('Product IDs:', ids);

    if (!Array.isArray(ids) || ids.length === 0) {
         console.warn("Batch deletion failed: No product IDs provided.");
        return res.status(400).json({ message: 'Nenhum ID de produto fornecido.' });
    }

     // Validação extra: Garante que todos os IDs são números
    const numericIds = ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    if (numericIds.length !== ids.length) {
         console.warn("Batch deletion failed: Some provided IDs were not valid numbers.");
         return res.status(400).json({ message: 'Um ou mais IDs fornecidos são inválidos.' });
    }
     if (numericIds.length === 0) {
         console.warn("Batch deletion failed: No valid numeric IDs provided after filtering.");
         return res.status(400).json({ message: 'Nenhum ID de produto válido fornecido.' });
    }


    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

         console.log("Checking for existing sales related to product IDs:", numericIds);
        // Verifica se algum produto está associado a vendas
        const [vendaItens] = await connection.query(`SELECT DISTINCT produto_id FROM venda_itens WHERE produto_id IN (?) LIMIT 1`, [numericIds]);
        if (vendaItens.length > 0) {
            await connection.rollback();
            const relatedProductId = vendaItens[0].produto_id;
            console.warn(`Batch deletion failed: Product ID ${relatedProductId} is associated with existing sales.`);
            return res.status(400).json({ message: `Não é possível excluir o produto ID ${relatedProductId} (e talvez outros) pois está associado a vendas existentes. Considere inativar.` });
        }

        // Busca public_ids das fotos associadas aos produtos a serem excluídos
        console.log("Fetching photo public_ids for products to be deleted:", numericIds);
        const [fotosParaDeletar] = await connection.query(`SELECT public_id FROM produto_fotos WHERE produto_id IN (?)`, [numericIds]);
        const publicIdsParaDeletarCloudinary = fotosParaDeletar.map(f => f.public_id).filter(pid => pid); // Filtra nulos/vazios

        // Deleta as fotos da tabela produto_fotos
         console.log("Deleting photo records from DB for product IDs:", numericIds);
        await connection.query(`DELETE FROM produto_fotos WHERE produto_id IN (?)`, [numericIds]);

        // Deleta os produtos da tabela produtos
         console.log("Deleting product records from DB for product IDs:", numericIds);
        const [result] = await connection.query(`DELETE FROM produtos WHERE id IN (?) AND empresa_id = ?`, [numericIds, empresa_id]);

         // Se a exclusão no banco foi bem-sucedida, deleta do Cloudinary
         if (publicIdsParaDeletarCloudinary.length > 0) {
             console.log("Deleting photos from Cloudinary:", publicIdsParaDeletarCloudinary);
             try {
                 await cloudinary.api.delete_resources(publicIdsParaDeletarCloudinary);
                 console.log("Cloudinary photos deleted successfully.");
             } catch (cloudinaryError) {
                 // Loga o erro do Cloudinary mas não impede a resposta de sucesso,
                 // pois os produtos foram removidos do banco. Pode exigir limpeza manual.
                 console.error("Error deleting photos from Cloudinary (products already deleted from DB):", cloudinaryError);
             }
         }


        await connection.commit();
        console.log(`${result.affectedRows} product(s) deleted permanently.`);
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
    const empresa_id = req.empresaId;
     console.log(`--- Received request to import CSV for Empresa ID: ${empresa_id} ---`);

    if (!req.file) {
         console.warn("CSV import failed: No file uploaded.");
        return res.status(400).json({ message: 'Nenhum arquivo CSV enviado.' });
    }

    const produtos = [];
    const fileContent = req.file.buffer.toString('utf8');
    const stream = Readable.from(fileContent);

    stream
        .pipe(csv({
            // Tenta mapear colunas comuns, ignorando case e espaços extras
            mapHeaders: ({ header }) => header.trim().toLowerCase(),
            // Não pula a primeira linha automaticamente, vamos verificar os headers
            // skipLines: 1
        }))
        .on('error', (error) => {
            console.error("Error parsing CSV stream:", error);
            // Verifica se o erro é por falta de header 'nome' (indicativo de CSV mal formatado)
            if (error.message.includes("header 'nome'")) {
                 res.status(400).json({ message: 'Erro ao processar CSV: Cabeçalho inválido ou ausente. Verifique se a primeira linha contém as colunas corretas (nome, preco, estoque, etc.).' });
            } else {
                 res.status(400).json({ message: `Erro ao processar CSV: ${error.message}` });
            }
        })
        .on('headers', (headers) => {
             console.log('CSV Headers:', headers);
             // Validação básica dos headers essenciais
             if (!headers.includes('nome') || !headers.includes('preco') || !headers.includes('estoque')) {
                  console.error("CSV import failed: Missing required headers (nome, preco, estoque).");
                  stream.destroy(); // Para o processamento
                  // Envia a resposta aqui, pois o 'end' pode não ser chamado após destroy
                  // Use um flag para evitar enviar resposta duas vezes se 'end' for chamado
                  if (!res.headersSent) {
                    res.status(400).json({ message: 'Cabeçalho inválido no arquivo CSV. As colunas "nome", "preco" e "estoque" são obrigatórias.' });
                  }
             }
        })
        .on('data', (row) => {
            // Adiciona validação simples para cada linha
            if (row.nome && row.preco && row.estoque) {
                produtos.push(row);
            } else {
                 console.warn("Skipping CSV row due to missing data:", row);
                 // Opcional: poderia coletar erros por linha aqui
            }
        })
        .on('end', async () => {
             console.log(`CSV parsing finished. Found ${produtos.length} valid product rows.`);
            // Verifica se a resposta já foi enviada (por erro de header)
            if (res.headersSent) {
                 return;
            }

            if (produtos.length === 0) {
                 console.warn("CSV import failed: No valid product data found after parsing.");
                return res.status(400).json({ message: 'O arquivo CSV está vazio ou não contém dados de produto válidos nas linhas.' });
            }

            let connection; // Mova a declaração para fora do try/catch/finally
             try {
                 connection = await pool.getConnection(); // Obtém conexão aqui
                 await connection.beginTransaction();
                 console.log(`Starting DB insertion for ${produtos.length} products...`);
                 let insertedCount = 0;
                 let skippedCount = 0;

                 for (const produto of produtos) {
                     // Tratamento mais robusto dos dados
                     const nome = String(produto.nome || '').trim();
                     const precoStr = String(produto.preco || '0').replace(',', '.'); // Troca vírgula por ponto
                     const preco = parseFloat(precoStr);
                     const estoqueStr = String(produto.estoque || '0');
                     const estoque = parseInt(estoqueStr, 10);
                     const categoria = String(produto.categoria || '').trim() || null; // Usa null se vazio
                     const descricao = String(produto.descricao || '').trim() || null;
                     const codigo = String(produto.codigo || '0').trim();
                     const foto_url = String(produto.foto_url || '').trim() || null;
                     const foto_public_id = String(produto.foto_public_id || '').trim() || null;


                     // Validação crucial antes de inserir
                     if (!nome || isNaN(preco) || isNaN(estoque) || preco < 0 || estoque < 0) {
                          console.warn(`Skipping invalid product data during DB insertion:`, { nome, preco, estoque, raw: produto });
                          skippedCount++;
                          continue; // Pula para o próximo produto
                     }


                     try {
                         const [result] = await connection.query(
                             'INSERT INTO produtos (empresa_id, nome, descricao, preco, estoque, categoria, codigo) VALUES (?, ?, ?, ?, ?, ?, ?)',
                             [empresa_id, nome, descricao, preco, estoque, categoria, codigo]
                         );
                         const insertedProductId = result.insertId;
                         insertedCount++;

                         // Insere foto apenas se URL existir
                         if (foto_url) {
                             await connection.query(
                                 'INSERT INTO produto_fotos (produto_id, url, public_id) VALUES (?, ?, ?)',
                                 [insertedProductId, foto_url, foto_public_id]
                             );
                         }
                     } catch (dbError) {
                          // Se der erro ao inserir (ex: nome duplicado), loga e continua com os outros
                          console.error(`Error inserting product "${nome}" into DB:`, dbError.message);
                          skippedCount++;
                          // Não faz rollback aqui, apenas pula este produto
                     }
                 }

                 await connection.commit();
                 console.log(`CSV import finished. Inserted: ${insertedCount}, Skipped: ${skippedCount}`);
                 let message = `${insertedCount} produto(s) importado(s) com sucesso!`;
                 if (skippedCount > 0) {
                     message += ` ${skippedCount} linha(s) foram ignoradas devido a dados inválidos ou erros.`;
                 }
                 res.status(201).json({ message: message });
            } catch (error) {
                 if (connection) await connection.rollback(); // Rollback em caso de erro geral
                 console.error('Error during CSV DB operation:', error);
                 res.status(500).json({ message: error.message || 'Erro ao salvar produtos do CSV no banco de dados.' });
            } finally {
                 if (connection) connection.release(); // Libera a conexão
            }
        });
};
