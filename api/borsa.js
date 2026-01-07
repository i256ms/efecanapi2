import * as cheerio from 'cheerio';

// --- YARDIMCI FONKSİYONLAR ---

function formatPara(sayi, sembol = "") {
    if (sayi === null || sayi === undefined) return "Veri Yok";
    
    // String geldiyse temizle ve sayıya çevir
    if (typeof sayi === 'string') {
        if (sayi.includes("Veri") || sayi.includes("Yok")) return "Veri Yok";
        if (sayi.includes(",")) return sembol && !sayi.includes(sembol) ? `${sayi} ${sembol}` : sayi;
        sayi = parseFloat(sayi.replace(/\./g, "").replace(",", "."));
    }

    let maxDigits = 2;
    if (Math.abs(sayi) < 1 && Math.abs(sayi) > 0) maxDigits = 6;

    const formatted = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: maxDigits }).format(sayi);
    return sembol ? `${formatted} ${sembol}` : formatted;
}

function formatHacim(sayi) {
    if (!sayi || sayi === "Veri Yok") return "Veri Yok";
    if (typeof sayi === 'string') {
        if (sayi.includes("Veri")) return "Veri Yok";
        return sayi;
    }
    
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

// Ortak Fetch Fonksiyonu
async function fetchWithHeaders(url) {
    return await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        }
    });
}

// --- KAYNAK 1: DOVİZ.COM (Yerli ve Detaylı - İlk Tercih) ---
async function getirHisseDoviz(symbol) {
    try {
        const url = `https://borsa.doviz.com/hisseler/${symbol.toLowerCase()}`;
        const response = await fetchWithHeaders(url);
        
        if (!response.ok) return null; // 404 ise bulamadı demektir

        const html = await response.text();
        const $ = cheerio.load(html);
        
        // Fiyat Çekme Stratejileri
        let fiyatText = $('div[data-socket-key="' + symbol + '"]').text().trim();
        if (!fiyatText) fiyatText = $('div[class*="text-4xl"]').first().text().trim();
        if (!fiyatText) fiyatText = $('span[itemprop="price"]').text().trim();
        
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

            return {
                kaynak: "Doviz.com",
                fiyat: parseFloat(fiyatText.replace(/\./g, "").replace(",", ".")),
                degisim: parseFloat(degisimText.replace(",", ".")),
                baslik: baslik || symbol,
                hacim_txt: hacim,
                gun_araligi_txt: gunAraligi,
                piyasa_degeri_txt: piyasaDegeri
            };
        }
    } catch (e) { console.log("Doviz.com fail:", e.message); }
    return null;
}

// --- KAYNAK 2: MYNET FİNANS (İkinci Tercih) ---
async function getirHisseMynet(symbol) {
    try {
        // Arama yap
        const searchUrl = `https://finans.mynet.com/api/search/searchall?term=${symbol}`;
        const searchRes = await fetchWithHeaders(searchUrl);
        if (!searchRes.ok) return null;
        
        const searchData = await searchRes.json();
        const hisse = searchData.stocks?.find(s => s.slug.toUpperCase().includes(symbol)) || searchData.stocks?.[0];
        if (!hisse) return null;

        // Detay çek
        const detailUrl = `https://finans.mynet.com/borsa/hisseler/${hisse.slug}/`;
        const htmlRes = await fetchWithHeaders(detailUrl);
        const html = await htmlRes.text();
        const $ = cheerio.load(html);

        let fiyat = 0;
        let degisim = 0;
        let hacim = null;
        let piyasaDegeri = null;
        let gunAraligi = null;

        $('.flex-list-item').each((i, el) => {
            const label = $(el).find('span').first().text().trim();
            const val = $(el).find('span').last().text().trim();
            
            if (label.includes("Son Fiyat")) fiyat = parseFloat(val.replace(",", "."));
            if (label.includes("Değişim (%)")) degisim = parseFloat(val.replace(",", "."));
            if (label.includes("Hacim (TL)")) hacim = val;
            if (label.includes("Piyasa Değeri")) piyasaDegeri = val;
            if (label.includes("Gün Aralığı")) gunAraligi = val;
        });

        if (!fiyat) {
             const headerFiyat = $('.company-info-current-price').text().trim().split(' ')[0];
             if(headerFiyat) fiyat = parseFloat(headerFiyat.replace(",", "."));
        }

        if (!fiyat) return null;

        return {
            kaynak: "Mynet Finans",
            fiyat: fiyat,
            degisim: degisim,
            baslik: $('h1').text().trim() || hisse.name,
            hacim_txt: hacim,
            piyasa_degeri_txt: piyasaDegeri,
            gun_araligi_txt: gunAraligi
        };

    } catch (e) { console.log("Mynet fail:", e.message); }
    return null;
}

