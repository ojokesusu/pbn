import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// ── Mock content templates — each genre has its own titles, paragraphs, tags, and image keyword ──
const MOCK_DATA: Record<string, { titles: string[]; imageKeyword: string; paragraphs: string[]; tags: string }> = {
  Teknologi: {
    titles: ["Tren Teknologi AI yang Mengubah Dunia Bisnis", "Panduan Memilih Laptop Terbaik untuk Kerja Remote", "Keamanan Siber: Melindungi Data Pribadi di Era Digital", "Cloud Computing dan Masa Depan Infrastruktur IT", "Perkembangan 5G dan Dampaknya bagi Industri"],
    imageKeyword: "technology laptop",
    paragraphs: ["Perkembangan teknologi semakin pesat dan membawa perubahan signifikan. Dari kecerdasan buatan hingga Internet of Things, inovasi terus bermunculan dan mengubah cara kita bekerja dan berkomunikasi.", "Keamanan data menjadi prioritas utama bagi setiap organisasi. Serangan siber semakin canggih, sehingga perlindungan terhadap informasi sensitif memerlukan pendekatan berlapis.", "Adopsi cloud computing memungkinkan bisnis beroperasi lebih efisien. Dengan model pay-as-you-go, bahkan usaha kecil dapat mengakses infrastruktur teknologi kelas enterprise.", "Transformasi digital bukan lagi pilihan melainkan kebutuhan. Perusahaan yang berinvestasi lebih awal cenderung memiliki keunggulan kompetitif yang signifikan di pasar.", "Kecerdasan buatan dan machine learning telah merevolusi berbagai industri. Dari otomasi proses bisnis hingga analisis prediktif, teknologi ini membuka peluang baru yang belum pernah ada sebelumnya."],
    tags: "teknologi, digital, inovasi, AI, cloud computing",
  },
  Kesehatan: {
    titles: ["Pola Makan Sehat untuk Menjaga Imunitas Tubuh", "10 Gerakan Olahraga Efektif yang Bisa Dilakukan di Rumah", "Pentingnya Kesehatan Mental di Era Modern", "Suplemen Vitamin: Mana yang Benar-Benar Dibutuhkan?", "Tidur Berkualitas: Kunci Produktivitas dan Kesehatan"],
    imageKeyword: "healthy food nutrition",
    paragraphs: ["Menjaga kesehatan tubuh merupakan investasi jangka panjang yang tidak ternilai. Pola hidup sehat dapat mengurangi risiko penyakit kronis dan meningkatkan kualitas hidup secara keseluruhan.", "Nutrisi seimbang memegang peranan penting dalam menjaga sistem imun. Konsumsi sayuran, buah-buahan, protein, dan karbohidrat dalam porsi tepat membantu tubuh melawan infeksi.", "Aktivitas fisik rutin terbukti meningkatkan mood, mengurangi stres, dan memperbaiki kualitas tidur. Olahraga ringan 30 menit per hari sudah memberikan manfaat signifikan.", "Kesehatan mental sama pentingnya dengan kesehatan fisik. Stres berkepanjangan dapat menyebabkan gangguan tidur hingga penyakit kardiovaskular.", "Hidrasi yang cukup sangat krusial namun sering diabaikan. Minum air putih minimal 8 gelas per hari membantu menjaga fungsi organ dan meningkatkan konsentrasi."],
    tags: "kesehatan, nutrisi, olahraga, wellness, gaya hidup sehat",
  },
  Keuangan: {
    titles: ["Strategi Investasi untuk Pemula: Mulai dari Mana?", "Mengelola Keuangan Pribadi di Tengah Ketidakpastian Ekonomi", "Reksa Dana vs Saham: Mana yang Lebih Cocok?", "Tips Menabung Efektif untuk Generasi Milenial", "Memahami Inflasi dan Cara Melindungi Aset Anda"],
    imageKeyword: "finance investment money",
    paragraphs: ["Pengelolaan keuangan yang baik merupakan fondasi untuk mencapai kebebasan finansial. Perencanaan matang membantu membangun masa depan keuangan yang lebih cerah.", "Investasi bukan hanya untuk orang kaya. Dengan modal relatif kecil, siapa pun bisa mulai melalui reksa dana, saham, atau obligasi pemerintah.", "Diversifikasi portofolio adalah prinsip dasar investasi. Menyebar investasi ke berbagai instrumen dapat meminimalisir risiko kerugian secara signifikan.", "Dana darurat adalah komponen penting yang sering diabaikan. Idealnya setara 3-6 bulan pengeluaran untuk menghadapi situasi tak terduga.", "Literasi keuangan menjadi kunci dalam mengambil keputusan finansial. Memahami bunga majemuk, inflasi, dan manajemen risiko sangat penting."],
    tags: "keuangan, investasi, finansial, tabungan, ekonomi",
  },
  Travel: {
    titles: ["Destinasi Wisata Tersembunyi di Indonesia yang Wajib Dikunjungi", "Tips Traveling Hemat: Keliling Asia Tenggara dengan Budget Minim", "Panduan Lengkap Backpacking untuk Pemula", "Wisata Alam Indonesia: Keindahan yang Tak Tertandingi", "Rekomendasi Hotel Unik dan Instagramable di Bali"],
    imageKeyword: "travel beach tropical",
    paragraphs: ["Indonesia memiliki keindahan alam yang luar biasa beragam. Dari pantai berpasir putih hingga pegunungan hijau, setiap sudut nusantara menawarkan pengalaman wisata yang tak terlupakan.", "Traveling tidak harus mahal. Dengan perencanaan yang tepat dan fleksibilitas, perjalanan impian bisa diwujudkan dengan budget yang ramah di kantong.", "Backpacking menjadi tren wisata yang semakin populer di kalangan anak muda. Selain hemat biaya, cara traveling ini memberikan pengalaman lebih autentik dan mendalam.", "Wisata kuliner lokal menjadi daya tarik tersendiri saat bepergian. Mencicipi makanan khas daerah memberikan perspektif budaya yang tidak bisa didapat dari hotel mewah.", "Keamanan dan kenyamanan tetap menjadi prioritas utama saat bepergian. Persiapan yang matang termasuk asuransi perjalanan dan dokumen lengkap sangat disarankan."],
    tags: "travel, wisata, liburan, destinasi, backpacking",
  },
  Makanan: {
    titles: ["Resep Masakan Nusantara yang Mudah untuk Pemula", "Street Food Indonesia yang Mendunia", "Panduan Lengkap Membuat Rendang Autentik", "Tren Kuliner Sehat: Menu Makan Siang Bergizi", "Kopi Indonesia: Dari Biji hingga Cangkir"],
    imageKeyword: "indonesian food cooking",
    paragraphs: ["Kuliner Indonesia dikenal sebagai salah satu yang terkaya di dunia. Dengan ribuan resep tradisional dari Sabang sampai Merauke, warisan kuliner nusantara tak pernah habis untuk dieksplorasi.", "Memasak di rumah tidak harus rumit. Dengan bahan-bahan segar dan teknik dasar yang tepat, siapa pun bisa menyajikan hidangan lezat untuk keluarga.", "Tren makanan sehat semakin diminati masyarakat urban. Mengganti bahan olahan dengan bahan alami dan organik menjadi pilihan cerdas untuk kesehatan jangka panjang.", "Street food Indonesia memiliki cita rasa yang unik dan autentik. Dari sate, bakso, hingga nasi goreng, jajanan kaki lima menjadi bagian tak terpisahkan dari budaya kuliner kita.", "Kopi Indonesia termasuk yang terbaik di dunia. Dari kopi Gayo, Toraja, hingga Kintamani, setiap daerah menghasilkan karakter rasa yang berbeda dan istimewa."],
    tags: "makanan, kuliner, resep, masakan, food",
  },
  Fashion: {
    titles: ["Tren Fashion Terkini yang Wajib Dicoba Tahun Ini", "Mix and Match: Panduan Berpakaian Stylish dengan Budget Terbatas", "Sustainable Fashion: Gaya Ramah Lingkungan", "Panduan Memilih Outfit untuk Berbagai Acara Formal", "Aksesoris yang Bisa Mengubah Total Penampilan Anda"],
    imageKeyword: "fashion style clothing",
    paragraphs: ["Dunia fashion terus berevolusi mengikuti perkembangan zaman. Tren terbaru menggabungkan unsur kenyamanan dengan estetika, menciptakan gaya yang fungsional namun tetap stylish.", "Mix and match adalah kunci untuk tampil menarik tanpa harus menghabiskan banyak uang. Kreativitas dalam memadukan pakaian yang sudah dimiliki bisa menghasilkan look yang segar.", "Sustainable fashion menjadi gerakan yang semakin kuat di industri mode. Memilih pakaian berkualitas yang tahan lama lebih baik daripada membeli fast fashion yang cepat rusak.", "Memahami bentuk tubuh sendiri adalah langkah pertama untuk berpakaian dengan percaya diri. Setiap orang memiliki keunikan yang bisa ditonjolkan melalui pilihan busana yang tepat.", "Aksesoris memiliki kekuatan untuk mengubah total penampilan. Sebuah tas, jam tangan, atau perhiasan yang tepat bisa mengangkat outfit sederhana menjadi terlihat premium."],
    tags: "fashion, gaya, pakaian, tren mode, outfit",
  },
  Olahraga: {
    titles: ["Panduan Latihan Gym untuk Pemula: Dari Mana Harus Mulai", "Lari Pagi: Manfaat dan Tips untuk Konsistensi", "Sepak Bola Indonesia: Perkembangan dan Tantangan Terkini", "Yoga untuk Pemula: Gerakan Dasar dan Manfaatnya", "Nutrisi Tepat untuk Meningkatkan Performa Olahraga"],
    imageKeyword: "sports fitness gym",
    paragraphs: ["Olahraga teratur adalah kunci untuk menjaga tubuh tetap bugar dan sehat. Tidak perlu menjadi atlet profesional untuk merasakan manfaat luar biasa dari aktivitas fisik rutin.", "Memulai program latihan baru memerlukan perencanaan yang baik. Mulailah dari intensitas ringan dan tingkatkan secara bertahap untuk menghindari cedera dan menjaga motivasi.", "Sepak bola tetap menjadi olahraga paling populer di Indonesia. Liga domestik terus berkembang dan pemain-pemain muda berbakat bermunculan dari berbagai daerah.", "Yoga bukan hanya tentang fleksibilitas, tetapi juga keseimbangan mental dan spiritual. Praktik ini telah terbukti mengurangi stres dan meningkatkan kualitas hidup secara menyeluruh.", "Nutrisi yang tepat sama pentingnya dengan latihan itu sendiri. Kombinasi protein, karbohidrat kompleks, dan hidrasi yang cukup dapat meningkatkan performa secara signifikan."],
    tags: "olahraga, fitness, gym, latihan, kesehatan",
  },
  Pendidikan: {
    titles: ["Metode Belajar Efektif untuk Pelajar dan Mahasiswa", "E-Learning: Revolusi Pendidikan di Era Digital", "Tips Memilih Jurusan Kuliah yang Tepat", "Beasiswa Luar Negeri: Panduan Lengkap untuk Pelamar", "Pentingnya Soft Skills dalam Dunia Kerja Modern"],
    imageKeyword: "education student learning",
    paragraphs: ["Pendidikan adalah fondasi utama untuk membangun masa depan yang cerah. Dengan metode belajar yang tepat, setiap siswa dapat mengoptimalkan potensi akademik mereka.", "E-learning telah merevolusi cara kita mengakses pendidikan. Platform pembelajaran online memungkinkan siapa saja belajar dari mana saja, kapan saja, dengan biaya yang lebih terjangkau.", "Memilih jurusan kuliah yang tepat adalah keputusan penting yang mempengaruhi karir di masa depan. Kenali minat, bakat, dan prospek kerja sebelum menentukan pilihan.", "Beasiswa membuka pintu kesempatan bagi pelajar berprestasi untuk menempuh pendidikan berkualitas. Persiapan dokumen dan esai yang matang meningkatkan peluang diterima.", "Soft skills seperti komunikasi, kepemimpinan, dan kerja tim semakin dihargai di dunia kerja. Kemampuan teknis saja tidak cukup tanpa kemampuan interpersonal yang baik."],
    tags: "pendidikan, belajar, kuliah, beasiswa, karir",
  },
  Berita: {
    titles: ["Perkembangan Ekonomi Indonesia di Kuartal Terbaru", "Kebijakan Baru Pemerintah yang Berdampak pada Masyarakat", "Isu Lingkungan: Tantangan dan Solusi untuk Indonesia", "Perkembangan Geopolitik Global dan Dampaknya bagi ASEAN", "Inovasi Startup Indonesia yang Menarik Perhatian Dunia"],
    imageKeyword: "newspaper press conference",
    paragraphs: ["Perkembangan ekonomi Indonesia menunjukkan tren yang positif meskipun menghadapi berbagai tantangan global. Pertumbuhan GDP dan investasi asing terus meningkat.", "Kebijakan pemerintah terbaru bertujuan untuk meningkatkan kesejahteraan masyarakat dan mendorong pertumbuhan ekonomi yang inklusif dan berkelanjutan.", "Isu lingkungan menjadi perhatian serius yang memerlukan aksi nyata dari semua pihak. Perubahan iklim dan polusi udara berdampak langsung pada kualitas hidup masyarakat.", "Dinamika geopolitik global mempengaruhi stabilitas dan peluang ekonomi di kawasan ASEAN. Indonesia sebagai negara terbesar di kawasan memiliki peran strategis.", "Ekosistem startup Indonesia terus berkembang pesat. Inovasi di bidang fintech, e-commerce, dan healthtech menarik perhatian investor global."],
    tags: "berita, ekonomi, politik, indonesia, terkini",
  },
  Otomotif: {
    titles: ["Mobil Listrik di Indonesia: Tren dan Rekomendasi Terbaik", "Tips Merawat Mobil Agar Tetap Prima di Musim Hujan", "Perbandingan SUV Terpopuler di Indonesia", "Motor Matic vs Manual: Kelebihan dan Kekurangan", "Teknologi Keselamatan Kendaraan Modern yang Wajib Diketahui"],
    imageKeyword: "car automotive vehicle",
    paragraphs: ["Industri otomotif Indonesia terus berkembang pesat dengan hadirnya berbagai model kendaraan baru. Tren mobil listrik dan hybrid semakin diminati konsumen yang peduli lingkungan.", "Perawatan kendaraan secara rutin adalah investasi yang menghemat biaya jangka panjang. Pengecekan berkala pada mesin, rem, dan ban memastikan keamanan berkendara.", "SUV menjadi segmen paling populer di pasar otomotif Indonesia. Kombinasi ruang kabin luas, ground clearance tinggi, dan fitur modern menjadi daya tarik utama.", "Pilihan antara motor matic dan manual tergantung pada kebutuhan dan preferensi pengendara. Matic lebih praktis di kemacetan, sementara manual menawarkan kontrol lebih.", "Teknologi keselamatan modern seperti ABS, airbag, dan sistem peringatan tabrakan telah menyelamatkan banyak nyawa di jalan raya."],
    tags: "otomotif, mobil, motor, kendaraan, teknologi",
  },
  Properti: {
    titles: ["Panduan Membeli Rumah Pertama untuk Generasi Milenial", "Investasi Properti: Apartemen vs Rumah Tapak", "Tips Mendesain Interior Rumah Minimalis Modern", "Kawasan Perumahan Terbaik di Jabodetabek", "KPR vs Cash: Strategi Cerdas Membeli Hunian"],
    imageKeyword: "real estate house interior",
    paragraphs: ["Memiliki rumah sendiri adalah impian banyak orang Indonesia. Dengan perencanaan keuangan yang tepat dan pemahaman pasar properti, impian ini bisa diwujudkan.", "Investasi properti tetap menjadi pilihan menarik untuk jangka panjang. Nilai properti cenderung meningkat seiring waktu, menjadikannya aset yang menguntungkan.", "Desain interior minimalis modern semakin diminati karena efisiensi ruang dan estetika yang bersih. Prinsip less is more menjadi panduan utama.", "Lokasi strategis adalah faktor terpenting dalam memilih hunian. Kedekatan dengan transportasi publik, sekolah, dan fasilitas komersial meningkatkan nilai properti.", "KPR memberikan kesempatan memiliki rumah tanpa harus menunggu tabungan cukup. Namun perhitungan bunga dan tenor yang tepat sangat penting."],
    tags: "properti, rumah, investasi, interior, KPR",
  },
  Hiburan: {
    titles: ["Film Indonesia yang Merajai Box Office Tahun Ini", "Rekomendasi Series Netflix yang Wajib Ditonton", "Konser Musik Terbesar yang Akan Digelar di Indonesia", "Game Mobile Terpopuler dan Tips Bermainnya", "Podcast Indonesia yang Menghibur dan Mengedukasi"],
    imageKeyword: "entertainment movie concert",
    paragraphs: ["Industri hiburan Indonesia mengalami pertumbuhan luar biasa. Film lokal semakin berkualitas dan mampu bersaing dengan produksi internasional di box office.", "Streaming platform telah mengubah cara kita menikmati hiburan. Akses mudah ke ribuan konten berkualitas membuat penonton memiliki lebih banyak pilihan dari sebelumnya.", "Konser musik internasional di Indonesia semakin sering digelar. Antusiasme penonton Indonesia menjadikan negara ini destinasi tur yang menarik bagi artis global.", "Gaming mobile menjadi industri bernilai miliaran dolar. Game-game populer tidak hanya menghibur tetapi juga membangun komunitas dan bahkan menjadi sumber penghasilan.", "Podcast berkembang sebagai medium yang unik untuk berbagi cerita dan pengetahuan. Format audio ini cocok untuk dinikmati saat berkendara atau berolahraga."],
    tags: "hiburan, film, musik, game, streaming",
  },
  Bisnis: {
    titles: ["Strategi UMKM untuk Bertahan dan Berkembang di Era Digital", "Panduan Memulai Bisnis Online dengan Modal Minim", "Leadership: Kualitas Kepemimpinan yang Dibutuhkan Saat Ini", "Digital Marketing: Strategi Efektif untuk Meningkatkan Penjualan", "Franchise vs Bisnis Mandiri: Mana yang Lebih Menguntungkan?"],
    imageKeyword: "business meeting office",
    paragraphs: ["Dunia bisnis terus berevolusi seiring perkembangan teknologi dan perubahan perilaku konsumen. Adaptasi cepat menjadi kunci keberlangsungan usaha di era modern.", "UMKM menjadi tulang punggung ekonomi Indonesia. Dengan digitalisasi dan akses pasar online, pelaku usaha kecil kini bisa menjangkau konsumen di seluruh nusantara.", "Digital marketing telah menjadi keharusan bagi setiap bisnis. Media sosial, SEO, dan content marketing memberikan ROI yang lebih terukur dibandingkan pemasaran konvensional.", "Kepemimpinan yang efektif membutuhkan kemampuan komunikasi, empati, dan visi yang jelas. Pemimpin yang baik menginspirasi timnya untuk mencapai tujuan bersama.", "Memilih antara franchise dan bisnis mandiri memerlukan analisis mendalam. Franchise menawarkan sistem yang sudah teruji, sementara bisnis mandiri memberikan kebebasan penuh."],
    tags: "bisnis, UMKM, marketing, startup, entrepreneur",
  },
  "Seni & Budaya": {
    titles: ["Seni Batik Indonesia: Warisan Budaya yang Mendunia", "Festival Budaya Terbesar di Indonesia yang Wajib Dikunjungi", "Seniman Muda Indonesia yang Menginspirasi Dunia", "Arsitektur Tradisional Nusantara dan Filosofinya", "Seni Pertunjukan Indonesia: Dari Wayang hingga Teater Modern"],
    imageKeyword: "art culture traditional",
    paragraphs: ["Indonesia memiliki kekayaan seni dan budaya yang luar biasa beragam. Dari Sabang sampai Merauke, setiap daerah memiliki keunikan budaya yang menjadi identitas bangsa.", "Batik sebagai warisan budaya dunia terus berkembang dan diadaptasi dalam mode kontemporer. Motif-motif tradisional dipadukan dengan desain modern menciptakan karya yang memukau.", "Seniman muda Indonesia semakin berani mengekspresikan ide-ide mereka di kancah internasional. Karya seni digital, instalasi, dan seni rupa kontemporer mendapat apresiasi global.", "Arsitektur tradisional nusantara bukan hanya tentang estetika, tetapi juga mengandung filosofi dan kearifan lokal yang dalam. Setiap bentuk dan ornamen memiliki makna tersendiri.", "Seni pertunjukan Indonesia terus berevolusi. Kolaborasi antara seni tradisional dan modern menghasilkan pertunjukan yang relevan bagi penonton masa kini."],
    tags: "seni, budaya, tradisional, batik, festival",
  },
  Lifestyle: {
    titles: ["Gaya Hidup Minimalis: Lebih Sedikit Lebih Bermakna", "Morning Routine yang Akan Mengubah Produktivitas Anda", "Self-Care: Panduan Merawat Diri di Tengah Kesibukan", "Tren Coffee Shop dan Budaya Ngopi di Indonesia", "Work-Life Balance: Menyeimbangkan Karir dan Kehidupan Pribadi"],
    imageKeyword: "lifestyle coffee minimalist",
    paragraphs: ["Gaya hidup minimalis bukan tentang kekurangan, tetapi tentang memilih apa yang benar-benar bernilai. Dengan mengurangi hal-hal yang tidak esensial, kita bisa fokus pada yang penting.", "Morning routine yang konsisten dapat mengubah produktivitas sepanjang hari. Bangun lebih awal, meditasi, dan olahraga ringan adalah kebiasaan yang direkomendasikan para ahli.", "Self-care adalah investasi terpenting yang bisa kita lakukan untuk diri sendiri. Meluangkan waktu untuk istirahat dan relaksasi bukan egois, melainkan kebutuhan.", "Budaya ngopi di Indonesia telah berevolusi menjadi gaya hidup tersendiri. Coffee shop bukan hanya tempat minum kopi, tetapi juga ruang kerja, sosialisasi, dan ekspresi diri.", "Menyeimbangkan karir dan kehidupan pribadi memerlukan disiplin dalam menetapkan batasan. Teknologi yang seharusnya membantu justru sering mengaburkan batas antara kerja dan istirahat."],
    tags: "lifestyle, gaya hidup, self-care, produktivitas, minimalis",
  },
  General: {
    titles: ["Tren Terbaru yang Perlu Anda Ketahui Tahun Ini", "Panduan Praktis untuk Meningkatkan Kualitas Hidup", "Tips Produktivitas yang Terbukti Efektif", "Inovasi yang Mengubah Kehidupan Sehari-hari", "Membangun Kebiasaan Positif untuk Masa Depan Lebih Baik"],
    imageKeyword: "city modern lifestyle",
    paragraphs: ["Di era modern ini, perubahan terjadi sangat cepat. Kemampuan beradaptasi dan terus belajar menjadi kunci untuk tetap relevan dan sukses di berbagai bidang.", "Banyak orang mencari cara meningkatkan produktivitas. Dengan strategi yang tepat, kita bisa menyelesaikan lebih banyak pekerjaan tanpa mengorbankan kualitas.", "Membangun kebiasaan positif membutuhkan konsistensi. Penelitian menunjukkan dibutuhkan rata-rata 66 hari untuk membentuk kebiasaan baru yang bertahan lama.", "Kolaborasi dan networking semakin penting di dunia profesional. Hubungan yang kuat dengan rekan kerja dan profesional lain membuka peluang baru yang tak terduga.", "Keseimbangan kehidupan pribadi dan profesional tetap menjadi tantangan. Menetapkan batasan jelas dan memprioritaskan kesejahteraan diri adalah langkah awal yang penting."],
    tags: "tips, panduan, produktivitas, gaya hidup, informasi",
  },
}

