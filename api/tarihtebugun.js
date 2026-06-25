const aylar = [
    "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", 
    "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"
];

export default async function handler(request, response) {
    try {
        let { gun, ay } = request.query;

        // Varsayılan olarak bugünün tarihini al
        const simdi = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
        if (!gun) gun = simdi.getDate();
        if (!ay) ay = simdi.getMonth() + 1;

        gun = parseInt(gun);
        ay = parseInt(ay);
        if (isNaN(gun) || isNaN(ay) || gun < 1 || gun > 31 || ay < 1 || ay > 12) {
            return response.status(400).json({ status: "error", message: "Geçersiz tarih." });
        }

        const ayAdi = aylar[ay - 1];

        const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
        
        if (!GEMINI_API_KEY) {
            return response.status(500).json({
                status: "error",
                message: "GEMINI_API_KEY bulunamadı! Lütfen Vercel ayarlarına API anahtarınızı ekleyin."
            });
        }

        // --- YENİ EKLENEN KISIM: Rastgele Kategori Motoru ---
        const kategoriler = [
            "bilim, teknoloji veya tıp",
            "sanat, edebiyat, müzik veya sinema",
            "uzay ve astronomi",
            "spor",
            "arkeolojik veya coğrafi keşifler",
            "ilginç, gizemli ve sıra dışı tesadüfler",
            "popüler kültür",
            "savaş HARİCİNDE tarihe yön veren sivil olaylar"
        ];
        const rastgeleKategori = kategoriler[Math.floor(Math.random() * kategoriler.length)];
        const rastgeleFaktor = Math.random(); // AI'ın aynı şeyi tekrarlamasını önlemek için

        // Artık AI'a savaşları bırakıp bizim seçtiğimiz rastgele kategoriye odaklanmasını söylüyoruz!
        const prompt = `Sen çok bilgili, diksiyonu düzgün ve akıcı konuşan bir tarihçisin. 
Bugün günlerden ${gun} ${ayAdi}. 
Lütfen kendi hafızanı tarayarak, dünya tarihinde tam olarak bu tarihte (${gun} ${ayAdi}) yaşanmış olaylar arasından SADECE **${rastgeleKategori}** alanıyla ilgili, en ilgi çekici veya şaşırtıcı 1 tane olayı seç. Lütfen savaşları ve çatışmaları anlatmaktan kaçın, bunun yerine odaklanmanı istediğim bu kategoriye yönel.
(Farklılık faktörü: ${rastgeleFaktor} - Lütfen bilinen en popüler olay yerine daha az duyulmuş ama çok ilginç bir olayı tercih etmeye çalış.)

Ardından bu olayı çok detaylı, ilgi çekici ve sürükleyici bir belgesel diliyle (yaklaşık 2-3 paragraf halinde) anlat. Metin sadece Türkçe olsun.

Yanıtını SADECE aşağıdaki JSON formatında ver, ekstra hiçbir metin veya markdown (\`\`\`json) ekleme:
{
  "secilen_olay": "Hafızandan bulduğun olayın kısa özeti",
  "hikaye": "Yazdığın sürükleyici belgesel metni"
}`;

        const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        if (!aiResponse.ok) throw new Error("Yapay zekadan yanıt alınamadı.");

        const aiData = await aiResponse.json();
        let aiText = aiData.candidates[0].content.parts[0].text;
        
        // AI bazen markdown formatında dönebilir, json.parse patlamasın diye bunu temizliyoruz
        aiText = aiText.replace(/```json/g, '').replace(/```/g, '').trim();
        const aiSonuc = JSON.parse(aiText);

        response.status(200).json({
            durum: "basarili",
            tarih: `${gun} ${ayAdi}`,
            kisa_olay: aiSonuc.secilen_olay,
            ai_hikayesi: aiSonuc.hikaye
        });

    } catch (error) {
        response.status(500).json({ 
            status: "error", 
            message: error.message 
        });
    }
}
