const multer = require('multer');

const storage = multer.memoryStorage();

const uploadImages = multer({
    storage: storage,
    limits: {
        fileSize: 7 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
        const mimeTypes = ['image/jpeg', 'image/pjpeg', 'image/png', 'image/gif', 'image/webp'];
        if (mimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Tipo de arquivo inválido. Apenas imagens (jpg, png, gif, webp) são permitidas.'), false);
        }
    }
}).array('imagens', 5);

const uploadCsv = multer({
    storage: storage,
    limits: {
        fileSize: 7 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv') {
            cb(null, true);
        } else {
            cb(new Error('Tipo de arquivo inválido. Apenas arquivos .csv são permitidos.'), false);
        }
    }
}).single('csvfile');

module.exports = { uploadImages, uploadCsv };
