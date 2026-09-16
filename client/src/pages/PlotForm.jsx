import { ArrowLeft, LocateFixed } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { describeError } from '../api/client.js';
import { usePlot, useSavePlot } from '../api/hooks.js';
import { CropSelect } from '../components/domain.jsx';
import { MapPicker } from '../components/maps.jsx';
import { Alert, Field, FullPageSpinner, PageHeader, Spinner } from '../components/ui.jsx';
import { useGeolocation } from '../lib/useGeolocation.js';

const EMPTY = { name: '', crop: '', variety: '', sowingDate: '', areaAcres: '', state: '', district: '', notes: '' };

export default function PlotForm() {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const existing = usePlot(id);
  const save = useSavePlot(id);
  const geo = useGeolocation();

  const [form, setForm] = useState(EMPTY);
  const [point, setPoint] = useState(null);
  const [locationError, setLocationError] = useState(false);

  useEffect(() => {
    const p = existing.data;
    if (!p) return;
    setForm({
      name: p.name,
      crop: p.crop,
      variety: p.variety ?? '',
      sowingDate: p.sowingDate ? p.sowingDate.slice(0, 10) : '',
      areaAcres: p.areaAcres ?? '',
      state: p.state ?? '',
      district: p.district ?? '',
      notes: p.notes ?? '',
    });
    setPoint({ lat: p.lat, lng: p.lng });
  }, [existing.data]);

  useEffect(() => {
    if (geo.coords) setPoint(geo.coords);
  }, [geo.coords]);

  if (id && existing.isLoading) return <FullPageSpinner />;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: typeof e === 'string' ? e : e.target.value }));
  const fieldErrors = save.error ? describeError(save.error).fields : {};

  async function onSubmit(e) {
    e.preventDefault();
    if (!point) {
      setLocationError(true);
      return;
    }
    const body = { ...point };
    for (const [k, v] of Object.entries(form)) {
      if (v !== '' && v != null) body[k] = k === 'areaAcres' ? Number(v) : v;
    }
    const plot = await save.mutateAsync(body).catch(() => null);
    if (plot) navigate(`/plots/${plot.id}`, { replace: true });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={id ? t('plots.editTitle') : t('plots.createTitle')}
        back={
          <Link to={id ? `/plots/${id}` : '/plots'} className="btn-ghost -ml-3 mb-2">
            <ArrowLeft className="size-4" aria-hidden="true" />
            {t('common.back')}
          </Link>
        }
      />
      <form onSubmit={onSubmit} className="card space-y-5 p-5 sm:p-6">
        {save.error && <Alert tone="danger">{describeError(save.error).message}</Alert>}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t('plots.name')} htmlFor="name" error={fieldErrors.name}>
            <input id="name" className="input" required maxLength={80} placeholder={t('plots.namePlaceholder')} value={form.name} onChange={set('name')} />
          </Field>
          <Field label={t('plots.crop')} htmlFor="crop" error={fieldErrors.crop}>
            <CropSelect id="crop" value={form.crop} onChange={set('crop')} required onlySupported={false} />
          </Field>
          <Field label={t('plots.variety')} htmlFor="variety" optional>
            <input id="variety" className="input" maxLength={80} value={form.variety} onChange={set('variety')} />
          </Field>
          <Field label={t('plots.sowingDate')} htmlFor="sowingDate" optional error={fieldErrors.sowingDate}>
            <input id="sowingDate" type="date" className="input" value={form.sowingDate} onChange={set('sowingDate')} />
          </Field>
          <Field label={t('plots.area')} htmlFor="areaAcres" optional error={fieldErrors.areaAcres}>
            <input id="areaAcres" type="number" min="0" step="0.01" inputMode="decimal" className="input" value={form.areaAcres} onChange={set('areaAcres')} />
          </Field>
          <Field label={t('auth.district')} htmlFor="district" optional>
            <input id="district" className="input" maxLength={60} value={form.district} onChange={set('district')} />
          </Field>
        </div>

        <Field label={t('plots.location')} hint={t('plots.locationHelp')} error={(locationError && !point && t('plots.pickLocation')) || fieldErrors.lat}>
          <div className="space-y-2">
            <MapPicker
              value={point}
              onChange={(p) => {
                setPoint(p);
                setLocationError(false);
              }}
            />
            <button type="button" className="btn-secondary" onClick={geo.request} disabled={geo.status === 'loading'}>
              {geo.status === 'loading' ? <Spinner className="size-4" /> : <LocateFixed className="size-4" aria-hidden="true" />}
              {t('scan.useLocation')}
            </button>
            {geo.status === 'error' && <p className="text-xs text-danger">{t('scan.locationFailed')}</p>}
          </div>
        </Field>

        <Field label={t('plots.notes')} htmlFor="notes" optional>
          <textarea id="notes" rows={3} maxLength={2000} className="input py-2" value={form.notes} onChange={set('notes')} />
        </Field>

        <div className="flex justify-end gap-2">
          <Link to={id ? `/plots/${id}` : '/plots'} className="btn-ghost">
            {t('common.cancel')}
          </Link>
          <button type="submit" className="btn-primary" disabled={save.isPending}>
            {save.isPending && <Spinner className="size-4 text-white" />}
            {t('common.save')}
          </button>
        </div>
      </form>
    </div>
  );
}
