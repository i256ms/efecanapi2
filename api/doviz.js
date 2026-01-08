// --- YARDIMCI FONKSİYONLAR ---

// 1. DİNAMİK İSİM DÖNÜŞTÜRÜCÜ (Otomatik Çeviri)
function getDinamikIsim(kod) {
    if (!kod) return "";
    
    // A) Standart Para Birimi Kontrolü (USD, EUR, GBP...)
    // Node.js'in yerleşik özelliği sayesinde "JPY" verip "Japon Yeni" alıyoruz.
    if (kod.length === 3 && !kod.includes("-")) {
        try {
            // 'tr' dilinde para birimi isimlerini iste
            const translator = new Intl.DisplayNames(['tr'], { type: 'currency' });
            const isim = translator.of(kod);
            // Eğer sistem tanırsa döndür (Tanımazsa kodu geri verir, biz de alttaki adıma geçeriz)
            if (isim && isim !== kod) return isim;
        } catch (e) {}
    }

    // B) Emtia ve Altınlar (gram-altin -> Gram Altın)
    // Tireleri boşluk yap, her kelimenin baş harfini büyüt
    return kod
        .split('-')
        .map(kelime => kelime.charAt(0).toUpperCase() + kelime.slice(1))
        .join(' ')
        .replace("Altin", "Altın") // Ufak Türkçe düzeltmeleri
        .replace("Gumus", "Gümüş");
}

// Esnek Sayı Okuyucu
function parseNumber(str) {
    if (str === null || str === undefined) return null;
    if (typeof str === 'number') return str;
    
    str = str.toString().trim().replace(/[€$£₺]/g, "").replace("TL", "").trim();
    if (str === "-" || str === "") return null;

    if (str.includes(",") && str.includes(".")) {
        return parseFloat(str.replace(/\./g, "").replace(",", "."));
    }
    if (str.includes(",") && !str.includes(".")) {
        return parseFloat(str.replace(",", "."));
    }
    if (str.includes(".") && !str.includes(",")) {
        if ((str.match(/\./g) || []).length > 1) {
            return parseFloat(str.replace(/\./g, ""));
        }
        return parseFloat(str.replace(/\./g, ""));
    }
    return parseFloat(str);
}

function formatPara(sayi, sembol = "") {
    if (sayi === null || sayi === undefined || isNaN(sayi)) return "Veri Yok";
    
    let maxDigits = 2;
    const absVal = Math.abs(sayi);
    
    if (absVal < 0.001) maxDigits = 6;
    else if (absVal < 1) maxDigits = 5;
    else if (absVal < 10) maxDigits = 4;
    
    const formatted = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: maxDigits }).format(sayi);
    return sembol ? `${formatted} ${sembol}` : formatted;
}

function getTrendEmoji(degisim) {
    if (degisim === null || degisim === undefined) return "⚪";
    let d = degisim;
    if (typeof degisim === 'string') {
        d = parseFloat(degisim.replace("%", "").replace(",", "."));
    }
    if (isNaN(d)) return "⚪";
    if (d > 0) return "🟢"; 
    if (d < 0) return "🔴"; 
    return "⚪"; 
}

