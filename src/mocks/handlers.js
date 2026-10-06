import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('https://api.waterdata.usgs.gov/ogcapi/v1/collections/continuous/items', () => {
    return HttpResponse.json({ type: "FeatureCollection", features: [] });
  })
];
