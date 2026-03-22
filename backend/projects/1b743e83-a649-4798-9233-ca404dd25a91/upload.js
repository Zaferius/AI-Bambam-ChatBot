const express = require('express');
const multer = require('multer');
const path = require('path');

const router = express.Router();
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // Yüklenen dosyaların kaydedileceği klasör
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname)); // Dosya adını benzersiz yapmak için zaman damgası ekliyoruz
    }
});

const upload = multer({ storage });

// Dosya yükleme endpoint
router.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'Dosya yüklenirken bir hata oluştu.' });
    }
    return res.status(200).json({ message: 'Dosya başarıyla yüklendi.', filePath: req.file.path });
});

module.exports = router;