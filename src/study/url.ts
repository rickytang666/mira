// Shared by createStudy and the knowledge page; a bare host like "httpbin.org" still gets a scheme.
export const withScheme = (url: string) => (/^https?:\/\//.test(url) ? url : `https://${url}`);
