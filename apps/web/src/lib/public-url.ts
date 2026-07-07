/**
 * Origin used for links that leave the app (invite emails, etc.).
 *
 * The request origin is unreliable here: in Docker the server sees its bind
 * address (e.g. https://0.0.0.0:3000), not the public domain. In production,
 * build links from the DOMAIN env var (hire.vizuara.ai); docker-compose
 * refuses to start the web service without it. In development, fall back to
 * the request origin so local links keep working.
 */
export function getPublicOrigin(request: Request): string {
  const domain = process.env.DOMAIN?.trim();
  if (process.env.NODE_ENV === 'production' && domain) {
    return `https://${domain}`;
  }
  return new URL(request.url).origin;
}
