// Small helper for talking to our own backend.
// Because the website and the API are served by the SAME Node app,
// we can just use "/api/..." - no need for a full web address.

const API_BASE = 'https://restaurant-webapp-gray.vercel.app/api';

async function apiRequest(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    credentials: 'include', // sends the login cookie automatically
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  let data = {};
  try { data = await res.json(); } catch (e) { /* no body */ }

  if (!res.ok) {
    throw new Error(data.message || 'Something went wrong. Please try again.');
  }
  return data;
}

const api = {
  get: (path) => apiRequest(path),
  post: (path, body) => apiRequest(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => apiRequest(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (path, body) => apiRequest(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: (path) => apiRequest(path, { method: 'DELETE' }),
};

// Format a number as Naira currency, e.g. 4500 -> "₦4,500"
function currency(amount) {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(amount);
}
