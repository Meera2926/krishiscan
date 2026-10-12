import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';

const get = (url, params) => api.get(url, { params }).then((r) => r.data);

export const keys = {
  crops: ['crops'],
  diseases: (filters) => ['diseases', filters],
  disease: (key) => ['disease', key],
  plots: ['plots'],
  plot: (id) => ['plot', id],
  scans: (filters) => ['scans', filters],
  scan: (id) => ['scan', id],
  summary: ['scans', 'summary'],
  alerts: ['alerts'],
  outbreaks: (params) => ['outbreaks', params],
  plotRisk: (id) => ['risk', 'plot', id],
  reviewQueue: (params) => ['reviews', 'queue', params],
  reviewMetrics: ['reviews', 'metrics'],
  consultations: (params) => ['consultations', params],
  consultation: (id) => ['consultation', id],
  consultationSlots: ['consultations', 'slots'],
  experts: (params) => ['consultations', 'experts', params],
  consultationSummary: ['consultations', 'summary'],
  expertOptions: ['experts', 'options'],
  myApplication: ['experts', 'me', 'application'],
  expertApplications: (status, page = 1) => ['experts', 'applications', status, page],
  expertProfile: (id) => ['experts', 'profile', id],
  // The version is when the application was sent: a resubmitted certificate is a different file.
  expertDocument: (id, version) => ['experts', 'document', id, ...(version ? [version] : [])],
};

export const useCrops = () => useQuery({ queryKey: keys.crops, queryFn: () => get('/crops').then((d) => d.crops), staleTime: 60 * 60_000 });

export const useDiseases = (filters) =>
  useQuery({ queryKey: keys.diseases(filters), queryFn: () => get('/diseases', filters).then((d) => d.diseases), staleTime: 10 * 60_000, placeholderData: keepPreviousData });

export const useDisease = (key) =>
  useQuery({ queryKey: keys.disease(key), queryFn: () => get(`/diseases/${key}`).then((d) => d.disease), enabled: Boolean(key), staleTime: 10 * 60_000 });

export const usePlots = (options = {}) => useQuery({ queryKey: keys.plots, queryFn: () => get('/plots').then((d) => d.plots), ...options });

export const usePlot = (id) => useQuery({ queryKey: keys.plot(id), queryFn: () => get(`/plots/${id}`).then((d) => d.plot), enabled: Boolean(id) });

export const useScans = (filters) =>
  useQuery({ queryKey: keys.scans(filters), queryFn: () => get('/scans', filters), placeholderData: keepPreviousData });

export const useScan = (id) => useQuery({ queryKey: keys.scan(id), queryFn: () => get(`/scans/${id}`), enabled: Boolean(id) });

export const useScanSummary = () => useQuery({ queryKey: keys.summary, queryFn: () => get('/scans/summary') });

export const useOutbreakAlerts = () =>
  useQuery({ queryKey: keys.alerts, queryFn: () => get('/outbreaks/alerts').then((d) => d.alerts), staleTime: 5 * 60_000 });

export const useOutbreakMap = (params) =>
  useQuery({ queryKey: keys.outbreaks(params), queryFn: () => get('/outbreaks/map', params), enabled: params.lat != null, placeholderData: keepPreviousData });

export const usePlotRisk = (id) =>
  useQuery({ queryKey: keys.plotRisk(id), queryFn: () => get(`/risk/plots/${id}`), enabled: Boolean(id), staleTime: 30 * 60_000, retry: 1 });

export const useReviewQueue = (params) =>
  useQuery({ queryKey: keys.reviewQueue(params), queryFn: () => get('/reviews/queue', params), placeholderData: keepPreviousData });

export const useReviewMetrics = () => useQuery({ queryKey: keys.reviewMetrics, queryFn: () => get('/reviews/metrics') });

export function useCreateScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formData) => api.post('/scans', formData).then((r) => r.data),
    onSuccess: (data) => {
      qc.setQueryData(keys.scan(data.scan.id), data);
      qc.invalidateQueries({ queryKey: ['scans'] });
      qc.invalidateQueries({ queryKey: keys.plots });
      qc.invalidateQueries({ queryKey: ['progression'] });
    },
  });
}

export function useUpdateScan(id) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (changes) => api.patch(`/scans/${id}`, changes).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.scan(id) });
      qc.invalidateQueries({ queryKey: ['scans'] });
    },
  });
}

export function useDeleteScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`/scans/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scans'] });
      qc.invalidateQueries({ queryKey: ['progression'] });
      qc.invalidateQueries({ queryKey: keys.plots });
    },
  });
}

export function useSavePlot(id) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => (id ? api.patch(`/plots/${id}`, body) : api.post('/plots', body)).then((r) => r.data.plot),
    onSuccess: (plot) => {
      qc.setQueryData(keys.plot(plot.id), plot);
      qc.invalidateQueries({ queryKey: keys.plots });
      qc.invalidateQueries({ queryKey: keys.plotRisk(plot.id) });
    },
  });
}

export function useDeletePlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`/plots/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.plots }),
  });
}

export function useReviewDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }) => api.post(`/reviews/${id}`, body).then((r) => r.data),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['reviews'] });
      qc.invalidateQueries({ queryKey: keys.scan(id) });
    },
  });
}

export const useProgression = (plotId) =>
  useQuery({ queryKey: ['progression', plotId], queryFn: () => get(`/plots/${plotId}/progression`), enabled: Boolean(plotId) });

export function useCreateTreatment(plotId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api.post(`/plots/${plotId}/treatments`, body).then((r) => r.data.treatment),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['progression', plotId] }),
  });
}

