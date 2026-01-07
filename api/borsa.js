import * as cheerio from 'cheerio';

// --- YARDIMCI FONKSİYONLAR ---

function formatPara(sayi, sembol = "") {
    if (sayi === null || sayi === undefined) return "Veri Yok";
    
    // Eğer sayı string ise ve içinde "Veri Yok" varsa
    if (typeof sayi === 'string') {
        if (sayi.includes("Veri") || sayi.includes("Yok")) return "Veri Yok";
        // Zaten formatlıysa (1.234,56)
        if (sayi.includes(",") && !sayi.includes(".")) {
             // Sadece sembol ekle
             return sembol && !sayi.includes(sembol) ? `${sayi} ${sembol}` : sayi;
        }
        // Temizle ve float yap (1.234,56 -> 1234.56)
        sayi = parseFloat(sayi.replace(/\./g, "").replace(",", "."));
    }

    if (isNaN(sayi)) return "Hata";

    let maxDigits = 2;
    if (Math.abs(sayi) < 1 && Math.abs(sayi) > 0) maxDigits = 6;

    const formatted = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: maxDigits }).format(sayi);
    return sembol ? `${formatted} ${sembol}` : formatted;
}

function formatHacim(sayi) {
    if (!sayi || sayi === "Veri Yok") return "Veri Yok";
    
    // String ise ve içinde harf varsa (Mn, Mr) dokunma
    if (typeof sayi === 'string' && /[a-zA-Z]/.test(sayi)) return sayi;
    
    // String sayı ise temizle
    if (typeof sayi === 'string') sayi = parseFloat(sayi.replace(/\./g, "").replace(",", "."));

    if (isNaN(sayi)) return "Veri Yok";

    if (sayi >= 1.0e+9) return (sayi / 1.0e+9).toFixed(2).replace(".", ",") + " Mr";
    if (sayi >= 1.0e+6) return (sayi / 1.0e+6).toFixed(2).replace(".", ",") + " Mn";
    if (sayi >= 1.0e+3) return (sayi / 1.0e+3).toFixed(2).replace(".", ",") + " B";
    return sayi.toString();
}

function getTrendEmoji(degisim) {
    const d = parseFloat(degisim);
    if (isNaN(d)) return "➖";
    if (d > 0) return "🟢"; 
    if (d < 0) return "🔴"; 
    return "⚪"; 
}

async function fetchWithHeaders(url) {
    return await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
        }
    });
}