const AUTHOR_NAMES = [
  "Rina Puspitasari", "Ahmad Fauzi", "Dewi Lestari", "Budi Santoso",
  "Siti Nurhaliza", "Raden Pratama", "Maya Indah", "Fikri Ramadhan",
  "Anisa Rahmawati", "Denny Kurniawan", "Putri Wulandari", "Hendra Wijaya",
  "Laras Setiawan", "Fajar Nugroho", "Dian Permata", "Rizky Aditya",
]

// Pexels search keywords per genre
const GENRE_KEYWORDS: Record<string, string[]> = {
  Teknologi: ["technology", "computer", "coding", "laptop", "digital"],
  Kesehatan: ["health", "fitness", "healthy food", "yoga", "wellness"],
  Keuangan: ["business finance", "money", "investment", "office meeting", "stock market"],
  Travel: ["travel", "beach", "mountain", "adventure", "tourism"],
  Makanan: ["food", "cooking", "restaurant", "cuisine", "recipe"],
  Fashion: ["fashion", "style", "clothing", "outfit", "model"],
  Olahraga: ["sports", "fitness", "running", "football", "gym"],
  Pendidikan: ["education", "student", "learning", "school", "book"],
  Berita: ["news", "newspaper", "press", "journalism", "media"],
  Otomotif: ["car", "automotive", "vehicle", "motorcycle", "road"],
  Properti: ["real estate", "house", "architecture", "building", "interior"],
  Hiburan: ["entertainment", "music", "movie", "concert", "party"],
  Bisnis: ["business", "corporate", "entrepreneur", "startup", "teamwork"],
  "Seni & Budaya": ["art", "culture", "painting", "museum", "creative"],
  Lifestyle: ["lifestyle", "coffee", "minimalist", "home decor", "morning routine"],
  General: ["city", "people", "work", "nature", "landscape"],
}

