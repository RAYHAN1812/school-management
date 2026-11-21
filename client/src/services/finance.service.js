import { api, downloadFile, unwrap, unwrapWithMeta } from './api';

const clean = (params = {}) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null));

export const financeService = {
  feeTypes: () => api.get('/fee-types').then(unwrap),
  createFeeType: (data) => api.post('/fee-types', data).then(unwrap),
  updateFeeType: (id, data) => api.patch(`/fee-types/${id}`, data).then(unwrap),

  feeStructures: (params) => api.get('/fees', { params: clean(params) }).then(unwrap),
  createFeeStructure: (data) => api.post('/fees', data).then(unwrap),
  updateFeeStructure: (id, data) => api.patch(`/fees/${id}`, data).then(unwrap),
  deleteFeeStructure: (id) => api.delete(`/fees/${id}`).then(unwrap),

  invoices: (params) => api.get('/invoices', { params: clean(params) }).then(unwrapWithMeta),
  invoice: (id) => api.get(`/invoices/${id}`).then(unwrap),
  createInvoice: (data) => api.post('/invoices', data).then(unwrap),
  generateInvoices: (data) => api.post('/invoices/generate', data).then(unwrap),
  updateInvoice: (id, data) => api.patch(`/invoices/${id}`, data).then(unwrap),
  cancelInvoice: (id) => api.post(`/invoices/${id}/cancel`).then(unwrap),

  payments: (params) => api.get('/payments', { params: clean(params) }).then(unwrapWithMeta),
  recordPayment: (data) => api.post('/payments', data).then(unwrap),
  receipt: (id) => api.get(`/payments/${id}/receipt`).then(unwrap),
  report: (month) => api.get('/payments/reports', { params: clean({ month }) }).then(unwrap),
  exportReport: (month) => downloadFile('/payments/reports', { month, format: 'csv' }, 'finance.csv'),

  studentFees: (studentId) => api.get(`/students/${studentId}/fees`).then(unwrap),
  payOnline: (invoiceId, amount) => api.post('/payments/online/init', clean({ invoiceId, amount })).then(unwrap),
};

export const METHOD_LABELS = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank transfer',
  BKASH: 'bKash',
  NAGAD: 'Nagad',
  SSLCOMMERZ: 'Online (SSLCommerz)',
  OTHER: 'Other',
};

export const FREQUENCY_LABELS = { ONE_TIME: 'One-time', MONTHLY: 'Monthly', TERM: 'Per term', YEARLY: 'Yearly' };
