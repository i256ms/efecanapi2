import * as cheerio from 'cheerio';

// --- YARDIMCI FONKSİYONLAR ---

function formatPara(sayi) {
    if (!sayi && sayi !== 0) return "Veri Yok";
    return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(sayi);
}

function getTrendEmoji(degisim) {
    const d = parseFloat(degisim);
    if (isNaN(d)) return "➖";
    if (d > 0) return "🟢"; 
    if (d < 0) return "🔴"; 
    return "⚪"; 
}

// Ortak Fetch Fonksiyonu (Tarayıcı gibi davranır)
async function fetchWithHeaders(url) {
    return await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });
}

// --- 1. MODÜL: KRİPTO PARA (Binance + MEXC Yedekli) ---
async function getirKripto(sembol) {
    let pair = "";
    try {
        pair = sembol.toUpperCase().trim();
        
        // AKILLI PARİTE MANTIĞI
        let ekle = true;
        
        // Zaten USDT, TRY vb. ile bitiyorsa ekleme
        if (["USDT", "TRY", "EUR", "BUSD", "USDC", "FDUSD"].some(s => pair.endsWith(s) && pair.length > s.length)) {
            ekle = false;
        }
        // Parite ise (ETHBTC gibi 4 harften uzun ve BTC ile biten) ekleme
        else if (["BTC", "ETH", "BNB"].some(s => pair.endsWith(s)) && pair.length > 4) {
            ekle = false;
        }

        if (ekle) {
            pair += "USDT";
        }

        let data = null;
        let kaynak = "Binance";

        // 1. Deneme: BINANCE
        try {
            const urlBinance = `https://api.binance.com/api/v3/ticker/24hr?symbol=${pair}`;
            const resBinance = await fetchWithHeaders(urlBinance);
            if (resBinance.ok) {
                data = await resBinance.json();
            }
        } catch (e) { console.log("Binance erişim hatası, yedeğe geçiliyor."); }

        // 2. Deneme: MEXC (Eğer Binance başarısızsa ve parite USDT ise)
        // Not: MEXC API yapısı Binance ile birebir aynıdır.
        if (!data && pair.endsWith("USDT")) {
            try {
                kaynak = "MEXC (Yedek)";
                const urlMexc = `https://api.mexc.com/api/v3/ticker/24hr?symbol=${pair}`;
                const resMexc = await fetchWithHeaders(urlMexc);
                if (resMexc.ok) {
                    data = await resMexc.json();
                }
            } catch (e) { console.log("Mexc erişim hatası."); }
        }

        if (!data) {
            return { hata: true, mesaj: `Coin bulunamadı. (Denenen: ${pair}) - Vercel IP'si engellenmiş olabilir.` };
        }
        
        const fiyat = parseFloat(data.lastPrice);
        let fiyatStr = formatPara(fiyat);
        if (fiyat < 1) fiyatStr = fiyat.toFixed(6); 

        return {
            tur: "Kripto Para",
            kaynak: kaynak,
            baslik: `${pair}`,
            fiyat: `${fiyatStr} $`,
            degisim_yuzde: parseFloat(data.priceChangePercent).toFixed(2),
            degisim_emoji: getTrendEmoji(data.priceChangePercent),
            en_yuksek_24s: parseFloat(data.highPrice),
            en_dusuk_24s: parseFloat(data.lowPrice),
            hacim: formatPara(data.quoteVolume) + (pair.endsWith("USDT") ? " USDT" : "")
        };

    } catch (e) {
        return { hata: true, mesaj: `Kripto hatası: ${e.message}` };
    }
}

// --- 2. MODÜL: DÖVİZ / ALTIN / EMTİA (Truncgil) ---
async function getirGenelFinans(kod) {
    try {
        const url = "https://finans.truncgil.com/today.json";
        const response = await fetchWithHeaders(url);
        
        if (!response.ok) return { hata: true, mesaj: "Finans servisine ulaşılamadı." };
        
        const data = await response.json();
        const aranan = kod.toUpperCase().trim();
        
        let key = "";
        if (aranan === "DOLAR" || aranan === "USD") key = "USD";
        else if (aranan === "EURO" || aranan === "EUR") key = "EUR";
        else if (aranan === "STERLIN" || aranan === "GBP") key = "GBP";
        else if (aranan === "ALTIN" || aranan === "GRAM" || aranan === "GRAM-ALTIN") key = "gram-altin";
        else if (aranan === "CEYREK") key = "ceyrek-altin";
        else if (aranan === "ONS") key = "ons";
        else if (aranan === "BRENT" || aranan === "PETROL") key = "brent-petrol";
        else if (aranan === "GUMUS") key = "gumus";
        else key = aranan;

        const veri = data[key] || data[key.replace("-", " ").toUpperCase()];

        if (!veri) {
            return { 
                hata: true, 
                mesaj: `Bu veri bulunamadı (${aranan}).`,
                mevcut_kodlar: ["USD", "EUR", "GRAM", "CEYREK", "ONS", "BRENT"]
            };
        }

        const alis = parseFloat(veri.Alış.replace(",", "."));
        const satis = parseFloat(veri.Satış.replace(",", "."));
        const degisim = parseFloat(veri["Değişim"].replace("%", "").replace(",", "."));

        return {
            tur: "Piyasa",
            baslik: key.toUpperCase().replace("-", " "),
            alis: formatPara(alis),
            satis: formatPara(satis),
            fiyat: formatPara(satis),
            degisim_yuzde: degisim,
            degisim_emoji: getTrendEmoji(degisim),
            guncelleme: veri.Update_Date || new Date().toLocaleTimeString('tr-TR')
        };

    } catch (e) {
        return { hata: true, mesaj: "Finans verisi çekilemedi." };
    }
}

