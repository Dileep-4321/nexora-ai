export function notFound(req, res) { res.status(404).json({ success: false, message: 'Route not found' }); }
export function errorHandler(error, req, res, _next) { console.error(error.message); res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'An unexpected server error occurred' }); }
