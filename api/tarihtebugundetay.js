export const config = {
    runtime: 'edge',
};

export default async function handler(request) {
    try {
        const url = new URL(request.url);
        let olayAnahtari = url.searchParams.get('olay');

        if (!olayAnahtari) {
            return new Response(JSON.stringify({ status: "error", message: "Lütfen bir 'olay' parametresi girin." }), {
                status: 400, headers: { 'Content-Type': 'application/json' }
            });
        }

        const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
        if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY eksik!");

        // YAPAY ZEKADAN BELGESEL İSTİYORUZ
        const prompt = `Sen çok bilgili, diksiyonu düzgün ve akıcı konuşan bir tarihçisin. 
Bana aşağıda anahtar kelimesi/konusu verilen tarihi olayı detaylı, ilgi çekici ve sürükleyici bir belgesel diliyle (yaklaşık 2-3 paragraf halinde) anlat. Metin sadece Türkçe olsun ve doğrudan hikayeye giriş yap.

Olay/Konu: ${olayAnahtari}

Lütfen SADECE aşağıdaki JSON formatında yanıt ver:
{
  "hikaye": "Anlattığın sürükleyici hikaye buraya gelecek."
}`;

        const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        const aiData = await aiResponse.json();
        let aiText = aiData.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '').trim();
        const aiSonuc = JSON.parse(aiText);

        return new Response(JSON.stringify({
            durum: "basarili",
            aranan_olay: olayAnahtari,
            hikaye: aiSonuc.hikaye
        }), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });

    } catch (error) {
        return new Response(JSON.stringify({ status: "error", message: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}
