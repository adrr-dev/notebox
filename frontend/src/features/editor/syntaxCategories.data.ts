/**
 * Kamus referensi sintaks LaTeX/KaTeX.
 * Diekstrak dari versi lama RI3D_Cabang22_Tahap5 (baris 7100 ss.).
 */
export interface SyntaxItem { readonly code: string; readonly desc: string }
export interface SyntaxCategory { readonly name: string; readonly items: readonly SyntaxItem[] }

export const SYNTAX_CATEGORIES: readonly SyntaxCategory[] = [
                {
                    name: 'Operator Dasar',
                    items: [
                        { code: '+', desc: 'Penjumlahan' },
                        { code: '-', desc: 'Pengurangan' },
                        { code: '\\times', desc: 'Perkalian (×)' },
                        { code: '\\div', desc: 'Pembagian (÷)' },
                        { code: '\\cdot', desc: 'Perkalian titik tengah (·)' },
                        { code: '\\pm', desc: 'Plus-minus (±)' },
                        { code: '\\mp', desc: 'Minus-plus (∓)' },
                        { code: '\\circ', desc: 'Komposisi fungsi (∘)' },
                    ],
                },
                {
                    name: 'Pecahan, Akar & Pangkat',
                    items: [
                        { code: '\\frac{a}{b}', desc: 'Pecahan a per b' },
                        { code: '\\dfrac{a}{b}', desc: 'Pecahan ukuran besar (display)' },
                        { code: '\\sqrt{x}', desc: 'Akar kuadrat dari x' },
                        { code: '\\sqrt[n]{x}', desc: 'Akar pangkat ke-n dari x' },
                        { code: 'x^{n}', desc: 'Pangkat / eksponen' },
                        { code: 'x_{i}', desc: 'Indeks bawah (subscript)' },
                        { code: 'x_{i}^{2}', desc: 'Gabungan indeks bawah & pangkat' },
                    ],
                },
                {
                    name: 'Huruf Yunani Kecil',
                    items: [
                        { code: '\\alpha', desc: 'Alfa (α)' },
                        { code: '\\beta', desc: 'Beta (β)' },
                        { code: '\\gamma', desc: 'Gamma kecil (γ)' },
                        { code: '\\delta', desc: 'Delta kecil (δ)' },
                        { code: '\\theta', desc: 'Theta (θ)' },
                        { code: '\\lambda', desc: 'Lambda (λ)' },
                        { code: '\\mu', desc: 'Mu (μ)' },
                        { code: '\\pi', desc: 'Pi (π)' },
                        { code: '\\sigma', desc: 'Sigma kecil (σ)' },
                        { code: '\\omega', desc: 'Omega kecil (ω)' },
                    ],
                },
                {
                    name: 'Huruf Yunani Besar',
                    items: [
                        { code: '\\Gamma', desc: 'Gamma besar (Γ)' },
                        { code: '\\Delta', desc: 'Delta besar / perubahan (Δ)' },
                        { code: '\\Theta', desc: 'Theta besar (Θ)' },
                        { code: '\\Sigma', desc: 'Sigma besar (Σ)' },
                        { code: '\\Phi', desc: 'Phi besar (Φ)' },
                        { code: '\\Omega', desc: 'Omega besar (Ω)' },
                    ],
                },
                {
                    name: 'Kalkulus',
                    items: [
                        { code: '\\int', desc: 'Integral' },
                        { code: '\\int_{a}^{b}', desc: 'Integral tentu dari a ke b' },
                        { code: '\\oint', desc: 'Integral kontur (garis tertutup)' },
                        { code: '\\sum_{i=1}^{n}', desc: 'Sigma / penjumlahan berurut' },
                        { code: '\\prod_{i=1}^{n}', desc: 'Perkalian berurut (produk)' },
                        { code: '\\lim_{x \\to a}', desc: 'Limit x menuju a' },
                        { code: '\\frac{d}{dx}', desc: 'Turunan terhadap x' },
                        { code: '\\frac{\\partial}{\\partial x}', desc: 'Turunan parsial terhadap x' },
                        { code: "f'(x)", desc: 'Turunan pertama (notasi aksen)' },
                        { code: '\\nabla', desc: 'Operator nabla / gradien' },
                    ],
                },
                {
                    name: 'Trigonometri, Log & Fungsi',
                    items: [
                        { code: '\\sin\\theta', desc: 'Sinus' },
                        { code: '\\cos\\theta', desc: 'Kosinus' },
                        { code: '\\tan\\theta', desc: 'Tangen' },
                        { code: '\\log_{b}(x)', desc: 'Logaritma basis b' },
                        { code: '\\ln(x)', desc: 'Logaritma natural' },
                        { code: '\\exp(x)', desc: 'Fungsi eksponensial' },
                        { code: '\\max(a,b)', desc: 'Nilai maksimum' },
                        { code: '\\min(a,b)', desc: 'Nilai minimum' },
                    ],
                },
                {
                    name: 'Relasi & Perbandingan',
                    items: [
                        { code: '=', desc: 'Sama dengan' },
                        { code: '\\neq', desc: 'Tidak sama dengan (≠)' },
                        { code: '\\approx', desc: 'Hampir sama dengan (≈)' },
                        { code: '\\equiv', desc: 'Ekivalen / identik (≡)' },
                        { code: '\\cong', desc: 'Kongruen / sebangun (≅)' },
                        { code: '>', desc: 'Lebih dari' },
                        { code: '\\geq', desc: 'Lebih dari sama dengan (≥)' },
                        { code: '<', desc: 'Kurang dari' },
                        { code: '\\leq', desc: 'Kurang dari sama dengan (≤)' },
                        { code: '\\propto', desc: 'Sebanding dengan (∝)' },
                    ],
                },
                {
                    name: 'Logika & Kuantor',
                    items: [
                        { code: '\\land', desc: 'Konjungsi / AND (∧)' },
                        { code: '\\lor', desc: 'Disjungsi / OR (∨)' },
                        { code: '\\neg', desc: 'Negasi / NOT (¬)' },
                        { code: '\\implies', desc: 'Implikasi / maka (⟹)' },
                        { code: '\\iff', desc: 'Bi-implikasi / jika dan hanya jika (⟺)' },
                        { code: '\\forall', desc: 'Kuantor universal / untuk semua (∀)' },
                        { code: '\\exists', desc: 'Kuantor eksistensial / terdapat (∃)' },
                        { code: '\\therefore', desc: 'Oleh karena itu (∴)' },
                    ],
                },
                {
                    name: 'Himpunan',
                    items: [
                        { code: '\\in', desc: 'Anggota dari (∈)' },
                        { code: '\\notin', desc: 'Bukan anggota dari (∉)' },
                        { code: '\\subset', desc: 'Himpunan bagian (⊂)' },
                        { code: '\\subseteq', desc: 'Himpunan bagian atau sama dengan (⊆)' },
                        { code: '\\cup', desc: 'Gabungan / union (∪)' },
                        { code: '\\cap', desc: 'Irisan / intersection (∩)' },
                        { code: '\\emptyset', desc: 'Himpunan kosong (∅)' },
                        { code: '\\mathbb{R}', desc: 'Himpunan bilangan real' },
                    ],
                },
                {
                    name: 'Panah',
                    items: [
                        { code: '\\rightarrow', desc: 'Panah kanan (→)' },
                        { code: '\\leftarrow', desc: 'Panah kiri (←)' },
                        { code: '\\leftrightarrow', desc: 'Panah dua arah (↔)' },
                        { code: '\\Rightarrow', desc: 'Panah kanan ganda (⇒)' },
                        { code: '\\Leftrightarrow', desc: 'Panah dua arah ganda (⇔)' },
                        { code: '\\mapsto', desc: 'Pemetaan fungsi (↦)' },
                        { code: '\\uparrow', desc: 'Panah atas (↑)' },
                    ],
                },
                {
                    name: 'Kurung & Delimiter',
                    items: [
                        { code: '\\left( a \\right)', desc: 'Kurung biasa menyesuaikan ukuran' },
                        { code: '\\left[ a \\right]', desc: 'Kurung siku menyesuaikan ukuran' },
                        { code: '\\left\\{ a \\right\\}', desc: 'Kurung kurawal menyesuaikan ukuran' },
                        { code: '|x|', desc: 'Nilai mutlak' },
                        { code: '\\lceil x \\rceil', desc: 'Pembulatan ke atas (ceiling)' },
                        { code: '\\lfloor x \\rfloor', desc: 'Pembulatan ke bawah (floor)' },
                    ],
                },
                {
                    name: 'Matriks & Array',
                    items: [
                        { code: '\\begin{matrix} a & b \\\\ c & d \\end{matrix}', desc: 'Matriks tanpa kurung' },
                        {
                            code: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}',
                            desc: 'Matriks dengan kurung biasa',
                        },
                        {
                            code: '\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}',
                            desc: 'Matriks dengan kurung siku',
                        },
                        { code: '\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}', desc: 'Determinan matriks' },
                        {
                            code: '\\begin{cases} x, & x \\geq 0 \\\\ -x, & x < 0 \\end{cases}',
                            desc: 'Fungsi bersyarat (piecewise)',
                        },
                    ],
                },
                {
                    name: 'Aksen & Dekorasi',
                    items: [
                        { code: '\\hat{x}', desc: 'Topi / nilai estimasi' },
                        { code: '\\bar{x}', desc: 'Garis atas / rata-rata' },
                        { code: '\\vec{x}', desc: 'Notasi vektor' },
                        { code: '\\dot{x}', desc: 'Turunan pertama (notasi Newton)' },
                        { code: '\\ddot{x}', desc: 'Turunan kedua (notasi Newton)' },
                        { code: '\\tilde{x}', desc: 'Tilde / aproksimasi' },
                        { code: '\\overline{AB}', desc: 'Garis di atas ruas AB' },
                    ],
                },
                {
                    name: 'Spasi & Teks',
                    items: [
                        { code: '\\text{kata}', desc: 'Menyisipkan teks biasa dalam rumus' },
                        { code: 'a \\, b', desc: 'Spasi tipis antar simbol' },
                        { code: 'a \\quad b', desc: 'Spasi lebar (1 em)' },
                        { code: 'a \\qquad b', desc: 'Spasi sangat lebar (2 em)' },
                    ],
                },
                {
                    name: 'Urutan Umum (Order Theory)',
                    items: [
                        { code: '\\ll', desc: 'Jauh lebih kecil dari (≪)' },
                        { code: '\\gg', desc: 'Jauh lebih besar dari (≫)' },
                        { code: '\\prec', desc: 'Mendahului, urutan abstrak (≺)' },
                        { code: '\\succ', desc: 'Mengikuti, kebalikan dari ≺ (≻)' },
                        { code: '\\preceq', desc: 'Mendahului atau sama dengan (⪯)' },
                        { code: '\\succeq', desc: 'Mengikuti atau sama dengan (⪰)' },
                        { code: '\\lesssim', desc: 'Kurang dari atau kira-kira sama dengan (≲)' },
                        { code: '\\gtrsim', desc: 'Lebih dari atau kira-kira sama dengan (≳)' },
                    ],
                },
                {
                    name: 'Himpunan: Superset & Operasi',
                    items: [
                        { code: '\\supseteq', desc: 'Superset, memuat semua elemen (⊇)' },
                        { code: '\\supset', desc: 'Superset sejati (⊃)' },
                        { code: '\\setminus', desc: 'Selisih himpunan, A dikurangi B (∖)' },
                        { code: 'A^{c}', desc: 'Komplemen himpunan A (Aᶜ)' },
                        { code: '\\mathcal{P}(A)', desc: 'Himpunan kuasa, semua subset dari A (℘(A))' },
                        { code: '|A|', desc: 'Kardinalitas, banyak anggota himpunan' },
                        { code: 'A \\times B', desc: 'Hasil kali kartesius, semua pasangan terurut' },
                    ],
                },
                {
                    name: 'Relasi Geometri',
                    items: [
                        { code: '\\parallel', desc: 'Sejajar dengan (∥)' },
                        { code: '\\perp', desc: 'Tegak lurus dengan, sudut 90° (⊥)' },
                        { code: '\\cong', desc: 'Kongruen dengan, bentuk & ukuran sama persis (≅)' },
                        { code: '\\sim', desc: 'Sebangun dengan, bentuk sama ukuran boleh beda (~)' },
                    ],
                },
                {
                    name: 'Keterbagian & Pemetaan Fungsi',
                    items: [
                        { code: '\\mid', desc: 'Habis membagi, a adalah faktor dari b (∣)' },
                        { code: '\\nmid', desc: 'Tidak habis membagi (∤)' },
                        { code: 'f: A \\to B', desc: 'f adalah fungsi yang memetakan A ke B' },
                        { code: 'x \\mapsto f(x)', desc: 'x dipetakan ke nilai f(x)' },
                    ],
                },
                {
                    name: 'Kesetaraan & Ekuivalensi Lanjutan',
                    items: [
                        { code: '\\simeq', desc: 'Hampir sama / ekuivalen asimtotik (≃)' },
                        { code: '\\cong', desc: 'Isomorfik dengan, struktur aljabar identik (≅)' },
                        { code: '\\triangleq', desc: 'Didefinisikan sebagai (≜)' },
                        { code: ':=', desc: 'Didefinisikan sebagai, notasi alternatif' },
                        { code: '\\sim', desc: 'Berelasi / ekuivalen dengan (∼)' },
                    ],
                },
                {
                    name: 'Negasi Relasi',
                    items: [
                        { code: '\\nless', desc: 'Tidak kurang dari (≮)' },
                        { code: '\\ngtr', desc: 'Tidak lebih dari (≯)' },
                        { code: '\\nleq', desc: 'Tidak kurang dari atau sama dengan (≰)' },
                        { code: '\\ngeq', desc: 'Tidak lebih dari atau sama dengan (≱)' },
                        { code: '\\not\\subset', desc: 'Bukan himpunan bagian dari (⊄)' },
                        { code: '\\not\\supset', desc: 'Bukan superset dari (⊅)' },
                        { code: '\\subsetneq', desc: 'Himpunan bagian sejati, notasi alternatif (⊊)' },
                        { code: '\\supsetneq', desc: 'Superset sejati, notasi alternatif (⊋)' },
                        { code: '\\nparallel', desc: 'Tidak sejajar dengan (∦)' },
                    ],
                },
                {
                    name: 'Logika Formal (Metamatematika)',
                    items: [
                        { code: '\\vdash', desc: 'Dapat diturunkan / membuktikan secara sintaksis (⊢)' },
                        { code: '\\models', desc: 'Memenuhi / mengakibatkan secara semantik (⊨)' },
                    ],
                },
                {
                    name: 'Simbol Logika Lanjutan',
                    items: [
                        { code: '\\because', desc: 'Sebab / karena, penanda alasan (∵)' },
                        { code: '\\oplus', desc: 'Eksklusif OR / XOR (⊕)' },
                        { code: '\\exists!', desc: 'Terdapat tepat satu (∃!)' },
                        { code: '\\nexists', desc: 'Tidak terdapat (∄)' },
                    ],
                },
                {
                    name: 'Kalkulus & Analisis Lanjutan',
                    items: [
                        { code: '\\iint', desc: 'Integral lipat dua, daerah 2 dimensi (∬)' },
                        { code: '\\iiint', desc: 'Integral lipat tiga, ruang 3 dimensi (∭)' },
                        { code: '\\partial', desc: 'Simbol del / turunan parsial (∂)' },
                        { code: '\\infty', desc: 'Tak hingga (∞)' },
                    ],
                },
                {
                    name: 'Himpunan Bilangan',
                    items: [
                        { code: '\\mathbb{N}', desc: 'Bilangan asli: 1, 2, 3, ... (ℕ)' },
                        { code: '\\mathbb{Z}', desc: 'Bilangan bulat: ..., -1, 0, 1, ... (ℤ)' },
                        { code: '\\mathbb{Q}', desc: 'Bilangan rasional, bentuk p/q (ℚ)' },
                        { code: '\\mathbb{R}', desc: 'Bilangan real, semua titik pada garis bilangan (ℝ)' },
                        { code: '\\mathbb{C}', desc: 'Bilangan kompleks, bentuk a + bi (ℂ)' },
                    ],
                },
                {
                    name: 'Geometri & Trigonometri (Non-Relasi)',
                    items: [
                        { code: '\\angle', desc: 'Sudut (∠)' },
                        { code: '\\triangle', desc: 'Segitiga (△)' },
                        { code: '90^\\circ', desc: 'Derajat, satuan ukuran sudut (°)' },
                        { code: '\\overset{\\frown}{AB}', desc: 'Busur, bagian lengkung lingkaran (⌢)' },
                    ],
                },
                {
                    name: 'Statistika & Peluang',
                    items: [
                        { code: 'P(A)', desc: 'Peluang kejadian A terjadi' },
                        { code: '\\mu', desc: 'Rata-rata (mean) populasi (μ)' },
                        { code: '\\sigma', desc: 'Simpangan baku / standar deviasi (σ)' },
                        { code: '\\sigma^{2}', desc: 'Varians (σ²)' },
                        { code: '\\bar{x}', desc: 'Rata-rata sampel (x̄)' },
                        { code: '\\binom{n}{r}', desc: 'Kombinasi, pilih r dari n tanpa urutan (nCr)' },
                        { code: 'P(n,r)', desc: 'Permutasi, susun r dari n dengan urutan (nPr)' },
                    ],
                },
                {
                    name: 'Vektor & Matriks',
                    items: [
                        { code: '\\|v\\|', desc: 'Norma vektor, panjang suatu vektor' },
                        { code: '\\cdot', desc: 'Perkalian titik (dot product), hasil skalar' },
                        { code: '\\times', desc: 'Perkalian silang (cross product), hasil vektor baru' },
                        { code: 'A^{T}', desc: 'Transpos matriks, baris & kolom ditukar (Aᵀ)' },
                        { code: 'A^{-1}', desc: 'Invers matriks, kebalikan dari A' },
                        { code: '\\det(A)', desc: 'Determinan, nilai skalar karakteristik matriks' },
                    ],
                },
                {
                    name: 'Operasi Aritmatika Dasar (Lanjutan)',
                    items: [
                        { code: '\\sqrt[3]{x}', desc: 'Akar pangkat tiga (∛)' },
                        { code: 'n!', desc: 'Faktorial, perkalian berurutan turun ke 1' },
                        { code: '\\%', desc: 'Persen, per seratus (%)' },
                        { code: '\\text{‰}', desc: 'Permil, per seribu (‰)' },
                    ],
                },
                {
                    name: 'Lainnya',
                    items: [
                        { code: '\\blacksquare', desc: 'Akhir bukti / QED (∎)' },
                        { code: '\\square', desc: 'Kotak kosong, alternatif akhir bukti (□)' },
                    ],
                },
            ];
