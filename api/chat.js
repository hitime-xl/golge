export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) return res.status(500).json({ error: 'API key tanımlı değil' });

  const { contents, systemPrompt } = req.body;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;

  try {
    const geminiRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: {
          temperature: 1.2,
          maxOutputTokens: 250,
          topP: 0.95
        }
      })
    });

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      return res.status(geminiRes.status).json({ error: data.error?.message || 'Gemini hatası' });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '...';
    return res.status(200).json({ text });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
