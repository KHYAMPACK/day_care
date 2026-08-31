export const ALGORITHM_PDF_CONTENT = {
  title: 'Uyarlanabilir Öğrenci Gelişim Motoru',
  subtitle: 'Atlas — deneme, sınıf çalışması ve devamsızlığı birleştiren eksik analizi',
  tagline:
    'Her öğrenci için kişisel bir koç: denemeleri, sınıf çalışmasını ve devamsızlığı birlikte okuyup, o öğrencinin gerçekten kim olduğuna göre her hafta okula tam olarak nereye odaklanması gerektiğini söylüyor.',

  problem: {
    title: 'Çözdüğü problem',
    intro:
      '120 öğrencili bir rehber öğretmen her optiği tek tek okuyamaz. Sınıf öğretmeni kimin zayıf olduğunu bilir ama neden zayıf olduğunu ve önce neyi düzeltmesi gerektiğini bilemez. Güçlü öğrenci görmezden gelinir; zayıf öğrenciye genel tavsiye verilir.',
    questions: [
      'Gerçekten nerede zorlanıyor? (Sadece düşük puan değil — kendi seviyesine göre)',
      'Kötüleşiyor mu? (Anlık fotoğraf değil, trend)',
      'Bu hafta ne yapmalıyız? (Nedenleriyle birlikte en önemli 3 öncelik)',
    ],
  },

  layers: [
    {
      title: 'Katman 1 — Öğrenciyi tanı',
      body: 'Eksik taramadan önce sistem öğrenciyi profiller. Performans seviyesi son deneme netine göre belirlenir: Destek (temel onarım), Orta (denge ve artış), Güçlü (rötuş). Trend son 3 deneme ile önceki dönem karşılaştırılarak Yükselen, Durağan veya Düşen olarak etiketlenir. Aynı veri, farklı yorum — 45 net ile 78 net öğrenci aynı cetvelle ölçülmez.',
    },
    {
      title: 'Katman 2 — Yedi sinyal tipi',
      body: 'Motor yedi paralel dedektör çalıştırır. Her biri öğrenmenin farklı bir boyutuna bakar. Tek kural hüküm sürmez; aynı konuda birden fazla sinyal birleştirilir ve açıklanır.',
    },
    {
      title: 'Katman 3 — Seviyeye duyarlı eşikler',
      body: 'Aynı başarı oranı farklı öğrenciler için farklı anlama gelir. Destek öğrencilerde temel eksikler ve devamsızlık önceliklidir. Orta seviyede denge kurulur. Güçlü öğrencilerde eski hatalar cezalandırılmaz; kişisel zayıflık ve düşüş trendi daha ağır basar. Gelişim, nereden başladığına göre ölçülür.',
    },
    {
      title: 'Katman 4 — Öncelik skoru ve çıktı',
      body: 'Her uyarı ciddiyet skoru alır: açığın büyüklüğü, öğrenci seviyesine göre ağırlık, devamsızlık ve zayıf sınıf çalışması gibi güçlendiriciler. En yüksek etkili 3 madde öncelik olarak sunulur. Her kartta ne, neden ve ne yapılmalı yer alır. Buna ek olarak seviye ve trende göre tek cümlelik dönem hedefi verilir — 500 puan değil, bulunduğun yerden daha iyi ol.',
    },
  ],

  signals: [
    { name: 'Temel eksik', desc: 'Yeterince test edilmiş konuda, seviyeye göre eşiğin altında kalıcı bilgi açığı.' },
    { name: 'Kişisel zayıflık', desc: 'Konu, öğrencinin aynı dersteki kendi ortalamasına göre belirgin zayıf — güçlü öğrencilerdeki gizli açıklar.' },
    { name: 'Düşüş trendi', desc: 'Son denemelerde konu, ders veya toplam nette belirgin gerileme.' },
    { name: 'Sınıf altı', desc: 'Ders neti sınıf ortalamasının anlamlı biçimde altında.' },
    { name: 'Eksik çalışma', desc: 'Aynı ünitede hem deneme hem sınıf içi pratik zayıf.' },
    { name: 'Devamsızlık', desc: 'Müfredata bağlı ünitelerde kaçırılan ders günleri — yapısal neden.' },
    { name: 'Dikkatsizlik', desc: 'Konuda genelde iyi ama son denemede çöküş — bilgi değil, uygulama sorunu.' },
  ],

  differentiators: [
    'Çok boyutlu analiz — sıralama kimin birinci olduğunu söyler; bu yarın ne öğreteceğini söyler.',
    'Göreceli zekâ — güçlü öğrencinin gizli zayıf konularını yakalar.',
    'Trende duyarlı — kaymayı kriz olmadan önce görür.',
    'Deneme + sınıf + devamsızlığı birleştirir — kök neden ayrıştırılır.',
    'Tasarım gereği açıklanabilir — her uyarı rakamlarla gerekçelendirilir.',
    'Mevcut okul verisiyle ölçeklenir — yeni test altyapısı gerekmez.',
  ],

  outcomes: [
    { role: 'Rehber öğretmen', before: 'Saatlerce tablo karşılaştırır', after: 'Öğrenci dosyasında anında top 3 eylemi görür' },
    { role: 'Öğretmen', before: 'Sınıf ortalamasına göre anlatır', after: 'Deneme + pratik + devamsızlık hizalı ünite sinyali alır' },
    { role: 'Müdür', before: 'Kurum sırasını görür', after: 'Hangi eksik tiplerinin baskın olduğunu görür' },
    { role: 'Veli', before: '“Netin düştü”', after: '“Matematik · Oran-orantı son 2 denemede %25 geriledi”' },
  ],
};
