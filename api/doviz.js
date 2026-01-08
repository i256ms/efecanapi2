// --- YARDIMCI FONKSİYONLAR ---

// Esnek Sayı Okuyucu (TR ve US formatlarını otomatik tanır)
function parseNumber(str) {
    if (!str) return null;
    if (typeof str === 'number') return str;
    
    str = str.trim();
    if (str === "-" || str === "") return null;

    // 1. Durum: Standart TR Formatı (3.000,50) -> Binlik nokta, Ondalık virgül
    if (str.includes(",") && str.includes(".")) {
        return parseFloat(str.replace(/\./g, "").replace(",", "."));
    }
    
    // 2. Durum: Sadece Virgül Var (3000,50) -> TR Formatı
    if (str.includes(",") && !str.includes(".")) {
        return parseFloat(str.replace(",", "."));
    }

    // 3. Durum: Sadece Nokta Var (2650.45 veya 2.650) -> Karışık Durum
    if (str.includes(".") && !str.includes(",")) {
        // Eğer birden fazla nokta varsa (1.234.567) binliktir.
        if ((str.match(/\./g) || []).length > 1) {
            return parseFloat(str.replace(/\./g, ""));
        }
        // Tek nokta varsa ve ondalık gibi duruyorsa (Doviz/Ons genelde böyledir)
        // Truncgil genelde TR formatı atar ama ONS bazen US gelir.
        // Güvenli yöntem: Noktayı sil (Binlik kabul et). 
        // Eğer kuruşlu gelirse formatPara fonksiyonu zaten düzeltir.
        return parseFloat(str.replace(/\./g, ""));
    }

    // 4. Durum: Düz Sayı
    return parseFloat(str);
}

function formatPara(sayi, sembol = "") {
    if (sayi === null || sayi === undefined || isNaN(sayi)) return "Veri Yok";
    
    let maxDigits = 2;
    const absVal = Math.abs(sayi);
    
    // Kuruşlu dövizler için 4 hane
    if (absVal < 10) maxDigits = 4; 
    
    const formatted = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: maxDigits }).format(sayi);
    return sembol ? `${formatted} ${sembol}` : formatted;
}

function getTrendEmoji(degisim) {
    // Null kontrolü
    if (degisim === null || degisim === undefined) return "⚪";

    // Değişim string gelirse (%0.45 veya %-0.45) temizle
    let d = degisim;
    if (typeof degisim === 'string') {
        d = parseFloat(degisim.replace("%", "").replace(",", "."));
    }
    
    if (isNaN(d)) return "⚪";
    if (d > 0) return "🟢"; 
    if (d < 0) return "🔴"; // HATA BURADAYDI (d yerine degisim yazıyordu veya d tanımsızdı)
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
    else key = aranan;

    try {
        const url = "https://finans.truncgil.com/today.json";
        const response = await fetchWithHeaders(url);
        
        if (!response.ok) {
            return res.status(500).json({ hata: true, mesaj: "Finans servisine ulaşılamadı." });
        }
        
        const data = await response.json();
        
        let veri = data[key] || data[key.replace("-", " ").toUpperCase()] || data[key.toLowerCase()];

        // Özel Durum: ONS bazen farklı isimde olabilir
        if (!veri && key === "ons") {
             const adaylar = ["ons", "Ons", "ONS", "Ons Altın"];
             for (const k of adaylar) {
                 if (data[k]) { veri = data[k]; break; }
             }
        }

        if (!veri) {
            return res.status(404).json({ 
                hata: true, 
                mesaj: `Bu veri bulunamadı (${aranan}).`,
                mevcut_anahtarlar: Object.keys(data).slice(0, 10)
            });
        }

        const alis = parseNumber(veri.Alış);
        const satis = parseNumber(veri.Satış);
        
        let degisimStr = veri["Değişim"] || "0";
        const degisim = parseFloat(degisimStr.replace("%", "").replace(",", "."));
        
        let makas = null;
        let makasYuzdesi = null;
        if (alis && satis) {
            makas = satis - alis;
            makasYuzdesi = (makas / satis) * 100;
        }

        const guncellemeUnix = Math.floor(Date.now() / 1000);

        let paraBirimi = "TL";
        if (key === "ons") paraBirimi = "$";
        if (key === "EUR" && aranan.includes("PARITE")) paraBirimi = "";

        res.status(200).json({
            tur: "Piyasa (Döviz/Altın/Emtia)",
            sembol: key.toUpperCase().replace(/-/g, " "),
            baslik: key.toUpperCase().replace(/-/g, " "),
            kaynak: "Truncgil",
            
            fiyat: formatPara(satis, paraBirimi), 
            fiyat_alternatif: !satis ? formatPara(alis, paraBirimi) : null,
            
            degisim_yuzde: `%${degisim.toFixed(2)}`,
            degisim_emoji: getTrendEmoji(degisim),
            
            guncelleme_unix: guncellemeUnix,
            guncelleme_discord: `<t:${guncellemeUnix}:R>`,
            
            detaylar: {
                alis: formatPara(alis, paraBirimi),
                satis: formatPara(satis, paraBirimi),
                makas: makas ? formatPara(makas, paraBirimi) : "Veri Yok",
                makas_orani: makasYuzdesi ? `%${makasYuzdesi.toFixed(2)}` : "Veri Yok",
                ham_veri: { alis: veri.Alış, satis: veri.Satış }
            }
        });

    } catch (err) {
        res.status(500).json({ hata: true, mesaj: "Sunucu hatası", detay: err.message });
    }
}
