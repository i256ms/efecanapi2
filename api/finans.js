import * as cheerio from 'cheerio';

// --- YARDIMCI FONKSİYONLAR ---

// Sayı formatlayıcı (12345.67 -> 12.345,67)
function formatPara(sayi) {
    if (!sayi && sayi !== 0) return "Veri Yok";
    return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(sayi);
}

// Yüzde değişimine göre emoji seçer
function getTrendEmoji(degisim) {
    const d = parseFloat(degisim);
    if (isNaN(d)) return "➖";
    if (d > 0) return "🟢"; // Yükseliş
    if (d < 0) return "🔴"; // Düşüş
    return "⚪"; // Nötr
}

// --- 1. MODÜL: KRİPTO PARA (Binance) ---
async function getirKripto(sembol) {
    try {
        // Kullanıcı BTC yazsa da biz BTCUSDT arayalım (Varsayılan USDT paritesi)
        // Eğer kullanıcı zaten USDT eklediyse (BTCUSDT) bozmayalım.
        let pair = sembol.toUpperCase();
        if (!pair.endsWith("USDT") && !pair.endsWith("TRY") && !pair.endsWith("BTC")) {
            pair += "USDT";
        }

        const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${pair}`;
        const response = await fetch(url);
        
        if (!response.ok) return { hata: true, mesaj: "Coin bulunamadı." };
        
        const data = await response.json();
        
        return {
            tur: "Kripto Para",
            baslik: `${pair} (Binance)`,
            fiyat: parseFloat(data.lastPrice),
            fiyat_formatli: `${parseFloat(data.lastPrice)} $`, // Kriptoda hassas küsurat önemlidir
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
        // Truncgil API'si devasa bir JSON döner, içinden aradığımızı bulacağız.
        const url = "https://finans.truncgil.com/today.json";
        const response = await fetch(url); // Tarayıcı taklidine gerek yok, public API.
        
        if (!response.ok) return { hata: true, mesaj: "Finans servisine ulaşılamadı." };
        
        const data = await response.json();
        const aranan = kod.toUpperCase();
        
        // API'deki anahtar kelimelerle eşleştirme (Mapping)
        let key = "";
        
        // Yaygın kodları eşleştirelim
        if (aranan === "DOLAR" || aranan === "USD") key = "USD";
        else if (aranan === "EURO" || aranan === "EUR") key = "EUR";
        else if (aranan === "STERLIN" || aranan === "GBP") key = "GBP";
        else if (aranan === "ALTIN" || aranan === "GRAM" || aranan === "GRAM-ALTIN") key = "gram-altin";
        else if (aranan === "CEYREK" || aranan === "CEYREK-ALTIN") key = "ceyrek-altin";
        else if (aranan === "ONS") key = "ons";
        else if (aranan === "BRENT" || aranan === "PETROL") key = "brent-petrol";
        else if (aranan === "GUMUS") key = "gumus";
        else key = aranan; // Kullanıcı tam kod biliyorsa (örn: CAD)

        const veri = data[key] || data[key.replace("-", " ").toUpperCase()];

        if (!veri) {
            // Bulunamazsa mevcut anahtarları ipucu olarak verelim
            return { 
                hata: true, 
                mesaj: "Bu veri bulunamadı. Örn: USD, EUR, GRAM, ONS, BRENT",
                mevcut_kodlar: ["USD", "EUR", "GRAM", "CEYREK", "ONS", "BRENT", "GUMUS"]
            };
        }

        // Truncgil verisi string gelir ("34,5000" gibi), parse etmemiz lazım
        const alis = parseFloat(veri.Alış.replace(",", "."));
        const satis = parseFloat(veri.Satış.replace(",", "."));
        const degisim = parseFloat(veri["Değişim"].replace("%", "").replace(",", "."));

        return {
            tur: "Piyasa",
            baslik: key.toUpperCase().replace("-", " "),
            alis: formatPara(alis),
            satis: formatPara(satis),
            degisim_yuzde: degisim,
            degisim_emoji: getTrendEmoji(degisim),
            guncelleme: veri.Update_Date || new Date().toLocaleTimeString('tr-TR')
        };

    } catch (e) {
        return { hata: true, mesaj: "Finans verisi çekilemedi." };
    }
}

// --- 3. MODÜL: BORSA İSTANBUL (Bigpara Scraping) ---
async function getirHisse(kod) {
    try {
        const symbol = kod.toUpperCase();
        const url = `https://bigpara.hurriyet.com.tr/borsa/hisse-fiyatlari/${symbol}-detay/`;
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        if (!response.ok) return { hata: true, mesaj: "Borsa verisine ulaşılamadı." };

        const html = await response.text();
        const $ = cheerio.load(html);

        // Bigpara yapısına göre seçiciler
        // Fiyat genellikle .proDetail .priceBox .price alanındadır
        const fiyatText = $('.proDetail .priceBox .price').first().text().trim();
        const degisimText = $('.proDetail .priceBox .dir').first().text().trim(); // %2,50 gibi gelir
        const baslik = $('.proDetail h1').first().text().trim(); // Örn: TURK HAVA YOLLARI

        if (!fiyatText) {
            return { hata: true, mesaj: `${symbol} kodlu hisse bulunamadı.` };
        }

        // Veriyi temizle (300,50 -> 300.50 float'a çevir)
        const fiyat = parseFloat(fiyatText.replace(",", "."));
        
        // Değişim yüzdesini temizle (% işaretini ve virgülü düzelt)
        let degisim = 0;
        if (degisimText) {
            degisim = parseFloat(degisimText.replace("%", "").replace(",", "."));
            // Bigpara bazen yönü okla belirtir, eksi işareti olmayabilir.
            // Class kontrolü yapabiliriz ama şimdilik basit parse yeterli.
            // Genellikle düşüşte 'down' class'ı olur.
            const isDown = $('.proDetail .priceBox .dir').hasClass('down');
            if (isDown && degisim > 0) degisim = -degisim;
        }

        // Hacim vb. detaylar
        const hacimText = $('.proDetail .col2 .line').eq(3).find('.val').text(); // Hacim genelde buralardadır

        return {
            tur: "Borsa İstanbul",
            sembol: symbol,
            baslik: baslik || symbol,
            fiyat: formatPara(fiyat) + " TL",
            degisim_yuzde: degisim,
            degisim_emoji: getTrendEmoji(degisim),
            hacim: hacimText || "N/A",
            not: "Veriler 15dk gecikmelidir."
        };

    } catch (e) {
        console.error(e);
        return { hata: true, mesaj: "Hisse verisi alınamadı." };
    }
}

