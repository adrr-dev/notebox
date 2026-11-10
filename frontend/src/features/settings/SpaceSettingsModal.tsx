/**
 * Konfigurasi Tata Ruang.
 *
 * Port dari modal pengaturan ruang versi lama (markup L4658-5116, penerapan
 * L6761-6954). Kontrol di sini hanya menulis ke `useSpaceStore`; engine 3D
 * berlangganan store tersebut dan menerapkan perubahannya secara langsung,
 * sehingga tidak ada tombol "Terapkan" maupun manipulasi three.js di sini.
 */
import { useSpaceStore } from '../../store/spaceStore';
import { useUiStore } from '../../store/uiStore';
import { useAppStore } from '../../store/appStore';
import { Modal } from '../../ui/Modal';

interface RangeFieldProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Human-readable current value shown under the slider. */
  display: string;
  accent: string;
  onChange: (value: number) => void;
  hint?: string;
}

/** Slider plus its live value readout (legacy `val-*` outputs, L6778). */
function RangeField({ id, label, value, min, max, step, display, accent, onChange, hint }: RangeFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-xs font-bold uppercase text-slate-400">
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        aria-valuetext={display}
        onChange={(event) => onChange(Number(event.target.value))}
        className={`h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-700 ${accent}`}
      />
      <div className="mt-1 text-right font-mono text-[10px] font-bold text-slate-500">{display}</div>
      {hint && <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{hint}</p>}
    </div>
  );
}

interface ToggleFieldProps {
  id: string;
  label: string;
  checked: boolean;
  accent: string;
  onChange: (checked: boolean) => void;
}

/** Checkbox with a label styled like the rest of the panel. */
function ToggleField({ id, label, checked, accent, onChange }: ToggleFieldProps) {
  return (
    <label htmlFor={id} className="flex w-fit cursor-pointer items-center gap-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        aria-label={label}
        onChange={(event) => onChange(event.target.checked)}
        className={`h-4 w-4 rounded border-slate-600 bg-slate-900 ${accent}`}
      />
      <span className="text-[10px] font-bold uppercase text-slate-300">{label}</span>
    </label>
  );
}

