// Lê location.hash: '#/convite/<token>' → { rota: 'convite', param: '<token>' }.
// Percent-encoding malformado (ex.: '%E0') vira param null em vez de URIError.
export function lerRota(hash) {
  const [rota = '', bruto] = String(hash).replace(/^#\/?/, '').split('/');
  let param = null;
  if (bruto) {
    try {
      param = decodeURIComponent(bruto);
    } catch {
      param = null;
    }
  }
  return { rota, param };
}
