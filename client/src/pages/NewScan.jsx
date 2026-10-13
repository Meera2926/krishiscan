import clsx from 'clsx';
import { Camera, Check, ImagePlus, ImageUp, Lightbulb, LocateFixed, MapPin } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';
import { describeError } from '../api/client.js';
import { useCreateScan, usePlots } from '../api/hooks.js';
import { CropSelect } from '../components/domain.jsx';
import { Alert, Field, IconBadge, PageHeader, Spinner } from '../components/ui.jsx';
import { useGeolocation } from '../lib/useGeolocation.js';

const MAX_MB = 8;

export default function NewScan() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data: plots = [] } = usePlots();
  const createScan = useCreateScan();
  const geo = useGeolocation();

  const [file, setFile] = useState(null);
  const [plotId, setPlotId] = useState(params.get('plot') ?? '');
  const [crop, setCrop] = useState('');
  const [share, setShare] = useState(true);
  const [fileError, setFileError] = useState(null);

  const plot = plots.find((p) => p.id === plotId);
  // A plot fixes both the crop and the location.
  useEffect(() => {
    if (plot) setCrop(plot.crop);
  }, [plot]);

  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: { 'image/jpeg': [], 'image/png': [], 'image/webp': [] },
    maxFiles: 1,
    maxSize: MAX_MB * 1024 * 1024,
    noClick: Boolean(file),
    onDrop: (accepted, rejected) => {
      setFileError(rejected.length ? rejected[0].errors[0]?.message : null);
      if (accepted[0]) setFile(accepted[0]);
    },
  });

  const location = plot ? { lat: plot.lat, lng: plot.lng } : geo.coords;
  const apiError = createScan.error ? describeError(createScan.error) : null;

  async function onSubmit(e) {
    e.preventDefault();
    const data = new FormData();
    data.append('image', file);
    if (plotId) data.append('plotId', plotId);
    data.append('crop', crop);
    if (!plot && geo.coords) {
      data.append('lat', String(geo.coords.lat));
      data.append('lng', String(geo.coords.lng));
    }
    if (location) data.append('shareLocation', String(share));
    const result = await createScan.mutateAsync(data).catch(() => null);
    if (result) navigate(`/scans/${result.scan.id}`);
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t('scan.title')} subtitle={t('scan.subtitle')} />

      <form onSubmit={onSubmit} className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="card p-3 sm:p-4">
          <div
            {...getRootProps()}
            className={clsx(
              'relative flex min-h-80 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[0.875rem] border-2 border-dashed text-center transition-colors sm:aspect-[4/3]',
              isDragActive ? 'border-brand-600 bg-brand-50' : 'border-brand-200 bg-surface-sunken hover:border-brand-400 hover:bg-brand-50/60',
              file && 'cursor-default border-solid border-line bg-canvas-deep',
            )}
          >
            {/* capture="environment" opens the rear camera directly on phones. */}
            <input {...getInputProps({ capture: 'environment' })} aria-label={t('scan.dropPrompt')} />
            {preview ? (
              <img src={preview} alt="" className="absolute inset-0 size-full object-cover" />
            ) : (
              <div className="flex flex-col items-center px-6 py-8">
                <span className="icon-badge mb-5 size-20 ring-8 ring-brand-50">
                  <ImageUp className="size-9" aria-hidden="true" />
                </span>
                {isDragActive ? (
                  <p className="text-[15px] font-semibold text-brand-900">{t('scan.dropActive')}</p>
                ) : (
                  <>
                    {/* Phones have nothing to drag from, so they get the tap wording. */}
                    <p className="hidden text-[15px] font-semibold text-brand-900 sm:block">{t('scan.dragPrompt')}</p>
                    <p className="text-[15px] font-semibold text-brand-900 sm:hidden">{t('scan.dropPrompt')}</p>
                  </>
                )}
                <p className="my-3 text-sm text-ink-subtle">{t('scan.or')}</p>
                <button
                  type="button"
                  className="btn-primary px-6"
                  onClick={(e) => {
                    // The card opens the picker on click too; without this it would open twice.
                    e.stopPropagation();
                    open();
                  }}
                >
                  <Camera className="size-4" aria-hidden="true" />
                  {t('scan.chooseFile')}
                </button>
                <p className="mt-5 text-xs text-ink-subtle">{t('scan.dropHint')}</p>
              </div>
            )}
          </div>
          {file && (
            <button type="button" onClick={open} className="btn-outline mt-3 w-full">
              <ImagePlus className="size-4" aria-hidden="true" />
              {t('scan.change')}
            </button>
          )}
          {fileError && (
            <Alert tone="danger" className="mt-3">
              {fileError}
            </Alert>
          )}
        </div>

        <div className="space-y-6">
          <div className="card space-y-5 p-5 sm:p-6">
            {plots.length > 0 && (
              <Field label={t('scan.plot')} htmlFor="plot" optional>
                <select id="plot" className="input" value={plotId} onChange={(e) => setPlotId(e.target.value)}>
                  <option value="">{t('scan.noPlot')}</option>
                  {plots.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <Field label={t('scan.crop')} htmlFor="crop" hint={t('scan.cropHelp')} error={apiError?.fields?.crop}>
              <CropSelect id="crop" value={crop} onChange={setCrop} required />
            </Field>

            {!plot && (
              <div>
                <button
                  type="button"
                  className={clsx('btn-secondary w-full', geo.status === 'success' && 'border-brand-500 bg-brand-50 text-brand-800')}
                  onClick={geo.request}
                  disabled={geo.status === 'loading'}
                >
                  {geo.status === 'loading' ? (
                    <Spinner className="size-4" />
                  ) : geo.status === 'success' ? (
                    <MapPin className="size-4" aria-hidden="true" />
                  ) : (
                    <LocateFixed className="size-4" aria-hidden="true" />
                  )}
                  {geo.status === 'loading' ? t('scan.locating') : geo.status === 'success' ? t('scan.locationSet') : t('scan.useLocation')}
                </button>
                {geo.status === 'error' && <p className="mt-1.5 text-xs font-semibold text-danger">{t('scan.locationFailed')}</p>}
              </div>
            )}

            {location && (
              <label className="flex cursor-pointer gap-3 rounded-control bg-surface-sunken p-3.5 ring-1 ring-line transition-shadow hover:ring-brand-300">
                <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-brand-700" checked={share} onChange={(e) => setShare(e.target.checked)} />
                <span>
                  <span className="block text-sm font-semibold">{t('scan.share')}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{t('scan.shareHelp')}</span>
                </span>
              </label>
            )}

            {apiError && !apiError.fields?.crop && <Alert tone="danger">{apiError.message}</Alert>}

            <button type="submit" className="btn-primary min-h-12 w-full text-base" disabled={!file || !crop || createScan.isPending}>
              {createScan.isPending ? <Spinner className="size-5 text-white" /> : <Camera className="size-5" aria-hidden="true" />}
              {createScan.isPending ? t('scan.analysing') : t('scan.submit')}
            </button>
          </div>

          <div className="card p-5 sm:p-6">
            <p className="mb-4 flex items-center gap-3 font-bold text-brand-900">
              <IconBadge icon={Lightbulb} tone="accent" />
              {t('scan.tipsTitle')}
            </p>
            <ul className="space-y-3">
              {['tip1', 'tip2', 'tip3', 'tip4'].map((k) => (
                <li key={k} className="flex items-start gap-3 text-sm leading-relaxed">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-700">
                    <Check className="size-3" strokeWidth={3} aria-hidden="true" />
                  </span>
                  <span>{t(`scan.${k}`)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </form>
    </div>
  );
}
