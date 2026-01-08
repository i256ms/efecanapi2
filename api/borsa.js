import * as cheerio from 'cheerio';

// --- SEKTÖR ÇEVİRİ SÖZLÜĞÜ ---
const SEKTOR_CEVIRI = {
    "Energy Minerals": "Enerji Madenciliği",
    "Non-Energy Minerals": "Enerji Dışı Madencilik",
    "Commercial Services": "Ticari Hizmetler",
    "Communications": "İletişim",
    "Consumer Durables": "Dayanıklı Tüketim",
    "Consumer Non-Durables": "Dayanıksız Tüketim",
    "Distribution Services": "Dağıtım Hizmetleri",
    "Electronic Technology": "Elektronik Teknolojisi",
    "Finance": "Finans",
    "Health Services": "Sağlık Hizmetleri",
    "Health Technology": "Sağlık Teknolojisi",
    "Industrial Services": "Endüstriyel Hizmetler",
    "Miscellaneous": "Çeşitli / Holding",
    "Process Industries": "İşleme Sanayi",
    "Producer Manufacturing": "İmalat Sanayi",
    "Retail Trade": "Perakende Ticaret",
    "Technology Services": "Teknoloji Hizmetleri",
    "Transportation": "Ulaşım / Lojistik",
    "Utilities": "Kamu Hizmetleri (Elektrik/Su)",
    "Real Estate": "Gayrimenkul",
    "Consumer Services": "Tüketici Hizmetleri"
};

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

    return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(sayi);
}

function getTrendEmoji(degisim) {
    if (degisim === null || degisim === undefined) return "⚪";
    const d = parseFloat(degisim);
    if (isNaN(d)) return "➖";
    if (d > 0) return "🟢"; 
    if (d < 0) return "🔴"; 
    return "⚪"; 
}

function getPiyasaDurumu() {
    const now = new Date().toLocaleString("en-US", { timeZone: "Europe/Istanbul" });
    const date = new Date(now);
    const day = date.getDay(); 
    const hour = date.getHours();
    const min = date.getMinutes();
    
    if (day === 0 || day === 6) return "Kapalı (Hafta Sonu) 🔴";
    
    const totalMinutes = hour * 60 + min;
    const start = 9 * 60 + 55; 
    const end = 18 * 60 + 10;  
    
    if (totalMinutes >= start && totalMinutes <= end) return "Açık 🟢";
    return "Kapalı 🔴";
}

// --- KAYNAK 1: TRADINGVIEW (JSON API) ---
async function getirHisseTradingView(symbol) {
    try {
        const url = "https://scanner.tradingview.com/turkey/scan";
        
        const body = {
            "symbols": { "tickers": [`BIST:${symbol}`] },
            "columns": [
                "close",              // 0: Son Fiyat
                "change|1d",          // 1: Değişim %
                "volume",             // 2: Hacim
                "market_cap_basic",   // 3: Piyasa Değeri
                "description",        // 4: Şirket Adı
                "high",               // 5: Gün Yüksek
                "low",                // 6: Gün Düşük
                "open",               // 7: Açılış
                "price_52_week_high", // 8: 52 Hafta Yüksek
                "price_52_week_low",  // 9: 52 Hafta Düşük
                "price_earnings_ttm", // 10: F/K Oranı
                "sector",             // 11: Sektör
                "change"              // 12: TL Bazlı Değişim (YENİ)
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

        // Sektör ismini Türkçeye çevir
        const hamSektor = d[11];
        const turkceSektor = SEKTOR_CEVIRI[hamSektor] || hamSektor || "Genel";

        // Önceki kapanışı hesapla (Fiyat - Değişim Miktarı)
        const fiyat = d[0];
        const degisimTL = d[12];
        let oncekiKapanis = null;
        if (fiyat !== null && degisimTL !== null) {
            oncekiKapanis = fiyat - degisimTL;
        }

        return {
            kaynak: "TradingView",
            fiyat: fiyat,
            degisim: d[1],
            degisim_tl: degisimTL, // TL değişimi
            onceki_kapanis: oncekiKapanis, // Dünkü kapanış
            hacim: d[2],
            piyasa_degeri: d[3],
            baslik: d[4],
            gun_yuksek: d[5],
            gun_dusuk: d[6],
            acilis: d[7],
            yil_yuksek: d[8],
            yil_dusuk: d[9],
            fk_orani: d[10],
            sektor: turkceSektor
        };

    } catch (e) { 
        console.log("TradingView fail:", e.message); 
        return null;
    }
}

// --- KAYNAK 2: DOVİZ.COM (Yedek) ---
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
                if (label.includes("F/K")) detaylar.fk = val;
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
        // 1. TradingView
        sonuc = await getirHisseTradingView(symbol);
        
        // Veri Tamamlama (F/K Eksikse)
        if (sonuc && (sonuc.fk_orani === null || sonuc.fk_orani === undefined)) {
            try {
                const dovizYedek = await getirHisseDoviz(symbol);
                if (dovizYedek && dovizYedek.fk_txt) {
                    sonuc.fk_orani = parseFloat(dovizYedek.fk_txt.replace(",", "."));
                }
            } catch (e) { }
        }

        // 2. Doviz.com (Yedek)
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
            let oncekiKapanisFinal = sonuc.onceki_kapanis ? formatPara(sonuc.onceki_kapanis, "TL") : "Veri Yok";
            let fiyatDegisimFinal = sonuc.degisim_tl ? formatPara(sonuc.degisim_tl, "TL") : "Veri Yok";

            const finalFiyat = sonuc.fiyat_raw ? sonuc.fiyat_raw + " TL" : formatPara(sonuc.fiyat, "TL");
            const guncellemeUnix = Math.floor(Date.now() / 1000);

            res.status(200).json({
                tur: "Borsa İstanbul",
                sembol: symbol,
                baslik: sonuc.baslik,
                kaynak: sonuc.kaynak,
                sektor: sonuc.sektor || "Genel",
                piyasa_durumu: getPiyasaDurumu(),
                
                fiyat: finalFiyat,
                degisim_yuzde: degisim.toFixed(2),
                degisim_tl: fiyatDegisimFinal, // YENİ: TL Değişimi
                degisim_emoji: getTrendEmoji(degisim),
                
                guncelleme_unix: guncellemeUnix,
                guncelleme_discord: `<t:${guncellemeUnix}:R>`,
                not: "Veriler yasal zorunluluk gereği 15dk gecikmelidir.",
                
                detaylar: {
                    onceki_kapanis: oncekiKapanisFinal, // YENİ: Dünkü Kapanış
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
            });
        }
    } catch (err) {
        res.status(500).json({ hata: true, mesaj: "Sunucu hatası", detay: err.message });
    }
}
