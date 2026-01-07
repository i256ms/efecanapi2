import * as cheerio from 'cheerio';

// --- YARDIMCI FONKSİYONLAR ---

function formatPara(sayi, sembol = "") {
    if (sayi === null || sayi === undefined) return "Veri Yok";
    
    if (typeof sayi === 'string') {
        if (sayi.includes("Veri") || sayi.includes("Yok")) return "Veri Yok";
        // Zaten formatlıysa (1.234,56)
        if (sayi.includes(",") && !sayi.includes(".")) {
             return sembol && !sayi.includes(sembol) ? `${sayi} ${sembol}` : sayi;
        }
        sayi = parseFloat(sayi.replace(/\./g, "").replace(",", "."));
    }

    if (isNaN(sayi)) return "Veri Yok";

    let maxDigits = 2;
    if (Math.abs(sayi) < 1 && Math.abs(sayi) > 0) maxDigits = 6;

    const formatted = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: maxDigits }).format(sayi);
    return sembol ? `${formatted} ${sembol}` : formatted;
}

function formatHacim(sayi) {
    if (!sayi || sayi === "Veri Yok") return "Veri Yok";
    
    if (typeof sayi === 'string' && /[a-zA-Z]/.test(sayi)) return sayi;
    
    if (typeof sayi === 'string') sayi = parseFloat(sayi.replace(/\./g, "").replace(",", "."));

    if (isNaN(sayi)) return "Veri Yok";

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

async function fetchWithHeaders(url) {
    return await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
            'Referer': 'https://www.google.com/',
            'Cache-Control': 'no-cache'
        }
    });
}

// --- KAYNAK 1: DOVİZ.COM ---
async function getirHisseDoviz(symbol) {
    const url = `https://borsa.doviz.com/hisseler/${symbol.toLowerCase()}`;
    const debug = { url: url, adimlar: [] };

    try {
        const response = await fetchWithHeaders(url);
        debug.adimlar.push(`HTTP: ${response.status}`);
        
        if (!response.ok) return null;

        const html = await response.text();
        // Boş response kontrolü
        if (!html || html.length < 500) {
            debug.adimlar.push("HTML İçeriği çok kısa veya boş (Bloklandı).");
            return null;
        }

        const $ = cheerio.load(html);
        
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
    } catch (e) { console.log("Doviz.com fail"); }
    return null;
}

// --- KAYNAK 2: BIGPARA (Akıllı API Destekli) ---
async function getirHisseBigpara(symbol) {
    try {
        // 1. Adım: Bigpara API'den hissenin doğru URL slug'ını bul
        const searchUrl = `https://bigpara.hurriyet.com.tr/api/v1/search/kripto-borsa-doviz-hisse?query=${symbol}`;
        const searchRes = await fetchWithHeaders(searchUrl);
        
        if (!searchRes.ok) return null;
        
        const searchJson = await searchRes.json();
        // Gelen listeden tam eşleşeni veya ilk hisseyi bul
        const hisse = searchJson.data?.find(d => d.type === "Hisse") || searchJson.data?.[0];
        
        if (!hisse || !hisse.slug) return null;

        // 2. Adım: Detay sayfasına git
        const detailUrl = `https://bigpara.hurriyet.com.tr/borsa/hisse-fiyatlari/${hisse.slug}-detay/`;
        const htmlRes = await fetchWithHeaders(detailUrl);
        const html = await htmlRes.text();
        const $ = cheerio.load(html);

        // Bigpara Seçicileri
        // Fiyat: .price-container .value veya .proDetail .priceBox .price
        const fiyatText = $('.price-container .value').first().text().trim() || 
                          $('.proDetail .priceBox .price').first().text().trim();
        
        if (fiyatText) {
            const degisimText = $('.price-container .rate').first().text().replace("%", "").trim() ||
                                $('.proDetail .priceBox .dir').first().text().replace("%", "").trim();
            
            // Yön kontrolü (Düşüşte mi?)
            const isDown = $('.price-container .rate').hasClass('down') || $('.proDetail .priceBox .dir').hasClass('down');
            let degisim = parseFloat(degisimText.replace(",", "."));
            if (isDown) degisim = -Math.abs(degisim);

            const baslik = $('h1').first().text().trim();

            // Detaylar
            let hacim = null;
            let gunDusuk = null;
            let gunYuksek = null;
            let piyasaDegeri = null;

            // Bigpara detay kutuları
            $('.detail-item').each((i, el) => {
                const label = $(el).find('.label').text().trim();
                const val = $(el).find('.value').text().trim();
                
                if (label.includes("Hacim")) hacim = val;
                if (label.includes("Piyasa Değeri")) piyasaDegeri = val;
                if (label.includes("Günlük Aralık")) {
                    const parts = val.split('-');
                    if (parts.length === 2) {
                        gunDusuk = parts[0].trim();
                        gunYuksek = parts[1].trim();
                    }
                }
            });

            return {
                kaynak: "Bigpara",
                fiyat: parseFloat(fiyatText.replace(/\./g, "").replace(",", ".")),
                degisim: degisim,
                baslik: baslik || symbol,
                hacim_txt: hacim,
                gun_araligi_txt: gunDusuk && gunYuksek ? `${gunDusuk} - ${gunYuksek}` : "Veri Yok",
                piyasa_degeri_txt: piyasaDegeri
            };
        }

    } catch (e) { console.log("Bigpara fail:", e.message); }
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
    
    // STRATEJİ: Önce Doviz.com, Olmazsa Bigpara
    let sonuc = await getirHisseDoviz(symbol);
    
    if (!sonuc) {
        sonuc = await getirHisseBigpara(symbol);
    }

    if (sonuc) {
        res.status(200).json({
            tur: "Borsa İstanbul",
            sembol: symbol,
            baslik: sonuc.baslik,
            kaynak: sonuc.kaynak,
            
            fiyat: formatPara(sonuc.fiyat, "TL"),
            degisim_yuzde: sonuc.degisim.toFixed(2),
            degisim_emoji: getTrendEmoji(sonuc.degisim),
            
            gun_araligi: sonuc.gun_araligi_txt || "Veri Yok",
            hacim: formatHacim(sonuc.hacim_txt),
            piyasa_degeri: formatHacim(sonuc.piyasa_degeri_txt)
        });
    } else {
        // İki kaynak da patladıysa
        res.status(404).json({ 
            hata: true, 
            mesaj: `Hisse verisi Doviz.com ve Bigpara'dan çekilemedi (${symbol}).`,
            sebep: "Sunucu IP'si engellenmiş veya hisse kodu hatalı olabilir."
        });
    }
}
