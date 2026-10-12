import clsx from 'clsx';
import { BadgeCheck, Clock, ExternalLink, ShieldOff, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { describeError } from '../api/client.js';
import { useExpertDocument } from '../api/hooks.js';
import { useCropName } from './domain.jsx';
import { Alert } from './ui.jsx';

/** Organisation types come from the server in English; the UI shows its own translation. */
export function useOrgTypeLabel() {
  const { t } = useTranslation();
  return (key, fallback) => (key ? t(`expert.orgType.${key}`, { defaultValue: fallback ?? key }) : '');
}

const STATUS_STYLE = {
  pending: { cls: 'bg-info-bg text-info ring-info/15', Icon: Clock },
  verified: { cls: 'bg-ok-bg text-ok ring-ok/15', Icon: BadgeCheck },
  rejected: { cls: 'bg-warn-bg text-warn ring-warn/20', Icon: XCircle },
  suspended: { cls: 'bg-danger-bg text-danger ring-danger/20', Icon: ShieldOff },
};

export function VerificationBadge({ status }) {
  const { t } = useTranslation();
  const style = STATUS_STYLE[status];
  if (!style) return null;
  return (
    <span className={clsx('chip ring-1', style.cls)}>
      <style.Icon className="size-3.5" aria-hidden="true" />
      {t(`expert.status.${status}`)}
    </span>
  );
}

const DEFAULT_FIELDS = ['qualification', 'university', 'organisation', 'designation', 'experienceYears'];

/**
 * An expert's credentials as label/value rows. The same facts appear on the applicant's status
 * page, the admin's review card and the public profile, each with its own selection.
 * `expert` is either the flat public profile or an expertProfile plus name and place.
 */
export function ExpertFacts({ expert, degreeLabel, fields = DEFAULT_FIELDS, className }) {
  const { t } = useTranslation();
  const cropName = useCropName();
  const orgType = useOrgTypeLabel();
  if (!expert) return null;

  const values = {
    qualification: expert.qualification,
    degree: degreeLabel ?? expert.degreeLabel,
    specialisation: expert.specialisation,
    university: [expert.university, expert.graduationYear].filter(Boolean).join(', '),
    organisation: [orgType(expert.organisationType), expert.organisation].filter(Boolean).join(' · '),
    designation: expert.designation,
    experienceYears: expert.experienceYears != null ? t('consult.yearsExperience', { count: expert.experienceYears }) : null,
    place: [expert.district, expert.state].filter(Boolean).join(', '),
    languages: expert.languages?.map((l) => t(`lang.${l}`, l)).join(', '),
    modes: expert.modes?.map((m) => t(`consult.mode.${m}`, m)).join(', '),
    // No crops ticked means the expert advises on all of them, not on none.
    crops: expert.crops ? (expert.crops.length ? expert.crops.map(cropName).join(', ') : t('expert.field.allCrops')) : null,
  };
  const rows = fields.filter((f) => values[f]);
  if (!rows.length) return null;

  return (
    <dl className={clsx('grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2', className)}>
      {rows.map((f) => (
        <div key={f} className="min-w-0">
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">{t(`expert.field.${f}`)}</dt>
          <dd className="mt-0.5 break-words font-medium">{values[f]}</dd>
        </div>
      ))}
    </dl>
  );
}

/** An object URL for a Blob, revoked when the Blob changes or the component goes away. */
function useObjectUrl(blob) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!blob) return undefined;
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => {
      URL.revokeObjectURL(next);
      setUrl(null);
    };
  }, [blob]);
  return url;
}

/**
 * The degree certificate. "large" is for the admin, who has to read the name and the degree off
 * it; "thumb" is a reminder for the applicant of what they sent. Either opens full size in a new
 * tab, through the object URL, since the file itself needs the bearer token.
 */
export function CertificateImage({ expertId, variant = 'thumb' }) {
  const { t } = useTranslation();
  const { data: blob, isLoading, error, refetch } = useExpertDocument(expertId);
  const url = useObjectUrl(blob);
  const large = variant === 'large';

  if (isLoading) {
    return <div className={clsx('skeleton', large ? 'h-72 w-full' : 'h-28 w-40')} role="status" aria-label={t('common.loading')} />;
  }
  if (error) {
    return (
      <Alert tone="danger">
        <p>{describeError(error).message}</p>
        <button type="button" className="btn-ghost -ml-3 mt-1 min-h-9" onClick={() => refetch()}>
          {t('common.retry')}
        </button>
      </Alert>
    );
  }
  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={clsx(
        'group relative block overflow-hidden rounded-card border border-line bg-canvas-deep',
        large ? 'w-full' : 'w-fit',
      )}
    >
      <img
        src={url}
        alt={t('expert.field.certificate')}
        className={large ? 'max-h-[75vh] w-full object-contain' : 'h-28 w-auto max-w-full object-cover'}
      />
      <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-ink/75 px-2.5 py-1 text-xs font-semibold text-white">
        <ExternalLink className="size-3.5" aria-hidden="true" />
        {t('admin.openFull')}
      </span>
    </a>
  );
}
