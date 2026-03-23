const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) return res.status(500).json({ error: 'API key tanımlı değil' });

  const { contents, systemPrompt } = req.body;

  const payload = JSON.stringify({
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: {
      temperature: 1.2,
      maxOutputTokens: 250,
      topP: 0.95
    }
  });

  const options = {
    hostname: 'generativelanguage.googleapis.com',
    path: `/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  try {
    const result = await new Promise((resolve, reject) => {
      const request = https.request(options, (response) => {
        let body = '';
        response.on('data', chunk => body += chunk);
        response.on('end', () => {
          try {
            resolve({ status: response.statusCode, data: JSON.parse(body) });
          } catch(e) {
            reject(new Error('JSON parse hatası: ' + body.slice(0, 200)));
          }
        });
      });
      request.on('error', reject);
      request.write(payload);
      request.end();
    });

    if (result.status !== 200) {
      return res.status(result.status).json({
        error: result.data?.error?.message || `Gemini HTTP ${result.status}`
      });
    }

    const text = result.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return res.status(500).json({ error: 'Gemini boş yanıt döndürdü' });
    return res.status(200).json({ text });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
