import * as cheerio from 'cheerio';

// --- YARDIMCI FONKSİYONLAR ---

function formatPara(sayi, sembol = "") {
    if (!sayi && sayi !== 0) return "Veri Yok";
    // Eğer sayı çok küçükse (0.00004 gibi) daha fazla basamak göster
    let maxDigits = 2;
    if (Math.abs(sayi) < 1 && Math.abs(sayi) > 0) maxDigits = 6;
    
    const formatted = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: maxDigits }).format(sayi);
    return sembol ? `${formatted} ${sembol}` : formatted;
}

function formatHacim(sayi) {
    if (!sayi) return "Veri Yok";
    if (sayi >= 1.0e+9) return (sayi / 1.0e+9).toFixed(2) + " Mr";
    if (sayi >= 1.0e+6) return (sayi / 1.0e+6).toFixed(2) + " Mn";
    if (sayi >= 1.0e+3) return (sayi / 1.0e+3).toFixed(2) + " B";
    return sayi.toString();
}

function getTrendEmoji(degisim) {
    const d = parseFloat(degisim);
    if (isNaN(d)) return "➖";
    if (d > 0) return "🟢"; // Yükseliş
    if (d < 0) return "🔴"; // Düşüş
    return "⚪"; // Nötr
}

// Ortak Fetch Fonksiyonu
async function fetchWithHeaders(url) {
    return await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9,tr;q=0.8'
        }
    });
}

// --- 1. MODÜL: KRİPTO PARA (Binance + MEXC Yedekli) ---
async function getirKripto(sembol) {
    let pair = "";
    try {
        pair = sembol.toUpperCase().trim();
        let ekle = true;
        
        if (["USDT", "TRY", "EUR", "BUSD", "USDC", "FDUSD"].some(s => pair.endsWith(s) && pair.length > s.length)) {
            ekle = false;
        }
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
        } catch (e) { console.log("Binance fail"); }

        // 2. Deneme: MEXC
        if (!data && pair.endsWith("USDT")) {
            try {
                kaynak = "MEXC (Yedek)";
                const urlMexc = `https://api.mexc.com/api/v3/ticker/24hr?symbol=${pair}`;
                const resMexc = await fetchWithHeaders(urlMexc);
                if (resMexc.ok) {
                    data = await resMexc.json();
                }
            } catch (e) { console.log("Mexc fail"); }
        }

        if (!data) {
            return { hata: true, mesaj: `Coin bulunamadı. (Denenen: ${pair})` };
        }
        
        const fiyat = parseFloat(data.lastPrice);
        const degisim = parseFloat(data.priceChangePercent);
        const acilis = parseFloat(data.openPrice);
        const dusuk = parseFloat(data.lowPrice);
        const yuksek = parseFloat(data.highPrice);
        const hacimBaz = parseFloat(data.volume); // Coin cinsinden hacim
        const hacimQuote = parseFloat(data.quoteVolume); // USDT cinsinden hacim

        return {
            tur: "Kripto Para",
            kaynak: kaynak,
            baslik: `${pair}`,
            // Temel Veriler
            fiyat: formatPara(fiyat, "$"),
            degisim_yuzde: degisim.toFixed(2),
            degisim_emoji: getTrendEmoji(degisim),
            
            // Detay Veriler
            acilis_fiyati: formatPara(acilis, "$"),
            gunluk_dusuk: formatPara(dusuk, "$"),
            gunluk_yuksek: formatPara(yuksek, "$"),
            gun_araligi: `${formatPara(dusuk)} - ${formatPara(yuksek)}`,
            
            hacim_coin: formatHacim(hacimBaz),
            hacim_usdt: formatHacim(hacimQuote) + " $",
            islem_sayisi: data.count ? formatHacim(data.count) : "N/A"
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
        // Genişletilmiş Eşleştirmeler
        if (aranan === "DOLAR" || aranan === "USD") key = "USD";
        else if (aranan === "EURO" || aranan === "EUR") key = "EUR";
        else if (aranan === "STERLIN" || aranan === "GBP") key = "GBP";
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
        else if (aranan === "GUMUS") key = "gumus";
        else if (aranan === "ONS") key = "ons";
        else if (aranan === "BRENT" || aranan === "PETROL") key = "brent-petrol";
        else key = aranan;

        const veri = data[key] || data[key.replace("-", " ").toUpperCase()];

        if (!veri) {
            return { 
                hata: true, 
                mesaj: `Bu veri bulunamadı (${aranan}).`,
                mevcut_kodlar: ["USD", "EUR", "GRAM", "CEYREK", "YARIM", "TAM", "CUMHURIYET", "ATA", "ONS", "BRENT"]
            };
        }

        const alis = parseFloat(veri.Alış.replace(/\./g, "").replace(",", "."));
        const satis = parseFloat(veri.Satış.replace(/\./g, "").replace(",", "."));
        const degisim = parseFloat(veri["Değişim"].replace("%", "").replace(",", "."));
        
        // Makas Hesabı (Spread)
        const makas = satis - alis;
        const makasYuzdesi = (makas / satis) * 100;

        return {
            tur: "Piyasa",
            baslik: key.toUpperCase().replace("-", " "),
            // Temel Veriler
            fiyat: formatPara(satis, "TL"), // Genelde satış fiyatı baz alınır
            degisim_yuzde: degisim,
            degisim_emoji: getTrendEmoji(degisim),
            
            // Detaylar
            alis: formatPara(alis, "TL"),
            satis: formatPara(satis, "TL"),
            makas: formatPara(makas, "TL"),
            makas_orani: `%${makasYuzdesi.toFixed(2)}`,
            
            guncelleme: veri.Update_Date || new Date().toLocaleTimeString('tr-TR')
        };

    } catch (e) {
        return { hata: true, mesaj: "Finans verisi çekilemedi." };
    }
}

