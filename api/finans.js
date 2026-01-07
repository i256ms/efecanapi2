import * as cheerio from 'cheerio';

// --- YARDIMCI FONKSİYONLAR ---

function formatPara(sayi) {
    if (!sayi && sayi !== 0) return "Veri Yok";
    // Sayısal değeri Türkçe formatına (virgüllü) çevir
    return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(sayi);
}

function getTrendEmoji(degisim) {
    const d = parseFloat(degisim);
    if (isNaN(d)) return "➖";
    if (d > 0) return "🟢"; 
    if (d < 0) return "🔴"; 
    return "⚪"; 
}

// --- 1. MODÜL: KRİPTO PARA (Binance) ---
async function getirKripto(sembol) {
    try {
        let pair = sembol.toUpperCase();
        // Basit düzeltmeler
        if (!pair.endsWith("USDT") && !pair.endsWith("TRY") && !pair.endsWith("BTC")) {
            pair += "USDT";
        }

        const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${pair}`;
        const response = await fetch(url);
        
        if (!response.ok) return { hata: true, mesaj: "Coin bulunamadı." };
        
        const data = await response.json();
        const fiyat = parseFloat(data.lastPrice);
        
        // Kriptoda virgülden sonraki basamak sayısı fiyata göre değişsin
        let fiyatStr = formatPara(fiyat);
        if (fiyat < 1) fiyatStr = fiyat.toFixed(6); // PEPE, SHIB gibi coinler için

        return {
            tur: "Kripto Para",
            baslik: `${pair} (Binance)`,
            fiyat: `${fiyatStr} $`,
            degisim_yuzde: parseFloat(data.priceChangePercent).toFixed(2),
            degisim_emoji: getTrendEmoji(data.priceChangePercent),
            en_yuksek_24s: parseFloat(data.highPrice),
            en_dusuk_24s: parseFloat(data.lowPrice),
            hacim: formatPara(data.quoteVolume) + " USDT"
        };
    } catch (e) {
        return { hata: true, mesaj: "Binance verisine ulaşılamadı." };
    }
}

// --- 2. MODÜL: DÖVİZ / ALTIN / EMTİA (Truncgil) ---
async function getirGenelFinans(kod) {
    try {
        const url = "https://finans.truncgil.com/today.json";
        const response = await fetch(url);
        
        if (!response.ok) return { hata: true, mesaj: "Finans servisine ulaşılamadı." };
        
        const data = await response.json();
        const aranan = kod.toUpperCase();
        
        // Eşleştirmeler
        let key = "";
        if (aranan === "DOLAR" || aranan === "USD") key = "USD";
        else if (aranan === "EURO" || aranan === "EUR") key = "EUR";
        else if (aranan === "STERLIN" || aranan === "GBP") key = "GBP";
        else if (aranan === "ALTIN" || aranan === "GRAM") key = "gram-altin";
        else if (aranan === "CEYREK") key = "ceyrek-altin";
        else if (aranan === "ONS") key = "ons";
        else if (aranan === "BRENT") key = "brent-petrol";
        else if (aranan === "GUMUS") key = "gumus";
        else key = aranan;

        // Truncgil bazen boşluklu bazen tireli key kullanıyor, ikisini de dene
        const veri = data[key] || data[key.replace("-", " ").toUpperCase()];

        if (!veri) {
            return { 
                hata: true, 
                mesaj: "Bu veri bulunamadı. Örn: USD, GRAM, ONS",
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
            fiyat: formatPara(satis), // Genel kullanım için satış fiyatını baz alalım
            degisim_yuzde: degisim,
            degisim_emoji: getTrendEmoji(degisim),
            guncelleme: veri.Update_Date || new Date().toLocaleTimeString('tr-TR')
        };

    } catch (e) {
        return { hata: true, mesaj: "Finans verisi çekilemedi." };
    }
}

// --- 3. MODÜL: BORSA İSTANBUL (Yahoo Finance) ---
// Bigpara link yapısı sorunlu olduğu için Yahoo Finance'e geçtik.
async function getirHisse(kod) {
    try {
        const symbol = kod.toUpperCase();
        // Yahoo Finance'de BIST hisseleri .IS uzantısı alır (Örn: THYAO.IS)
        const yahooSymbol = symbol.endsWith(".IS") ? symbol : `${symbol}.IS`;
        
        const url = `https://finance.yahoo.com/quote/${yahooSymbol}`;
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        if (!response.ok) return { hata: true, mesaj: "Borsa verisine ulaşılamadı." };

        const html = await response.text();
        const $ = cheerio.load(html);

        // Yahoo Finance Seçicileri (fin-streamer etiketleri çok stabildir)
        // Fiyat
        const fiyatEl = $(`fin-streamer[data-field="regularMarketPrice"][data-symbol="${yahooSymbol}"]`);
        const fiyatText = fiyatEl.attr('value') || fiyatEl.text();
        
        // Değişim (%)
        const degisimEl = $(`fin-streamer[data-field="regularMarketChangePercent"][data-symbol="${yahooSymbol}"]`);
        const degisimText = degisimEl.attr('value') || degisimEl.text();

        // Başlık (Şirket Adı)
        const baslik = $('h1').first().text().replace(" (.IS)", "").trim();

        if (!fiyatText) {
            // Eğer Yahoo'da bulamazsak Google Finance deneyelim (Yedek)
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
        console.error(e);
        return { hata: true, mesaj: "Hisse verisi alınamadı." };
    }
}

// --- YEDEK BORSA MODÜLÜ (Google Finance) ---
async function getirHisseYedek(kod) {
    try {
        const symbol = kod.toUpperCase();
        const url = `https://www.google.com/finance/quote/${symbol}:IST`;
        
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        
        if (!response.ok) return { hata: true, mesaj: `${symbol} kodlu hisse bulunamadı.` };

        const html = await response.text();
        const $ = cheerio.load(html);

        // Google Finance Seçicileri (Değişebilir ama genelde stabildir)
        const fiyatText = $('.YMlKec.fxKbKc').first().text().replace("₺", "").trim();
        const degisimText = $('.JwB6zf').first().text().replace("%", "").trim();
        const baslik = $('.zzDege').first().text().trim();

        if (!fiyatText) return { hata: true, mesaj: `${symbol} bulunamadı.` };

        // Google Türkçe sunucudan 123,45 formatında dönebilir, düzeltelim
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
            kullanim: "/api/finans?kod=THYAO (Otomatik algılar)"
        });
    }

    let sonuc = {};

    // 1. Manuel Tür Seçimi
    if (tur === "kripto" || tur === "coin") {
        sonuc = await getirKripto(kod);
    } 
    else if (tur === "borsa" || tur === "hisse") {
        sonuc = await getirHisse(kod);
    }
    else if (tur === "doviz" || tur === "altin" || tur === "emtia") {
        sonuc = await getirGenelFinans(kod);
    }
    // 2. Akıllı Tahmin Modu
    else {
        const k = kod.toUpperCase();
        
        // Yaygın Dövizler
        const dovizler = ["USD", "EUR", "GBP", "GRAM", "ONS", "BRENT", "GUMUS", "DOLAR", "EURO", "ALTIN", "STERLIN"];
        
        if (dovizler.includes(k)) {
            sonuc = await getirGenelFinans(kod);
        }
        // Kripto Belirteçleri (Sonunda USDT/TRY varsa veya bilinen coinlerse)
        else if (k.endsWith("USDT") || k.endsWith("TRY") || ["BTC", "ETH", "SOL", "XRP", "AVAX", "DOGE"].includes(k)) {
            sonuc = await getirKripto(kod);
        }
        // Geriye kalan her şeyi önce Borsa (Hisse) olarak dene
        else {
            let borsaDene = await getirHisse(kod);
            if (!borsaDene.hata) {
                sonuc = borsaDene;
            } else {
                // Borsa'da yoksa Kripto'ya bak (Belki PEPE yazmıştır)
                sonuc = await getirKripto(kod);
            }
        }
    }

    if (sonuc.hata) {
        return res.status(404).json(sonuc);
    }

    res.status(200).json(sonuc);
}
