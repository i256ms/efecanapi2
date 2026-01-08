import * as cheerio from 'cheerio';

// --- YARDIMCI FONKSİYONLAR ---

function formatPara(sayi, sembol = "") {
    if (sayi === null || sayi === undefined) return "Veri Yok";
    if (typeof sayi === 'string') return sayi; 

    let maxDigits = 2;
    if (Math.abs(sayi) < 1 && Math.abs(sayi) > 0) maxDigits = 6;

    const formatted = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: maxDigits }).format(sayi);
    return sembol ? `${formatted} ${sembol}` : formatted;
}

function formatHacim(sayi) {
    if (!sayi || sayi === "Veri Yok") return "Veri Yok";
    if (typeof sayi === 'string') return sayi;

    if (sayi >= 1.0e+9) return (sayi / 1.0e+9).toFixed(2).replace(".", ",") + " Mr"; // Milyar
    if (sayi >= 1.0e+6) return (sayi / 1.0e+6).toFixed(2).replace(".", ",") + " Mn"; // Milyon
    if (sayi >= 1.0e+3) return (sayi / 1.0e+3).toFixed(2).replace(".", ",") + " B";  // Bin
    return sayi.toString();
}

function getTrendEmoji(degisim) {
    if (degisim === null || degisim === undefined) return "⚪";
    const d = parseFloat(degisim);
    if (isNaN(d)) return "➖";
    if (d > 0) return "🟢"; 
    if (d < 0) return "🔴"; 
    return "⚪"; 
}

// --- KAYNAK 1: TRADINGVIEW (JSON API - Hızlı) ---
async function getirHisseTradingView(symbol) {
    try {
        const url = "https://scanner.tradingview.com/turkey/scan";
        
        const body = {
            "symbols": { "tickers": [`BIST:${symbol}`] },
            "columns": [
                "close", "change|1d", "volume", "market_cap_basic", 
                "description", "high", "low", "open", 
                "price_52_week_high", "price_52_week_low", 
                "price_earnings_ttm", "sector"
            ]
        };

        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });

        if (!response.ok) return null;
        const json = await response.json();
        if (!json.data || json.data.length === 0) return null;

        const d = json.data[0].d; 

        return {
            kaynak: "TradingView",
            fiyat: d[0],
            degisim: d[1],
            hacim: d[2],
            piyasa_degeri: d[3],
            baslik: d[4],
            gun_yuksek: d[5],
            gun_dusuk: d[6],
            acilis: d[7],
            yil_yuksek: d[8],
            yil_dusuk: d[9],
            fk_orani: d[10], // Bazen null gelebilir
            sektor: d[11]
        };

    } catch (e) { 
        console.log("TradingView fail:", e.message); 
        return null;
    }
}

