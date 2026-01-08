// --- YARDIMCI FONKSİYONLAR ---

// Kripto paralar için özel para formatlayıcı
function formatPara(sayi, sembol = "") {
    if (sayi === null || sayi === undefined) return "Veri Yok";
    
    if (typeof sayi === 'string') sayi = parseFloat(sayi);
    
    if (isNaN(sayi)) return "Veri Yok";

    let maxDigits = 2;
    const absVal = Math.abs(sayi);

    if (absVal > 1000) maxDigits = 2;       // BTC: 64,123.45
    else if (absVal > 1) maxDigits = 4;     // SOL: 145.2345
    else if (absVal > 0.01) maxDigits = 5;  // DOGE: 0.12345
    else if (absVal > 0.0001) maxDigits = 7;// SHIB
    else maxDigits = 9;                     // PEPE: 0.000001234

    const formatted = new Intl.NumberFormat('en-US', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: maxDigits 
    }).format(sayi);
    
    return sembol ? `${formatted} ${sembol}` : formatted;
}

function formatHacim(sayi) {
    if (!sayi && sayi !== 0) return "Veri Yok";
    if (typeof sayi === 'string') sayi = parseFloat(sayi);
    if (isNaN(sayi)) return "Veri Yok";

    if (sayi >= 1.0e+9) return (sayi / 1.0e+9).toFixed(2) + " Mr"; 
    if (sayi >= 1.0e+6) return (sayi / 1.0e+6).toFixed(2) + " Mn"; 
    if (sayi >= 1.0e+3) return (sayi / 1.0e+3).toFixed(2) + " B";  
    return sayi.toFixed(2);
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

// --- KAYNAK 1: BINANCE GLOBAL ---
async function getirBinance(pair) {
    try {
        const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${pair}`;
        const response = await fetchWithHeaders(url);
        
        if (!response.ok) return null;
        
        const data = await response.json();
        
        return {
            kaynak: "Binance",
            sembol: data.symbol,
            fiyat: parseFloat(data.lastPrice),
            degisim_yuzde: parseFloat(data.priceChangePercent),
            fiyat_degisim: parseFloat(data.priceChange),
            acilis: parseFloat(data.openPrice),
            yuksek: parseFloat(data.highPrice),
            dusuk: parseFloat(data.lowPrice),
            hacim_coin: parseFloat(data.volume),
            hacim_usdt: parseFloat(data.quoteVolume),
            agirlikli_ort: parseFloat(data.weightedAvgPrice),
            islem_sayisi: data.count
        };
    } catch (e) { console.log("Binance fail"); return null; }
}

// --- KAYNAK 2: BINANCE US (Vercel Dostu) ---
async function getirBinanceUS(pair) {
    try {
        // Binance US API yapısı Global ile aynıdır
        const url = `https://api.binance.us/api/v3/ticker/24hr?symbol=${pair}`;
        const response = await fetchWithHeaders(url);
        
        if (!response.ok) return null;
        
        const data = await response.json();
        
        return {
            kaynak: "Binance US",
            sembol: data.symbol,
            fiyat: parseFloat(data.lastPrice),
            degisim_yuzde: parseFloat(data.priceChangePercent),
            fiyat_degisim: parseFloat(data.priceChange),
            acilis: parseFloat(data.openPrice),
            yuksek: parseFloat(data.highPrice),
            dusuk: parseFloat(data.lowPrice),
            hacim_coin: parseFloat(data.volume),
            hacim_usdt: parseFloat(data.quoteVolume),
            agirlikli_ort: parseFloat(data.weightedAvgPrice),
            islem_sayisi: data.count // Burada işlem sayısı kesin vardır!
        };
    } catch (e) { console.log("Binance US fail"); return null; }
}

// --- KAYNAK 3: MEXC (Yedek) ---
async function getirMexc(pair) {
    try {
        const url = `https://api.mexc.com/api/v3/ticker/24hr?symbol=${pair}`;
        const response = await fetchWithHeaders(url);
        
        if (!response.ok) return null;
        
        const data = await response.json();
        
        // MEXC eksik verileri tamamlama
        let avgPrice = parseFloat(data.weightedAvgPrice);
        if (isNaN(avgPrice) || !avgPrice) {
            if (data.quoteVolume && data.volume) {
                avgPrice = parseFloat(data.quoteVolume) / parseFloat(data.volume);
            }
        }

        return {
            kaynak: "MEXC",
            sembol: data.symbol,
            fiyat: parseFloat(data.lastPrice),
            degisim_yuzde: parseFloat(data.priceChangePercent),
            fiyat_degisim: parseFloat(data.priceChange),
            acilis: parseFloat(data.openPrice),
            yuksek: parseFloat(data.highPrice),
            dusuk: parseFloat(data.lowPrice),
            hacim_coin: parseFloat(data.volume),
            hacim_usdt: parseFloat(data.quoteVolume),
            agirlikli_ort: avgPrice, 
            islem_sayisi: data.count || null 
        };
    } catch (e) { console.log("Mexc fail"); return null; }
}

// --- ANA YÖNETİCİ ---
export default async function handler(req, res) {
    const { kod } = req.query;

    if (!kod) {
        return res.status(400).json({
            hata: true,
            mesaj: "Lütfen bir coin kodu girin. Örn: /api/kripto?kod=BTC"
        });
    }

    let symbol = kod.toUpperCase().trim();
    let pair = symbol;

    if (symbol === "USDT") {
        pair = "USDTTRY";
    } else {
        const suffixes = ["USDT", "TRY", "BTC", "ETH", "BNB", "EUR", "BUSD", "USDC", "FDUSD"];
        const hasSuffix = suffixes.some(s => symbol.endsWith(s) && symbol.length > s.length);
        
        if (!hasSuffix) {
            pair = symbol + "USDT";
        }
    }

    try {
        // STRATEJİ: Global -> US -> MEXC
        let sonuc = await getirBinance(pair);
        
        if (!sonuc) {
            sonuc = await getirBinanceUS(pair);
        }
        
        if (!sonuc) {
            sonuc = await getirMexc(pair);
        }

        if (sonuc) {
            const guncellemeUnix = Math.floor(Date.now() / 1000);
            
            let paraBirimi = "$";
            if (pair.endsWith("TRY")) paraBirimi = "₺";
            if (pair.endsWith("BTC")) paraBirimi = "₿";
            if (pair.endsWith("ETH")) paraBirimi = "Ξ";

            res.status(200).json({
                tur: "Kripto Para",
                sembol: symbol,
                parite: sonuc.sembol,
                kaynak: sonuc.kaynak,
                
                fiyat: formatPara(sonuc.fiyat, paraBirimi),
                fiyat_ham: sonuc.fiyat,
                
                degisim_yuzde: `%${sonuc.degisim_yuzde.toFixed(2)}`,
                degisim_emoji: getTrendEmoji(sonuc.degisim_yuzde),
                fiyat_degisim: formatPara(sonuc.fiyat_degisim, paraBirimi),
                
                guncelleme_unix: guncellemeUnix,
                guncelleme_discord: `<t:${guncellemeUnix}:R>`,
                
                detaylar: {
                    gun_araligi: `${formatPara(sonuc.dusuk)} - ${formatPara(sonuc.yuksek)}`,
                    acilis: formatPara(sonuc.acilis, paraBirimi),
                    hacim_24s: formatHacim(sonuc.hacim_usdt) + " " + (paraBirimi === "₺" ? "TL" : "$"), 
                    hacim_adet: formatHacim(sonuc.hacim_coin) + " Adet",
                    // İşlem sayısı US'den gelirse dolu olur, MEXC ise Veri Yok dönebilir
                    islem_sayisi: sonuc.islem_sayisi ? new Intl.NumberFormat('en-US').format(sonuc.islem_sayisi) : "Veri Yok",
                    ort_fiyat: formatPara(sonuc.agirlikli_ort, paraBirimi)
                }
            });
        } else {
            res.status(404).json({ 
                hata: true, 
                mesaj: `Coin verisi 3 kaynaktan da çekilemedi (${pair}).`,
                denenen_parite: pair
            });
        }
    } catch (err) {
        res.status(500).json({ hata: true, mesaj: "Sunucu hatası", detay: err.message });
    }
}
