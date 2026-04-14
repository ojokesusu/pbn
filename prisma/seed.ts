import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Clear existing data
  await prisma.comment.deleteMany();
  await prisma.article.deleteMany();
  await prisma.category.deleteMany();
  await prisma.deployLog.deleteMany();
  await prisma.domain.deleteMany();
  await prisma.server.deleteMany();
  await prisma.theme.deleteMany();

  // ═══════════════════════════════════════════
  // THEMES — each with unique template + colors
  // ═══════════════════════════════════════════

  const theme1 = await prisma.theme.create({
    data: {
      name: "Creative Portfolio Dark",
      templateName: "developer",
      primaryColor: "#8b5cf6",
      secondaryColor: "#6d28d9",
      accentColor: "#f59e0b",
      bgColor: "#faf5ff",
      textColor: "#1e1b4b",
      fontFamily: "Playfair Display",
      headerStyle: "left-aligned",
      footerStyle: "detailed",
    },
  });

  const theme2 = await prisma.theme.create({
    data: {
      name: "Toon Magazine Vibrant",
      templateName: "flavor",
      primaryColor: "#e11d48",
      secondaryColor: "#be185d",
      accentColor: "#facc15",
      bgColor: "#ffffff",
      textColor: "#18181b",
      fontFamily: "Open Sans",
      headerStyle: "centered",
      footerStyle: "detailed",
    },
  });

  const theme3 = await prisma.theme.create({
    data: {
      name: "Art Gallery Minimal",
      templateName: "flavor-developer",
      primaryColor: "#0f766e",
      secondaryColor: "#115e59",
      accentColor: "#f97316",
      bgColor: "#ffffff",
      textColor: "#1c1917",
      fontFamily: "Lato",
      headerStyle: "minimal",
      footerStyle: "simple",
    },
  });

  const theme4 = await prisma.theme.create({
    data: {
      name: "Bold Classic",
      templateName: "flavor-developer-developer",
      primaryColor: "#dc2626",
      secondaryColor: "#991b1b",
      accentColor: "#2563eb",
      bgColor: "#fff7ed",
      textColor: "#292524",
      fontFamily: "Merriweather",
      headerStyle: "centered",
      footerStyle: "detailed",
    },
  });

  const theme5 = await prisma.theme.create({
    data: {
      name: "Community News Portal",
      templateName: "developer-developer",
      primaryColor: "#0d9488",
      secondaryColor: "#0f766e",
      accentColor: "#f59e0b",
      bgColor: "#ffffff",
      textColor: "#111827",
      fontFamily: "Roboto",
      headerStyle: "left-aligned",
      footerStyle: "detailed",
    },
  });

  // ═══════════════════════════════════════════
  // SERVERS — 3 cPanel servers
  // ═══════════════════════════════════════════

  const server1 = await prisma.server.create({
    data: {
      name: "Server Utama PBN",
      host: "199.85.210.162",
      username: "pbnpgkeo",
      password: "h!-tA4J=OTaUSrLO",
      port: 21,
      status: "active",
    },
  });

  const server2 = await prisma.server.create({
    data: {
      name: "Server Breno",
      host: "5.135.245.202",
      username: "brenorotatori",
      password: "xlqsmsfL$IU(a9I$",
      port: 21,
      status: "active",
    },
  });

  const server3 = await prisma.server.create({
    data: {
      name: "Server BToon",
      host: "5.196.183.191",
      username: "btoon",
      password: "^0_u@?+v!}KRWGw5",
      port: 21,
      status: "active",
    },
  });

  console.log("Created 3 servers");

  // ═══════════════════════════════════════════
  // DOMAINS — 5 real PBN domains
  // ═══════════════════════════════════════════

  const domain1 = await prisma.domain.create({
    data: {
      name: "Breno Rotatori",
      url: "https://brenorotatori.com",
      themeId: theme1.id,
      status: "active",
      serverId: server2.id,
    },
  });

  const domain2 = await prisma.domain.create({
    data: {
      name: "BToon",
      url: "https://btoon.co",
      themeId: theme2.id,
      status: "active",
      serverId: server3.id,
    },
  });

  const domain3 = await prisma.domain.create({
    data: {
      name: "George Wagner Art",
      url: "https://georgewagnerart.com",
      themeId: theme3.id,
      status: "active",
      serverId: server1.id,
    },
  });

  const domain4 = await prisma.domain.create({
    data: {
      name: "Lifestyle Underground",
      url: "https://fuckmyassporn.com",
      themeId: theme4.id,
      status: "active",
      serverId: server1.id,
    },
  });

  const domain5 = await prisma.domain.create({
    data: {
      name: "Hamamatsu Mosque",
      url: "https://hamamatsumosque.com",
      themeId: theme5.id,
      status: "active",
      serverId: server1.id,
    },
  });

  // ═══════════════════════════════════════════
  // CATEGORIES — 3 per domain
  // ═══════════════════════════════════════════

  // Domain 1: Fotografi & Seni
  const cats1 = await Promise.all([
    prisma.category.create({ data: { name: "Fotografi", slug: "fotografi", description: "Tips, teknik, dan sorotan portofolio fotografi", domainId: domain1.id } }),
    prisma.category.create({ data: { name: "Seni Visual", slug: "seni-visual", description: "Lukisan, ilustrasi, dan media campuran", domainId: domain1.id } }),
    prisma.category.create({ data: { name: "Proses Kreatif", slug: "proses-kreatif", description: "Di balik layar proyek-proyek kreatif", domainId: domain1.id } }),
  ]);

  // Domain 2: Animasi & Hiburan
  const cats2 = await Promise.all([
    prisma.category.create({ data: { name: "Animasi", slug: "animasi", description: "Teknik animasi dan berita industri", domainId: domain2.id } }),
    prisma.category.create({ data: { name: "Desain Karakter", slug: "desain-karakter", description: "Menciptakan karakter kartun yang berkesan", domainId: domain2.id } }),
    prisma.category.create({ data: { name: "Berita Industri", slug: "berita-industri", description: "Kabar terbaru dari dunia animasi dan hiburan", domainId: domain2.id } }),
  ]);

  // Domain 3: Seni & Kreatif
  const cats3 = await Promise.all([
    prisma.category.create({ data: { name: "Lukisan", slug: "lukisan", description: "Teknik cat minyak, akrilik, dan cat air", domainId: domain3.id } }),
    prisma.category.create({ data: { name: "Patung", slug: "patung", description: "Bentuk seni tiga dimensi dan metodenya", domainId: domain3.id } }),
    prisma.category.create({ data: { name: "Sejarah Seni", slug: "sejarah-seni", description: "Menjelajahi aliran dan maestro seni rupa", domainId: domain3.id } }),
  ]);

  // Domain 4: Gaya Hidup
  const cats4 = await Promise.all([
    prisma.category.create({ data: { name: "Gaya Hidup", slug: "gaya-hidup", description: "Tips dan tren gaya hidup modern", domainId: domain4.id } }),
    prisma.category.create({ data: { name: "Hubungan", slug: "hubungan", description: "Membangun dan memelihara koneksi yang sehat", domainId: domain4.id } }),
    prisma.category.create({ data: { name: "Kesehatan", slug: "kesehatan", description: "Panduan kesehatan, kebugaran, dan perawatan diri", domainId: domain4.id } }),
  ]);

  // Domain 5: Budaya Islam & Komunitas
  const cats5 = await Promise.all([
    prisma.category.create({ data: { name: "Komunitas", slug: "komunitas", description: "Acara dan kabar terbaru komunitas lokal", domainId: domain5.id } }),
    prisma.category.create({ data: { name: "Budaya", slug: "budaya", description: "Budaya, tradisi, dan warisan Islam", domainId: domain5.id } }),
    prisma.category.create({ data: { name: "Pendidikan", slug: "pendidikan", description: "Sumber belajar dan program pendidikan", domainId: domain5.id } }),
  ]);

  // ═══════════════════════════════════════════
  // ARTICLES — 4 per domain with realistic content
  // ═══════════════════════════════════════════

  const authorNames = [
    "Rina Susanti", "Budi Prasetyo", "Dewi Lestari", "Ahmad Fauzi",
    "Siti Nurhaliza", "Rudi Hartono", "Putri Wulandari", "Dimas Prakoso",
    "Maya Anggraini", "Hendra Wijaya",
  ];

  function pickAuthor() {
    return authorNames[Math.floor(Math.random() * authorNames.length)];
  }

  function daysAgo(n: number) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d;
  }

  // Domain 1: Fotografi & Seni — artikel
  const articles1 = [
    {
      title: "Menguasai Cahaya Alami dalam Fotografi Potret",
      slug: "menguasai-cahaya-alami-fotografi-potret",
      excerpt: "Cahaya alami mampu mengubah potret biasa menjadi luar biasa. Pelajari cara menemukan, membentuk, dan memanfaatkan cahaya yang tersedia.",
      content: `<p>Fotografi cahaya alami adalah bentuk pemotretan potret yang paling mudah diakses sekaligus paling menantang. Berbeda dengan pencahayaan studio, kita tidak bisa mengontrol matahari — tetapi kita bisa belajar bekerja dengannya secara piawai.</p>
<h2>Keunggulan Golden Hour</h2>
<p>Satu jam setelah matahari terbit dan sebelum terbenam menghasilkan cahaya hangat dan terarah yang mempercantik setiap warna kulit. Sudut rendah menciptakan bayangan alami yang menambah kedalaman dan dimensi pada wajah tanpa kontras yang keras.</p>
<h2>Menemukan Open Shade</h2>
<p>Pada hari yang cerah, arahkan subjek Anda ke area teduh terbuka — di bawah kanopi pohon, di samping gedung, atau di ambang pintu. Ini memberikan pencahayaan yang merata dan lembut sementara latar belakang tetap terlihat indah.</p>
<h3>Teknik Cahaya Jendela</h3>
<p>Jendela besar yang menghadap utara memberikan cahaya paling konsisten dan indah untuk potret dalam ruangan. Posisikan subjek pada sudut 45 derajat terhadap jendela untuk mendapatkan pencahayaan Rembrandt klasik dengan segitiga cahaya alami di pipi.</p>
<blockquote>Fotografer terbaik tidak melawan cahaya — mereka menari bersamanya. Memahami cahaya alami berarti memahami suasana gambar Anda.</blockquote>
<h2>Reflektor dan Diffuser</h2>
<p>Reflektor putih sederhana memantulkan cahaya kembali ke area bayangan sehingga mengurangi kontras. Diffuser tembus pandang melunakkan sinar matahari siang yang keras menjadi pencahayaan lembut yang melingkupi subjek. Dua alat ini saja sudah cukup untuk membentuk cahaya alami layaknya profesional.</p>`,
      categoryId: cats1[0].id,
      tags: "fotografi,potret,pencahayaan,tips",
      domainId: domain1.id,
      publishedAt: daysAgo(2),
    },
    {
      title: "Seni Komposisi: Aturan yang Harus Diketahui (dan Dilanggar)",
      slug: "seni-komposisi-aturan-yang-harus-dilanggar",
      excerpt: "Memahami aturan komposisi memberi Anda fondasi untuk menciptakan gambar yang kuat — dan mengetahui kapan harus melanggarnya menjadikan Anda seniman sejati.",
      content: `<p>Setiap foto menceritakan sebuah kisah, dan komposisi adalah bahasanya. Baik Anda melukis, memotret, atau mendesain, prinsip-prinsip ini menuntun mata pemirsa menelusuri karya Anda.</p>
<h2>Aturan Sepertiga</h2>
<p>Bagi bingkai Anda menjadi grid 3x3. Tempatkan elemen kunci di sepanjang garis ini atau di titik perpotongannya. Cara ini menghasilkan komposisi yang dinamis dan menarik secara visual, terasa seimbang tanpa terkesan statis.</p>
<h2>Garis Penuntun</h2>
<p>Jalan, sungai, pagar, dan elemen arsitektur dapat mengarahkan mata pemirsa langsung ke subjek Anda. Garis diagonal menambah energi, sementara garis lengkung menciptakan kesan elegan dan mengalir.</p>
<h2>Ruang Negatif</h2>
<p>Jangan mengisi setiap sudut bingkai Anda. Ruang kosong di sekitar subjek memberikan ruang bernapas, menarik perhatian ke hal yang penting, dan bisa membangkitkan emosi seperti kesunyian, kebebasan, atau kontemplasi.</p>
<h3>Kapan Harus Melanggar Aturan</h3>
<p>Komposisi terpusat bisa sangat kuat secara simetris. Bingkai yang penuh sesak bisa menyampaikan kekacauan atau energi. Ruang kosong di tempat tak terduga menciptakan ketegangan. Begitu Anda memahami mengapa aturan itu bekerja, melanggarnya menjadi pilihan kreatif — bukan kesalahan.</p>
<h2>Latihan Praktis</h2>
<p>Potret subjek yang sama dengan sepuluh cara berbeda. Bergeraklah di sekitarnya, ubah sudut pandang, zoom in, tarik mundur. Anda akan menemukan bahwa komposisi paling menarik jarang yang paling jelas terlihat.</p>`,
      categoryId: cats1[1].id,
      tags: "komposisi,seni-visual,fotografi,teknik",
      domainId: domain1.id,
      publishedAt: daysAgo(5),
    },
    {
      title: "Membangun Rutinitas Kreatif yang Benar-Benar Konsisten",
      slug: "membangun-rutinitas-kreatif-yang-konsisten",
      excerpt: "Inspirasi itu tidak bisa diandalkan. Rutinitas kreatif yang solid memastikan Anda terus berkarya secara konsisten, bahkan saat motivasi memudar.",
      content: `<p>Setiap seniman sukses memiliki rutinitas. Bukan karena mereka tidak spontan, tetapi karena mereka paham bahwa menunggu inspirasi adalah musuh produktivitas yang konsisten.</p>
<h2>Mulai dari yang Kecil</h2>
<p>Komitmenkan 20 menit kerja kreatif setiap hari. Durasi ini cukup singkat sehingga rasa malas memudar, tetapi cukup panjang untuk membuat kemajuan yang berarti. Kebanyakan sesi secara alami akan memanjang begitu Anda memulai.</p>
<h2>Tentukan Ruang Kreatif</h2>
<p>Entah itu studio khusus atau sudut meja dapur, memiliki tempat kerja yang konsisten memberi sinyal kepada otak bahwa sudah waktunya berkreasi. Siapkan alat-alat Anda agar mudah dijangkau.</p>
<h2>Praktik Menulis Pagi</h2>
<p>Tulislah tiga halaman teks arus kesadaran setiap pagi. Ini membersihkan kekacauan mental, memunculkan ide-ide, dan mempersiapkan pompa kreativitas Anda untuk sisa hari.</p>
<h3>Menghadapi Kebuntuan Kreatif</h3>
<p>Kebuntuan bukan pertanda untuk berhenti — melainkan sinyal untuk mengubah pendekatan. Coba medium yang berbeda, kerjakan latihan berbasis batasan, atau pelajari karya seniman yang Anda kagumi. Pergerakan sering kali memecah kemacetan.</p>
<blockquote>Amatir menunggu inspirasi. Profesional hadir setiap hari dan mengerjakan tugasnya.</blockquote>
<h2>Lacak Kemajuan Anda</h2>
<p>Catat secara sederhana apa yang Anda ciptakan setiap hari. Selama berminggu-minggu dan berbulan-bulan, catatan ini menjadi sangat memotivasi — bukti bahwa kehadiran yang konsisten menghasilkan kumpulan karya.</p>`,
      categoryId: cats1[2].id,
      tags: "proses-kreatif,rutinitas,produktivitas,seni",
      domainId: domain1.id,
      publishedAt: daysAgo(9),
    },
    {
      title: "Teori Warna untuk Seniman Visual: Panduan Praktis",
      slug: "teori-warna-seniman-visual-panduan-praktis",
      excerpt: "Memahami hubungan warna mengubah karya Anda secara mendasar. Panduan praktis ini mencakup semua yang perlu diketahui setiap seniman visual.",
      content: `<p>Warna adalah salah satu alat paling kuat dalam persenjataan seniman visual. Memahami bagaimana warna berinteraksi memungkinkan Anda menciptakan suasana, mengarahkan perhatian, dan membangkitkan respons emosional tertentu.</p>
<h2>Dasar-Dasar Lingkaran Warna</h2>
<p>Warna primer (merah, biru, kuning) dikombinasikan untuk membuat warna sekunder (oranye, hijau, ungu). Warna tersier mengisi celah di antaranya. Lingkaran warna ini adalah peta jalan Anda untuk memahami hubungan warna.</p>
<h2>Warna Komplementer</h2>
<p>Warna yang berseberangan di lingkaran (merah/hijau, biru/oranye, kuning/ungu) menghasilkan kontras maksimum. Gunakan mereka untuk menonjolkan elemen, tetapi hati-hati — terlalu banyak kontras komplementer bisa terasa mengganggu.</p>
<h2>Harmoni Analog</h2>
<p>Warna yang berdekatan di lingkaran menciptakan palet yang alami dan harmonis. Kombinasi biru, biru-hijau, dan hijau terasa kohesif dan menenangkan. Ini cara termudah untuk membuat skema warna yang menyenangkan.</p>
<h3>Suhu dan Suasana</h3>
<p>Warna hangat (merah, oranye, kuning) terkesan maju dan energetik. Warna dingin (biru, hijau, ungu) terkesan mundur dan tenang. Memadukan subjek hangat dengan latar belakang dingin menciptakan kedalaman alami.</p>
<h2>Menerapkan Teori Warna</h2>
<p>Mulailah dengan palet terbatas 3-4 warna. Ini memaksa Anda mengeksplorasi pencampuran dan secara otomatis menciptakan harmoni. Seiring kepercayaan diri tumbuh, perluas palet kerja Anda secara bertahap.</p>`,
      categoryId: cats1[1].id,
      tags: "teori-warna,seni-visual,lukisan,panduan",
      domainId: domain1.id,
      publishedAt: daysAgo(13),
    },
  ];

  // Domain 2: Animasi & Hiburan — artikel
  const articles2 = [
    {
      title: "Evolusi Animasi 2D di Era Streaming",
      slug: "evolusi-animasi-2d-era-streaming",
      excerpt: "Animasi 2D mengalami kebangkitan berkat platform streaming yang berinvestasi dalam konten animasi orisinal.",
      content: `<p>Selama berpuluh-puluh tahun, animasi 2D tampak ditakdirkan untuk punah saat studio-studio mengejar revolusi 3D. Namun platform streaming telah menyalakan kebangkitan luar biasa bagi konten 2D yang digambar tangan maupun digital.</p>
<h2>Efek Streaming</h2>
<p>Layanan streaming membutuhkan perpustakaan konten yang luas, dan serial animasi menawarkan nilai yang sangat baik — mudah ditonton maraton, menarik berbagai demografi, dan memiliki umur simpan lebih panjang dibanding tayangan live-action.</p>
<h2>Alat Baru, Nuansa Klasik</h2>
<p>Animasi 2D modern memanfaatkan alat digital yang mempercepat produksi tanpa mengorbankan estetika buatan tangan yang dicintai penonton. Perangkat lunak telah membuat animasi frame-by-frame lebih mudah diakses dari sebelumnya.</p>
<h3>Kebangkitan Kreator Independen</h3>
<p>Platform kini secara aktif mencari konten dari animator independen dan studio kecil. Hal ini telah mendemokrasikan industri, memungkinkan suara-suara beragam dan cerita non-konvensional menemukan penontonnya.</p>
<blockquote>Animasi 2D bukan peninggalan masa lalu — ia adalah pilihan gaya yang membawa bobot emosional unik yang tidak bisa ditiru oleh render 3D mana pun.</blockquote>
<h2>Apa yang Akan Datang</h2>
<p>Perpaduan teknik 2D dan 3D menciptakan gaya hibrid yang menarik. Seiring teknologi terus berkembang, kemungkinan kreatif untuk animasi meluas lebih cepat dari sebelumnya.</p>`,
      categoryId: cats2[0].id,
      tags: "animasi-2d,streaming,industri,tren",
      domainId: domain2.id,
      publishedAt: daysAgo(1),
    },
    {
      title: "Menciptakan Karakter yang Berkesan: Prinsip Desain yang Efektif",
      slug: "menciptakan-karakter-berkesan-prinsip-desain",
      excerpt: "Karakter kartun paling ikonik memiliki prinsip desain yang sama. Pelajari apa yang membuat sebuah karakter langsung dikenali.",
      content: `<p>Pikirkan karakter kartun kesayangan Anda — kemungkinan besar Anda bisa mengenalinya hanya dari siluetnya saja. Itu bukan kebetulan. Itu hasil dari prinsip desain yang diterapkan secara sengaja oleh seniman-seniman terampil.</p>
<h2>Tes Siluet</h2>
<p>Karakter yang didesain dengan baik seharusnya bisa dikenali hanya dari siluetnya. Ini berarti menciptakan bentuk yang khas: karakter bulat terasa ramah, karakter bersudut terasa dinamis, dan karakter kotak terasa kuat.</p>
<h2>Bahasa Bentuk</h2>
<p>Setiap bentuk mengomunikasikan kepribadian. Lingkaran menyiratkan kehangatan dan keramahan. Segitiga menyiratkan bahaya atau energi. Persegi menyampaikan stabilitas dan keandalan. Desain karakter terbaik menggunakan bentuk dominan sebagai fondasinya.</p>
<h2>Warna sebagai Karakter</h2>
<p>Palet warna karakter harus mencerminkan kepribadiannya. Pahlawan sering mengenakan warna primer. Penjahat cenderung ke warna yang lebih gelap dan jenuh. Pendamping biasanya menggunakan warna sekunder atau komplementer.</p>
<h3>Ekspresi dan Pose</h3>
<p>Desain karakter Anda dalam pose paling khasnya. Bagaimana mereka berdiri? Seperti apa ekspresi bawaan mereka? Pilihan-pilihan ini mengomunikasikan kepribadian bahkan sebelum satu baris dialog pun diucapkan.</p>
<h2>Kesederhanaan adalah Kunci</h2>
<p>Karakter yang paling abadi justru terlihat sederhana. Kompleksitas bisa ditambahkan melalui animasi dan penceritaan, tetapi desain dasar harus cukup bersih agar bisa digambar dengan cepat dan konsisten.</p>`,
      categoryId: cats2[1].id,
      tags: "desain-karakter,animasi,kartun,tips",
      domainId: domain2.id,
      publishedAt: daysAgo(4),
    },
    {
      title: "Tren Industri Animasi yang Perlu Diperhatikan Tahun Ini",
      slug: "tren-industri-animasi-yang-perlu-diperhatikan",
      excerpt: "Dari animasi berbantuan AI hingga produksi virtual, tren-tren ini mengubah cara konten animasi dibuat dan didistribusikan.",
      content: `<p>Industri animasi berkembang dengan kecepatan yang belum pernah terjadi sebelumnya. Teknologi mengubah alur produksi sementara ekspektasi penonton terus meningkat. Berikut tren-tren kunci yang membentuk industri ini.</p>
<h2>Produksi Berbantuan AI</h2>
<p>Alat AI semakin banyak digunakan untuk frame-frame di antara (in-between), pembuatan latar belakang, dan koreksi warna. Ini tidak menggantikan animator melainkan mempercepat alur kerja mereka, memungkinkan tim yang lebih kecil menghasilkan konten berkualitas lebih tinggi.</p>
<h2>Teknik Produksi Virtual</h2>
<p>Mesin render real-time yang awalnya dibuat untuk game merevolusi produksi animasi. Sutradara bisa melihat pratinjau adegan dalam kualitas hampir final selama produksi, bukan menunggu proses render selesai.</p>
<h2>Kolaborasi Global</h2>
<p>Alat berbasis cloud memungkinkan tim animasi yang tersebar di berbagai benua untuk berkolaborasi secara mulus. Studio di zona waktu berbeda bisa mengerjakan proyek yang sama sepanjang waktu.</p>
<h3>Penceritaan yang Beragam</h3>
<p>Penonton menuntut — dan mendapatkan — cerita dari budaya dan perspektif yang lebih luas. Studio animasi berinvestasi pada kreator dari latar belakang yang kurang terwakili, menghasilkan konten yang lebih kaya dan bervariasi.</p>
<h2>Kembalinya Layar Lebar</h2>
<p>Setelah bertahun-tahun dominasi streaming, film animasi membuktikan bahwa mereka masih mampu menarik penonton bioskop secara masif. Pengalaman sinematik tetap sangat kuat untuk penceritaan animasi.</p>`,
      categoryId: cats2[2].id,
      tags: "animasi,industri,tren,teknologi",
      domainId: domain2.id,
      publishedAt: daysAgo(7),
    },
    {
      title: "Animasi Frame-by-Frame: Memulai dengan Alat Digital",
      slug: "animasi-frame-by-frame-memulai-alat-digital",
      excerpt: "Ingin mulai membuat animasi? Alat-alat digital ramah pemula ini akan membuat Anda berkreasi menciptakan gerakan dalam waktu singkat.",
      content: `<p>Animasi frame-by-frame adalah bentuk paling murni dari keahlian ini — menggambar setiap frame individual untuk menciptakan ilusi gerakan. Dengan alat digital modern, memulainya tidak pernah semudah sekarang.</p>
<h2>Memilih Perangkat Lunak</h2>
<p>Ada beberapa pilihan sangat baik di berbagai rentang harga. Alat gratis menawarkan fitur yang mengejutkan untuk pemula, sementara perangkat lunak profesional menyediakan fitur lanjutan seiring pertumbuhan Anda.</p>
<h2>Memahami Frame Rate</h2>
<p>Animasi biasanya berjalan pada 24 frame per detik (fps). Namun, kebanyakan animasi 2D menggunakan "twos" — menggambar setiap dua frame untuk menghasilkan 12 gambar unik per detik. Ini menghasilkan tampilan khas yang diasosiasikan penonton dengan animasi tradisional.</p>
<h2>Latihan Bola Memantul</h2>
<p>Setiap animator memulai dari sini. Bola memantul mengajarkan timing, spacing, squash and stretch, dan gravitasi — prinsip-prinsip fundamental yang berlaku untuk setiap gerakan animasi yang akan Anda buat.</p>
<h3>Pose Kunci Terlebih Dahulu</h3>
<p>Jangan menganimasi langsung dari frame 1. Sebaliknya, gambar pose kunci terlebih dahulu (posisi-posisi terpenting), lalu isi breakdown dan in-between. Ini memberi Anda kendali atas timing dan memastikan animasi terbaca dengan jelas.</p>
<h2>Berlatih Setiap Hari</h2>
<p>Bahkan 15 menit latihan animasi harian membangun keterampilan dengan pesat. Coba animasikan objek sederhana — pendulum, bendera tertiup angin, siklus berjalan. Latihan-latihan fundamental ini mengembangkan rasa timing dan bobot Anda.</p>`,
      categoryId: cats2[0].id,
      tags: "animasi,tutorial,pemula,alat-digital",
      domainId: domain2.id,
      publishedAt: daysAgo(11),
    },
  ];

  // Domain 3: Seni & Kreatif — artikel
  const articles3 = [
    {
      title: "Melukis Cat Minyak untuk Pemula: Bahan Esensial dan Langkah Pertama",
      slug: "melukis-cat-minyak-pemula-bahan-esensial",
      excerpt: "Melukis dengan cat minyak bisa terasa mengintimidasi, tetapi dengan bahan yang tepat dan pendekatan yang benar, siapa pun bisa mulai menciptakan karya yang indah.",
      content: `<p>Cat minyak telah menjadi medium pilihan para pelukis maestro selama berabad-abad. Warna yang kaya, kemampuan mencampur, dan waktu kering yang lambat membuatnya sangat toleran bagi pemula yang mau belajar.</p>
<h2>Bahan-Bahan Esensial</h2>
<p>Mulailah dengan palet terbatas: titanium white, cadmium yellow, cadmium red, ultramarine blue, dan burnt umber. Kelima warna ini bisa dicampur untuk menghasilkan hampir setiap nuansa yang Anda butuhkan.</p>
<h2>Memilih Permukaan</h2>
<p>Kanvas yang sudah direntangkan adalah pilihan paling praktis untuk pemula. Papan kanvas lebih terjangkau dan cocok untuk latihan. Apa pun yang Anda pilih, pastikan permukaannya sudah dilapis gesso dengan benar.</p>
<h3>Kuas yang Benar-Benar Anda Butuhkan</h3>
<p>Mulailah dengan empat kuas: flat besar untuk menutup area, flat sedang untuk kerja umum, round kecil untuk detail, dan filbert untuk blending. Kualitas lebih penting daripada kuantitas.</p>
<blockquote>Kesalahan terbesar pemula adalah membeli terlalu banyak warna. Palet terbatas memaksa Anda belajar mencampur warna, yang merupakan keterampilan paling berharga dalam melukis.</blockquote>
<h2>Sesi Pertama Anda</h2>
<p>Mulailah dengan still life sederhana — sebuah apel, cangkir, atau setangkai bunga. Fokus pada melihat nilai (terang dan gelap) daripada warna. Jika Anda bisa melukis cahaya dan bayangan yang meyakinkan, warna akan mengikuti secara alami.</p>`,
      categoryId: cats3[0].id,
      tags: "cat-minyak,pemula,bahan,tutorial",
      domainId: domain3.id,
      publishedAt: daysAgo(3),
    },
    {
      title: "Memahami Patung Abstrak: Bentuk, Ruang, dan Makna",
      slug: "memahami-patung-abstrak-bentuk-ruang-makna",
      excerpt: "Patung abstrak menantang kita untuk melihat melampaui representasi. Berikut cara mengapresiasi dan memahami seni tiga dimensi abstrak.",
      content: `<p>Patung abstrak menanggalkan representasi untuk berfokus pada bentuk murni, ruang, tekstur, dan material. Bagi banyak pemirsa, ini bisa terasa menantang — tetapi memahami beberapa konsep kunci membuka dunia makna yang kaya.</p>
<h2>Bentuk dan Volume</h2>
<p>Dalam patung abstrak, bentuk itu sendiri adalah subjeknya. Bentuk yang halus dan melengkung mungkin membangkitkan pertumbuhan organik, sementara bentuk yang bersudut dan bergerigi menyiratkan konflik atau energi. Perhatikan bagaimana bentuk membuat Anda merasakan sesuatu sebelum mencoba menafsirkannya.</p>
<h2>Ruang Negatif</h2>
<p>Ruang kosong di dalam dan di sekitar patung sama pentingnya dengan bentuk padatnya. Banyak pematung abstrak sengaja menciptakan bukaan dan rongga yang berinteraksi dengan lingkungan sekitarnya.</p>
<h2>Material sebagai Makna</h2>
<p>Pilihan material membawa signifikansi. Baja yang dingin dan dipoles menyiratkan industri dan presisi. Batu yang dipahat kasar terhubung dengan bumi dan kelanggengan. Objek temuan membawa sejarahnya ke dalam karya.</p>
<h3>Skala dan Lingkungan</h3>
<p>Patung abstrak bertransformasi tergantung konteksnya. Karya yang terasa intim di galeri bisa menjadi monumental di ruang publik. Perhatikan bagaimana karya tersebut berhubungan dengan lingkungan sekitarnya.</p>
<h2>Berinteraksi dengan Karya Abstrak</h2>
<p>Berjalanlah mengelilinginya. Lihat dari berbagai sudut dan jarak. Perhatikan bagaimana cahaya bermain di permukaan. Patung abstrak terbaik menghargai pengamatan yang lambat dan cermat dengan penemuan baru setiap kali Anda memandang.</p>`,
      categoryId: cats3[1].id,
      tags: "patung,seni-abstrak,kontemporer,analisis",
      domainId: domain3.id,
      publishedAt: daysAgo(6),
    },
    {
      title: "Revolusi Impresionisme: Bagaimana Seni Berubah Selamanya",
      slug: "revolusi-impresionisme-seni-berubah-selamanya",
      excerpt: "Gerakan Impresionis tidak hanya mengubah seni lukis — ia mengubah cara kita melihat dunia. Jelajahi revolusi yang memulai segalanya.",
      content: `<p>Pada tahun 1870-an, sekelompok pelukis di Paris melanggar setiap aturan yang dijunjung tinggi oleh kalangan seni mapan. Mereka melukis di luar ruangan, menggunakan sapuan kuas yang terlihat, dan menangkap momen-momen cahaya yang berlalu. Dunia seni tidak akan pernah sama lagi.</p>
<h2>Melanggar Aturan Akademi</h2>
<p>Salon resmi menuntut lukisan yang dipoles dan realistis dengan subjek sejarah atau mitologi. Kaum Impresionis menolak ini sepenuhnya, memilih untuk melukis pemandangan sehari-hari dengan teknik baru yang radikal.</p>
<h2>Menangkap Cahaya</h2>
<p>Alih-alih memadukan warna secara halus, para Impresionis menempatkan sapuan warna murni berdampingan, membiarkan mata pemirsa yang mencampurnya. Ini menghasilkan kualitas yang cemerlang dan bercahaya yang tidak bisa dicapai teknik tradisional.</p>
<h2>Melukis En Plein Air</h2>
<p>Penemuan tabung cat portabel membebaskan seniman dari studio. Melukis di luar berarti bekerja cepat untuk menangkap kondisi cahaya yang berubah, yang menghasilkan sapuan kuas spontan dan energetik yang mendefinisikan gerakan ini.</p>
<h3>Warisan dan Pengaruh</h3>
<p>Impresionisme membuka pintu bagi setiap gerakan seni modern yang mengikutinya. Dengan memprioritaskan persepsi pribadi di atas konvensi akademis, seniman-seniman ini menetapkan bahwa bagaimana Anda melihat lebih penting dari apa yang Anda lihat.</p>
<h2>Mengapresiasi Impresionisme Hari Ini</h2>
<p>Mundurlah dari lukisan Impresionis dan biarkan warna-warna menyatu. Kemudian mendekatlah dan lihat sapuan kuas individual. Pengalaman ganda ini — keajaiban dari kejauhan dan kejujuran dari dekat — adalah yang membuat karya-karya ini tak pernah membosankan.</p>`,
      categoryId: cats3[2].id,
      tags: "impresionisme,sejarah-seni,lukisan,gerakan",
      domainId: domain3.id,
      publishedAt: daysAgo(10),
    },
    {
      title: "Teknik Cat Air yang Harus Dikuasai Setiap Seniman",
      slug: "teknik-cat-air-yang-harus-dikuasai",
      excerpt: "Cat air itu tak terduga dan indah. Kuasai teknik-teknik inti ini untuk memanfaatkan kualitas uniknya.",
      content: `<p>Cat air sering disebut medium melukis yang paling menantang — dan paling memuaskan. Transparansi dan fluiditasnya menciptakan efek yang mustahil dengan medium lain, tetapi menuntut pendekatan yang berbeda dari cat minyak atau akrilik.</p>
<h2>Basah di Atas Basah</h2>
<p>Mengaplikasikan cat basah pada permukaan yang basah menciptakan tepi yang lembut dan menyebar serta paduan warna yang indah. Teknik ini sempurna untuk langit, pantulan air, dan efek atmosferik. Kuncinya adalah mengontrol seberapa basah kertas Anda.</p>
<h2>Basah di Atas Kering</h2>
<p>Melukis di atas kertas kering memberikan tepi yang tajam dan terdefinisi serta kontrol maksimum. Gunakan ini untuk detail, elemen arsitektur, dan area mana pun yang membutuhkan presisi.</p>
<h2>Glazing</h2>
<p>Membangun lapisan tipis dan transparan adalah kekuatan super cat air. Setiap lapisan memodifikasi warna di bawahnya, menciptakan kedalaman bercahaya yang tidak bisa ditandingi cat opak. Biarkan setiap lapisan kering sepenuhnya sebelum mengaplikasikan yang berikutnya.</p>
<h3>Mengangkat dan Menepuk</h3>
<p>Cat air bukan hanya tentang menambahkan cat — tetapi juga tentang mengangkatnya. Kuas lembap bisa mengangkat warna dari kertas untuk membuat highlight, melunakkan tepi, atau mengoreksi kesalahan.</p>
<h2>Merangkul Kebetulan yang Indah</h2>
<p>Beberapa efek paling cantik dalam cat air terjadi secara kebetulan — blooming yang tak terduga, granulasi, dan interaksi warna. Belajar bekerja dengan kebetulan-kebetulan ini alih-alih melawannya adalah kunci menguasai medium ini.</p>`,
      categoryId: cats3[0].id,
      tags: "cat-air,teknik,lukisan,tutorial",
      domainId: domain3.id,
      publishedAt: daysAgo(14),
    },
  ];

  // Domain 4: Gaya Hidup — artikel
  const articles4 = [
    {
      title: "Panduan Lengkap Rutinitas Perawatan Diri yang Benar-Benar Efektif",
      slug: "panduan-rutinitas-perawatan-diri-efektif",
      excerpt: "Lupakan kata-kata trendi. Berikut praktik perawatan diri berbasis bukti yang meningkatkan kehidupan sehari-hari secara nyata.",
      content: `<p>Perawatan diri telah menjadi istilah yang sarat makna, sering dikaitkan dengan produk mahal dan estetika media sosial. Tapi perawatan diri yang sesungguhnya lebih sederhana, lebih efektif, dan sering kali gratis.</p>
<h2>Perawatan Diri Fisik</h2>
<p>Fondasi untuk merasa baik dimulai dari tubuh Anda. Tidur yang konsisten (7-9 jam), gerakan teratur (bahkan sekadar berjalan kaki), dan hidrasi yang cukup membentuk dasar yang menjadi tumpuan segala hal lainnya.</p>
<h2>Perawatan Diri Mental</h2>
<p>Pikiran Anda juga butuh perawatan. Menetapkan batasan dengan pekerjaan, membatasi konsumsi berita, dan mempraktikkan kesadaran penuh meski hanya lima menit sehari bisa mengurangi stres dan kecemasan secara drastis.</p>
<h3>Koneksi Sosial</h3>
<p>Hubungan yang bermakna adalah pilar kesejahteraan. Jadwalkan waktu rutin bersama orang-orang yang memberi Anda energi, dan jangan merasa bersalah untuk mengurangi waktu bersama mereka yang menguras energi Anda.</p>
<blockquote>Perawatan diri bukan egois. Anda tidak bisa menuang dari gelas yang kosong. Merawat diri sendiri adalah fondasi untuk merawat segala hal lain dalam hidup Anda.</blockquote>
<h2>Membuat Rutinitas Anda</h2>
<p>Pilih satu praktik dari setiap kategori dan komitmenkan selama 30 hari. Jangan merombak seluruh hidup Anda sekaligus — perubahan kecil yang konsisten akan berlipat ganda menjadi hasil yang transformatif seiring waktu.</p>`,
      categoryId: cats4[2].id,
      tags: "perawatan-diri,kesehatan,rutinitas,kebugaran",
      domainId: domain4.id,
      publishedAt: daysAgo(2),
    },
    {
      title: "Kencan Modern: Menavigasi Hubungan di Era Digital",
      slug: "kencan-modern-menavigasi-hubungan-era-digital",
      excerpt: "Kencan telah berubah secara fundamental dalam satu dekade terakhir. Begini cara membangun koneksi tulus di dunia yang semakin digital.",
      content: `<p>Aturan kencan telah bergeser secara dramatis. Aplikasi, media sosial, dan perubahan norma sosial telah menciptakan peluang baru sekaligus tantangan baru bagi mereka yang mencari hubungan bermakna.</p>
<h2>Paradoks Aplikasi Kencan</h2>
<p>Aplikasi kencan memberi Anda akses ke lebih banyak calon pasangan dari yang bisa dibayangkan generasi mana pun sebelumnya. Tetapi kelimpahan ini bisa mengarah pada paradoks pilihan — selalu bertanya-tanya apakah ada seseorang yang lebih baik hanya dengan satu geseran lagi.</p>
<h2>Membangun Koneksi yang Tulus</h2>
<p>Letakkan ponsel Anda saat berkencan. Ajukan pertanyaan yang nyata. Bagikan kerentanan. Koneksi terdalam terjadi melalui kehadiran dan keaslian, bukan melalui profil yang dikurasi dan pesan teks yang cerdik.</p>
<h2>Menetapkan Batasan yang Sehat</h2>
<p>Ketahui hal-hal yang tidak bisa dinegosiasikan sebelum Anda mulai berkencan. Komunikasikan dengan jelas dan sejak awal. Orang yang tepat akan menghormati batasan Anda; orang yang salah akan mengujinya.</p>
<h3>Tanda Bahaya vs Preferensi</h3>
<p>Belajar membedakan antara tanda bahaya yang sesungguhnya (ketidakjujuran, ketidakhormatan, perilaku mengontrol) dan sekadar preferensi (tinggi badan, karier, hobi). Fleksibilitas dalam preferensi membuka pintu; mengabaikan tanda bahaya menutupnya.</p>
<h2>Berjalan Perlahan</h2>
<p>Kecocokan sejati terungkap seiring waktu, bukan dalam satu malam yang ajaib. Berikan hubungan ruang untuk berkembang secara alami alih-alih terburu-buru menuju label atau tonggak pencapaian.</p>`,
      categoryId: cats4[1].id,
      tags: "kencan,hubungan,kehidupan-modern,saran",
      domainId: domain4.id,
      publishedAt: daysAgo(5),
    },
    {
      title: "Kebugaran di Rumah: Membentuk Latihan Efektif Tanpa Alat",
      slug: "kebugaran-di-rumah-latihan-efektif-tanpa-alat",
      excerpt: "Anda tidak membutuhkan keanggotaan gym atau peralatan untuk mendapatkan tubuh yang bugar. Rutinitas bodyweight ini memberikan hasil nyata.",
      content: `<p>Anggapan bahwa Anda perlu gym untuk bugar adalah salah satu mitos terbesar di dunia kebugaran. Latihan dengan berat badan sendiri, jika diprogramkan dengan benar, bisa membangun kekuatan, daya tahan, dan fleksibilitas seefektif rutinitas gym mana pun.</p>
<h2>Latihan Dasar</h2>
<p>Kuasai lima gerakan ini dan Anda memiliki semua yang dibutuhkan: push-up, squat, lunge, plank, dan burpee. Setiap gerakan menargetkan beberapa kelompok otot dan bisa dimodifikasi untuk tingkat kebugaran apa pun.</p>
<h2>Peningkatan Beban Progresif di Rumah</h2>
<p>Untuk terus bertambah kuat, Anda perlu meningkatkan tingkat kesulitan seiring waktu. Perlambat repetisi Anda, tambahkan jeda di titik tersulit, coba variasi satu kaki atau satu tangan, atau tingkatkan volume total.</p>
<h2>Contoh Rutinitas Mingguan</h2>
<ul>
<li>Senin: Fokus tubuh bagian atas (push-up, dip, plank)</li>
<li>Rabu: Fokus tubuh bagian bawah (squat, lunge, calf raise)</li>
<li>Jumat: Sirkuit seluruh tubuh (burpee, mountain climber, bear crawl)</li>
<li>Akhir pekan: Pemulihan aktif (jalan kaki, stretching, yoga)</li>
</ul>
<h3>Konsistensi di Atas Intensitas</h3>
<p>Latihan sedang yang Anda lakukan empat kali seminggu mengalahkan latihan intens yang Anda lakukan sekali. Bangun kebiasaan terlebih dahulu, baru secara bertahap tingkatkan tantangannya.</p>
<h2>Melacak Kemajuan</h2>
<p>Buat catatan sederhana dari latihan Anda. Lacak repetisi, set, dan bagaimana perasaan setiap sesi. Data ini menjaga motivasi Anda dan memastikan Anda terus berkembang seiring waktu.</p>`,
      categoryId: cats4[2].id,
      tags: "kebugaran,latihan-rumah,bodyweight,olahraga",
      domainId: domain4.id,
      publishedAt: daysAgo(8),
    },
    {
      title: "Seni Hidup Bahagia: Kesenangan Sederhana yang Mengubah Hari Anda",
      slug: "seni-hidup-bahagia-kesenangan-sederhana",
      excerpt: "Kebahagiaan bukan soal hal-hal besar. Praktik kecil sehari-hari ini bisa mengubah cara Anda menjalani hidup secara fundamental.",
      content: `<p>Kita sering mengejar kebahagiaan melalui pencapaian besar dan pembelian mewah, padahal riset secara konsisten menunjukkan bahwa kesenangan kecil sehari-hari lebih berkontribusi pada kepuasan hidup secara keseluruhan.</p>
<h2>Ritual Pagi</h2>
<p>Cara Anda memulai hari menentukan nada untuk semua yang mengikutinya. Beberapa menit tenang bersama kopi Anda, sedikit peregangan lembut, atau sekadar melangkah keluar untuk merasakan udara pagi bisa membuat Anda lebih terpusat sebelum tuntutan hari dimulai.</p>
<h2>Kekuatan Menikmati</h2>
<p>Pelankan langkah saat momen-momen menyenangkan terjadi. Rasakan makanan Anda. Nikmati sinar matahari. Dengarkan musik dengan perhatian penuh. Riset menunjukkan bahwa menikmati pengalaman positif secara perlahan memperbesar dampak emosionalnya.</p>
<h2>Matahari Terbenam Digital</h2>
<p>Tetapkan waktu setiap malam untuk menyimpan layar. Cahaya biru mengganggu tidur, tetapi yang lebih penting, aliran informasi yang terus-menerus menghalangi pikiran Anda dari memproses hari dan beristirahat secara alami.</p>
<h3>Menumbuhkan Rasa Syukur</h3>
<p>Sebelum tidur, pikirkan tiga hal spesifik dari hari Anda yang berjalan baik. Praktik sederhana ini, didukung oleh riset yang luas, secara terukur meningkatkan kebahagiaan dan mengurangi kecemasan seiring waktu.</p>
<h2>Berinvestasi pada Pengalaman</h2>
<p>Habiskan uang Anda untuk pengalaman alih-alih barang. Makan bersama teman, mendaki di akhir pekan, atau mempelajari keterampilan baru menciptakan kenangan dan cerita yang tidak bisa ditandingi oleh pembelian material.</p>`,
      categoryId: cats4[0].id,
      tags: "gaya-hidup,kebahagiaan,kesehatan,kesadaran",
      domainId: domain4.id,
      publishedAt: daysAgo(12),
    },
  ];

  // Domain 5: Budaya Islam & Komunitas — artikel
  const articles5 = [
    {
      title: "Keindahan Seni Geometri dan Arsitektur Islam",
      slug: "keindahan-seni-geometri-arsitektur-islam",
      excerpt: "Pola geometri Islam merepresentasikan kesempurnaan matematis dan makna spiritual. Jelajahi kesenian di balik desain-desain abadi ini.",
      content: `<p>Seni geometri Islam adalah salah satu tradisi artistik paling canggih dalam sejarah peradaban manusia. Berlandaskan prinsip-prinsip matematika, pola-pola rumit ini menghiasi masjid, istana, dan manuskrip di seluruh dunia Muslim.</p>
<h2>Fondasi Matematis</h2>
<p>Pola geometri Islam dibangun dari bentuk-bentuk sederhana — lingkaran, persegi, dan segitiga — yang diulang, diputar, dan dikunci satu sama lain untuk menciptakan desain yang tak terbatas kompleksitasnya. Ketelitian matematis ini memberikan rasa keteraturan dan harmoni.</p>
<h2>Makna Spiritual</h2>
<p>Sifat tak terbatas dari pola geometri mencerminkan konsep Islam tentang tauhid — keesaan dan ketidakterbatasan penciptaan. Pola-pola ini tidak memiliki awal dan akhir, menunjuk pada sifat tak terbatas dari Yang Ilahi.</p>
<h3>Variasi Regional</h3>
<p>Meski berbagi prinsip yang sama, seni geometri bervariasi secara indah di setiap wilayah. Pola Afrika Utara cenderung pada desain berbasis bintang yang berani. Pola Persia menyukai arabesque yang mengalir. Desain Turki sering memasukkan elemen-elemen floral.</p>
<blockquote>Setiap pola geometri dimulai dari satu titik dan sebuah jangka. Dari kesederhanaan ini muncul kompleksitas tak terbatas — sebuah cermin dari penciptaan itu sendiri.</blockquote>
<h2>Aplikasi Modern</h2>
<p>Arsitek dan desainer kontemporer terus menggali inspirasi dari geometri Islam. Bangunan modern, tekstil, dan seni digital sering mengadopsi pola-pola abadi ini, membuktikan keindahan dan relevansinya yang tak lekang oleh waktu.</p>`,
      categoryId: cats5[1].id,
      tags: "seni-islam,arsitektur,geometri,budaya",
      domainId: domain5.id,
      publishedAt: daysAgo(1),
    },
    {
      title: "Membangun Komunitas yang Lebih Kuat Melalui Keterlibatan Lokal",
      slug: "membangun-komunitas-kuat-keterlibatan-lokal",
      excerpt: "Komunitas yang kuat tidak terjadi begitu saja. Berikut cara-cara praktis membangun koneksi dan dukungan di lingkungan sekitar Anda.",
      content: `<p>Komunitas yang hidup memberikan dukungan, rasa memiliki, dan tujuan bagi para anggotanya. Baik Anda baru pindah ke suatu daerah atau ingin memperdalam koneksi yang sudah ada, keterlibatan aktif mengubah lingkungan menjadi komunitas sejati.</p>
<h2>Mulai dari Tetangga</h2>
<p>Langkah paling sederhana sering kali yang paling kuat. Perkenalkan diri Anda kepada tetangga. Sapaan ramah, makan bersama, atau bantuan kecil membangun fondasi kepercayaan dalam komunitas.</p>
<h2>Jadi Relawan di Lingkungan Lokal</h2>
<p>Cari organisasi di daerah Anda yang sejalan dengan nilai dan keterampilan Anda. Bank makanan, program bimbingan belajar, kerja bakti lingkungan, dan kebun komunitas semuanya membutuhkan relawan yang berdedikasi.</p>
<h2>Ciptakan Ruang Berkumpul</h2>
<p>Komunitas membutuhkan tempat untuk berkumpul. Adakan potluck lingkungan, malam permainan, atau perayaan budaya. Bahkan pertemuan informal di taman lokal pun bisa memperkuat ikatan sosial.</p>
<h3>Dukung Usaha Lokal</h3>
<p>Berbelanja secara lokal menjaga uang tetap beredar di komunitas dan membangun hubungan dengan pemilik usaha yang sering menjadi tulang punggung identitas dan kebanggaan lingkungan.</p>
<h2>Menjembatani Perbedaan</h2>
<p>Komunitas yang paling kuat merangkul keberagaman. Mengadakan dialog antaragama, acara pertukaran budaya, dan proyek kolaboratif menyatukan orang-orang lintas perbedaan dan membangun saling pengertian.</p>`,
      categoryId: cats5[0].id,
      tags: "komunitas,keterlibatan,relawan,lokal",
      domainId: domain5.id,
      publishedAt: daysAgo(4),
    },
    {
      title: "Kaligrafi Islam: Seni Menulis Indah",
      slug: "kaligrafi-islam-seni-menulis-indah",
      excerpt: "Kaligrafi menempati posisi istimewa dalam budaya Islam sebagai bentuk seni visual tertinggi. Temukan sejarah dan maknanya.",
      content: `<p>Dalam tradisi Islam, kaligrafi menempati posisi tertinggi di antara seni-seni visual. Penulisan indah aksara Arab — khususnya ayat-ayat Al-Quran — dipandang sebagai bentuk seni sekaligus bentuk ibadah.</p>
<h2>Gaya-Gaya Kaligrafi Utama</h2>
<p>Beberapa gaya penulisan yang berbeda telah berkembang selama berabad-abad. Kufi, salah satu yang tertua, menampilkan bentuk huruf geometris dan bersudut. Naskhi, yang paling banyak digunakan, menawarkan keterbacaan yang jelas. Tsuluts dikenal dengan lengkungannya yang elegan dan mengalir, sering dipakai dalam inskripsi arsitektur.</p>
<h2>Alat-Alat Kaligrafer</h2>
<p>Kaligrafi tradisional memerlukan pena bambu (qalam), tinta, dan kertas yang disiapkan secara khusus. Sudut pemotongan bambu menentukan karakter goresan. Setiap kaligrafer menyiapkan peralatannya sendiri dengan penuh ketelitian.</p>
<h3>Bertahun-tahun Berlatih</h3>
<p>Menjadi kaligrafer maestro secara tradisional membutuhkan bertahun-tahun belajar di bawah bimbingan maestro yang sudah mapan. Murid-murid berlatih menulis huruf individual ribuan kali sebelum mencoba kata, dan kata ribuan kali sebelum mencoba komposisi.</p>
<h2>Kaligrafi dalam Kehidupan Sehari-hari</h2>
<p>Kaligrafi Islam hadir di mana-mana — dalam dekorasi masjid, seni buku, koin, tekstil, keramik, dan karya logam. Kini, seniman kontemporer terus mendorong batas ekspresi kaligrafi sambil tetap menghormati teknik tradisional.</p>`,
      categoryId: cats5[1].id,
      tags: "kaligrafi,seni-islam,arab,tradisi",
      domainId: domain5.id,
      publishedAt: daysAgo(8),
    },
    {
      title: "Program Pendidikan yang Memberdayakan Pemuda di Komunitas Muslim",
      slug: "program-pendidikan-memberdayakan-pemuda-komunitas-muslim",
      excerpt: "Investasi dalam pendidikan pemuda menciptakan perubahan positif yang bertahan lama. Program-program ini membuat perbedaan nyata di komunitas Muslim di seluruh dunia.",
      content: `<p>Pendidikan ditekankan sebagai nilai fundamental dalam Islam. Komunitas-komunitas di seluruh dunia mengembangkan program inovatif yang menggabungkan keunggulan akademis dengan identitas budaya dan pembentukan karakter.</p>
<h2>Sekolah Islam Akhir Pekan</h2>
<p>Program akhir pekan menyediakan pembelajaran terstruktur tentang sejarah Islam, bahasa Arab, dan tilawah Al-Quran. Program terbaik membuat belajar menjadi menarik melalui aktivitas interaktif, proyek kelompok, dan diskusi yang sesuai usia.</p>
<h2>Integrasi STEM dan Keimanan</h2>
<p>Program yang menghubungkan penelitian ilmiah dengan tradisi keilmuan Islam menginspirasi generasi muda untuk mengejar karir di bidang sains dan teknologi. Sejarah kaya kontribusi Muslim pada matematika, astronomi, dan kedokteran menjadi teladan yang menginspirasi.</p>
<h2>Pengembangan Kepemimpinan</h2>
<p>Program kepemimpinan pemuda mempersiapkan generasi pemimpin komunitas berikutnya. Melalui mentoring, kesempatan berbicara di depan umum, dan proyek pengabdian masyarakat, generasi muda mengembangkan kepercayaan diri dan tanggung jawab kewarganegaraan.</p>
<h3>Dukungan Kesehatan Mental</h3>
<p>Program pemuda modern semakin banyak mengintegrasikan kesadaran dan dukungan kesehatan mental. Menciptakan ruang aman di mana generasi muda bisa mendiskusikan tantangan, pertanyaan identitas, dan kesejahteraan emosional sangat penting untuk perkembangan yang sehat.</p>
<h2>Peran Teknologi</h2>
<p>Platform pembelajaran daring telah memperluas akses ke pendidikan Islam berkualitas melampaui batas-batas geografis. Pelajar di daerah terpencil kini bisa mengakses pengajar dan sumber daya kelas dunia melalui platform digital.</p>`,
      categoryId: cats5[2].id,
      tags: "pendidikan,pemuda,komunitas,program",
      domainId: domain5.id,
      publishedAt: daysAgo(12),
    },
  ];

  // ═══════════════════════════════════════════
  // CREATE ALL ARTICLES
  // ═══════════════════════════════════════════

  const allArticles = [
    ...articles1,
    ...articles2,
    ...articles3,
    ...articles4,
    ...articles5,
  ];

  const createdArticles = [];
  for (const a of allArticles) {
    const article = await prisma.article.create({
      data: {
        title: a.title,
        slug: a.slug,
        content: a.content,
        excerpt: a.excerpt,
        categoryId: a.categoryId,
        tags: a.tags,
        authorName: pickAuthor(),
        status: "published",
        domainId: a.domainId,
        publishedAt: a.publishedAt,
      },
    });
    createdArticles.push(article);
  }

  console.log(`Created ${createdArticles.length} articles`);

  // ═══════════════════════════════════════════
  // FAKE COMMENTS — 2-3 per article
  // ═══════════════════════════════════════════

  const commentTemplates = [
    { author: "Agus Setiawan", content: "Artikel yang sangat bermanfaat! Terima kasih sudah berbagi." },
    { author: "Lina Marlina", content: "Penjelasannya sangat jelas dan mudah dipahami. Saya jadi tambah semangat belajar." },
    { author: "Bambang Suryadi", content: "Sudah lama mencari informasi seperti ini. Sangat membantu!" },
    { author: "Fitri Handayani", content: "Perspektif yang menarik. Semoga ada kelanjutannya di artikel berikutnya." },
    { author: "Wahyu Nugroho", content: "Tepat sekali. Saya punya pengalaman serupa dan bisa memastikan tips ini benar-benar berguna." },
    { author: "Ratna Dewi", content: "Panduan yang sangat lengkap. Sudah saya bagikan ke teman-teman." },
    { author: "Eko Prasetyo", content: "Saran yang jelas dan praktis. Inilah alasan saya terus mengunjungi situs ini." },
    { author: "Sri Mulyani", content: "Senang sekali membaca konten seperti ini. Terus berkarya ya!" },
    { author: "Joko Widodo", content: "Akhirnya ada yang menjelaskan ini dengan cara yang masuk akal. Terima kasih!" },
    { author: "Tika Sari", content: "Rekomendasi yang mantap. Saya coba tips pertama dan langsung berhasil." },
    { author: "Doni Kusuma", content: "Ini mengubah pendekatan saya sepenuhnya. Terima kasih atas uraian yang mendetail." },
    { author: "Ari Wibowo", content: "Bacaan yang bagus. Bagian perbandingannya sangat membantu untuk mengambil keputusan." },
  ];

  let commentCount = 0;
  for (const article of createdArticles) {
    const numComments = 2 + Math.floor(Math.random() * 2); // 2-3 comments
    const shuffled = [...commentTemplates].sort(() => Math.random() - 0.5);

    for (let i = 0; i < numComments; i++) {
      const c = shuffled[i];
      await prisma.comment.create({
        data: {
          authorName: c.author,
          content: c.content,
          articleId: article.id,
          createdAt: new Date(article.publishedAt!.getTime() + (i + 1) * 86400000),
        },
      });
      commentCount++;
    }
  }

  console.log(`Created ${commentCount} comments`);

  console.log("\nSeed complete!");
  console.log("  3 servers");
  console.log("  5 themes");
  console.log("  5 domains");
  console.log("  15 categories");
  console.log(`  ${createdArticles.length} articles`);
  console.log(`  ${commentCount} comments`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
