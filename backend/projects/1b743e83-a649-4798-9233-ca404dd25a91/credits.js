const express = require('express');
const router = express.Router();
let userCredits = {};  // Mock user credits storage

// Kullanıcı kredilerini alma
router.get('/api/credits', (req, res) => {
    const creditsList = userCredits;
    return res.status(200).json(creditsList);
});

// Kullanıcı kredilerini güncelleme
router.post('/api/credits/update', (req, res) => {
    const { username, credits } = req.body;
    userCredits[username] = (userCredits[username] || 0) + credits;
    return res.status(200).json({ message: 'Credits updated successfully', credits: userCredits[username] });
});

// Kullanıcı kredilerini sıfırlama
router.post('/api/credits/reset', (req, res) => {
    const { username } = req.body;
    userCredits[username] = 0;
    return res.status(200).json({ message: 'Credits reset successfully' });
});

module.exports = router;