// Kullanıcı girdisini API anahtarına çeviren sözlük (Burası durmalı çünkü "Dolar" -> "USD" eşleşmesi lazım)
function cozAnahtar(hamKod) {
    if (!hamKod) return null;
    const aranan = hamKod.toUpperCase().trim();
    
    if (aranan === "DOLAR" || aranan === "USD" || aranan === "$") return "USD";
    if (aranan === "EURO" || aranan === "EUR" || aranan === "AVRO" || aranan === "€") return "EUR";
    if (aranan === "STERLIN" || aranan === "GBP" || aranan === "£") return "GBP";
    if (aranan === "JAPON YENI" || aranan === "JPY") return "JPY";
    if (aranan === "KANADA DOLARI" || aranan === "CAD") return "CAD";
    if (aranan === "RUS RUBLESI" || aranan === "RUB") return "RUB";
    if (aranan === "CIN YUANI" || aranan === "CNY") return "CNY";
    if (aranan === "TURK LIRASI" || aranan === "TL" || aranan === "TRY") return "TRY";
    
    if (aranan === "ALTIN" || aranan === "GRAM" || aranan === "GRAM-ALTIN") return "gram-altin";
    if (aranan === "CEYREK" || aranan === "ÇEYREK") return "ceyrek-altin";
    if (aranan === "YARIM") return "yarim-altin";
    if (aranan === "TAM") return "tam-altin";
    if (aranan === "CUMHURIYET") return "cumhuriyet-altini";
    if (aranan === "ATA") return "ata-altin";
    if (aranan === "RESAT" || aranan === "REŞAT") return "resat-altin";
    if (aranan === "22AYAR" || aranan === "BILEZIK") return "22-ayar-bilezik";
    if (aranan === "18AYAR") return "18-ayar-altin";
    if (aranan === "14AYAR") return "14-ayar-altin";
    if (aranan === "HAS" || aranan === "HASALTIN") return "has-altin";
    if (aranan === "GUMUS" || aranan === "GÜMÜŞ") return "gumus";
    if (aranan === "ONS") return "ons";
    if (aranan === "BRENT" || aranan === "PETROL") return "brent-petrol";
    
    return aranan;
}

async function fetchWithHeaders(url) {
    return await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });
}

