const API_BASE = '/api/v1';

async function request(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const selectedTenantId = localStorage.getItem('selectedTenantId');
  if (selectedTenantId) {
    headers['X-Tenant-ID'] = selectedTenantId;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/portal/login';
    return;
  }

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error?.message || data.message || 'Request failed');
  }

  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: 'DELETE' }),

  upload: async (path, file, extraFields = {}) => {
    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('file', file);
    Object.entries(extraFields).forEach(([k, v]) => formData.append(k, v));

    const uploadHeaders = { Authorization: `Bearer ${token}` };
    const selectedTenantId = localStorage.getItem('selectedTenantId');
    if (selectedTenantId) {
      uploadHeaders['X-Tenant-ID'] = selectedTenantId;
    }

    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: uploadHeaders,
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Upload failed');
    return data;
  },

  // Data Ingestion API-First endpoints
  ingest: {
    prestadores: (batch) => request('/data/prestadores/batch', { method: 'POST', body: JSON.stringify(batch) }),
    nomencladores: (batch) => request('/data/nomencladores/batch', { method: 'POST', body: JSON.stringify(batch) }),
    acuerdos: (batch) => request('/data/acuerdos/batch', { method: 'POST', body: JSON.stringify(batch) }),
    jobStatus: (jobId) => request(`/data/jobs/${jobId}/status`),
    stats: () => request('/data/stats'),
  },

  // Ordenes Batch Processing
  ordenesBatch: {
    submit: (orders) => request('/ordenes/batch', { method: 'POST', body: JSON.stringify(orders) }),
    status: (batchId) => request(`/ordenes/batch/${batchId}/status`),
  },

  // Feedback / Pre-visacion
  feedback: {
    submit: (idVisacion, body) => request(`/ordenes/${idVisacion}/feedback`, { method: 'POST', body: JSON.stringify(body) }),
  },
};
