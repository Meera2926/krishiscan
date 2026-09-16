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
