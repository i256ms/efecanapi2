// Bu API, Wikipedia'nın Türkçe sayfalarından güncel "Tarihte Bugün" verilerini çeker.
// Cheerio kütüphanesi gerektirir (önceki projelerde zaten eklemiştik).

import * as cheerio from 'cheerio';

const aylar = [
    "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", 
    "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"
];

export default async function handler(request, response) {
    try {
        let { gun, ay } = request.query;

        // Varsayılan olarak bugünün tarihini al (Türkiye saatine göre hesaplanır)
        const simdi = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
        
        if (!gun) gun = simdi.getDate();
        if (!ay) ay = simdi.getMonth() + 1; // JavaScript'te aylar 0'dan başlar, 1 ekliyoruz

        // Girdilerin geçerli bir sayı olup olmadığını kontrol et
        gun = parseInt(gun);
        ay = parseInt(ay);
        if (isNaN(gun) || isNaN(ay) || gun < 1 || gun > 31 || ay < 1 || ay > 12) {
            return response.status(400).json({ 
                status: "error", 
                message: "Lütfen geçerli bir gün (1-31) ve ay (1-12) girin." 
            });
        }

        const ayAdi = aylar[ay - 1];
        const wikipediaUrl = `https://tr.wikipedia.org/wiki/${gun}_${ayAdi}`;

        // Wikipedia sayfasına istek atıyoruz
        const wikiResponse = await fetch(wikipediaUrl);
        if (!wikiResponse.ok) {
             throw new Error("Wikipedia'dan veri çekilemedi. Tarih formatı hatalı olabilir.");
        }

        const html = await wikiResponse.text();
        const $ = cheerio.load(html);

        // --- YARDIMCI FONKSİYON ---
        // Wikipedia'daki <h2> başlıklarını (Olaylar, Doğumlar vs.) bulup altındaki liste elemanlarını çeker
        function listeyiCek(sectionId) {
            const sonuclar = [];
            const baslik = $(`#${sectionId}`).parent(); // <h2> etiketini bul
            
            if (baslik.length > 0) {
                let siradakiElement = baslik.next();
                
                // Bir sonraki <h2> başlığına kadar olan tüm listeleri (ul > li) tara
                while (siradakiElement.length > 0 && siradakiElement[0].name !== 'h2') {
                    if (siradakiElement[0].name === 'ul') {
                        siradakiElement.children('li').each((i, el) => {
                            // [1], [2] gibi Wikipedia kaynak referanslarını temizle ve metni al
                            const metin = $(el).text().replace(/\[\d+\]/g, '').trim(); 
                            if (metin) sonuclar.push(metin);
                        });
                    }
                    siradakiElement = siradakiElement.next();
                }
            }
            return sonuclar;
        }

        // İlgili bölümleri sayfadan kazıyoruz
        const olaylar = listeyiCek('Olaylar');
        const dogumlar = listeyiCek('Doğumlar');
        const olumler = listeyiCek('Ölümler');
        
        // Bazen "Tatiller ve özel günler" başlığı küçük/büyük harf veya farklı id ile yazılabiliyor.
        const ozelGunler = listeyiCek('Tatiller_ve_özel_günler').length > 0 
            ? listeyiCek('Tatiller_ve_özel_günler') 
            : listeyiCek('Tatiller_ve_Özel_Günler');

        // Verileri temiz bir JSON olarak gönder
        response.status(200).json({
            durum: "basarili",
            tarih: `${gun} ${ayAdi}`,
            kaynak_url: wikipediaUrl,
            veriler: {
                olaylar: olaylar,
                dogumlar: dogumlar,
                olumler: olumler,
                ozel_gunler: ozelGunler
            }
        });

    } catch (error) {
        response.status(500).json({ 
            status: "error", 
            message: "Tarihte Bugün verileri alınırken bir hata oluştu.",
            detay: error.message
        });
    }
}