// --- KAYNAK 2: DOVİZ.COM (Yedek & Tamamlayıcı) ---
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
        
        let fiyatText = $('div[data-socket-key="' + symbol + '"]').text().trim();
        if (!fiyatText) fiyatText = $('div[class*="text-4xl"]').first().text().trim();
        
        if (fiyatText) {
            const degisimText = $('div[class*="text-md"]').first().text().replace("%", "").trim();
            const baslik = $('title').text().split('|')[0].trim();
            
            // Detayları topla
            const detaylar = {
                hacim: null,
                gun_araligi: null,
                piyasa_degeri: null,
                acilis: null,
                yil_araligi: null,
                fk: null
            };
            
            $('.value-table-row').each((i, el) => {
                const label = $(el).find('.label').text().trim(); 
                const val = $(el).find('.value').text().trim();
                
                if (label.includes("Hacim")) detaylar.hacim = val;
                if (label.includes("Gün Aralığı")) detaylar.gun_araligi = val;
                if (label.includes("Piyasa Değeri")) detaylar.piyasa_degeri = val;
                if (label.includes("Açılış")) detaylar.acilis = val;
                if (label.includes("Yıllık Aralık")) detaylar.yil_araligi = val;
                if (label.includes("F/K")) detaylar.fk = val; // F/K Oranını buradan yakalayacağız
            });

            return {
                kaynak: "Doviz.com",
                fiyat: parseFloat(fiyatText.replace(/\./g, "").replace(",", ".")),
                degisim: parseFloat(degisimText.replace(",", ".")),
                baslik: baslik || symbol,
                hacim_txt: detaylar.hacim,
                gun_araligi_txt: detaylar.gun_araligi,
                piyasa_degeri_txt: detaylar.piyasa_degeri,
                acilis_txt: detaylar.acilis,
                yil_araligi_txt: detaylar.yil_araligi,
                fk_txt: detaylar.fk
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
        // 1. Önce TradingView'den çek (En hızlı ve güvenilir)
        sonuc = await getirHisseTradingView(symbol);
        
        // --- VERİ ZENGİNLEŞTİRME (DATA ENRICHMENT) ---
        // Eğer TradingView geldi ama F/K oranı (price_earnings_ttm) boşsa,
        // Doviz.com'a gidip sadece o eksik veriyi tamamla.
        if (sonuc && (sonuc.fk_orani === null || sonuc.fk_orani === undefined)) {
            try {
                // Sadece eksik veriyi tamamlamak için Doviz.com'u çağırıyoruz
                const dovizYedek = await getirHisseDoviz(symbol);
                if (dovizYedek && dovizYedek.fk_txt) {
                    // "8,45" gibi gelen metni sayıya çevir
                    sonuc.fk_orani = parseFloat(dovizYedek.fk_txt.replace(",", "."));
                    // Kaynak bilgisini güncelleme ki ana kaynağın TradingView olduğu bilinsin
                }
            } catch (e) { 
                // Yedek de çalışmazsa sessizce devam et
            }
        }

        // 2. Eğer TradingView tamamen başarısızsa Doviz.com'u ana kaynak yap
        if (!sonuc) {
            sonuc = await getirHisseDoviz(symbol);
        }

        if (sonuc) {
            const degisim = (sonuc.degisim !== null && sonuc.degisim !== undefined) ? Number(sonuc.degisim) : 0;
            
            // Formatlama
            let gunAraligiFinal = "Veri Yok";
            if (sonuc.gun_dusuk && sonuc.gun_yuksek) {
                gunAraligiFinal = `${formatPara(sonuc.gun_dusuk)} - ${formatPara(sonuc.gun_yuksek)}`;
            } else if (sonuc.gun_araligi_txt) {
                gunAraligiFinal = sonuc.gun_araligi_txt;
            }

            let yilAraligiFinal = "Veri Yok";
            if (sonuc.yil_dusuk && sonuc.yil_yuksek) {
                yilAraligiFinal = `${formatPara(sonuc.yil_dusuk)} - ${formatPara(sonuc.yil_yuksek)}`;
            } else if (sonuc.yil_araligi_txt) {
                yilAraligiFinal = sonuc.yil_araligi_txt;
            }

            let hacimFinal = "Veri Yok";
            if (sonuc.hacim) hacimFinal = formatHacim(sonuc.hacim);
            else if (sonuc.hacim_txt) hacimFinal = sonuc.hacim_txt;

            let pdFinal = "Veri Yok";
            if (sonuc.piyasa_degeri) pdFinal = formatHacim(sonuc.piyasa_degeri);
            else if (sonuc.piyasa_degeri_txt) pdFinal = sonuc.piyasa_degeri_txt;

            let acilisFinal = sonuc.acilis ? formatPara(sonuc.acilis, "TL") : (sonuc.acilis_txt || "Veri Yok");
            let fkFinal = sonuc.fk_orani ? sonuc.fk_orani.toFixed(2) : (sonuc.fk_txt || "Veri Yok");

            const finalFiyat = sonuc.fiyat_raw ? sonuc.fiyat_raw + " TL" : formatPara(sonuc.fiyat, "TL");

            res.status(200).json({
                tur: "Borsa İstanbul",
                sembol: symbol,
                baslik: sonuc.baslik,
                kaynak: sonuc.kaynak,
                sektor: sonuc.sektor || "Genel",
                
                fiyat: finalFiyat,
                degisim_yuzde: degisim.toFixed(2),
                degisim_emoji: getTrendEmoji(degisim),
                
                detaylar: {
                    acilis: acilisFinal,
                    gun_araligi: gunAraligiFinal,
                    yil_araligi: yilAraligiFinal,
                    hacim: hacimFinal,
                    piyasa_degeri: pdFinal,
                    fk_orani: fkFinal
                }
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
