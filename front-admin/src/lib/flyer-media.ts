export function flyerPageFileUrl(flyerId: string, pageNumber: number) {
  return `/api/v1/admin/flyers/${flyerId}/pages/${pageNumber}/file`;
}

export function flyerPageSrc(filePath: string, flyerId: string, pageNumber: number) {
  if (/^https?:\/\//i.test(filePath)) return filePath;
  return flyerPageFileUrl(flyerId, pageNumber);
}
