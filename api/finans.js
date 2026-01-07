import * as cheerio from 'cheerio';

// --- YARDIMCI FONKSİYONLAR ---

function formatPara(sayi, sembol = "") {
    if (!sayi && sayi !== 0) return "Veri Yok";
    let maxDigits = 2;
    if (Math.abs(sayi) < 1 && Math.abs(sayi) > 0) maxDigits = 6;
    
    if (typeof sayi === 'string') return sembol ? `${sayi} ${sembol}` : sayi;

    const formatted = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: maxDigits }).format(sayi);
    return sembol ? `${formatted} ${sembol}` : formatted;
}

function formatHacim(sayi) {
    if (!sayi) return "Veri Yok";
    if (typeof sayi === 'string') return sayi; 
    if (sayi >= 1.0e+9) return (sayi / 1.0e+9).toFixed(2) + " Mr";
    if (sayi >= 1.0e+6) return (sayi / 1.0e+6).toFixed(2) + " Mn";
    if (sayi >= 1.0e+3) return (sayi / 1.0e+3).toFixed(2) + " B";
    return sayi.toString();
}

function getTrendEmoji(degisim) {
    const d = parseFloat(degisim);
    if (isNaN(d)) return "➖";
    if (d > 0) return "🟢"; 
    if (d < 0) return "🔴"; 
    return "⚪"; 
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

        try {
            const urlBinance = `https://api.binance.com/api/v3/ticker/24hr?symbol=${pair}`;
            const resBinance = await fetchWithHeaders(urlBinance);
            if (resBinance.ok) {
                data = await resBinance.json();
            }
        } catch (e) { console.log("Binance fail"); }

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
        const hacimBaz = parseFloat(data.volume); 
        const hacimQuote = parseFloat(data.quoteVolume); 

        return {
            tur: "Kripto Para",
            kaynak: kaynak,
            baslik: `${pair}`,
            fiyat: formatPara(fiyat, "$"),
            degisim_yuzde: degisim.toFixed(2),
            degisim_emoji: getTrendEmoji(degisim),
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
        
        if (aranan === "DOLAR" || aranan === "USD") key = "USD";
        else if (aranan === "EURO" || aranan === "EUR") key = "EUR";
        else if (aranan === "STERLIN" || aranan === "GBP") key = "GBP";
        else if (aranan === "ALTIN" || aranan === "GRAM" || aranan === "GRAM-ALTIN") key = "gram-altin";
        else if (aranan === "CEYREK") key = "ceyrek-altin";
        else if (aranan === "YARIM") key = "yarim-altin";
        else if (aranan === "TAM") key = "tam-altin";
        else if (aranan === "CUMHURIYET") key = "cumhuriyet-altini";
        else if (aranan === "ATA") key = "ata-altin";
        else if (aranan === "RESAT") key = "resat-altin";
        else if (aranan === "22AYAR") key = "22-ayar-bilezik";
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
                mevcut_kodlar: ["USD", "EUR", "GRAM", "CEYREK", "ONS", "BRENT"]
            };
        }

        const alis = parseFloat(veri.Alış.replace(/\./g, "").replace(",", "."));
        const satis = parseFloat(veri.Satış.replace(/\./g, "").replace(",", "."));
        const degisim = parseFloat(veri["Değişim"].replace("%", "").replace(",", "."));
        const makas = satis - alis;
        const makasYuzdesi = (makas / satis) * 100;

        return {
            tur: "Piyasa",
            baslik: key.toUpperCase().replace("-", " "),
            fiyat: formatPara(satis, "TL"),
            degisim_yuzde: degisim,
            degisim_emoji: getTrendEmoji(degisim),
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

// --- 3. MODÜL: BORSA İSTANBUL (Yahoo -> Google -> Doviz.com) ---

// Yahoo Finance Scraper
async function getirHisseYahoo(symbol) {
    try {
        const yahooSymbol = symbol.endsWith(".IS") ? symbol : `${symbol}.IS`;
        const url = `https://finance.yahoo.com/quote/${yahooSymbol}`;
        const response = await fetchWithHeaders(url);
        
        if (!response.ok) return null;

        const html = await response.text();
        const $ = cheerio.load(html);
        
        const getVal = (field) => {
            const el = $(`fin-streamer[data-field="${field}"][data-symbol="${yahooSymbol}"]`);
            return el.attr('value') || el.text();
        };

        const fiyatText = getVal("regularMarketPrice");
        
        if (fiyatText) {
            return {
                kaynak: "Yahoo Finance",
                fiyat: parseFloat(fiyatText),
                degisim: parseFloat(getVal("regularMarketChangePercent")),
                baslik: $('h1').first().text().replace(" (.IS)", "").trim(),
                hacim: parseFloat(getVal("regularMarketVolume")),
                piyasa_degeri: parseFloat(getVal("marketCap")),
                gun_yuksek: parseFloat(getVal("regularMarketDayHigh")),
                gun_dusuk: parseFloat(getVal("regularMarketDayLow"))
            };
        }
    } catch (e) { console.log("Yahoo fail:", e.message); }
    return null;
}

// Google Finance Scraper (Akıllı Metin Arama Modu)
async function getirHisseGoogle(symbol) {
    try {
        const url = `https://www.google.com/finance/quote/${symbol}:IST`;
        const response = await fetchWithHeaders(url);
        if (!response.ok) return null;

        const html = await response.text();
        const $ = cheerio.load(html);
        
        const fiyatText = $('.YMlKec.fxKbKc').first().text().replace("₺", "").trim();
        if (!fiyatText) return null;

        const degisimText = $('.JwB6zf').first().text().replace("%", "").trim();
        const baslik = $('.zzDege').first().text().trim();
        
        // Detayları Akıllı Arama ile Bul
        let piyasaDegeri = "Veri Yok";
        let gunAraligi = "Veri Yok";
        
        // Class isimlerine güvenmeden, içeriğe göre bul
        $('div').each((i, el) => {
            const text = $(el).text().trim();
            // Google yapısı: Label ve Value ayrı divlerde ama aynı containerda olabilir
            // Bu yüzden "Piyasa değeri" yazısını bulunca, o divin içindeki veya yanındaki sayısal değeri almaya çalışırız
            // Google'da yapı genelde: <div class="gyFHrc"><div class="mfs7Fc">Piyasa değeri</div><div class="P6K39c">2,50 Mr</div></div>
            
            // Eğer element sadece "Piyasa değeri" yazıyorsa, kardeşine bak
            if (text === "Piyasa değeri") {
                const val = $(el).next().text().trim();
                if(val) piyasaDegeri = val;
            }
            if (text === "Gün aralığı") {
                const val = $(el).next().text().trim();
                if(val) gunAraligi = val;
            }
        });

        // Eğer yukarıdaki yöntem tutmazsa, class tabanlı yedek
        if (piyasaDegeri === "Veri Yok") {
             $('.gyFHrc').each((i, el) => {
                const label = $(el).find('.mfs7Fc').text().trim();
                const val = $(el).find('.P6K39c').text().trim();
                if (label.includes("Piyasa değeri")) piyasaDegeri = val;
                if (label.includes("Gün aralığı")) gunAraligi = val;
            });
        }

        return {
            kaynak: "Google Finance",
            fiyat: parseFloat(fiyatText.replace(/\./g, "").replace(",", ".")),
            degisim: parseFloat(degisimText.replace(",", ".")),
            baslik: baslik || symbol,
            piyasa_degeri_txt: piyasaDegeri,
            gun_araligi_txt: gunAraligi
        };
    } catch (e) { console.log("Google fail:", e.message); }
    return null;
}

// Doviz.com Scraper (Yerli ve Milli Yedek)
async function getirHisseDoviz(symbol) {
    try {
        const url = `https://borsa.doviz.com/hisseler/${symbol.toLowerCase()}`;
        const response = await fetchWithHeaders(url);
        if (!response.ok) return null;

        const html = await response.text();
        const $ = cheerio.load(html);
        
        const fiyatText = $('div[class*="text-4xl"]').first().text().trim();
        
        if (fiyatText) {
            const degisimText = $('div[class*="text-md"]').first().text().replace("%", "").trim();
            const baslik = $('title').text().split('|')[0].trim();
            
            let hacim = "Veri Yok";
            let gunAraligi = "Veri Yok";
            
            // Doviz.com tablo yapısı
            $('.value-table-row').each((i, el) => {
                const label = $(el).find('.label').text().trim(); // "Hacim (TL)" gibi
                const val = $(el).find('.value').text().trim();
                if (label.includes("Hacim")) hacim = val;
                if (label.includes("Gün Aralığı")) gunAraligi = val;
            });

            return {
                kaynak: "Doviz.com",
                fiyat: parseFloat(fiyatText.replace(/\./g, "").replace(",", ".")),
                degisim: parseFloat(degisimText.replace(",", ".")),
                baslik: baslik || symbol,
                hacim_txt: hacim,
                gun_araligi_txt: gunAraligi
            };
        }
    } catch (e) { console.log("Doviz.com fail:", e.message); }
    return null;
}

// Ana Borsa Fonksiyonu (Yönetici)
async function getirHisse(kod) {
    const symbol = kod.toUpperCase().trim();
    
    // 1. Yahoo Dene
    let sonuc = await getirHisseYahoo(symbol);
    
    // 2. Google Dene
    if (!sonuc) sonuc = await getirHisseGoogle(symbol);
    
    // 3. Doviz.com Dene
    if (!sonuc) sonuc = await getirHisseDoviz(symbol);

    if (sonuc) {
        // Çıktıyı standartlaştır
        let gunAraligiFinal = "Veri Yok";
        if (sonuc.gun_dusuk && sonuc.gun_yuksek) {
            gunAraligiFinal = `${formatPara(sonuc.gun_dusuk)} - ${formatPara(sonuc.gun_yuksek)}`;
        } else if (sonuc.gun_araligi_txt) {
            gunAraligiFinal = sonuc.gun_araligi_txt;
        }

        let hacimFinal = "Veri Yok";
        if (sonuc.hacim) hacimFinal = formatHacim(sonuc.hacim);
        else if (sonuc.hacim_txt) hacimFinal = sonuc.hacim_txt;

        let pdFinal = "Veri Yok";
        if (sonuc.piyasa_degeri) pdFinal = formatHacim(sonuc.piyasa_degeri);
        else if (sonuc.piyasa_degeri_txt) pdFinal = sonuc.piyasa_degeri_txt;

        return {
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
            const dovizler = ["USD", "EUR", "GBP", "GRAM", "ONS", "BRENT", "GUMUS", "DOLAR", "EURO", "ALTIN", "STERLIN", "TAM", "YARIM", "CEYREK", "CUMHURIYET", "ATA", "RESAT", "22AYAR", "14AYAR", "18AYAR", "BILEZIK"];
            
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
