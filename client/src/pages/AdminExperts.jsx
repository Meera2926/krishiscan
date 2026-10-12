import clsx from 'clsx';
import { BadgeCheck, Ban, FileImage, Mail, MapPin, ShieldCheck, X, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { describeError } from '../api/client.js';
import { useExpertApplications, useExpertDecision, useExpertOptions } from '../api/hooks.js';
import { CertificateImage, ExpertFacts, VerificationBadge } from '../components/experts.jsx';
import { Alert, EmptyState, ErrorState, Field, PageHeader, Pagination, Spinner } from '../components/ui.jsx';
import { shortDate } from '../lib/format.js';

const TABS = ['pending', 'verified', 'rejected', 'suspended'];

/** Which decisions the server accepts from each status; anything else is a 409. */
const ACTIONS = {
  pending: ['verify', 'reject'],
  verified: ['suspend'],
  rejected: ['verify'],
  suspended: ['verify'],
};

const ACTION_STYLE = {
  verify: { cls: 'btn-primary', Icon: BadgeCheck },
  reject: { cls: 'btn-danger', Icon: XCircle },
  suspend: { cls: 'btn-danger', Icon: Ban },
};

const MIN_NOTE = 5;

const FACT_FIELDS = ['degree', 'specialisation', 'university', 'organisation', 'designation', 'experienceYears', 'crops', 'languages', 'modes'];

function ApplicationCard({ item, degreeLabel, onDecided }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const decide = useExpertDecision();
  const [showDocument, setShowDocument] = useState(false);
  const [action, setAction] = useState(null);
  const [note, setNote] = useState('');

  const verification = item.expertVerification ?? {};
  const profile = item.expertProfile ?? {};
  const place = [item.district, item.state].filter(Boolean).join(', ');
  // Turning someone down or stopping them must come with a reason they can read and act on.
  const noteRequired = action === 'reject' || action === 'suspend';
  const noteOk = !noteRequired || note.trim().length >= MIN_NOTE;
  const error = decide.error ? describeError(decide.error) : null;
  const noteId = `note-${item.id}`;

  const choose = (next) => {
    decide.reset();
    setNote('');
    setAction(next);
  };

  const confirm = () =>
    decide.mutate(
      {
        id: item.id,
        decision: action,
        ...(note.trim() && { note: note.trim() }),
        // The version of the application on screen; the server refuses if a newer one has arrived.
        ...(verification.submittedAt && { submittedAt: verification.submittedAt }),
      },
      { onSuccess: (data) => onDecided({ decision: action, name: item.name, released: data?.released ?? 0 }) },
    );

  return (
    <li className="card overflow-hidden">
      <div className="space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold leading-tight">{item.name}</h2>
            <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
              <span className="inline-flex min-w-0 items-center gap-1.5 break-all">
                <Mail className="size-3.5 shrink-0" aria-hidden="true" />
                {item.email}
              </span>
              {place && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                  {place}
                </span>
              )}
            </p>
            <p className="mt-1 text-xs text-ink-subtle">
              {t('admin.applied', { date: shortDate(verification.submittedAt ?? item.createdAt, lang) })}
            </p>
          </div>
          <VerificationBadge status={verification.status} />
        </div>

        {profile.qualification && <p className="text-base font-bold text-brand-700">{profile.qualification}</p>}
        <ExpertFacts expert={profile} degreeLabel={degreeLabel} fields={FACT_FIELDS} />
        {profile.bio && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">{t('expert.field.bio')}</p>
            <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed">{profile.bio}</p>
          </div>
        )}

        {verification.decidedAt && (
          <div className="rounded-card border border-line bg-surface-sunken p-3.5 text-sm">
            <p className="text-ink-muted">
              {verification.decidedBy?.name
                ? t('admin.decidedBy', { name: verification.decidedBy.name, date: shortDate(verification.decidedAt, lang) })
                : t('admin.decidedOn', { date: shortDate(verification.decidedAt, lang) })}
            </p>
            {verification.note && <p className="mt-1 whitespace-pre-wrap">{verification.note}</p>}
          </div>
        )}

        <div>
          {item.hasDocument ? (
            <>
              <button type="button" className="btn-secondary" aria-expanded={showDocument} onClick={() => setShowDocument((v) => !v)}>
                <FileImage className="size-4" aria-hidden="true" />
                {showDocument ? t('admin.hideCertificate') : t('admin.viewCertificate')}
              </button>
              {showDocument && (
                <div className="mt-3">
                  <CertificateImage expertId={item.id} version={verification.submittedAt} variant="large" />
                </div>
              )}
            </>
          ) : (
            <Alert tone="warn">{t('admin.noCertificate')}</Alert>
          )}
        </div>
      </div>

      <div className="border-t border-line bg-surface-sunken p-5 sm:px-6">
        {!action ? (
          <div className="flex flex-wrap gap-2">
            {(ACTIONS[verification.status] ?? []).map((a) => {
              const { cls, Icon } = ACTION_STYLE[a];
              return (
                <button key={a} type="button" className={cls} onClick={() => choose(a)}>
                  <Icon className="size-4" aria-hidden="true" />
                  {a === 'verify' && verification.status === 'suspended' ? t('admin.reinstate') : t(`admin.action.${a}`)}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-medium">{t(`admin.warning.${action}`)}</p>
            <Field
              label={t('admin.noteLabel')}
              htmlFor={noteId}
              optional={!noteRequired}
              hint={noteRequired ? t('admin.noteRequired', { min: MIN_NOTE }) : t('admin.noteOptional')}
              error={error?.fields?.note}
            >
              <textarea
                id={noteId}
                className="input py-2"
                rows={3}
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                required={noteRequired}
              />
            </Field>
            {error && !error.fields?.note && <Alert tone="danger">{error.message}</Alert>}
            <div className="flex flex-wrap gap-2">
              {/* Stays locked after success too: the card leaves the list only when the refetch lands. */}
              <button
                type="button"
                className={ACTION_STYLE[action].cls}
                disabled={!noteOk || decide.isPending || decide.isSuccess}
                onClick={confirm}
              >
                {decide.isPending && <Spinner className="size-4" />}
                {t(`admin.confirm.${action}`)}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setAction(null)} disabled={decide.isPending}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * Where an admin checks each expert before they can see a farmer's case: the details they gave,
 * side by side with the certificate that is meant to prove them.
 */
export default function AdminExperts() {
  const { t } = useTranslation();
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState(null);
  const noticeRef = useRef(null);
  const { data, isLoading, isPlaceholderData, error, refetch } = useExpertApplications(status, { page });

  // The card that was just decided leaves the list, taking keyboard focus with it; put focus on
  // the confirmation instead, so it is both seen and read out.
  useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);

  // Deciding the last application on the last page leaves that page empty; step back to one that is not.
  useEffect(() => {
    if (data && page > data.pages) setPage(data.pages);
  }, [data, page]);
  const options = useExpertOptions();
  const counts = data?.counts ?? {};
  const degreeLabel = (key) => options.data?.degrees?.find((d) => d.key === key)?.label ?? key;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t('admin.title')} subtitle={t('admin.subtitle')} />

      {notice && (
        <Alert tone="ok" className="mb-5">
          <div className="flex items-start gap-3" role="status" tabIndex={-1} ref={noticeRef}>
            <p className="min-w-0 flex-1">
              {t(`admin.done.${notice.decision}`, { name: notice.name })}
              {notice.released > 0 && ` ${t('admin.released', { count: notice.released })}`}
            </p>
            <button type="button" className="-my-1 shrink-0 rounded-full p-1 hover:bg-ok/10" onClick={() => setNotice(null)} aria-label={t('admin.dismiss')}>
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        </Alert>
      )}

      <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-black/5 p-1 sm:flex sm:w-fit" role="tablist" aria-label={t('admin.title')}>
        {TABS.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            id={`tab-${s}`}
            aria-selected={status === s}
            aria-controls="applications-panel"
            onClick={() => {
              setStatus(s);
              setPage(1);
            }}
            className={clsx(
              'flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium',
              status === s ? 'bg-surface shadow-sm' : 'text-ink-muted',
            )}
          >
            {t(`admin.tab.${s}`)}
            {counts[s] != null && (
              <span
                className={clsx(
                  'chip tabular-nums',
                  s === 'pending' && counts[s] > 0 ? 'bg-warn-bg text-warn ring-1 ring-warn/20' : 'bg-canvas-deep text-ink-muted',
                )}
              >
                {counts[s]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div id="applications-panel" role="tabpanel" aria-labelledby={`tab-${status}`} aria-busy={isPlaceholderData}>
        {isLoading ? (
          <Spinner />
        ) : error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : !data.items.length ? (
          <EmptyState icon={ShieldCheck} title={t(`admin.empty.${status}`)} />
        ) : (
          <ul className={clsx('space-y-5 transition-opacity', isPlaceholderData && 'opacity-60')}>
            {data.items.map((item) => (
              <ApplicationCard key={item.id} item={item} degreeLabel={degreeLabel(item.expertProfile?.degree)} onDecided={setNotice} />
            ))}
          </ul>
        )}
        {data && <Pagination page={data.page} pages={data.pages} onChange={setPage} />}
      </div>
    </div>
  );
}