export function SpaceSettingsModal() {
  const open = useUiStore((state) => state.spaceSettingsOpen);
  const close = useUiStore((state) => state.close);
  const pushToast = useAppStore((state) => state.pushToast);
  const settings = useSpaceStore();
  const set = useSpaceStore((state) => state.set);
  const reset = useSpaceStore((state) => state.reset);

  const handleReset = () => {
    reset();
    pushToast('Tata ruang & sumbu koordinat dikembalikan ke pengaturan bawaan.', 'success');
  };

  return (
    <Modal
      open={open}
      onClose={() => close('spaceSettings')}
      title={
        <>
          <i className="fas fa-cogs mr-2 text-blue-400" aria-hidden="true" />
          Konfigurasi Tata Ruang
        </>
      }
      widthClass="max-w-lg"
      footer={
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleReset}
            className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-bold text-white hover:bg-slate-600"
          >
            <i className="fas fa-rotate-left mr-2" aria-hidden="true" />
            Kembalikan ke bawaan
          </button>
        </div>
      }
    >
      <p className="mb-4 text-[11px] leading-relaxed text-slate-400">
        Perubahan di bawah ini diterapkan langsung ke ruang 3D dan tidak mengubah isi, bentuk, atau hubungan antar objek.
      </p>

      <div className="space-y-5">
        <RangeField
          id="set-cam-limit"
          label="Batas Zoom Kamera (Max Distance)"
          value={settings.maxDistance}
          min={10}
          max={500}
          step={10}
          display={`${settings.maxDistance} unit`}
          accent="accent-blue-500"
          onChange={(maxDistance) => set({ maxDistance })}
        />
        <RangeField
          id="set-grid-size"
          label="Luas Area Lantai (Grid Size)"
          value={settings.gridSize}
          min={1}
          max={100}
          step={1}
          display={`${settings.gridSize} x ${settings.gridSize}`}
          accent="accent-blue-500"
          onChange={(gridSize) => set({ gridSize })}
        />
        <RangeField
          id="set-grid-y"
          label="Ketinggian Lantai Dasar (Sumbu Y)"
          value={settings.gridY}
          min={-50}
          max={50}
          step={1}
          display={`Y: ${settings.gridY}`}
          accent="accent-blue-500"
          onChange={(gridY) => set({ gridY })}
        />

        <div className="space-y-3">
          <ToggleField
            id="set-fog-enabled"
            label="Aktifkan Kabut (Fog)"
            checked={settings.fogEnabled}
            accent="accent-blue-500"
            onChange={(fogEnabled) => set({ fogEnabled })}
          />
          <RangeField
            id="set-fog"
            label="Visibilitas / Kepadatan Kabut"
            value={settings.fogDensity}
            min={0.001}
            max={0.05}
            step={0.001}
            display={settings.fogDensity.toFixed(3)}
            accent="accent-blue-500"
            onChange={(fogDensity) => set({ fogDensity })}
          />
        </div>

        <div className="mt-4 border-t border-slate-700 pt-4">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-indigo-400">
            <i className="fas fa-border-all mr-2" aria-hidden="true" />
            Visibilitas Bidang Grid 3D
          </h3>
          <div className="flex flex-col gap-3">
            <ToggleField
              id="set-grid-xz"
              label="Grid Horizontal (Lantai Dasar XZ)"
              checked={settings.planeXZ}
              accent="accent-indigo-500"
              onChange={(planeXZ) => set({ planeXZ })}
            />
            <ToggleField
              id="set-grid-xy"
              label="Grid Vertikal (Dinding Belakang XY)"
              checked={settings.planeXY}
              accent="accent-indigo-500"
              onChange={(planeXY) => set({ planeXY })}
            />
            <ToggleField
              id="set-grid-yz"
              label="Grid Vertikal (Dinding Samping YZ)"
              checked={settings.planeYZ}
              accent="accent-indigo-500"
              onChange={(planeYZ) => set({ planeYZ })}
            />
          </div>
        </div>

        <div className="mt-4 border-t border-slate-700 pt-4">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-emerald-400">
            <i className="fas fa-ruler-combined mr-2" aria-hidden="true" />
            Sumbu Koordinat Berlabel
          </h3>
          <ToggleField
            id="set-axis-labels"
            label="Sumbu Koordinat Berlabel"
            checked={settings.axisLabels}
            accent="accent-emerald-500"
            onChange={(axisLabels) => set({ axisLabels })}
          />
        </div>

        <div className="mt-4 border-t border-slate-700 pt-4">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-cyan-400">
            <i className="fas fa-level-down-alt mr-2" aria-hidden="true" />
            Garis Proyeksi Objek (Drop-Lines)
          </h3>
          <ToggleField
            id="set-dropline-visible"
            label="Tampilkan Garis Proyeksi ke Lantai"
            checked={settings.dropLines}
            accent="accent-cyan-500"
            onChange={(dropLines) => set({ dropLines })}
          />
        </div>

        <div className="mt-4 border-t border-slate-700 pt-4">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-300">
            <i className="fas fa-cubes mr-2" aria-hidden="true" />
            Voxel Grid 3D (Visibilitas Adaptif)
          </h3>
          <div className="space-y-3">
            <ToggleField
              id="set-voxel-visible"
              label="Aktifkan Voxel Space"
              checked={settings.voxelVisible}
              accent="accent-slate-400"
              onChange={(voxelVisible) => set({ voxelVisible })}
            />
            <RangeField
              id="set-voxel-cell-size"
              label="Kepadatan (Ukuran Sel)"
              value={settings.voxelCellSize}
              min={1}
              max={20}
              step={1}
              display={`Ukuran ${settings.voxelCellSize} unit`}
              accent="accent-slate-400"
              onChange={(voxelCellSize) => set({ voxelCellSize })}
            />
          </div>
        </div>

        <div className="mt-4 border-t border-slate-700 pt-4">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-amber-400">
            <i className="fas fa-lightbulb mr-2" aria-hidden="true" />
            Pencahayaan Ruang
          </h3>
          <div className="space-y-5">
            <RangeField
              id="set-ambient-light"
              label="Cahaya ambient"
              value={settings.ambientLight}
              min={0}
              max={1.5}
              step={0.05}
              display={`${Math.round((settings.ambientLight / 1.5) * 100)}%`}
              accent="accent-amber-500"
              onChange={(ambientLight) => set({ ambientLight })}
            />
            <RangeField
              id="set-directional-light"
              label="Cahaya terarah"
              value={settings.directionalLight}
              min={0}
              max={1.5}
              step={0.05}
              display={`${Math.round((settings.directionalLight / 1.5) * 100)}%`}
              accent="accent-amber-500"
              onChange={(directionalLight) => set({ directionalLight })}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
