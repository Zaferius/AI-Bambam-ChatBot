const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const app = express();
const port = 3000;

// Dosya yükleme için multer yapılandırması
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// JPEG'den PNG'ye dönüştürme
app.post('/convert/jpeg-to-png', upload.single('file'), async (req, res) => {
    try {
        const buffer = await sharp(req.file.buffer).toFormat('png').toBuffer();
        res.type('png');
        res.send(buffer);
    } catch (error) {
        res.status(500).send({ error: 'Dönüştürme sırasında hata oluştu' });
    }
});

// PNG'den JPEG'e dönüştürme
app.post('/convert/png-to-jpeg', upload.single('file'), async (req, res) => {
    try {
        const buffer = await sharp(req.file.buffer).toFormat('jpeg').toBuffer();
        res.type('jpeg');
        res.send(buffer);
    } catch (error) {
        res.status(500).send({ error: 'Dönüştürme sırasında hata oluştu' });
    }
});

// Sunucu başlatma
app.listen(port, () => {
    console.log(`Sunucu http://localhost:${port} adresinde çalışıyor`);
});