// --- 3. MODÜL: BORSA İSTANBUL (Yahoo Finance Detaylı) ---
async function getirHisse(kod) {
    const symbol = kod.toUpperCase().trim();
    let sonuc = null;

    // 1. KAYNAK: YAHOO FINANCE (Çok Detaylı)
    try {
        const yahooSymbol = symbol.endsWith(".IS") ? symbol : `${symbol}.IS`;
        const url = `https://finance.yahoo.com/quote/${yahooSymbol}`;
        const response = await fetchWithHeaders(url);
        
        if (response.ok) {
            const html = await response.text();
            const $ = cheerio.load(html);
            
            // Data Field seçicileri Yahoo'da çok stabildir
            const getVal = (field) => {
                const el = $(`fin-streamer[data-field="${field}"][data-symbol="${yahooSymbol}"]`);
                return el.attr('value') || el.text();
            };

            const fiyatText = getVal("regularMarketPrice");
            
            if (fiyatText) {
                const degisimText = getVal("regularMarketChangePercent");
                const hacimText = getVal("regularMarketVolume");
                const piyasaDegeriText = getVal("marketCap");
                const gunYuksek = getVal("regularMarketDayHigh");
                const gunDusuk = getVal("regularMarketDayLow");
                
                const baslik = $('h1').first().text().replace(" (.IS)", "").trim();

                sonuc = {
                    kaynak: "Yahoo Finance",
                    fiyat: parseFloat(fiyatText),
                    degisim: parseFloat(degisimText),
                    baslik: baslik || symbol,
                    
                    // Ekstra Detaylar
                    hacim: parseFloat(hacimText),
                    piyasa_degeri: parseFloat(piyasaDegeriText),
                    gun_yuksek: parseFloat(gunYuksek),
                    gun_dusuk: parseFloat(gunDusuk)
                };
            }
        }
    } catch (e) { console.log("Yahoo fail"); }

    // 2. KAYNAK: GOOGLE FINANCE (Yedek - Daha az detay)
    if (!sonuc) {
        try {
            const url = `https://www.google.com/finance/quote/${symbol}:IST`;
            const response = await fetchWithHeaders(url);
            
            if (response.ok) {
                const html = await response.text();
                const $ = cheerio.load(html);
                
                const fiyatText = $('.YMlKec.fxKbKc').first().text().replace("₺", "").trim();
                if (fiyatText) {
                    const degisimText = $('.JwB6zf').first().text().replace("%", "").trim();
                    const baslik = $('.zzDege').first().text().trim();
                    const gunAralik = $('.P6K39c').eq(0).text(); // Gün Aralığı bazen buradadır
                    
                    sonuc = {
                        kaynak: "Google Finance",
                        fiyat: parseFloat(fiyatText.replace(/\./g, "").replace(",", ".")),
                        degisim: parseFloat(degisimText.replace(",", ".")),
                        baslik: baslik || symbol,
                        ekstra_bilgi: gunAralik // Google'dan bazen aralık gelir
                    };
                }
            }
        } catch (e) { console.log("Google fail"); }
    }

    // 3. KAYNAK: DOVIZ.COM (Yedek)
    if (!sonuc) {
        try {
            const url = `https://borsa.doviz.com/hisseler/${symbol.toLowerCase()}`;
            const response = await fetchWithHeaders(url);
            
            if (response.ok) {
                const html = await response.text();
                const $ = cheerio.load(html);
                
                const fiyatText = $('div[class*="text-4xl"]').first().text().trim();
                
                if (fiyatText) {
                    const degisimText = $('div[class*="text-md"]').first().text().replace("%", "").trim();
                    const baslik = $('title').text().split('|')[0].trim();
                    
                    // Doviz.com'da detayları almak için class araması (değişken olabilir)
                    
                    sonuc = {
                        kaynak: "Doviz.com",
                        fiyat: parseFloat(fiyatText.replace(/\./g, "").replace(",", ".")),
                        degisim: parseFloat(degisimText.replace(",", ".")),
                        baslik: baslik || symbol
                    };
                }
            }
        } catch (e) { console.log("Doviz.com fail"); }
    }

    // SONUÇ DÖNDÜRME
    if (sonuc) {
        return {
            tur: "Borsa İstanbul",
            sembol: symbol,
            baslik: sonuc.baslik,
            kaynak: sonuc.kaynak,
            
            // Temel
            fiyat: formatPara(sonuc.fiyat, "TL"),
            degisim_yuzde: sonuc.degisim.toFixed(2),
            degisim_emoji: getTrendEmoji(sonuc.degisim),
            
            // Detaylar (Varsa)
            gun_araligi: sonuc.gun_dusuk && sonuc.gun_yuksek ? `${formatPara(sonuc.gun_dusuk)} - ${formatPara(sonuc.gun_yuksek)}` : (sonuc.ekstra_bilgi || "Veri Yok"),
            hacim: sonuc.hacim ? formatHacim(sonuc.hacim) : "Veri Yok",
            piyasa_degeri: sonuc.piyasa_degeri ? formatHacim(sonuc.piyasa_degeri) : "Veri Yok"
        };
    } else {
        return { hata: true, mesaj: `Hisse verisi 3 kaynaktan da çekilemedi (${symbol}).` };
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
            
            // Genişletilmiş liste
            const dovizler = ["USD", "EUR", "GBP", "GRAM", "ONS", "BRENT", "GUMUS", "DOLAR", "EURO", "ALTIN", "STERLIN", "TAM", "YARIM", "CEYREK", "CUMHURIYET", "ATA", "RESAT", "22AYAR"];
            
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
