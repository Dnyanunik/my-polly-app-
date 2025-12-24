require('dotenv').config();
const express = require('express');
const cors = require('cors'); 
const bodyParser = require('body-parser');
const { PollyClient, SynthesizeSpeechCommand } = require("@aws-sdk/client-polly");
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken'); // Added for security tokens

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_key_123';

// ------------------ MIDDLEWARE ------------------
app.use(cors({ 
  origin: ['http://localhost:4200', 'https://angular-polly-app.onrender.com'],
  credentials: true 
}));
app.use(express.json());
app.use(bodyParser.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const polly = new PollyClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

// ------------------ ROUTES ------------------

// AWS Polly TTS
app.post("/speak", async (req, res) => {
    try {
        const { text, voice } = req.body;
        const params = { OutputFormat: "mp3", Text: text || "Hello", VoiceId: voice || "Joanna" };
        const command = new SynthesizeSpeechCommand(params);
        const result = await polly.send(command);

        const chunks = [];
        for await (const chunk of result.AudioStream) { chunks.push(chunk); }
        res.setHeader("Content-Type", "audio/mpeg");
        res.send(Buffer.concat(chunks));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// REGISTER
app.post('/api/auth/register', async (req, res) => {
    const { name, email, password } = req.body;
    try {
        const password_hash = bcrypt.hashSync(password, 10);
        const { data, error } = await supabase.from('users').insert([{ name, email, password_hash }]).select().single();
        if (error) return res.status(400).json({ error: error.message });
        res.status(201).json({ message: 'Registered successfully' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// LOGIN (Fixed to return a Token)
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const { data: user, error } = await supabase.from('users').select('*').eq('email', email).maybeSingle();
        if (error || !user) return res.status(400).json({ error: 'User not found' });

        const valid = bcrypt.compareSync(password, user.password_hash);
        if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

        // Generate the token so Angular can save it
        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1d' });

        res.json({ 
            message: 'Login successful', 
            token: token, // Sent to Frontend
            user: { id: user.id, name: user.name, email: user.email } 
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// CHANGE PASSWORD
app.post('/api/auth/change-password', async (req, res) => {
    const { email, oldPassword, newPassword } = req.body;
    try {
        const { data: user } = await supabase.from('users').select('*').eq('email', email).single();
        if (!user || !bcrypt.compareSync(oldPassword, user.password_hash)) {
            return res.status(400).json({ message: "Auth failed" });
        }
        const { error } = await supabase.from('users').update({ password_hash: bcrypt.hashSync(newPassword, 10) }).eq('email', email);
        if (error) throw error;
        res.json({ message: "Password updated!" });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

app.listen(PORT, () => console.log(`✅ Server running on ${PORT}`));