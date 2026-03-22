const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const uploadRouter = require('./upload');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(bodyParser.json());
mongoose.connect('mongodb://localhost:27017/uploadzone', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

// API yönlendirmeleri
app.use(uploadRouter);

// API dinleme
app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});