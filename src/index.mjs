import api from './index.js';

export const version = api.version;
export const ready = api.ready;
export const readySync = api.readySync;
export const countries = api.countries;
export const countriesSync = api.countriesSync;
export const options = api.options;
export const optionsSync = api.optionsSync;
export const getData = api.getData;
export const getDataSync = api.getDataSync;
export const get = api.get;
export const getSync = api.getSync;
export const prefetch = api.prefetch;
export const prefetchSync = api.prefetchSync;
export const configure = api.configure;
export const clearCache = api.clearCache;
export const DataApiError = api.DataApiError;
export const ERROR_CODES = api.ERROR_CODES;

export default api;