// --- KAYNAK 3: YAHOO FINANCE JSON (Üçüncü Tercih) ---
async function getirHisseYahooJson(symbol) {
    try {
        const yahooSymbol = symbol.endsWith(".IS") ? symbol : `${symbol}.IS`;
        const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${yahooSymbol}`;
        const response = await fetchWithHeaders(url);
        if (!response.ok) return null;

        const json = await response.json();
        const data = json.quoteResponse?.result?.[0];

        if (!data) return null;

        return {
            kaynak: "Yahoo Finance",
            fiyat: data.regularMarketPrice,
            degisim: data.regularMarketChangePercent,
            baslik: data.longName || data.shortName || symbol,
            hacim: data.regularMarketVolume,
            piyasa_degeri: data.marketCap,
            gun_yuksek: data.regularMarketDayHigh,
            gun_dusuk: data.regularMarketDayLow
        };

    } catch (e) { console.log("Yahoo JSON fail:", e.message); }
    return null;
}

// --- KAYNAK 4: GOOGLE FINANCE (Son Çare) ---
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
        
        let piyasaDegeri = null;
        let gunAraligi = null;

        $('div').each((i, el) => {
            const text = $(el).text().trim();
            if (text.includes("Piyasa değ")) {
                const val = $(el).next().text().trim() || $(el).parent().children().last().text().trim();
                if(val && !val.includes("Piyasa")) piyasaDegeri = val;
            }
            if (text.includes("Gün aralığı")) {
                const val = $(el).next().text().trim() || $(el).parent().children().last().text().trim();
                if(val && !val.includes("Gün")) gunAraligi = val;
            }
        });

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

// --- ANA YÖNETİCİ ---
export default async function handler(req, res) {
    const { kod } = req.query;

    if (!kod) {
        return res.status(400).json({
            hata: true,
            mesaj: "Lütfen bir hisse kodu girin. Örn: /api/borsa?kod=THYAO"
        });
    }

    const symbol = kod.toUpperCase().trim();
    let sonuc = null;

    try {
        // SIRALAMA: Doviz -> Mynet -> Yahoo -> Google
        
        sonuc = await getirHisseDoviz(symbol);

        if (!sonuc) sonuc = await getirHisseMynet(symbol);
        
        if (!sonuc) sonuc = await getirHisseYahooJson(symbol);
        
        if (!sonuc) sonuc = await getirHisseGoogle(symbol);

        if (sonuc) {
            // Çıktıyı standartlaştır ve formatla
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

            res.status(200).json({
                tur: "Borsa İstanbul",
                sembol: symbol,
                baslik: sonuc.baslik,
                kaynak: sonuc.kaynak,
                fiyat: formatPara(sonuc.fiyat, "TL"),
                degisim_yuzde: sonuc.degisim ? sonuc.degisim.toFixed(2) : "0.00",
                degisim_emoji: getTrendEmoji(sonuc.degisim),
                gun_araligi: gunAraligiFinal,
                hacim: hacimFinal,
                piyasa_degeri: pdFinal
            });
        } else {
            res.status(404).json({ 
                hata: true, 
                mesaj: `Hisse verisi 4 kaynaktan da çekilemedi (${symbol}).`,
                denenen_kaynaklar: ["Doviz.com", "Mynet", "Yahoo", "Google"]
            });
        }
    } catch (err) {
        res.status(500).json({ hata: true, mesaj: "Sunucu hatası", detay: err.message });
    }
}
