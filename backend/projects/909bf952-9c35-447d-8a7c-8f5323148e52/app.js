const express = require('express');
const { imageRouter } = require('./routes/imageConverter');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use('/api', imageRouter);

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});