// --- TEK VE ANA KAYNAK: DOVİZ.COM ---
async function getirHisseDoviz(symbol) {
    const url = `https://borsa.doviz.com/hisseler/${symbol.toLowerCase()}`;
    const debugInfo = { url: url, adimlar: [] };

    try {
        const response = await fetchWithHeaders(url);
        debugInfo.adimlar.push(`HTTP Durumu: ${response.status}`);
        
        if (!response.ok) {
            return { hata: true, mesaj: `Doviz.com'da sayfa bulunamadı (404). Kod: ${symbol}`, debug: debugInfo };
        }

        const html = await response.text();
        const $ = cheerio.load(html);
        
        // Debug: Sayfa başlığını al
        const pageTitle = $('title').text();
        debugInfo.adimlar.push(`Sayfa Başlığı: ${pageTitle}`);

        // --- SEÇİCİLERİ DENİYORUZ ---
        
        let fiyatText = null;
        let yontem = "";

        // 1. Yöntem: data-socket-key (En güvenilir)
        const socketEl = $('div[data-socket-key="' + symbol + '"]');
        if (socketEl.length > 0) {
            fiyatText = socketEl.text().trim();
            yontem = "Socket Key";
        }

        // 2. Yöntem: data-socket-key (Küçük harf dene)
        if (!fiyatText) {
            const socketElKucuk = $('div[data-socket-key="' + symbol.toLowerCase() + '"]');
            if (socketElKucuk.length > 0) {
                fiyatText = socketElKucuk.text().trim();
                yontem = "Socket Key (Küçük Harf)";
            }
        }

        // 3. Yöntem: Büyük punto (text-4xl) - Genelde fiyat en büyük yazıdır
        if (!fiyatText) {
            fiyatText = $('div[class*="text-4xl"]').first().text().trim();
            yontem = "CSS Class (text-4xl)";
        }

        // 4. Yöntem: Itemprop
        if (!fiyatText) {
            fiyatText = $('span[itemprop="price"]').text().trim();
            yontem = "Itemprop Price";
        }

        debugInfo.adimlar.push(`Fiyat Bulma Yöntemi: ${yontem || "BAŞARISIZ"}`);
        debugInfo.adimlar.push(`Ham Fiyat Verisi: ${fiyatText || "YOK"}`);

        if (fiyatText) {
            // Değişim Oranı
            let degisimText = $('div[data-socket-key="' + symbol + '"]').parent().find('div[class*="text-md"]').text().trim();
            if (!degisimText) degisimText = $('div[class*="text-4xl"]').parent().find('div[class*="text-md"]').text().trim();
            
            // Başlık
            const baslik = $('h1').first().text().trim() || pageTitle.split('|')[0].trim();
            
            // Detaylar (Hacim, Piyasa Değeri vb.)
            let hacim = null;
            let gunAraligi = null;
            let piyasaDegeri = null;
            
            // Tabloyu tara
            $('.value-table-row').each((i, el) => {
                const label = $(el).find('.label').text().trim(); 
                const val = $(el).find('.value').text().trim();
                
                if (label.includes("Hacim")) hacim = val;
                if (label.includes("Gün Aralığı")) gunAraligi = val;
                if (label.includes("Piyasa Değeri")) piyasaDegeri = val;
            });

            debugInfo.adimlar.push("Veriler ayrıştırıldı.");

            return {
                kaynak: "Doviz.com",
                fiyat: parseFloat(fiyatText.replace(/\./g, "").replace(",", ".")),
                degisim: parseFloat(degisimText.replace("%", "").replace(",", ".")) || 0,
                baslik: baslik || symbol,
                hacim_txt: hacim,
                gun_araligi_txt: gunAraligi,
                piyasa_degeri_txt: piyasaDegeri,
                debug: debugInfo
            };
        } else {
            return { hata: true, mesaj: `Fiyat alanı sayfada bulunamadı.`, debug: debugInfo };
        }

    } catch (e) { 
        return { hata: true, mesaj: `Bağlantı hatası: ${e.message}`, debug: debugInfo };
    }
}

// --- ANA YÖNETİCİ ---
export default async function handler(req, res) {
    const { kod } = req.query;

    if (!kod) {
        return res.status(400).json({
            hata: true,
            mesaj: "Lütfen bir hisse kodu girin. Örn: /api/borsa?kod=BOBET"
        });
    }

    const symbol = kod.toUpperCase().trim();
    
    // SADECE DOVİZ.COM ÇAĞIRIYORUZ
    let sonuc = await getirHisseDoviz(symbol);

    if (sonuc && !sonuc.hata) {
        res.status(200).json({
            tur: "Borsa İstanbul",
            sembol: symbol,
            baslik: sonuc.baslik,
            kaynak: sonuc.kaynak,
            
            fiyat: formatPara(sonuc.fiyat, "TL"),
            degisim_yuzde: sonuc.degisim.toFixed(2),
            degisim_emoji: getTrendEmoji(sonuc.degisim),
            
            gun_araligi: sonuc.gun_araligi_txt || "Veri Yok",
            hacim: sonuc.hacim_txt || "Veri Yok",
            piyasa_degeri: sonuc.piyasa_degeri_txt || "Veri Yok",
            
            // Eğer istersen debug bilgisini gizleyebilirsin ama şu an görmek için açık
            _debug: sonuc.debug 
        });
    } else {
        // Hata durumunda detaylı rapor dönüyoruz
        res.status(404).json(sonuc || { hata: true, mesaj: "Bilinmeyen hata." });
    }
}