// --- ANA YÖNETİCİ ---
export default async function handler(req, res) {
    const { kod, from, to } = req.query;

    if (!kod && (!from || !to)) {
        return res.status(400).json({
            hata: true,
            mesaj: "Eksik parametre. Lütfen 'kod' VEYA 'from' ve 'to' girin."
        });
    }

    try {
        const url = "https://finans.truncgil.com/today.json";
        const response = await fetchWithHeaders(url);
        
        if (!response.ok) {
            return res.status(500).json({ hata: true, mesaj: "Finans servisine ulaşılamadı." });
        }
        
        const data = await response.json();
        
        // --- PARİTE MODU ---
        let pariteModu = false;
        let baseCode = "";
        let quoteCode = "";
        let singleCode = "";

        if (from && to) {
            pariteModu = true;
            baseCode = cozAnahtar(from);
            quoteCode = cozAnahtar(to);
        } else if (kod) {
            const hamKod = kod.toUpperCase().trim();
            const ayiricilar = ["/", "-", " "];
            for (const sep of ayiricilar) {
                if (hamKod.includes(sep)) {
                    const parts = hamKod.split(sep);
                    if (parts.length === 2 && parts[0] && parts[1]) {
                        pariteModu = true;
                        baseCode = cozAnahtar(parts[0]);
                        quoteCode = cozAnahtar(parts[1]);
                        break;
                    }
                }
            }
            if (!pariteModu) {
                singleCode = cozAnahtar(hamKod);
            }
        }

        // --- HESAPLAMA MOTORU (Çapraz Kur) ---
        if (pariteModu) {
            if (quoteCode === "TRY") {
                singleCode = baseCode; 
            } else {
                const baseVeri = data[baseCode] || data[baseCode.replace("-", " ").toUpperCase()] || data[baseCode.toLowerCase()];
                const baseFiyat = baseCode === "TRY" ? 1 : parseNumber(baseVeri?.Satış);
                
                const quoteVeri = data[quoteCode] || data[quoteCode.replace("-", " ").toUpperCase()] || data[quoteCode.toLowerCase()];
                const quoteFiyat = quoteCode === "TRY" ? 1 : parseNumber(quoteVeri?.Satış);

                if (baseFiyat && quoteFiyat) {
                    const baseDegisim = baseCode === "TRY" ? 0 : parseFloat((baseVeri["Değişim"] || "0").replace("%", "").replace(",", "."));
                    const quoteDegisim = quoteCode === "TRY" ? 0 : parseFloat((quoteVeri["Değişim"] || "0").replace("%", "").replace(",", "."));

                    const pariteFiyati = baseFiyat / quoteFiyat;
                    const pariteDegisim = ((1 + baseDegisim/100) / (1 + quoteDegisim/100) - 1) * 100;
                    const guncellemeUnix = Math.floor(Date.now() / 1000);

                    // ARTIK İSİMLER OTOMATİK ÇEVRİLİYOR
                    const baseIsim = getDinamikIsim(baseCode);
                    const quoteIsim = getDinamikIsim(quoteCode);

                    return res.status(200).json({
                        tur: "Çapraz Kur (Hesaplanan)",
                        sembol: `${baseCode}/${quoteCode}`,
                        baslik: `${baseIsim} / ${quoteIsim}`,
                        kaynak: "Truncgil (Hesaplamalı)",
                        
                        fiyat: formatPara(pariteFiyati),
                        degisim_yuzde: `%${pariteDegisim.toFixed(2)}`,
                        degisim_emoji: getTrendEmoji(pariteDegisim),
                        
                        guncelleme_unix: guncellemeUnix,
                        guncelleme_discord: `<t:${guncellemeUnix}:R>`,
                        
                        detaylar: {
                            base: { kod: baseCode, isim: baseIsim, fiyat: formatPara(baseFiyat, "TL") },
                            quote: { kod: quoteCode, isim: quoteIsim, fiyat: formatPara(quoteFiyat, "TL") },
                            not: "Veriler TL kurları üzerinden oranlanmıştır."
                        }
                    });
                }
            }
        }

        // --- TEKLİ SORGULAMA ---
        let veri = data[singleCode] || data[singleCode.replace("-", " ").toUpperCase()] || data[singleCode.toLowerCase()];

        if (!veri && singleCode === "ons") {
             const adaylar = ["ons", "Ons", "ONS", "Ons Altın"];
             for (const k of adaylar) { if (data[k]) { veri = data[k]; break; } }
        }

        if (!veri) {
            return res.status(404).json({ 
                hata: true, 
                mesaj: `Bu veri bulunamadı (${singleCode || kod}).`,
                mevcut_anahtarlar: Object.keys(data).slice(0, 10)
            });
        }

        const alis = parseNumber(veri.Alış);
        const satis = parseNumber(veri.Satış);
        let degisimStr = veri["Değişim"] || "0";
        const degisim = parseFloat(degisimStr.replace("%", "").replace(",", "."));
        
        let makas = null;
        let makasYuzdesi = null;
        if (alis && satis) {
            makas = satis - alis;
            makasYuzdesi = (makas / satis) * 100;
        }

        const guncellemeUnix = Math.floor(Date.now() / 1000);
        let paraBirimi = "TL";
        if (singleCode === "ons") paraBirimi = "$";
        if (singleCode === "EUR" && (kod || "").includes("PARITE")) paraBirimi = "";

        // İsim Güzelleştirme (Otomatik)
        const guzelIsim = getDinamikIsim(singleCode);

        res.status(200).json({
            tur: "Piyasa (Döviz/Altın/Emtia)",
            sembol: singleCode.toUpperCase().replace(/-/g, " "),
            baslik: guzelIsim, // "Amerikan Doları" gibi otomatik gelir
            kaynak: "Truncgil",
            
            fiyat: formatPara(satis, paraBirimi), 
            fiyat_alternatif: !satis ? formatPara(alis, paraBirimi) : null,
            degisim_yuzde: `%${degisim.toFixed(2)}`,
            degisim_emoji: getTrendEmoji(degisim),
            
            guncelleme_unix: guncellemeUnix,
            guncelleme_discord: `<t:${guncellemeUnix}:R>`,
            
            detaylar: {
                alis: formatPara(alis, paraBirimi),
                satis: formatPara(satis, paraBirimi),
                makas: makas ? formatPara(makas, paraBirimi) : "Veri Yok",
                makas_orani: makasYuzdesi ? `%${makasYuzdesi.toFixed(2)}` : "Veri Yok",
                ham_veri: { alis: veri.Alış, satis: veri.Satış }
            }
        });

    } catch (err) {
        res.status(500).json({ hata: true, mesaj: "Sunucu hatası", detay: err.message });
    }
}
