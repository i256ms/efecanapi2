import * as cheerio from 'cheerio';

// --- YARDIMCI FONKSİYONLAR ---

function formatPara(sayi, sembol = "") {
    if (sayi === null || sayi === undefined) return "Veri Yok";
    if (typeof sayi === 'string') return sayi; // Zaten formatlıysa elleme

    let maxDigits = 2;
    if (Math.abs(sayi) < 1 && Math.abs(sayi) > 0) maxDigits = 6;

    const formatted = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: maxDigits }).format(sayi);
    return sembol ? `${formatted} ${sembol}` : formatted;
}

function formatHacim(sayi) {
    if (!sayi || sayi === "Veri Yok") return "Veri Yok";
    if (typeof sayi === 'string') return sayi;

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

// --- KAYNAK 1: TRADINGVIEW (JSON API - En Sağlamı) ---
async function getirHisseTradingView(symbol) {
    try {
        // TradingView Scanner API (HTML parse derdi yok, direkt veri!)
        const url = "https://scanner.tradingview.com/turkey/scan";
        
        // BIST hisselerini sorgulamak için payload
        const body = {
            "symbols": {
                "tickers": [`BIST:${symbol}`] // Örn: BIST:BOBET
            },
            "columns": [
                "close",        // 0: Son Fiyat
                "change|1d",    // 1: Değişim %
                "volume",       // 2: Hacim
                "market_cap_basic", // 3: Piyasa Değeri
                "description",  // 4: Şirket Adı
                "high",         // 5: Gün Yüksek
                "low"           // 6: Gün Düşük
            ]
        };

        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });

        if (!response.ok) return null;

        const json = await response.json();
        
        // Eğer data boşsa hisse bulunamadı demektir
        if (!json.data || json.data.length === 0) return null;

        const d = json.data[0].d; // Veri dizisi

        return {
            kaynak: "TradingView",
            fiyat: d[0],
            degisim: d[1],
            hacim: d[2],
            piyasa_degeri: d[3],
            baslik: d[4],
            gun_yuksek: d[5],
            gun_dusuk: d[6]
        };

    } catch (e) { 
        console.log("TradingView fail:", e.message); 
        return null;
    }
}

// --- KAYNAK 2: DOVİZ.COM (Yedek - HTML Scraper) ---
async function getirHisseDoviz(symbol) {
    try {
        const url = `https://borsa.doviz.com/hisseler/${symbol.toLowerCase()}`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        
        if (!response.ok) return null;

        const html = await response.text();
        const $ = cheerio.load(html);
        
        // Fiyatı bul
        let fiyatText = $('div[data-socket-key="' + symbol + '"]').text().trim();
        if (!fiyatText) fiyatText = $('div[class*="text-4xl"]').first().text().trim();
        
        if (fiyatText) {
            const degisimText = $('div[class*="text-md"]').first().text().replace("%", "").trim();
            const baslik = $('title').text().split('|')[0].trim();
            
            let hacim = null;
            let gunAraligi = null;
            let piyasaDegeri = null;
            
            $('.value-table-row').each((i, el) => {
                const label = $(el).find('.label').text().trim(); 
                const val = $(el).find('.value').text().trim();
                if (label.includes("Hacim")) hacim = val;
                if (label.includes("Gün Aralığı")) gunAraligi = val;
                if (label.includes("Piyasa Değeri")) piyasaDegeri = val;
            });

            // Doviz.com'dan gelen stringleri parse etmiyoruz, formatPara fonksiyonu halledecek
            return {
                kaynak: "Doviz.com",
                fiyat: fiyatText, // String olarak gönderiyoruz: "2.052,00"
                degisim: parseFloat(degisimText.replace(",", ".")),
                baslik: baslik || symbol,
                hacim_txt: hacim,
                gun_araligi_txt: gunAraligi,
                piyasa_degeri_txt: piyasaDegeri
            };
        }
    } catch (e) { console.log("Doviz.com fail"); }
    return null;
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
    let sonuc = null;

    try {
        // STRATEJİ: Önce TradingView (API), Olmazsa Doviz.com (HTML)
        
        sonuc = await getirHisseTradingView(symbol);
        
        if (!sonuc) {
            sonuc = await getirHisseDoviz(symbol);
        }

        if (sonuc) {
            // Verileri Formatla
            
            // Gün Aralığı
            let gunAraligiFinal = "Veri Yok";
            if (sonuc.gun_dusuk && sonuc.gun_yuksek) {
                gunAraligiFinal = `${formatPara(sonuc.gun_dusuk)} - ${formatPara(sonuc.gun_yuksek)}`;
            } else if (sonuc.gun_araligi_txt) {
                gunAraligiFinal = sonuc.gun_araligi_txt;
            }

            // Hacim
            let hacimFinal = "Veri Yok";
            if (sonuc.hacim) hacimFinal = formatHacim(sonuc.hacim);
            else if (sonuc.hacim_txt) hacimFinal = sonuc.hacim_txt;

            // Piyasa Değeri
            let pdFinal = "Veri Yok";
            if (sonuc.piyasa_degeri) pdFinal = formatHacim(sonuc.piyasa_degeri);
            else if (sonuc.piyasa_degeri_txt) pdFinal = sonuc.piyasa_degeri_txt;

            res.status(200).json({
                tur: "Borsa İstanbul",
                sembol: symbol,
                baslik: sonuc.baslik,
                kaynak: sonuc.kaynak,
                
                fiyat: formatPara(sonuc.fiyat, "TL"),
                degisim_yuzde: sonuc.degisim.toFixed(2),
                degisim_emoji: getTrendEmoji(sonuc.degisim),
                
                gun_araligi: gunAraligiFinal,
                hacim: hacimFinal,
                piyasa_degeri: pdFinal
            });
        } else {
            res.status(404).json({ 
                hata: true, 
                mesaj: `Hisse verisi TradingView ve Doviz.com'dan çekilemedi (${symbol}).`,
                sebep: "Kod hatalı olabilir veya kaynaklar yanıt vermiyor."
            });
        }
    } catch (err) {
        res.status(500).json({ hata: true, mesaj: "Sunucu hatası", detay: err.message });
    }
}
