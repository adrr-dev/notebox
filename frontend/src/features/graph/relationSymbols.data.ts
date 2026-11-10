/**
 * Simbol relasi logika/matematika untuk garis antar objek.
 * Diekstrak dari markup select #input-edge-relation versi lama (baris 4427 ss.).
 * CATATAN: entri "< (Kurang Dari)" dipulihkan manual — regex ekstraksi tidak
 * dapat menangkap label opsi yang diawali "<". Jaga sinkronisasi dengan select
 * lama bila katalog berubah.
 */
export interface RelationSymbolOption { readonly value: string; readonly label: string }
export interface RelationSymbolGroup { readonly group: string | null; readonly options: readonly RelationSymbolOption[] }

export const RELATION_SYMBOLS: readonly RelationSymbolGroup[] = [
  {
    "group": null,
    "options": [
      {
        "value": "none",
        "label": "Garis Biasa (Tidak ada simbol)"
      }
    ]
  },
  {
    "group": "Kesetaraan & Identitas",
    "options": [
      {
        "value": "=",
        "label": "= (Sama Dengan / Ekivalen Secara Nilai)"
      },
      {
        "value": "≠",
        "label": "≠ (Tidak Sama Dengan)"
      },
      {
        "value": "≈",
        "label": "≈ (Hampir Sama Dengan)"
      },
      {
        "value": "≡",
        "label": "≡ (Ekivalen Logika)"
      },
      {
        "value": "≜",
        "label": "≜ (Didefinisikan Sebagai)"
      },
      {
        "value": "≃",
        "label": "≃ (Hampir Sama / Ekuivalen Asimtotik)"
      }
    ]
  },
  {
    "group": "Relasi Spasial & Geometri",
    "options": [
      {
        "value": "≅",
        "label": "≅ (Kongruen / Sebangun)"
      },
      {
        "value": "∼",
        "label": "∼ (Sebangun / Ekuivalen)"
      },
      {
        "value": "∥",
        "label": "∥ (Sejajar Dengan)"
      },
      {
        "value": "⊥",
        "label": "⊥ (Tegak Lurus Dengan)"
      },
      {
        "value": "∦",
        "label": "∦ (Tidak Sejajar Dengan)"
      }
    ]
  },
  {
    "group": "Perbandingan & Urutan",
    "options": [
      {
        "value": ">",
        "label": "> (Lebih Dari)"
      },
      {
        "value": "≥",
        "label": "≥ (Lebih Dari Sama Dengan)"
      },
      {
        "value": "<",
        "label": "< (Kurang Dari)"
      },
      {
        "value": "≤",
        "label": "≤ (Kurang Dari Sama Dengan)"
      },
      {
        "value": "≪",
        "label": "≪ (Jauh Lebih Kecil Dari)"
      },
      {
        "value": "≫",
        "label": "≫ (Jauh Lebih Besar Dari)"
      },
      {
        "value": "∝",
        "label": "∝ (Berbanding Lurus Dengan)"
      },
      {
        "value": "≺",
        "label": "≺ (Mendahului)"
      },
      {
        "value": "≻",
        "label": "≻ (Mengikuti)"
      },
      {
        "value": "⪯",
        "label": "⪯ (Mendahului Atau Sama Dengan)"
      },
      {
        "value": "⪰",
        "label": "⪰ (Mengikuti Atau Sama Dengan)"
      },
      {
        "value": "≲",
        "label": "≲ (Kurang Dari Atau Kira-kira Sama Dengan)"
      },
      {
        "value": "≳",
        "label": "≳ (Lebih Dari Atau Kira-kira Sama Dengan)"
      },
      {
        "value": "≮",
        "label": "≮ (Tidak Kurang Dari)"
      },
      {
        "value": "≯",
        "label": "≯ (Tidak Lebih Dari)"
      },
      {
        "value": "≰",
        "label": "≰ (Tidak Kurang Dari Sama Dengan)"
      },
      {
        "value": "≱",
        "label": "≱ (Tidak Lebih Dari Sama Dengan)"
      }
    ]
  },
  {
    "group": "Keanggotaan & Himpunan Bagian",
    "options": [
      {
        "value": "∈",
        "label": "∈ (Anggota Dari)"
      },
      {
        "value": "∉",
        "label": "∉ (Bukan Anggota Dari)"
      },
      {
        "value": "⊆",
        "label": "⊆ (Himpunan Bagian / Subset)"
      },
      {
        "value": "⊂",
        "label": "⊂ (Himpunan Bagian Sejati)"
      },
      {
        "value": "⊇",
        "label": "⊇ (Superset)"
      },
      {
        "value": "⊃",
        "label": "⊃ (Superset Sejati)"
      },
      {
        "value": "⊄",
        "label": "⊄ (Bukan Himpunan Bagian Dari)"
      },
      {
        "value": "⊅",
        "label": "⊅ (Bukan Superset Dari)"
      },
      {
        "value": "⊊",
        "label": "⊊ (Himpunan Bagian Sejati - Alt)"
      },
      {
        "value": "⊋",
        "label": "⊋ (Superset Sejati - Alt)"
      }
    ]
  },
  {
    "group": "Operasi Himpunan",
    "options": [
      {
        "value": "∩",
        "label": "∩ (Irisan / Intersection)"
      },
      {
        "value": "∪",
        "label": "∪ (Gabungan / Union)"
      },
      {
        "value": "⊕",
        "label": "⊕ (Eksklusif OR / XOR)"
      },
      {
        "value": "∖",
        "label": "∖ (Selisih Himpunan)"
      }
    ]
  },
  {
    "group": "Logika & Implikasi",
    "options": [
      {
        "value": "∧",
        "label": "∧ (Konjungsi / AND)"
      },
      {
        "value": "∨",
        "label": "∨ (Disjungsi / OR)"
      },
      {
        "value": "→",
        "label": "→ (Implikasi / Maka)"
      },
      {
        "value": "↔",
        "label": "↔ (Bi-implikasi / Jika dan hanya jika)"
      },
      {
        "value": "¬",
        "label": "¬ (Negasi / Bukan)"
      },
      {
        "value": "↦",
        "label": "↦ (Dipetakan Ke)"
      }
    ]
  },
  {
    "group": "Kuantor Logika",
    "options": [
      {
        "value": "∀",
        "label": "∀ (Kuantor Universal / Untuk Semua)"
      },
      {
        "value": "∃",
        "label": "∃ (Kuantor Eksistensial / Terdapat)"
      }
    ]
  },
  {
    "group": "Keterbagian",
    "options": [
      {
        "value": "∣",
        "label": "∣ (Habis Membagi)"
      },
      {
        "value": "∤",
        "label": "∤ (Tidak Habis Membagi)"
      }
    ]
  },
  {
    "group": "Inferensi & Pembuktian",
    "options": [
      {
        "value": "∴",
        "label": "∴ (Jadi / Maka)"
      },
      {
        "value": "∵",
        "label": "∵ (Sebab / Karena)"
      },
      {
        "value": "⊢",
        "label": "⊢ (Dapat Diturunkan / Membuktikan)"
      },
      {
        "value": "⊨",
        "label": "⊨ (Memenuhi Secara Semantik)"
      }
    ]
  }
];

export const RELATION_LABEL_BY_VALUE: ReadonlyMap<string, string> = new Map(
  RELATION_SYMBOLS.flatMap((g) => g.options.map((o) => [o.value, o.label] as const)),
);
