const express = require('express');

const router = express.Router();
let usageHistory = {};  // Mock usage history storage

// Kullanım geçmişini alma
router.get('/api/usage', (req, res) => {
    const historyList = usageHistory;
    return res.status(200).json(historyList);
});

// Kullanım geçmişine ekleme
router.post('/api/usage/add', (req, res) => {
    const { username, usage } = req.body;
    if (!usageHistory[username]) usageHistory[username] = [];
    usageHistory[username].push(usage);
    return res.status(200).json({ message: 'Usage history updated successfully', history: usageHistory[username] });
});

// Kullanım geçmişini temizleme
router.post('/api/usage/clear', (req, res) => {
    const { username } = req.body;
    usageHistory[username] = [];
    return res.status(200).json({ message: 'Usage history cleared successfully' });
});

module.exports = router;