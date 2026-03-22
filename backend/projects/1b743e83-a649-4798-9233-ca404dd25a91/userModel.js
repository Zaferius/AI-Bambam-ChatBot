const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { 
        type: String, 
        required: true, 
        unique: true 
    },
    password: { 
        type: String, 
        required: true 
    },
    credits: { 
        type: Number, 
        default: 100    // Yeni kullanıcılar 100 kredi ile başlar
    },
    usageHistory: [{ 
        type: Object 
    }],
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

module.exports = User;