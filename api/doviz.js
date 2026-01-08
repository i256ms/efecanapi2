// --- YARDIMCI FONKSİYONLAR ---

function formatPara(sayi, sembol = "") {
    if (sayi === null || sayi === undefined) return "Veri Yok";
    
    // String geldiyse temizle ve sayıya çevir
    if (typeof sayi === 'string') {
        if (sayi.includes("Veri") || sayi.includes("Yok")) return "Veri Yok";
        // Zaten formatlıysa dokunma
        if (sayi.includes(",") && sayi.split(',')[1].length >= 2) return sembol ? `${sayi} ${sembol}` : sayi;
        sayi = parseFloat(sayi.replace(/\./g, "").replace(",", "."));
    }

    if (isNaN(sayi)) return "Veri Yok";

    let maxDigits = 2;
    // Dolar/Euro gibi kuruşlu şeylerde 4 hane görmek isteyebilirler ama genelde 2 yeterlidir
    if (Math.abs(sayi) < 10) maxDigits = 4;

    const formatted = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: maxDigits }).format(sayi);
    return sembol ? `${formatted} ${sembol}` : formatted;
}

function getTrendEmoji(degisim) {
    const d = parseFloat(degisim);
    if (isNaN(d)) return "⚪";
    if (d > 0) return "🟢"; 
    if (d < 0) return "🔴"; 
    return "⚪"; 
}

// Ortak Fetch Fonksiyonu
async function fetchWithHeaders(url) {
    return await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });
}

// --- ANA YÖNETİCİ ---
export default async function handler(req, res) {
    const { kod } = req.query;

    if (!kod) {
        return res.status(400).json({
            hata: true,
            mesaj: "Lütfen bir döviz veya altın kodu girin. Örn: /api/doviz?kod=USD"
        });
    }

    const aranan = kod.toUpperCase().trim();
    let key = "";

    // AKILLI EŞLEŞTİRME SÖZLÜĞÜ
    if (aranan === "DOLAR" || aranan === "USD" || aranan === "$") key = "USD";
    else if (aranan === "EURO" || aranan === "EUR" || aranan === "AVRO" || aranan === "€") key = "EUR";
    else if (aranan === "STERLIN" || aranan === "GBP" || aranan === "£") key = "GBP";
    else if (aranan === "ALTIN" || aranan === "GRAM" || aranan === "GRAM-ALTIN") key = "gram-altin";
    else if (aranan === "CEYREK" || aranan === "ÇEYREK") key = "ceyrek-altin";
    else if (aranan === "YARIM") key = "yarim-altin";
    else if (aranan === "TAM") key = "tam-altin";
    else if (aranan === "CUMHURIYET") key = "cumhuriyet-altini";
    else if (aranan === "ATA") key = "ata-altin";
    else if (aranan === "RESAT" || aranan === "REŞAT") key = "resat-altin";
    else if (aranan === "22AYAR" || aranan === "BILEZIK") key = "22-ayar-bilezik";
    else if (aranan === "18AYAR") key = "18-ayar-altin";
    else if (aranan === "14AYAR") key = "14-ayar-altin";
    else if (aranan === "HAS" || aranan === "HASALTIN") key = "has-altin";
    else if (aranan === "GUMUS" || aranan === "GÜMÜŞ") key = "gumus";
    else if (aranan === "ONS") key = "ons";
    else if (aranan === "BRENT" || aranan === "PETROL") key = "brent-petrol";
    else if (aranan === "PLATIN") key = "platin";
    else if (aranan === "PALADYUM") key = "paladyum";
    else if (aranan === "DOGALGAZ" || aranan === "GAZ") key = "dogalgaz";
    else key = aranan; // Diğer kodlar (CAD, JPY vb.)

    try {
        const url = "https://finans.truncgil.com/today.json";
        const response = await fetchWithHeaders(url);
        
        if (!response.ok) {
            return res.status(500).json({ hata: true, mesaj: "Finans servisine ulaşılamadı." });
        }
        
        const data = await response.json();
        
        // Truncgil bazen boşluklu bazen tireli key kullanıyor, ikisini de dene
        const veri = data[key] || data[key.replace("-", " ").toUpperCase()];

        if (!veri) {
            return res.status(404).json({ 
                hata: true, 
                mesaj: `Bu veri bulunamadı (${aranan}).`,
                desteklenenler: ["USD", "EUR", "GRAM", "CEYREK", "YARIM", "TAM", "CUMHURIYET", "ATA", "ONS", "BRENT", "GUMUS"]
            });
        }

        // Veri Temizleme (Truncgil string döner: "34,5000")
        const alis = parseFloat(veri.Alış.replace(/\./g, "").replace(",", "."));
        const satis = parseFloat(veri.Satış.replace(/\./g, "").replace(",", "."));
        const degisim = parseFloat(veri["Değişim"].replace("%", "").replace(",", "."));
        
        // Makas Hesabı (Spread)
        const makas = satis - alis;
        const makasYuzdesi = (makas / satis) * 100;

        const guncellemeUnix = Math.floor(Date.now() / 1000);

        res.status(200).json({
            tur: "Piyasa (Döviz/Altın/Emtia)",
            sembol: key.toUpperCase().replace(/-/g, " "), // gram-altin -> GRAM ALTIN
            baslik: key.toUpperCase().replace(/-/g, " "),
            kaynak: "Truncgil",
            
            fiyat: formatPara(satis, "TL"), // Genel fiyat satış fiyatıdır
            degisim_yuzde: `%${degisim.toFixed(2)}`,
            degisim_emoji: getTrendEmoji(degisim),
            
            guncelleme_unix: guncellemeUnix,
            guncelleme_discord: `<t:${guncellemeUnix}:R>`,
            
            detaylar: {
                alis: formatPara(alis, "TL"),
                satis: formatPara(satis, "TL"),
                makas: formatPara(makas, "TL"),
                makas_orani: `%${makasYuzdesi.toFixed(2)}`
            }
        });

    } catch (err) {
        res.status(500).json({ hata: true, mesaj: "Sunucu hatası", detay: err.message });
    }
}
