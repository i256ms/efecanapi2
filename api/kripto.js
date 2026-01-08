// --- YARDIMCI FONKSİYONLAR ---

// Kripto paralar için özel para formatlayıcı
// Bitcoin 60.000$ iken 2 hane, PEPE 0.000004$ iken 8 hane göstermeli.
function formatPara(sayi, sembol = "") {
    if (sayi === null || sayi === undefined) return "Veri Yok";
    if (typeof sayi === 'string') sayi = parseFloat(sayi);

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
    if (!sayi) return "Veri Yok";
    if (typeof sayi === 'string') sayi = parseFloat(sayi);

    if (sayi >= 1.0e+9) return (sayi / 1.0e+9).toFixed(2) + " Mr"; // Milyar
    if (sayi >= 1.0e+6) return (sayi / 1.0e+6).toFixed(2) + " Mn"; // Milyon
    if (sayi >= 1.0e+3) return (sayi / 1.0e+3).toFixed(2) + " B";  // Bin
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

// --- KAYNAK 1: BINANCE ---
async function getirBinance(pair) {
    try {
        const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${pair}`;
        const response = await fetchWithHeaders(url);
        
        if (!response.ok) return null;
        
        const data = await response.json();
        
        // Binance response yapısı
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
    } catch (e) { console.log("Binance fail:", e.message); return null; }
}

// --- KAYNAK 2: MEXC (Yedek) ---
async function getirMexc(pair) {
    try {
        const url = `https://api.mexc.com/api/v3/ticker/24hr?symbol=${pair}`;
        const response = await fetchWithHeaders(url);
        
        if (!response.ok) return null;
        
        const data = await response.json();
        
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
            agirlikli_ort: parseFloat(data.weightedAvgPrice),
            islem_sayisi: data.count
        };
    } catch (e) { console.log("Mexc fail:", e.message); return null; }
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

    // --- AKILLI SEMBOL DÜZELTME ---
    let symbol = kod.toUpperCase().trim();
    let pair = symbol;

    // İstisna: Sadece "USDT" yazılırsa Dolar/TL kurunu getirsin
    if (symbol === "USDT") {
        pair = "USDTTRY";
    } else {
        // Eğer zaten bir parite değilse (sonunda USDT, TRY, BTC yoksa) sonuna USDT ekle
        const suffixes = ["USDT", "TRY", "BTC", "ETH", "BNB", "EUR", "BUSD", "USDC", "FDUSD"];
        const hasSuffix = suffixes.some(s => symbol.endsWith(s) && symbol.length > s.length);
        
        if (!hasSuffix) {
            pair = symbol + "USDT";
        }
    }

    try {
        // STRATEJİ: Önce Binance, Olmazsa MEXC
        let sonuc = await getirBinance(pair);
        
        if (!sonuc) {
            sonuc = await getirMexc(pair);
        }

        if (sonuc) {
            // Veri Formatlama
            const guncellemeUnix = Math.floor(Date.now() / 1000);
            
            // Fiyat Sembolü Belirleme (BTCUSDT -> $, BTCTRY -> ₺)
            let paraBirimi = "$";
            if (pair.endsWith("TRY")) paraBirimi = "₺";
            if (pair.endsWith("BTC")) paraBirimi = "₿";
            if (pair.endsWith("ETH")) paraBirimi = "Ξ";

            res.status(200).json({
                tur: "Kripto Para",
                sembol: symbol, // Kullanıcının girdiği (BTC)
                parite: sonuc.sembol, // API'den gelen (BTCUSDT)
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
                    hacim_24s: formatHacim(sonuc.hacim_usdt) + " " + (paraBirimi === "₺" ? "TL" : "$"), // Dolar/TL hacmi
                    hacim_adet: formatHacim(sonuc.hacim_coin) + " Adet", // Coin hacmi
                    islem_sayisi: sonuc.islem_sayisi ? new Intl.NumberFormat('tr-TR').format(sonuc.islem_sayisi) : "Veri Yok",
                    ort_fiyat: formatPara(sonuc.agirlikli_ort, paraBirimi)
                }
            });
        } else {
            res.status(404).json({ 
                hata: true, 
                mesaj: `Coin verisi Binance ve MEXC'den çekilemedi (${pair}).`,
                denenen_parite: pair
            });
        }
    } catch (err) {
        res.status(500).json({ hata: true, mesaj: "Sunucu hatası", detay: err.message });
    }
}
