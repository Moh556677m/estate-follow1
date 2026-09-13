/// <reference path="../pb_data/types.d.ts" />

// Centralized geo data source: platform_countries + platform_collections.
// Public read (anonymous can read for public CRM lead page / signup),
// Super Admin only writes. Seeded from the static lib on first run.
// The frontend useGeoData hook merges these with the static lib fallback.

migrate(
  (app) => {
    // ---- platform_countries ------------------------------------------------
    let pc;
    try {
      pc = app.findCollectionByNameOrId('platform_countries');
    } catch (_) {
      pc = new Collection({
        type: 'base',
        name: 'platform_countries',
        listRule: '',
        viewRule: '',
        createRule: '@request.auth.is_super_admin = true',
        updateRule: '@request.auth.is_super_admin = true',
        deleteRule: '@request.auth.is_super_admin = true',
        fields: [
          { name: 'iso', type: 'text', required: true, max: 2 },
          { name: 'name_en', type: 'text', required: true, max: 120 },
          { name: 'name_ar', type: 'text', required: true, max: 120 },
          { name: 'dial_code', type: 'text', max: 8 },
          { name: 'enabled', type: 'bool' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_platform_countries_iso ON platform_countries (iso)',
        ],
      });
      app.save(pc);
    }

    // ---- platform_cities ---------------------------------------------------
    let citiesCol;
    try {
      citiesCol = app.findCollectionByNameOrId('platform_cities');
    } catch (_) {
      citiesCol = new Collection({
        type: 'base',
        name: 'platform_cities',
        listRule: '',
        viewRule: '',
        createRule: '@request.auth.is_super_admin = true',
        updateRule: '@request.auth.is_super_admin = true',
        deleteRule: '@request.auth.is_super_admin = true',
        fields: [
          {
            name: 'country',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: pc.id,
            cascadeDelete: true,
          },
          { name: 'name_en', type: 'text', required: true, max: 120 },
          { name: 'name_ar', type: 'text', required: true, max: 120 },
          { name: 'enabled', type: 'bool' },
          { name: 'is_custom', type: 'bool' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_platform_cities_country ON platform_cities (country)',
        ],
      });
      app.save(citiesCol);
    }

    // ---- seed countries (idempotent) --------------------------------------
    const COUNTRIES = [["AF","Afghanistan","أفغانستان","+93"],["AL","Albania","ألبانيا","+355"],["DZ","Algeria","الجزائر","+213"],["AD","Andorra","أندورا","+376"],["AO","Angola","أنغولا","+244"],["AR","Argentina","الأرجنتين","+54"],["AM","Armenia","أرمينيا","+374"],["AU","Australia","أستراليا","+61"],["AT","Austria","النمسا","+43"],["AZ","Azerbaijan","أذربيجان","+994"],["BH","Bahrain","البحرين","+973"],["BD","Bangladesh","بنغلاديش","+880"],["BB","Barbados","باربادوس","+1246"],["BY","Belarus","بيلاروسيا","+375"],["BE","Belgium","بلجيكا","+32"],["BZ","Belize","بليز","+501"],["BJ","Benin","بنين","+229"],["BT","Bhutan","بوتان","+975"],["BO","Bolivia","بوليفيا","+591"],["BA","Bosnia and Herzegovina","البوسنة والهرسك","+387"],["BW","Botswana","بوتسوانا","+267"],["BR","Brazil","البرازيل","+55"],["BN","Brunei","بروناي","+673"],["BG","Bulgaria","بلغاريا","+359"],["BF","Burkina Faso","بوركينا فاسو","+226"],["BI","Burundi","بوروندي","+257"],["KH","Cambodia","كمبوديا","+855"],["CM","Cameroon","الكاميرون","+237"],["CA","Canada","كندا","+1"],["CV","Cape Verde","الرأس الأخضر","+238"],["CF","Central African Republic","أفريقيا الوسطى","+236"],["TD","Chad","تشاد","+235"],["CL","Chile","تشيلي","+56"],["CN","China","الصين","+86"],["CO","Colombia","كولومبيا","+57"],["KM","Comoros","جزر القمر","+269"],["CG","Congo","الكونغو","+242"],["CD","Congo (DRC)","الكونغو الديمقراطية","+243"],["CR","Costa Rica","كوستاريكا","+506"],["CI","Côte d'Ivoire","ساحل العاج","+225"],["HR","Croatia","كرواتيا","+385"],["CU","Cuba","كوبا","+53"],["CY","Cyprus","قبرص","+357"],["CZ","Czechia","التشيك","+420"],["DK","Denmark","الدنمارك","+45"],["DJ","Djibouti","جيبوتي","+253"],["DO","Dominican Republic","الدومينيكان","+1809"],["EC","Ecuador","الإكوادور","+593"],["EG","Egypt","مصر","+20"],["SV","El Salvador","السلفادور","+503"],["GQ","Equatorial Guinea","غينيا الاستوائية","+240"],["ER","Eritrea","إريتريا","+291"],["EE","Estonia","إستونيا","+372"],["SZ","Eswatini","إسواتيني","+268"],["ET","Ethiopia","إثيوبيا","+251"],["FJ","Fiji","فيجي","+679"],["FI","Finland","فنلندا","+358"],["FR","France","فرنسا","+33"],["GA","Gabon","الغابون","+241"],["GM","Gambia","غامبيا","+220"],["GE","Georgia","جورجيا","+995"],["DE","Germany","ألمانيا","+49"],["GH","Ghana","غانا","+233"],["GR","Greece","اليونان","+30"],["GD","Grenada","غرينادا","+1473"],["GT","Guatemala","غواتيمالا","+502"],["GN","Guinea","غينيا","+224"],["GW","Guinea-Bissau","غينيا بيساو","+245"],["GY","Guyana","غيانا","+592"],["HT","Haiti","هايتي","+509"],["HN","Honduras","هندوراس","+504"],["HK","Hong Kong","هونغ كونغ","+852"],["HU","Hungary","المجر","+36"],["IS","Iceland","آيسلندا","+354"],["IN","India","الهند","+91"],["ID","Indonesia","إندونيسيا","+62"],["IR","Iran","إيران","+98"],["IQ","Iraq","العراق","+964"],["IE","Ireland","أيرلندا","+353"],["IL","Israel","إسرائيل","+972"],["IT","Italy","إيطاليا","+39"],["JM","Jamaica","جامايكا","+1876"],["JP","Japan","اليابان","+81"],["JO","Jordan","الأردن","+962"],["KZ","Kazakhstan","كازاخستان","+7"],["KE","Kenya","كينيا","+254"],["KI","Kiribati","كيريباتي","+686"],["KP","North Korea","كوريا الشمالية","+850"],["KR","South Korea","كوريا الجنوبية","+82"],["KW","Kuwait","الكويت","+965"],["KG","Kyrgyzstan","قيرغيزستان","+996"],["LA","Laos","لاوس","+856"],["LV","Latvia","لاتفيا","+371"],["LB","Lebanon","لبنان","+961"],["LS","Lesotho","ليسوتو","+266"],["LR","Liberia","ليبيريا","+231"],["LY","Libya","ليبيا","+218"],["LI","Liechtenstein","ليختنشتاين","+423"],["LT","Lithuania","ليتوانيا","+370"],["LU","Luxembourg","لوكسمبورغ","+352"],["MO","Macao","ماكاو","+853"],["MG","Madagascar","مدغشقر","+261"],["MW","Malawi","مالاوي","+265"],["MY","Malaysia","ماليزيا","+60"],["MV","Maldives","جزر المالديف","+960"],["ML","Mali","مالي","+223"],["MT","Malta","مالطا","+356"],["MR","Mauritania","موريتانيا","+222"],["MU","Mauritius","موريشيوس","+230"],["MX","Mexico","المكسيك","+52"],["MD","Moldova","مولدوفا","+373"],["MC","Monaco","موناكو","+377"],["MN","Mongolia","منغوليا","+976"],["ME","Montenegro","الجبل الأسود","+382"],["MA","Morocco","المغرب","+212"],["MZ","Mozambique","موزمبيق","+258"],["MM","Myanmar","ميانمار","+95"],["NA","Namibia","ناميبيا","+264"],["NP","Nepal","نيبال","+977"],["NL","Netherlands","هولندا","+31"],["NZ","New Zealand","نيوزيلندا","+64"],["NI","Nicaragua","نيكاراغوا","+505"],["NE","Niger","النيجر","+227"],["NG","Nigeria","نيجيريا","+234"],["MK","North Macedonia","شمال مقدونيا","+389"],["NO","Norway","النرويج","+47"],["OM","Oman","عُمان","+968"],["PK","Pakistan","باكستان","+92"],["PS","Palestine","فلسطين","+970"],["PA","Panama","بنما","+507"],["PG","Papua New Guinea","بابوا غينيا الجديدة","+675"],["PY","Paraguay","باراغواي","+595"],["PE","Peru","البيرو","+51"],["PH","Philippines","الفلبين","+63"],["PL","Poland","بولندا","+48"],["PT","Portugal","البرتغال","+351"],["QA","Qatar","قطر","+974"],["RO","Romania","رومانيا","+40"],["RU","Russia","روسيا","+7"],["RW","Rwanda","رواندا","+250"],["SA","Saudi Arabia","السعودية","+966"],["SN","Senegal","السنغال","+221"],["RS","Serbia","صربيا","+381"],["SC","Seychelles","سيشل","+248"],["SL","Sierra Leone","سيراليون","+232"],["SG","Singapore","سنغافورة","+65"],["SK","Slovakia","سلوفاكيا","+421"],["SI","Slovenia","سلوفينيا","+386"],["SO","Somalia","الصومال","+252"],["ZA","South Africa","جنوب أفريقيا","+27"],["SS","South Sudan","جنوب السودان","+211"],["ES","Spain","إسبانيا","+34"],["LK","Sri Lanka","سريلانكا","+94"],["SD","Sudan","السودان","+249"],["SR","Suriname","سورينام","+597"],["SE","Sweden","السويد","+46"],["CH","Switzerland","سويسرا","+41"],["SY","Syria","سوريا","+963"],["TW","Taiwan","تايوان","+886"],["TJ","Tajikistan","طاجيكستان","+992"],["TZ","Tanzania","تنزانيا","+255"],["TH","Thailand","تايلاند","+66"],["TL","Timor-Leste","تيمور الشرقية","+670"],["TG","Togo","توغو","+228"],["TT","Trinidad and Tobago","ترينيداد وتوباغو","+1868"],["TN","Tunisia","تونس","+216"],["TR","Turkey","تركيا","+90"],["TM","Turkmenistan","تركمانستان","+993"],["UG","Uganda","أوغندا","+256"],["UA","Ukraine","أوكرانيا","+380"],["AE","United Arab Emirates","الإمارات","+971"],["GB","United Kingdom","المملكة المتحدة","+44"],["US","United States","الولايات المتحدة","+1"],["UY","Uruguay","الأوروغواي","+598"],["UZ","Uzbekistan","أوزبكستان","+998"],["VU","Vanuatu","فانواتو","+678"],["VA","Vatican City","الفاتيكان","+379"],["VE","Venezuela","فنزويلا","+58"],["VN","Vietnam","فيتنام","+84"],["YE","Yemen","اليمن","+967"],["ZM","Zambia","زامبيا","+260"],["ZW","Zimbabwe","زيمبابوي","+263"]];
    const existingIso = {};
    try {
      const rows = app.findRecordsByFilter('platform_countries', "id != ''", 'iso', 1000, 0, {});
      (rows || []).forEach((r) => { existingIso[r.get('iso')] = true; });
    } catch (_) {}
    COUNTRIES.forEach((row) => {
      const iso = row[0];
      if (existingIso[iso]) return;
      const rec = new Record(pc);
      rec.set('iso', iso);
      rec.set('name_en', row[1]);
      rec.set('name_ar', row[2]);
      rec.set('dial_code', row[3] || '');
      rec.set('enabled', true);
      app.save(rec);
    });

    // ---- seed cities (idempotent) -----------------------------------------
    const CITIES = [["AE","Dubai","دبي"],["AE","Abu Dhabi","أبوظبي"],["AE","Sharjah","الشارقة"],["AE","Ajman","عجمان"],["AE","Ras Al Khaimah","رأس الخيمة"],["AE","Fujairah","الفجيرة"],["AE","Umm Al Quwain","أم القيوين"],["SA","Riyadh","الرياض"],["SA","Jeddah","جدة"],["SA","Dammam","الدمام"],["SA","Khobar","الخبر"],["SA","Mecca","مكة"],["SA","Medina","المدينة"],["SA","Neom","نيوم"],["EG","Cairo","القاهرة"],["EG","Giza","الجيزة"],["EG","Alexandria","الإسكندرية"],["EG","New Administrative Capital","العاصمة الإدارية"],["EG","Hurghada","الغردقة"],["EG","Sharm El Sheikh","شرم الشيخ"],["QA","Doha","الدوحة"],["QA","Lusail","لوسيل"],["QA","Al Rayyan","الريان"],["QA","Al Wakrah","الوكرة"],["KW","Kuwait City","مدينة الكويت"],["KW","Hawalli","حولي"],["KW","Salmiya","السالمية"],["BH","Manama","المنامة"],["BH","Riffa","الرفاع"],["BH","Muharraq","المحرق"],["OM","Muscat","مسقط"],["OM","Salalah","صلالة"],["OM","Sohar","صحار"],["JO","Amman","عمّان"],["JO","Aqaba","العقبة"],["JO","Irbid","إربد"],["TR","Istanbul","إسطنبول"],["TR","Ankara","أنقرة"],["TR","Antalya","أنطاليا"],["TR","Izmir","إزمير"],["GB","London","لندن"],["GB","Manchester","مانشستر"],["GB","Birmingham","برمنغهام"],["US","New York","نيويورك"],["US","Los Angeles","لوس أنجلوس"],["US","Miami","ميامي"],["US","Houston","هيوستن"]];
    const isoToCountryId = {};
    try {
      const rows = app.findRecordsByFilter('platform_countries', "id != ''", 'iso', 1000, 0, {});
      (rows || []).forEach((r) => { isoToCountryId[r.get('iso')] = r.id; });
    } catch (_) {}
    const existingCityKey = {};
    try {
      const rows = app.findRecordsByFilter('platform_cities', "id != ''", 'name_en', 1000, 0, {});
      (rows || []).forEach((r) => { existingCityKey[r.get('country') + '|' + r.get('name_en')] = true; });
    } catch (_) {}
    CITIES.forEach((row) => {
      const iso = row[0];
      const cid = isoToCountryId[iso];
      if (!cid) return;
      const key = cid + '|' + row[1];
      if (existingCityKey[key]) return;
      const rec = new Record(citiesCol);
      rec.set('country', cid);
      rec.set('name_en', row[1]);
      rec.set('name_ar', row[2]);
      rec.set('enabled', true);
      rec.set('is_custom', false);
      app.save(rec);
    });
  },
  (app) => {
    ['platform_cities', 'platform_countries'].forEach((n) => {
      try { const c = app.findCollectionByNameOrId(n); app.delete(c); } catch (_) {}
    });
  },
);
