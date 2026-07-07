export const config = {
    runtime: 'edge',
};

export default async function handler(request) {
    try {
        const url = new URL(request.url);
        let olayAnahtari = url.searchParams.get('olay');

        if (!olayAnahtari) {
            return new Response(JSON.stringify({ durum: "hata", mesaj: "Lütfen bir 'olay' parametresi girin." }), {
                status: 400, headers: { 'Content-Type': 'application/json' }
            });
        }

        // --- YENİ: UNIX Zaman Damgası Hesaplama ---
        const simdi = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
        const yil = simdi.getFullYear();
        const ay = simdi.getMonth();
        const gun = simdi.getDate();
        const hedefTarih = new Date(yil, ay, gun, 12, 0, 0); 
        const unixZamanDamgasi = Math.floor(hedefTarih.getTime() / 1000);

        const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
        if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY eksik!");

        const prompt = `Sen çok bilgili, diksiyonu düzgün ve akıcı konuşan bir tarihçisin. 
Bana aşağıda anahtar kelimesi/konusu verilen tarihi olayı detaylı, ilgi çekici ve sürükleyici bir belgesel diliyle (yaklaşık 2-3 paragraf halinde) anlat. Metin sadece Türkçe olsun.

DİKKAT: JSON formatı veya süslü parantez KULLANMA. Sadece düz metin yaz.
Yanıtının EN ÜSTÜNDEKİ İLK SATIRA kesinlikle olayla ilgili emojili, çok çarpıcı ve kısa bir başlık yaz (Örn: 🚀 Ay'a İlk Adım).
Hemen altındaki satırdan itibaren doğrudan hikayeyi anlatmaya başla.

Olay/Konu: ${olayAnahtari}`;

        const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                contents: [{ parts: [{ text: prompt }] }],
                safetySettings: [
                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                ]
            })
        });

        const aiData = await aiResponse.json();
        
        // --- GÜNCELLENMİŞ KOTA VE HATA YAKALAYICI ---
        if (aiData.error) {
            // Eğer Google "429 Too Many Requests" (Kota Doldu) hatası verirse:
            if (aiData.error.code === 429 || aiResponse.status === 429) {
                return new Response(JSON.stringify({
                    durum: "kota_doldu",
                    mesaj: "⏳ Sistem şu an çok yoğun! Dakikalık yapay zeka sınırına takıldık. Lütfen yaklaşık 1 dakika bekleyip butona tekrar tıklayın."
                }), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } }); 
                // BDFD rahat okusun diye bilerek status 200 döndürüyoruz.
            }
            
            // Diğer genel hatalar
            return new Response(JSON.stringify({
                durum: "hata",
                mesaj: "Yapay zeka bir sorunla karşılaştı.",
                gemini_hata_mesaji: aiData.error.message
            }), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
        }
        
        if (!aiData.candidates || !aiData.candidates[0] || !aiData.candidates[0].content) {
            return new Response(JSON.stringify({
                durum: "hata",
                mesaj: "Yapay zeka boş bir yanıt döndü. Lütfen tekrar deneyin."
            }), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
        }
        // -----------------------------------------------------------
        
        let aiText = aiData.candidates[0].content.parts[0].text.trim();
        let satirlar = aiText.split('\n');
        let uretilenBaslik = satirlar[0].replace(/\*/g, '').trim(); 
        let hikayeMetni = satirlar.slice(1).join('\n').trim();

        return new Response(JSON.stringify({
            durum: "basarili",
            aranan_olay: olayAnahtari,
            baslik: uretilenBaslik,
            unix_zaman_damgasi: unixZamanDamgasi,
            hikaye: hikayeMetni
        }), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });

    } catch (error) {
        return new Response(JSON.stringify({ durum: "hata", mesaj: error.message }), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
    }
}
