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

        const ayAdi = aylar[ay - 1];
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
        
        if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY eksik!");

        // YENİ PROMPT: Sadece kısa özetler ve "sorgu_anahtari" istiyoruz. Hız inanılmaz artacak.
        const prompt = `Bugün günlerden ${gun} ${ayAdi}. 
Hafızanı tarayarak, dünya tarihinde tam olarak bu tarihte yaşanmış olaylar arasından EN ÖNEMLİ ve İLGİ ÇEKİCİ tam 5 farklı olayı seç (Bilim, Sanat, Siyaset, Özel Gün vb. çeşitli olsun).

Lütfen SADECE aşağıdaki JSON dizisi formatında yanıt ver:
[
  {
    "buton_basligi": "Discord butonu için 2-3 kelimelik çarpıcı başlık",
    "kategori": "Olayın kategorisi",
    "kisa_ozet": "Olayın ne olduğunu anlatan 1 cümlelik net özet",
    "sorgu_anahtari": "MAKSİMUM 5-6 KELİMELİK, olayı eşsiz tanımlayan anahtar kelime öbeği (Örn: '1969 Apollo 11 Ay İnişi' veya '1453 İstanbul un Fethi'). Bu veri Discord butonuna gömülecek."
  }
]`;

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
            tarih: `${gun} ${ayAdi}`,
            olaylar: aiSonuc
        }), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });

    } catch (error) {
        return new Response(JSON.stringify({ status: "error", message: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}
