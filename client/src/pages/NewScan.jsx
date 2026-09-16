import clsx from 'clsx';
import { Camera, ImagePlus, Lightbulb, LocateFixed, MapPin } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';
import { describeError } from '../api/client.js';
import { useCreateScan, usePlots } from '../api/hooks.js';
import { CropSelect } from '../components/domain.jsx';
import { Alert, Field, PageHeader, Spinner } from '../components/ui.jsx';
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
    accept: { 'image/jpeg': [], 'image/png': [], 'image/webp': [], 'image/heic': [], 'image/heif': [] },
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
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('scan.title')} subtitle={t('scan.subtitle')} />

      <form onSubmit={onSubmit} className="grid gap-6 md:grid-cols-[1.1fr_1fr]">
        <div>
          <div
            {...getRootProps()}
            className={clsx(
              'card relative flex aspect-square cursor-pointer flex-col items-center justify-center overflow-hidden border-2 border-dashed text-center transition-colors',
              isDragActive ? 'border-brand-600 bg-brand-50' : 'border-line hover:border-brand-500',
              file && 'cursor-default border-solid',
            )}
          >
            {/* capture="environment" opens the rear camera directly on phones. */}
            <input {...getInputProps({ capture: 'environment' })} aria-label={t('scan.dropPrompt')} />
            {preview ? (
              <img src={preview} alt="" className="absolute inset-0 size-full object-cover" />
            ) : (
              <div className="px-6">
                <div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl bg-brand-700 text-white">
                  <Camera className="size-8" aria-hidden="true" />
                </div>
                <p className="font-semibold">{isDragActive ? t('scan.dropActive') : t('scan.dropPrompt')}</p>
                <p className="mt-1 text-sm text-ink-muted">{t('scan.dropHint')}</p>
              </div>
            )}
          </div>
          {file && (
            <button type="button" onClick={open} className="btn-secondary mt-3 w-full">
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

        <div className="space-y-5">
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
                className={clsx('btn-secondary w-full', geo.status === 'success' && 'border-brand-600 text-brand-800')}
                onClick={geo.request}
                disabled={geo.status === 'loading'}
              >
                {geo.status === 'loading' ? <Spinner className="size-4" /> : geo.status === 'success' ? <MapPin className="size-4" aria-hidden="true" /> : <LocateFixed className="size-4" aria-hidden="true" />}
                {geo.status === 'loading' ? t('scan.locating') : geo.status === 'success' ? t('scan.locationSet') : t('scan.useLocation')}
              </button>
              {geo.status === 'error' && <p className="mt-1 text-xs text-danger">{t('scan.locationFailed')}</p>}
            </div>
          )}

          {location && (
            <label className="flex cursor-pointer gap-3 rounded-xl border border-line bg-surface p-3">
              <input type="checkbox" className="mt-1 size-4 accent-brand-700" checked={share} onChange={(e) => setShare(e.target.checked)} />
              <span>
                <span className="block text-sm font-medium">{t('scan.share')}</span>
                <span className="block text-xs text-ink-muted">{t('scan.shareHelp')}</span>
              </span>
            </label>
          )}

          {apiError && !apiError.fields?.crop && <Alert tone="danger">{apiError.message}</Alert>}

          <button type="submit" className="btn-primary w-full text-base" disabled={!file || !crop || createScan.isPending}>
            {createScan.isPending ? <Spinner className="size-5 text-white" /> : <Camera className="size-5" aria-hidden="true" />}
            {createScan.isPending ? t('scan.analysing') : t('scan.submit')}
          </button>

          <div className="rounded-2xl bg-soil-100 p-4 text-sm text-soil-700">
            <p className="mb-2 flex items-center gap-2 font-semibold">
              <Lightbulb className="size-4" aria-hidden="true" />
              {t('scan.tipsTitle')}
            </p>
            <ul className="list-inside list-disc space-y-1">
              {['tip1', 'tip2', 'tip3', 'tip4'].map((k) => (
                <li key={k}>{t(`scan.${k}`)}</li>
              ))}
            </ul>
          </div>
        </div>
      </form>
    </div>
  );
}
