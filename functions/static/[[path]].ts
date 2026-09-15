import { proxyToPaper } from '../_shared/paper-proxy';

export const onRequest = (context: Parameters<typeof proxyToPaper>[0]) => proxyToPaper(context);