export function useDeleteTreatment(plotId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`/plots/${plotId}/treatments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['progression', plotId] }),
  });
}

// --- expert consultations ---------------------------------------------------

export const useConsultations = (params = {}) =>
  useQuery({ queryKey: keys.consultations(params), queryFn: () => get('/consultations', params), placeholderData: keepPreviousData });

export const useConsultation = (id) =>
  useQuery({
    queryKey: keys.consultation(id),
    queryFn: () => get(`/consultations/${id}`).then((d) => d.consultation),
    enabled: Boolean(id),
    // A live chat should not need a refresh to show the expert's reply.
    refetchInterval: (query) => (query.state.data?.status === 'completed' ? false : 15_000),
  });

/** Dashboard counts and upcoming appointments; shaped by the caller's role. */
export const useConsultationSummary = () =>
  useQuery({ queryKey: keys.consultationSummary, queryFn: () => get('/consultations/summary'), refetchInterval: 30_000 });

export const useExperts = (params = {}) =>
  useQuery({ queryKey: keys.experts(params), queryFn: () => get('/consultations/experts', params).then((d) => d.experts), staleTime: 10 * 60_000 });

export const useConsultationSlots = () =>
  useQuery({ queryKey: keys.consultationSlots, queryFn: () => get('/consultations/slots').then((d) => d.slots), staleTime: 10 * 60_000 });

/** Invalidates everything a consultation can change, including the scan it was raised for. */
function useConsultationMutation(mutationFn, id) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (data) => {
      const consultation = data?.consultation ?? data;
      if (consultation?.id) qc.setQueryData(keys.consultation(consultation.id), consultation);
      qc.invalidateQueries({ queryKey: ['consultations'] });
      qc.invalidateQueries({ queryKey: keys.consultationSummary });
      qc.invalidateQueries({ queryKey: ['consultation', id] });
      if (consultation?.scan?.id ?? consultation?.scan) {
        qc.invalidateQueries({ queryKey: keys.scan(consultation.scan?.id ?? consultation.scan) });
      }
    },
  });
}

export const useConsultationDecision = (id) =>
  useConsultationMutation((body) => api.post(`/consultations/${id}/decision`, body).then((r) => r.data), id);

/** Takes FormData, so a message can carry a photo as well as text. */
export const useConsultationMessage = (id) =>
  useConsultationMutation((form) => api.post(`/consultations/${id}/messages`, form).then((r) => r.data), id);

export const useConsultationAction = (id) =>
  useConsultationMutation((body) => api.patch(`/consultations/${id}`, body).then((r) => r.data), id);

export const useRequestConsultation = () =>
  useConsultationMutation((body) => api.post('/consultations', body).then((r) => r.data));

export function useRateConsultation(id) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api.post(`/consultations/${id}/rating`, body).then((r) => r.data),
    onSuccess: ({ rating, expertRating }) => {
      qc.setQueryData(keys.consultation(id), (old) => (old ? { ...old, rating, expertRating } : old));
      qc.invalidateQueries({ queryKey: keys.consultation(id) });
      // The new average shows wherever a farmer chooses an expert: the picker and the profile.
      qc.invalidateQueries({ queryKey: ['consultations', 'experts'] });
      qc.invalidateQueries({ queryKey: ['experts', 'profile'] });
    },
  });
}

// --- expert verification ----------------------------------------------------

export const useExpertOptions = () =>
  useQuery({ queryKey: keys.expertOptions, queryFn: () => get('/experts/options'), staleTime: 60 * 60_000 });

export const useMyApplication = (options = {}) =>
  useQuery({ queryKey: keys.myApplication, queryFn: () => get('/experts/me/application').then((d) => d.application), ...options });

/** Takes FormData; leaving the certificate out keeps the one already on file. */
export function useResubmitApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formData) => api.put('/experts/me/application', formData).then((r) => r.data.user),
    onSuccess: (user) => {
      qc.invalidateQueries({ queryKey: keys.myApplication });
      qc.invalidateQueries({ queryKey: keys.expertDocument(user.id) });
    },
  });
}

/** Admin only. `counts` covers every status, so the tabs can show totals while one is open. */
export const useExpertApplications = (status, { page = 1, ...options } = {}) =>
  useQuery({
    queryKey: keys.expertApplications(status, page),
    queryFn: () => get('/experts/applications', { status, page }),
    placeholderData: keepPreviousData,
    ...options,
  });

export function useExpertDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }) => api.post(`/experts/${id}/verification`, body).then((r) => r.data),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['experts', 'applications'] });
      qc.invalidateQueries({ queryKey: keys.expertProfile(id) });
      // Verifying or suspending changes who farmers can book, and a suspension hands that
      // expert's open cases back to the queue.
      qc.invalidateQueries({ queryKey: ['consultations'] });
    },
  });
}

export const useExpertProfile = (id) =>
  useQuery({ queryKey: keys.expertProfile(id), queryFn: () => get(`/experts/${id}`).then((d) => d.expert), enabled: Boolean(id) });

/**
 * With responseType 'blob' an error body arrives as a Blob too; turn it back into JSON so
 * describeError() can still read the server's message.
 */
async function readBlobError(error) {
  const data = error.response?.data;
  if (data instanceof Blob && data.type.includes('json')) {
    try {
      error.response.data = JSON.parse(await data.text());
    } catch {
      // Leave it; describeError falls back to a generic message.
    }
  }
  throw error;
}

/**
 * The degree certificate, as a Blob. It needs the bearer token, so it is fetched here rather than
 * put in an <img src>; the caller turns it into an object URL and revokes it.
 */
export const useExpertDocument = (id, { enabled = true, version } = {}) =>
  useQuery({
    queryKey: keys.expertDocument(id, version),
    queryFn: () => api.get(`/experts/${id}/document`, { responseType: 'blob' }).then((r) => r.data, readBlobError),
    enabled: Boolean(id) && enabled,
    staleTime: 10 * 60_000,
  });
