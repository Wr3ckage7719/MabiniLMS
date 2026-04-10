import { apiClient } from './api-client';

export interface SearchParams {
  q: string;
  limit?: number;
  offset?: number;
}

const toQuery = (params: SearchParams) => {
  const query = new URLSearchParams();
  query.append('q', params.q);
  if (typeof params.limit === 'number') query.append('limit', String(params.limit));
  if (typeof params.offset === 'number') query.append('offset', String(params.offset));
  return query.toString();
};

export const searchService = {
  global(params: SearchParams) {
    return apiClient.get(`/search?${toQuery(params)}`);
  },

  courses(params: SearchParams) {
    return apiClient.get(`/search/courses?${toQuery(params)}`);
  },

  materials(params: SearchParams) {
    return apiClient.get(`/search/materials?${toQuery(params)}`);
  },

  users(params: SearchParams) {
    return apiClient.get(`/search/users?${toQuery(params)}`);
  },

  assignments(params: SearchParams) {
    return apiClient.get(`/search/assignments?${toQuery(params)}`);
  },
};
