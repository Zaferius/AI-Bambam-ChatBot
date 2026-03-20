const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Dosya yükleme ayarları
const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// PNG dosyasını yükleme
app.post('/upload', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }
    res.status(200).send({ message: 'File uploaded successfully!', filename: req.file.filename });
});

// PNG dosyasını JPEG'e dönüştürme
app.post('/convert', async (req, res) => {
    const { filename } = req.body; // Yüklenmiş dosya adı
    const inputPath = path.join(__dirname, 'uploads', filename);
    const outputPath = path.join(__dirname, 'converted', `${path.parse(filename).name}.jpeg`);
    
    try {
        await sharp(inputPath).jpeg().toFile(outputPath);
        res.status(200).send({ message: 'File converted successfully!', output: outputPath });
    } catch (error) {
        res.status(500).send('Conversion failed.');
    }
});

// Dönüştürülmüş dosyayı indirme
app.get('/download/:filename', (req, res) => {
    const file = path.join(__dirname, 'converted', req.params.filename);
    res.download(file);
});

// Sunucuyu başlat
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});