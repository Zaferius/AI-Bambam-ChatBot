const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.post('/convert', upload.single('image'), async (req, res) => {
    try {
        const inputFilePath = path.join(__dirname, '../', req.file.path);
        const outputFileName = `${Date.now()}.png`;
        const outputFilePath = path.join(__dirname, '../uploads/', outputFileName);

        await sharp(inputFilePath)
            .toFormat('png')
            .toFile(outputFilePath);

        // Dosya işlemeyi bitirdikten sonra geçici dosyayı sil
        fs.unlinkSync(inputFilePath);

        res.download(outputFilePath, (err) => {
            if (err) {
                res.status(500).send('Dosya indirilemedi');
            }
            fs.unlinkSync(outputFilePath); // İndirildikten sonra sonucu sil
        });
    } catch (error) {
        res.status(500).send('Dönüştürme sırasında bir hata oluştu');
    }
});

module.exports = { imageRouter: router };