// --- ANA API ---
export default async function handler(req, res) {
    const { kod, tur } = req.query;

    // Rehber Modu
    if (!kod) {
        return res.status(200).json({
            durum: "Hazır",
            mesaj: "Lütfen bir 'kod' ve isteğe bağlı 'tur' girin.",
            kullanim_ornekleri: [
                "/api/finans?tur=kripto&kod=BTC",
                "/api/finans?tur=kripto&kod=PEPE",
                "/api/finans?tur=borsa&kod=THYAO",
                "/api/finans?tur=borsa&kod=ASELS",
                "/api/finans?tur=doviz&kod=USD",
                "/api/finans?tur=altin&kod=GRAM",
                "/api/finans?tur=emtia&kod=BRENT"
            ]
        });
    }

    let sonuc = {};

    // 1. Kullanıcı türü belirttiyse direkt o fonksiyona git
    if (tur === "kripto" || tur === "coin") {
        sonuc = await getirKripto(kod);
    } 
    else if (tur === "borsa" || tur === "hisse") {
        sonuc = await getirHisse(kod);
    }
    else if (tur === "doviz" || tur === "altin" || tur === "emtia") {
        sonuc = await getirGenelFinans(kod);
    }
    // 2. Tür belirtilmediyse "AKILLI TAHMİN" yap
    else {
        // 3 harfli ve yaygın dövizse -> Döviz
        const yayginDovizler = ["USD", "EUR", "GBP", "GRAM", "ONS", "BRENT", "GUMUS", "DOLAR", "EURO", "ALTIN"];
        
        if (yayginDovizler.includes(kod.toUpperCase())) {
            sonuc = await getirGenelFinans(kod);
        } 
        // Sonunda USDT veya TRY varsa -> Kripto
        else if (kod.toUpperCase().endsWith("USDT") || kod.toUpperCase().endsWith("TRY")) {
            sonuc = await getirKripto(kod);
        }
        // Hiçbiri değilse, önce Borsaya bak, bulamazsan Kriptoya bak
        else {
            // Önce Borsa dene (THYAO gibi)
            let borsaDene = await getirHisse(kod);
            if (!borsaDene.hata) {
                sonuc = borsaDene;
            } else {
                // Borsa değilse Coin olabilir (PEPE, SHIB gibi)
                sonuc = await getirKripto(kod);
            }
        }
    }

    if (sonuc.hata) {
        return res.status(404).json(sonuc);
    }

    // Başarılı Sonuç
    res.status(200).json(sonuc);
}
