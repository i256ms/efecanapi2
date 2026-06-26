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

        // BDFD'de kullanabilmen için o günün Unix zaman damgasını (mevcut yıla göre) hesapla
        const yil = simdi.getFullYear();
        const hedefTarih = new Date(yil, ay - 1, gun, 12, 0, 0); // O günün öğlen 12:00'si referans alınır
        const unixZamanDamgasi = Math.floor(hedefTarih.getTime() / 1000);

        const ayAdi = aylar[ay - 1];
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
        
        if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY eksik!");

        // YENİ PROMPT: Mesaj başlığı eklendi
        const prompt = `Bugün günlerden ${gun} ${ayAdi}. 
Hafızanı tarayarak, dünya tarihinde tam olarak bu tarihte yaşanmış olaylar arasından EN ÖNEMLİ ve İLGİ ÇEKİCİ tam 5 farklı olayı seç (Bilim, Sanat, Siyaset, Özel Gün vb. çeşitli olsun).

Lütfen SADECE aşağıdaki JSON dizisi formatında yanıt ver:
[
  {
    "mesaj_basligi": "Discord embed açıklaması (description) için kullanılacak, ilgili bir emoji içeren 3-5 kelimelik şık bir başlık (Örn: 🚀 Apollo 11 Ay'a İndi)",
    "buton_basligi": "Discord butonu için 2-3 kelimelik çarpıcı, kısa başlık (Örn: Ay'a İlk Adım)",
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

        // --- YENİ EKLENEN KISIM: Discord Buton Optimizasyonu ---
        // Gelen diziyi gezip, Discord custom_id limitine takılmamak için
        // URL encode (%20) YAPMADAN, sadece boşlukları alt çizgiye (_) çeviriyoruz.
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
        return new Response(JSON.stringify({ status: "error", message: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}