// --- 3. MODÜL: BORSA İSTANBUL (Yahoo Finance + Google Yedek) ---
async function getirHisse(kod) {
    let yahooSymbol = "";
    try {
        const symbol = kod.toUpperCase().trim();
        yahooSymbol = symbol.endsWith(".IS") ? symbol : `${symbol}.IS`;
        
        const url = `https://finance.yahoo.com/quote/${yahooSymbol}`;
        const response = await fetchWithHeaders(url);

        if (!response.ok) return { hata: true, mesaj: "Borsa verisine ulaşılamadı." };

        const html = await response.text();
        const $ = cheerio.load(html);

        const fiyatEl = $(`fin-streamer[data-field="regularMarketPrice"][data-symbol="${yahooSymbol}"]`);
        const fiyatText = fiyatEl.attr('value') || fiyatEl.text();
        
        const degisimEl = $(`fin-streamer[data-field="regularMarketChangePercent"][data-symbol="${yahooSymbol}"]`);
        const degisimText = degisimEl.attr('value') || degisimEl.text();

        const baslik = $('h1').first().text().replace(" (.IS)", "").trim();

        if (!fiyatText) {
            return await getirHisseYedek(symbol);
        }

        const fiyat = parseFloat(fiyatText);
        const degisim = parseFloat(degisimText);

        return {
            tur: "Borsa İstanbul",
            sembol: symbol,
            baslik: baslik || symbol,
            fiyat: formatPara(fiyat) + " TL",
            degisim_yuzde: degisim.toFixed(2),
            degisim_emoji: getTrendEmoji(degisim),
            kaynak: "Yahoo Finance"
        };

    } catch (e) {
        return { hata: true, mesaj: `Hisse verisi alınamadı (${yahooSymbol}).` };
    }
}

async function getirHisseYedek(kod) {
    try {
        const symbol = kod.toUpperCase().trim();
        const url = `https://www.google.com/finance/quote/${symbol}:IST`;
        const response = await fetchWithHeaders(url);
        
        if (!response.ok) return { hata: true, mesaj: `${symbol} kodlu hisse bulunamadı.` };

        const html = await response.text();
        const $ = cheerio.load(html);

        const fiyatText = $('.YMlKec.fxKbKc').first().text().replace("₺", "").trim();
        const degisimText = $('.JwB6zf').first().text().replace("%", "").trim();
        const baslik = $('.zzDege').first().text().trim();

        if (!fiyatText) return { hata: true, mesaj: `${symbol} bulunamadı.` };

        const fiyat = parseFloat(fiyatText.replace(",", "."));
        const degisim = parseFloat(degisimText.replace(",", "."));

        return {
            tur: "Borsa İstanbul",
            sembol: symbol,
            baslik: baslik || symbol,
            fiyat: formatPara(fiyat) + " TL",
            degisim_yuzde: degisim.toFixed(2),
            degisim_emoji: getTrendEmoji(degisim),
            kaynak: "Google Finance"
        };

    } catch (e) {
        return { hata: true, mesaj: "Hisse bulunamadı." };
    }
}

// --- ANA API ---
export default async function handler(req, res) {
    const { kod, tur } = req.query;

    if (!kod) {
        return res.status(200).json({
            durum: "Hazır",
            mesaj: "Lütfen bir 'kod' girin.",
            kullanim: "/api/finans?kod=THYAO"
        });
    }

    let sonuc = {};

    try {
        const temizKod = kod.trim();

        if (tur === "kripto" || tur === "coin") {
            sonuc = await getirKripto(temizKod);
        } 
        else if (tur === "borsa" || tur === "hisse") {
            sonuc = await getirHisse(temizKod);
        }
        else if (tur === "doviz" || tur === "altin" || tur === "emtia") {
            sonuc = await getirGenelFinans(temizKod);
        }
        else {
            const k = temizKod.toUpperCase();
            
            const dovizler = ["USD", "EUR", "GBP", "GRAM", "ONS", "BRENT", "GUMUS", "DOLAR", "EURO", "ALTIN", "STERLIN"];
            
            if (dovizler.includes(k)) {
                sonuc = await getirGenelFinans(temizKod);
            }
            else if (k.endsWith("USDT") || k.endsWith("TRY") || ["BTC", "ETH", "SOL", "XRP", "AVAX", "DOGE"].includes(k)) {
                sonuc = await getirKripto(temizKod);
            }
            else {
                let borsaDene = await getirHisse(temizKod);
                if (!borsaDene.hata) {
                    sonuc = borsaDene;
                } else {
                    sonuc = await getirKripto(temizKod);
                }
            }
        }

        if (sonuc.hata) {
            return res.status(404).json(sonuc);
        }

        res.status(200).json(sonuc);
    } catch (err) {
        res.status(500).json({ hata: true, mesaj: "Sunucu hatası", detay: err.message });
    }
}
