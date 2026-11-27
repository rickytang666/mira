// Same rule as createStudy, so a bare host like "httpbin.org" still gets a scheme.
export const withScheme = (url: string) => (/^https?:\/\//.test(url) ? url : `https://${url}`);
