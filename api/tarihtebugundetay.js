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

        // --- YENİ: UNIX Zaman Damgası Hesaplama ---
        const simdi = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
        const yil = simdi.getFullYear();
        const ay = simdi.getMonth();
        const gun = simdi.getDate();
        const hedefTarih = new Date(yil, ay, gun, 12, 0, 0); // O günün öğlen 12:00'si referans alınır
        const unixZamanDamgasi = Math.floor(hedefTarih.getTime() / 1000);

        const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
        if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY eksik!");

        // YAPAY ZEKADAN BELGESEL İSTİYORUZ (JSON DAYATMASI KALDIRILDI)
        // YENİ: İlk satırın başlık olmasını istiyoruz
        const prompt = `Sen çok bilgili, diksiyonu düzgün ve akıcı konuşan bir tarihçisin. 
Bana aşağıda anahtar kelimesi/konusu verilen tarihi olayı detaylı, ilgi çekici ve sürükleyici bir belgesel diliyle (yaklaşık 2-3 paragraf halinde) anlat. Metin sadece Türkçe olsun.

DİKKAT: JSON formatı veya süslü parantez KULLANMA. Sadece düz metin yaz.
Yanıtının EN ÜSTÜNDEKİ İLK SATIRA kesinlikle olayla ilgili emojili, çok çarpıcı ve kısa bir başlık yaz (Örn: 🚀 Ay'a İlk Adım).
Hemen altındaki satırdan itibaren doğrudan hikayeyi anlatmaya başla.

Olay/Konu: ${olayAnahtari}`;

        const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        const aiData = await aiResponse.json();
        
        // JSON parse derdinden kurtulduk! Doğrudan yapay zekanın yazdığı temiz, düz metni alıyoruz.
        let aiText = aiData.candidates[0].content.parts[0].text.trim();
        
        // --- YENİ: Başlık ve Hikayeyi Ayırma Mantığı ---
        // Metni satır satır bölüyoruz
        let satirlar = aiText.split('\n');
        
        // İlk satırı başlık olarak alıyoruz (Yapay zeka kalınlaştırma ** kullandıysa temizliyoruz)
        let uretilenBaslik = satirlar[0].replace(/\*/g, '').trim(); 
        
        // İlk satırı atıp, geriye kalan tüm satırları tekrar birleştirerek hikayeyi oluşturuyoruz
        let hikayeMetni = satirlar.slice(1).join('\n').trim();

        return new Response(JSON.stringify({
            durum: "basarili",
            aranan_olay: olayAnahtari,
            baslik: uretilenBaslik,
            unix_zaman_damgasi: unixZamanDamgasi,
            hikaye: hikayeMetni
        }), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });

    } catch (error) {
        return new Response(JSON.stringify({ status: "error", message: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}
