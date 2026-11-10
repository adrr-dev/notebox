/**
 * Skema Epistemik V2 — katalog beku (17 jenis node, 19 jenis relasi, 8 status).
 * Diekstrak apa adanya dari versi lama RI3D_Cabang22_Tahap5 (baris 5466 ss.)
 * Jangan ubah nilai string: nilai ini dipakai untuk validasi dan data tersimpan.
 */
export const EPISTEMIC_SCHEMA_V2 = {
                schemaVersion: 2,
                active: true,
                migrationEnabled: true,
                relationStatuses: [
                    'unreviewed', 'under_review', 'provisional', 'supported',
                    'contested', 'rejected', 'accepted_in_scope', 'superseded'
                ],
                nodeKinds: {
                    note: 'Catatan', observation: 'Observasi', concept: 'Konsep',
                    definition: 'Definisi', question: 'Pertanyaan', claim: 'Klaim',
                    hypothesis: 'Hipotesis', source: 'Sumber', model: 'Model',
                    procedure: 'Prosedur', action: 'Tindakan', result: 'Hasil',
                    reflection: 'Refleksi', evidence: 'Bukti', assumption: 'Asumsi',
                    prediction: 'Prediksi', experiment: 'Eksperimen'
                },
                relationTypes: {
                    abstracts_to: {
                        label: 'Diabstraksikan menjadi',
                        description: 'Menyatakan bahwa konsep dirumuskan dari pola pada kasus atau data; bukan bukti otomatis atas generalisasi.',
                        sourceKinds: ['observation', 'result', 'note', 'reflection'], targetKinds: ['concept'],
                        diagramPath: 'experience_to_concept'
                    },
                    formalizes_as: {
                        label: 'Diformalkan sebagai',
                        description: 'Menyatakan bahwa rumusan definisi memperjelas atau memformalkan konsep.',
                        sourceKinds: ['concept'], targetKinds: ['definition'], diagramPath: 'concept_to_definition'
                    },
                    is_example_of: {
                        label: 'Merupakan contoh dari',
                        description: 'Menandai kasus yang dianggap sebagai contoh; satu contoh tidak membuktikan generalisasi universal.',
                        sourceKinds: ['observation', 'result', 'note'], targetKinds: ['concept', 'definition', 'claim'],
                        diagramPath: 'experience_to_concept'
                    },
                    is_counterexample_to: {
                        label: 'Merupakan contoh penyangkal dari',
                        description: 'Menandai kasus yang menentang klaim atau menunjukkan batas konsep/model.',
                        sourceKinds: ['observation', 'result', 'evidence'],
                        targetKinds: ['concept', 'definition', 'claim', 'hypothesis', 'model'],
                        diagramPath: 'experience_to_claim'
                    },
                    supports: {
                        label: 'Mendukung',
                        description: 'Sumber memberi dukungan terhadap klaim; relasi ini tidak otomatis membuktikan klaim benar.',
                        sourceKinds: ['evidence', 'source', 'observation', 'result'], targetKinds: ['claim', 'hypothesis'],
                        diagramPath: 'evidence_to_claim'
                    },
                    challenges: {
                        label: 'Menyanggah atau melemahkan',
                        description: 'Sumber memberi alasan untuk meragukan, membatasi, atau menolak sasaran.',
                        sourceKinds: ['evidence', 'source', 'observation', 'result', 'claim'],
                        targetKinds: ['claim', 'hypothesis', 'definition', 'model'],
                        diagramPath: 'evidence_to_claim'
                    },
                    contradicts: {
                        label: 'Bertentangan dengan',
                        description: 'Dua pernyataan tidak dapat sama-sama benar di bawah interpretasi dan kondisi yang sama.',
                        sourceKinds: ['claim', 'hypothesis'], targetKinds: ['claim', 'hypothesis'],
                        diagramPath: 'claim_to_claim'
                    },
                    cites: {
                        label: 'Merujuk atau mengutip',
                        description: 'Menunjukkan sumber yang dirujuk; kutipan tidak dengan sendirinya berarti sumber mendukung klaim.',
                        sourceKinds: ['claim', 'definition', 'model', 'hypothesis'], targetKinds: ['source'],
                        diagramPath: 'knowledge_to_source'
                    },
                    depends_on: {
                        label: 'Bergantung pada',
                        description: 'Target adalah premis atau prasyarat yang diperlukan oleh sumber.',
                        sourceKinds: ['claim', 'hypothesis', 'model', 'definition', 'procedure'],
                        targetKinds: ['concept', 'definition', 'assumption', 'claim', 'source'],
                        diagramPath: 'dependency'
                    },
                    refines: {
                        label: 'Memperjelas atau memperhalus',
                        description: 'Rumusan baru memperjelas atau membatasi rumusan sebelumnya tanpa harus menggantikan semuanya.',
                        sourceKinds: ['concept', 'definition', 'claim', 'hypothesis', 'model'],
                        targetKinds: ['concept', 'definition', 'claim', 'hypothesis', 'model'],
                        diagramPath: 'revision'
                    },
                    supersedes: {
                        label: 'Menggantikan versi terdahulu',
                        description: 'Objek sumber menggantikan objek tujuan; versi lama tetap harus dapat ditelusuri.',
                        sourceKinds: ['concept', 'definition', 'claim', 'hypothesis', 'model', 'procedure', 'source', 'result'],
                        targetKinds: ['concept', 'definition', 'claim', 'hypothesis', 'model', 'procedure', 'source', 'result'],
                        diagramPath: 'revision'
                    },
                    limits_scope_of: {
                        label: 'Membatasi ruang lingkup',
                        description: 'Sumber membatasi kondisi ketika target layak digunakan.',
                        sourceKinds: ['assumption', 'evidence', 'source', 'observation', 'result'],
                        targetKinds: ['claim', 'hypothesis', 'model'],
                        diagramPath: 'scope'
                    },
                    applies_to: {
                        label: 'Diterapkan pada',
                        description: 'Pengetahuan digunakan pada model atau situasi dengan syarat penerapan yang dinyatakan.',
                        sourceKinds: ['claim', 'hypothesis', 'definition', 'concept'], targetKinds: ['model'],
                        diagramPath: 'claim_to_model'
                    },
                    idealizes_into: {
                        label: 'Diidealisasi menjadi',
                        description: 'Konsep atau fenomena disederhanakan secara sadar menjadi model dengan asumsi yang dapat dinyatakan.',
                        sourceKinds: ['concept', 'observation', 'note'], targetKinds: ['model'],
                        diagramPath: 'concept_to_model'
                    },
                    assumes: {
                        label: 'Mengasumsikan',
                        description: 'Model bergantung pada asumsi yang ditunjuk.',
                        sourceKinds: ['model'], targetKinds: ['assumption'], diagramPath: 'model_to_assumption'
                    },
                    predicts: {
                        label: 'Memprediksi',
                        description: 'Model menghasilkan ekspektasi yang harus dibedakan dari hasil aktual.',
                        sourceKinds: ['model'], targetKinds: ['prediction', 'result'], diagramPath: 'model_to_prediction'
                    },
                    tested_by: {
                        label: 'Diuji melalui',
                        description: 'Tindakan/prosedur dirancang untuk menguji sasaran; bukan hasil pengujian itu sendiri.',
                        sourceKinds: ['claim', 'hypothesis', 'model'], targetKinds: ['experiment', 'action', 'procedure'],
                        diagramPath: 'claim_model_to_action'
                    },
                    produces: {
                        label: 'Menghasilkan',
                        description: 'Tindakan atau prosedur menghasilkan observasi, hasil, atau bukti yang tercatat.',
                        sourceKinds: ['experiment', 'action', 'procedure'], targetKinds: ['observation', 'result', 'evidence'],
                        diagramPath: 'action_to_experience'
                    },
                    informs: {
                        label: 'Memberi informasi bagi',
                        description: 'Hasil digunakan untuk meninjau pemahaman; lebih umum daripada mendukung atau menyanggah.',
                        sourceKinds: ['observation', 'result', 'evidence'], targetKinds: ['concept', 'claim', 'model'],
                        diagramPath: 'experience_to_knowledge'
                    },
                    custom: {
                        label: 'Relasi khusus',
                        description: 'Relasi pengguna di luar katalog standar; label khusus wajib dan alasannya dianjurkan.',
                        sourceKinds: null, targetKinds: null, diagramPath: 'custom'
                    }
                },
                relationFields: {
                    type: { required: true, type: 'enum' },
                    status: { required: false, type: 'enum', default: 'unreviewed' },
                    rationale: { required: false, type: 'string' },
                    qualifier: { required: false, type: 'string' },
                    sourceRefs: { required: false, type: 'array<reference>' },
                    createdAt: { required: false, type: 'ISO-8601 date-time' },
                    updatedAt: { required: false, type: 'ISO-8601 date-time' },
                    customLabel: { required: false, type: 'string; wajib untuk type=custom' }
                }
            } as const;

export type EpistemicSchemaV2 = typeof EPISTEMIC_SCHEMA_V2;
export type EpistemicNodeKind = keyof typeof EPISTEMIC_SCHEMA_V2.nodeKinds;
export type EpistemicRelationType = keyof typeof EPISTEMIC_SCHEMA_V2.relationTypes;
export type EpistemicRelationStatus = (typeof EPISTEMIC_SCHEMA_V2.relationStatuses)[number];

export const EPISTEMIC_KIND_LABELS = EPISTEMIC_SCHEMA_V2.nodeKinds;
export const EPISTEMIC_STATUS_LABELS = {
  unreviewed: 'Belum ditinjau', under_review: 'Sedang ditinjau', provisional: 'Sementara',
  supported: 'Didukung bukti', contested: 'Diperdebatkan', rejected: 'Ditolak',
  accepted_in_scope: 'Diterima dalam ruang lingkup', superseded: 'Digantikan versi baru',
} as const;
