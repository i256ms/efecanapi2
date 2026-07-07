export const config = {
    runtime: 'edge',
};

const aylar = [
    "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", 
    "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"
];

export default async function handler(request) {
    try {
        const url = new URL(request.url);
        let gun = url.searchParams.get('gun');
        let ay = url.searchParams.get('ay');

        const simdi = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
        if (!gun) gun = simdi.getDate();
        if (!ay) ay = simdi.getMonth() + 1;

        // BDFD'de kullanabilmen için o günün Unix zaman damgasını hesapla
        const yil = simdi.getFullYear();
        const hedefTarih = new Date(yil, ay - 1, gun, 12, 0, 0);
        const unixZamanDamgasi = Math.floor(hedefTarih.getTime() / 1000);

        const ayAdi = aylar[ay - 1];
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
        
        if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY eksik!");

        const prompt = `Bugün günlerden ${gun} ${ayAdi}. 
Hafızanı tarayarak, dünya tarihinde tam olarak bu tarihte yaşanmış olaylar arasından EN ÖNEMLİ ve İLGİ ÇEKİCİ tam 5 farklı olayı seç (Bilim, Sanat, Siyaset, Özel Gün vb. çeşitli olsun).

Lütfen SADECE aşağıdaki JSON dizisi formatında yanıt ver:
[
  {
    "mesaj_basligi": "Discord embed açıklaması (description) için kullanılacak, ilgili bir emoji içeren 3-5 kelimelik şık bir başlık (Örn: 🚀 Apollo 11 Ay'a İndi)",
    "buton_basligi": "Discord butonu için 2-3 kelimelik çarpıcı, kısa başlık (Örn: Ay'a İlk Adım)",
    "kategori": "Olayın kategorisi",
    "kisa_ozet": "Olayın ne olduğunu anlatan 1 cümlelik net özet",
    "sorgu_anahtari": "MAKSİMUM 5-6 KELİMELİK, olayı eşsiz tanımlayan anahtar kelime öbeği. Bu veri Discord butonuna gömülecek."
  }
]`;

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
        
        // --- YENİ EKLENEN KOTA VE HATA KONTROLÜ ---
        if (aiData.error) {
            if (aiData.error.code === 429 || aiResponse.status === 429) {
                return new Response(JSON.stringify({
                    durum: "kota_doldu",
                    mesaj: "⏳ Sistem şu an çok yoğun! Lütfen yaklaşık 1 dakika bekleyip komutu tekrar kullanın."
                }), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } }); 
            }
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
        // ------------------------------------------

        let aiText = aiData.candidates[0].content.parts[0].text.replace(/[\n\r\t]/g, ' ').replace(/```json/g, '').replace(/```/g, '').trim();
        const aiSonuc = JSON.parse(aiText);

        const islenmisOlaylar = aiSonuc.map(olay => ({
            ...olay,
            sorgu_anahtari_kisa: olay.sorgu_anahtari.replace(/\s+/g, '_')
        }));

        return new Response(JSON.stringify({
            durum: "basarili",
            tarih: `${gun} ${ayAdi}`,
            unix_zaman_damgasi: unixZamanDamgasi,
            olaylar: islenmisOlaylar
        }), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });

    } catch (error) {
        return new Response(JSON.stringify({ durum: "hata", mesaj: error.message }), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
    }
}