/**
 * Fetch a relevant image from Pexels API, fallback to Picsum
 */
async function fetchImage(genre: string, query?: string): Promise<string> {
  const apiKey = process.env.PEXELS_API_KEY;

  if (apiKey) {
    try {
      const keywords = GENRE_KEYWORDS[genre] || GENRE_KEYWORDS["General"];
      const searchQuery = query || keywords[Math.floor(Math.random() * keywords.length)];

      const res = await fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(searchQuery)}&per_page=15&page=1`,
        {
          headers: { Authorization: apiKey },
          signal: AbortSignal.timeout(8000),
        }
      );

      if (res.ok) {
        const data = await res.json();
        if (data.photos && data.photos.length > 0) {
          // Pick a random photo from results
          const photo = data.photos[Math.floor(Math.random() * data.photos.length)];
          return photo.src.large2x || photo.src.large || photo.src.original;
        }
      }
    } catch {
      // Fall through to Picsum
    }
  }

  // Fallback: Picsum (always works)
  const seed = Math.floor(Math.random() * 800) + 100;
  return `https://picsum.photos/seed/${seed}/1200/630`;
}

async function generateMockArticle(genre: string, wordTarget: number): Promise<{
  title: string; content: string; excerpt: string; tags: string; authorName: string; featuredImage: string
}> {
  const data = MOCK_DATA[genre] || MOCK_DATA["General"]

  const title = data.titles[Math.floor(Math.random() * data.titles.length)]
  const authorName = AUTHOR_NAMES[Math.floor(Math.random() * AUTHOR_NAMES.length)]

  // Fetch relevant image from Pexels using genre-specific keyword
  const featuredImage = await fetchImage(genre, data.imageKeyword)

  // Build well-formatted SEO content
  const shuffled = [...data.paragraphs].sort(() => Math.random() - 0.5)
  const subheadings = [
    "Mengapa Ini Penting?", "Apa yang Perlu Diketahui?", "Langkah-Langkah Praktis",
    "Tips dan Strategi yang Terbukti Efektif", "Analisis Mendalam",
    "Panduan Lengkap untuk Pemula", "Fakta Menarik yang Jarang Diketahui", "Perspektif Para Ahli",
  ].sort(() => Math.random() - 0.5)

  const listItems: string[][] = [
    [
      "Peningkatan <strong>efisiensi dan produktivitas</strong> secara signifikan dalam jangka pendek maupun panjang",
      "Pengurangan <strong>biaya operasional</strong> yang berdampak langsung pada profitabilitas",
      "Peningkatan <strong>kualitas layanan</strong> dan kepuasan pelanggan secara menyeluruh",
      "Akselerasi pertumbuhan dan <strong>inovasi berkelanjutan</strong> di berbagai lini",
    ],
    [
      "Lakukan riset mendalam sebelum mengambil keputusan besar",
      "Konsultasikan dengan <strong>ahli yang berpengalaman</strong> di bidangnya",
      "Evaluasi secara berkala untuk memastikan <strong>strategi tetap relevan</strong>",
      "Gunakan <strong>data dan analitik</strong> sebagai dasar pengambilan keputusan",
      "Jangan ragu untuk melakukan <em>pivoting</em> ketika diperlukan",
    ],
  ]

  let content = ""
  let wordCount = 0
  let paraIdx = 0
  let headIdx = 0

  // ── Featured image ──
  content += `<figure style="margin-bottom: 2em;">\n`
  content += `  <img src="${featuredImage}" alt="${title}" style="width: 100%; height: auto; border-radius: 12px; object-fit: cover;" />\n`
  content += `</figure>\n\n`

  // ── Intro paragraph (slightly longer, sets the tone) ──
  content += `<p style="font-size: 1.1em; line-height: 1.8; margin-bottom: 1.5em;">${shuffled[0]}</p>\n\n`
  wordCount += shuffled[0].split(/\s+/).length

  // ── Body sections ──
  while (wordCount < wordTarget && paraIdx < 20) {
    paraIdx++
    const para = shuffled[paraIdx % shuffled.length]
    const extraPara = data.paragraphs[paraIdx % data.paragraphs.length]

    // Add H2 heading every 2 paragraphs
    if (paraIdx % 2 === 1 && headIdx < subheadings.length) {
      content += `<h2 style="font-size: 1.5em; font-weight: 700; margin-top: 2em; margin-bottom: 0.8em; color: #1a202c;">${subheadings[headIdx]}</h2>\n\n`
      headIdx++
    }

    // Main paragraph with bold key phrases
    const boldPara = para.replace(
      /(\w{5,}\s+\w{5,}\s+\w{5,})/,
      "<strong>$1</strong>"
    )
    content += `<p style="line-height: 1.8; margin-bottom: 1.2em;">${boldPara}</p>\n\n`
    wordCount += para.split(/\s+/).length

    // Second paragraph if needed
    if (wordCount < wordTarget) {
      content += `<p style="line-height: 1.8; margin-bottom: 1.2em;">${extraPara}</p>\n\n`
      wordCount += extraPara.split(/\s+/).length
    }

    // Add a sub-heading (H3) with a short tip paragraph
    if (paraIdx % 3 === 0 && wordCount < wordTarget) {
      const tipTexts = [
        "Menurut berbagai penelitian terbaru, pendekatan ini telah terbukti memberikan hasil yang <em>konsisten dan terukur</em> dalam berbagai situasi.",
        "Para praktisi berpengalaman menyarankan untuk memulai dari langkah-langkah kecil namun <em>konsisten</em>, daripada mencoba melakukan perubahan besar sekaligus.",
        "Penting untuk diingat bahwa <em>setiap situasi memiliki konteks yang berbeda</em>. Adaptasi strategi sesuai kondisi spesifik sangat disarankan.",
      ]
      const tip = tipTexts[paraIdx % tipTexts.length]
      content += `<h3 style="font-size: 1.2em; font-weight: 600; margin-top: 1.5em; margin-bottom: 0.6em; color: #2d3748;">Tip Penting</h3>\n\n`
      content += `<p style="line-height: 1.8; margin-bottom: 1.2em; padding-left: 1em; border-left: 3px solid #e2e8f0;">${tip}</p>\n\n`
      wordCount += tip.replace(/<[^>]+>/g, "").split(/\s+/).length
    }

    // Add bullet list every 4 paragraphs
    if (paraIdx % 4 === 0 && wordCount < wordTarget) {
      const items = listItems[paraIdx % listItems.length]
      content += `<ul style="margin: 1.2em 0; padding-left: 1.5em;">\n`
      for (const item of items) {
        content += `  <li style="line-height: 1.7; margin-bottom: 0.5em;">${item}</li>\n`
        wordCount += item.replace(/<[^>]+>/g, "").split(/\s+/).length
      }
      content += `</ul>\n\n`
    }

    // Add inline image every 5 paragraphs
    if (paraIdx % 5 === 0 && wordCount < wordTarget) {
      const inlineImage = await fetchImage(genre)
      content += `<figure style="margin: 2em 0;">\n`
      content += `  <img src="${inlineImage}" alt="Ilustrasi" style="width: 100%; height: auto; border-radius: 8px; object-fit: cover;" />\n`
      content += `  <figcaption style="text-align: center; font-size: 0.85em; color: #718096; margin-top: 0.5em; font-style: italic;">Ilustrasi terkait pembahasan</figcaption>\n`
      content += `</figure>\n\n`
    }
  }

  // ── Natural closing (no "Kesimpulan" heading) ──
  const closings = [
    `<p style="line-height: 1.8; margin-bottom: 1.2em;">Pada akhirnya, semua kembali pada <strong>konsistensi dan kemauan untuk terus belajar</strong>. Tidak ada jalan pintas, tetapi setiap langkah kecil yang diambil hari ini akan membawa perbedaan besar di masa depan.</p>\n`,
    `<p style="line-height: 1.8; margin-bottom: 1.2em;">Yang terpenting adalah <strong>memulai dari sekarang</strong>, sekecil apa pun langkahnya. Dunia terus bergerak maju, dan mereka yang berani mengambil tindakan akan selalu selangkah lebih depan.</p>\n`,
    `<p style="line-height: 1.8; margin-bottom: 1.2em;">Semoga informasi di atas bisa menjadi <strong>referensi yang bermanfaat</strong> untuk Anda. Jangan ragu untuk terus mengeksplorasi dan menemukan pendekatan yang paling sesuai dengan kebutuhan Anda.</p>\n`,
    `<p style="line-height: 1.8; margin-bottom: 1.2em;">Apapun pilihan yang diambil, pastikan untuk <strong>selalu melakukan riset terlebih dahulu</strong> dan mempertimbangkan berbagai faktor sebelum mengambil keputusan. Dengan begitu, hasilnya akan lebih optimal dan sesuai harapan.</p>\n`,
  ]
  content += closings[Math.floor(Math.random() * closings.length)]

  const excerpt = shuffled[0].slice(0, 150) + "..."

  return { title, content, excerpt, tags: data.tags, authorName, featuredImage }
}

/**
 * Humanize content — break AI detection patterns
 * Removes common AI phrases, varies structure, adds natural Indonesian voice
 */
function humanizeContent(html: string): string {
  let content = html

  // ── 1. Remove common AI marker phrases (Indonesian) ──
  const aiPhrases = [
    /\b(Penting untuk dicatat bahwa|Perlu digarisbawahi bahwa|Menariknya,|Yang menarik adalah)/gi,
    /\b(Secara keseluruhan,|Pada intinya,|Dengan kata lain,|Sebagai kesimpulan,)/gi,
    /\b(Tidak dapat dipungkiri bahwa|Tak bisa disangkal bahwa)/gi,
    /\b(Mari kita telusuri|Mari kita bahas|Mari kita eksplorasi)/gi,
    /\b(Dalam konteks ini,|Dalam hal ini,|Sejalan dengan itu,)/gi,
    /\b(sangat krusial|sangat signifikan|sangat fundamental)/gi,
    /\b(memberikan dampak yang signifikan)/gi,
    /\b(merupakan hal yang tidak bisa diabaikan)/gi,
  ]
  for (const pattern of aiPhrases) {
    content = content.replace(pattern, "")
  }

  // ── 2. Replace overused AI transition words ──
  const replacements: [RegExp, string[]][] = [
    [/\bSelain itu,/g, ["Terus,", "Nah,", "Oh iya,", "Satu lagi,", ""]],
    [/\bNamun demikian,/g, ["Tapi ya,", "Cuma,", "Sayangnya,", "Tapi,"]],
    [/\bOleh karena itu,/g, ["Jadi,", "Makanya,", "Ya jadinya,", "Karena itu,"]],
    [/\bDi sisi lain,/g, ["Tapi di sisi lain,", "Kalau dari sisi lain,", "Beda cerita kalau,"]],
    [/\bDengan demikian,/g, ["Jadi intinya,", "Nah jadi,", "Ya pada akhirnya,"]],
    [/\bLebih lanjut,/g, ["Terus lagi,", "Nah selain itu,", ""]],
    [/\bBerdasarkan data,/g, ["Dari data yang ada,", "Kalau lihat datanya,"]],
    [/\bPerlu diketahui bahwa/g, ["Yang perlu diketahui,", "FYI aja,", "Buat info,"]],
  ]
  for (const [pattern, options] of replacements) {
    content = content.replace(pattern, () => options[Math.floor(Math.random() * options.length)])
  }

  // ── 3. Break uniform paragraph lengths — split overly long paragraphs ──
  content = content.replace(/<p([^>]*)>([\s\S]*?)<\/p>/g, (match, attrs, text) => {
    const plainText = text.replace(/<[^>]+>/g, "")
    const words = plainText.split(/\s+/)
    // If paragraph is very long (80+ words), randomly split it
    if (words.length > 80 && Math.random() > 0.4) {
      const midpoint = Math.floor(words.length * (0.4 + Math.random() * 0.2))
      // Find the nearest sentence boundary
      const sentences = text.split(/(?<=[.!?])\s+/)
      let charCount = 0
      let splitIdx = 0
      const targetChars = words.slice(0, midpoint).join(" ").length
      for (let i = 0; i < sentences.length; i++) {
        charCount += sentences[i].length
        if (charCount >= targetChars) { splitIdx = i + 1; break }
      }
      if (splitIdx > 0 && splitIdx < sentences.length) {
        const first = sentences.slice(0, splitIdx).join(" ")
        const second = sentences.slice(splitIdx).join(" ")
        return `<p${attrs}>${first}</p>\n<p${attrs}>${second}</p>`
      }
    }
    return match
  })

  // ── 4. Randomly add casual Indonesian filler phrases ──
  const fillers = [
    "Gini loh,", "Nah,", "Sebenernya,", "Jujur aja,",
    "Kalau menurut gue sih,", "Yang jelas,", "Buat yang belum tahu,",
  ]
  // Add filler to ~15% of paragraphs
  content = content.replace(/<p([^>]*)>/g, (match, attrs) => {
    if (Math.random() < 0.15) {
      const filler = fillers[Math.floor(Math.random() * fillers.length)]
      return `<p${attrs}>${filler} `
    }
    return match
  })

  // ── 5. Remove double spaces and clean up ──
  content = content.replace(/  +/g, " ")
  content = content.replace(/\n{3,}/g, "\n\n")

  return content
}

/**
 * Scrape headlines from a news source homepage
 */
async function scrapeHeadlines(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return "";

    const html = await res.text();

    const headlines: string[] = [];

    const titleMatches = html.matchAll(/<(h1|h2|h3|h4)[^>]*>([\s\S]*?)<\/\1>/gi);
    for (const m of titleMatches) {
      const text = m[2].replace(/<[^>]+>/g, "").trim();
      if (text.length > 15 && text.length < 200) {
        headlines.push(text);
      }
    }

    const linkMatches = html.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi);
    for (const m of linkMatches) {
      const text = m[1].replace(/<[^>]+>/g, "").trim();
      if (text.length > 20 && text.length < 200 && !text.includes("{") && !text.includes("//")) {
        headlines.push(text);
      }
    }

    const unique = [...new Set(headlines)].slice(0, 30);
    return unique.join("\n");
  } catch {
    return "";
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { topic, newsSource, language, wordCount, genre } = body;

    const lang = language || "Indonesia";
    const targetWords = wordCount || 1200;
    const niche = genre || "General";

    // ── Try real Gemini API first ──
    if (process.env.GEMINI_API_KEY) {
      try {
        let topicInstruction = "";

        if (topic) {
          topicInstruction = `Write about this topic: "${topic}"`;
        } else if (newsSource) {
          const headlines = await scrapeHeadlines(newsSource);

          if (headlines) {
            topicInstruction = `I scraped these headlines from a news website. Pick ONE headline that best matches the "${niche}" niche, then write a completely original article inspired by that topic.\n\nHeadlines found:\n${headlines}\n\nIMPORTANT: Do NOT copy the headline directly. Create your own unique title and write original content about the same topic.`;
          }
        }

        if (topicInstruction) {
          const prompt = `Kamu adalah blogger Indonesia biasa yang nulis di blog pribadi tentang "${niche}". Kamu BUKAN AI — kamu orang biasa yang sharing pengalaman dan opini.

${topicInstruction}

ATURAN PENTING (anti AI detection):
- Tulis sekitar ${targetWords} kata
- Pakai HTML (h2, h3, p, ul, li, strong, em). JANGAN pakai html/head/body/h1
- JANGAN pakai kata-kata khas AI: "crucial", "delve", "landscape", "it's important to note", "signifikan", "krusial", "fundamental", "komprehensif", "berkelanjutan"
- JANGAN pakai transisi formal berlebihan: "Selain itu", "Namun demikian", "Oleh karena itu", "Dengan demikian", "Di sisi lain", "Lebih lanjut"
- Campur bahasa formal dan santai — kadang pakai "gue/lo", kadang pakai "saya/Anda", kadang pakai "kita"
- Variasi panjang kalimat: ada yang pendek (3-5 kata), ada yang panjang. Jangan seragam
- Kadang mulai kalimat dengan "Dan", "Tapi", "Soalnya", "Eh ternyata"
- Boleh ada 1-2 kalimat yang grammarnya kurang sempurna — manusia gak selalu nulis perfect
- Masukkan 1-2 opini pribadi atau pengalaman fiktif ("gue pernah coba ini dan...")
- JANGAN buat paragraf yang panjangnya sama semua
- Subheading boleh santai, gak harus formal
- Tulis dalam Bahasa ${lang}, campur sedikit slang Jakarta

Format JSON (tanpa markdown, tanpa code fences):
{
  "title": "Judul artikel dalam Bahasa ${lang}",
  "content": "<h2>...</h2><p>...</p>...",
  "excerpt": "Ringkasan 1-2 kalimat",
  "tags": "tag1, tag2, tag3",
  "authorName": "Nama author Indonesia yang realistis"
}`;

          const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });
          const result = await model.generateContent(prompt);
          const text = result.response.text();

          let jsonText = text.trim();
          if (jsonText.startsWith("```")) {
            jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
          }

          const article = JSON.parse(jsonText);

          // Fetch relevant image for AI mode too
          const aiFeaturedImage = await fetchImage(niche);

          return NextResponse.json({
            title: article.title,
            content: humanizeContent(article.content),
            excerpt: article.excerpt,
            tags: article.tags,
            authorName: article.authorName,
            featuredImage: aiFeaturedImage,
            mode: "ai",
          });
        }
      } catch (aiError) {
        console.warn("Gemini API failed, falling back to mock mode:", aiError);
        // Fall through to mock mode
      }
    }

    // ── Mock mode fallback ──
    // Small delay to simulate AI generation
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const article = await generateMockArticle(niche, targetWords);

    return NextResponse.json({
      title: article.title,
      content: humanizeContent(article.content),
      excerpt: article.excerpt,
      tags: article.tags,
      authorName: article.authorName,
      featuredImage: article.featuredImage,
      mode: "mock",
    });
  } catch (error) {
    console.error("AI generation failed:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Gagal generate artikel: ${message}` },
      { status: 500 }
    );
  }
}
