require('dotenv').config();
const fs = require('fs');
const express = require('express');
const cors = require('cors'); 
const bodyParser = require('body-parser');
const { PollyClient, SynthesizeSpeechCommand } = require("@aws-sdk/client-polly");
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

// ------------------ MIDDLEWARE ------------------
origin: ['https://angular-polly-app.onrender.com']
app.use(express.json());
app.use(bodyParser.json());

// ------------------ SUPABASE CLIENT ------------------
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ------------------ AWS POLLY CLIENT ------------------
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
        const text = req.body.text || "Hello from Amazon Polly";
        const voice = req.body.voice || "Joanna";

        const params = { OutputFormat: "mp3", Text: text, VoiceId: voice };
        const command = new SynthesizeSpeechCommand(params);
        const result = await polly.send(command);

        const chunks = [];
        for await (const chunk of result.AudioStream) {
            chunks.push(chunk);
        }
        const audioBuffer = Buffer.concat(chunks);

        res.setHeader("Content-Type", "audio/mpeg");
        res.send(audioBuffer);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// Supabase Auth - REGISTER
app.post('/api/auth/register', async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        const { data: existingUser } = await supabase
            .from('users')
            .select('id')
            .eq('email', email)
            .maybeSingle();

        if (existingUser) return res.status(409).json({ error: 'Email already registered' });

        const password_hash = bcrypt.hashSync(password, 10);

        const { data, error } = await supabase
            .from('users')
            .insert([{ name, email, password_hash }])
            .select()
            .single();

        if (error) return res.status(400).json({ error: error.message });

        res.status(201).json({ message: 'User registered successfully', user: { id: data.id, name: data.name, email: data.email } });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Supabase Auth - LOGIN
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const { data } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

        if (!data) return res.status(400).json({ error: 'User not found' });

        const valid = bcrypt.compareSync(password, data.password_hash);
        if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

        res.json({ message: 'Login successful', user: { id: data.id, name: data.name, email: data.email } });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ------------------ START SERVER ------------------
app.listen(PORT, () => {
    console.log(`✅ Server running at http://localhost:${PORT}`);
});

// Supabase Auth - CHANGE PASSWORD
app.post('/api/auth/change-password', async (req, res) => {
    const { email, oldPassword, newPassword } = req.body;

    // 1. Debugging: Check if email arrived
    if (!email) {
        return res.status(400).json({ message: "Email is missing from request" });
    }

    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

        if (error || !user) {
            return res.status(404).json({ message: "User not found" });
        }

        // 2. Verify Old Password
        const isMatch = bcrypt.compareSync(oldPassword, user.password_hash);
        if (!isMatch) {
            return res.status(400).json({ message: "Current password is wrong" });
        }

        // 3. Hash New Password
        const newHash = bcrypt.hashSync(newPassword, 10);

        // 4. Update Database
        const { error: updateError } = await supabase
            .from('users')
            .update({ password_hash: newHash })
            .eq('email', email);

        if (updateError) throw updateError;

        res.json({ message: "Password updated successfully!" });

   // server.js
} catch (err) {
    console.error("CRITICAL BACKEND ERROR:", err); 
    // Always send a JSON object so Angular doesn't get 'undefined'
    return res.status(500).json({ 
        message: "Database Error: " + (err.message || "Unknown server crash") 
    });
}
});