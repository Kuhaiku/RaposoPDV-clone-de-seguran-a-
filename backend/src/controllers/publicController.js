const pool = require('../config/database');

exports.obterCatalogoPorSlug = async (req, res) => {
    const { slug } = req.params;
    
    try {
        const [empresas] = await pool.query('SELECT id, nome_empresa FROM empresas WHERE slug = ? AND ativo = 1', [slug]);
        if (empresas.length === 0) {
            return res.status(404).json({ message: 'Catálogo não encontrado.' });
        }
        const empresa = empresas[0];

        const [produtos] = await pool.query(
            `SELECT p.id, p.nome, p.descricao, p.preco, p.codigo, p.categoria,
                    COALESCE(JSON_ARRAYAGG(f.url), JSON_ARRAY()) as fotos
             FROM produtos p
             LEFT JOIN produto_fotos f ON p.id = f.produto_id
             WHERE p.empresa_id = ? AND p.ativo = 1
             GROUP BY p.id
             ORDER BY p.nome ASC`,
            [empresa.id]
        );

        const [categoriasRows] = await pool.query(
            'SELECT DISTINCT categoria FROM produtos WHERE empresa_id = ? AND ativo = 1 AND categoria IS NOT NULL AND categoria != "" ORDER BY categoria ASC',
            [empresa.id]
        );
        const categorias = categoriasRows.map(row => row.categoria);

        res.status(200).json({
            nome_empresa: empresa.nome_empresa,
            produtos: produtos,
            categorias: categorias
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro no servidor ao buscar catálogo.' });
    }
};