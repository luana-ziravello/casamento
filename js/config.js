/* ==========================================================================
   Configuração central do Álbum de Fotos colaborativo.

   ── COMO PUBLICAR O ÁLBUM ────────────────────────────────────────────────
   1. PHOTO_ALBUM_ENABLED = false  → álbum indisponível (mesmo pela URL direta)
                                      e o botão do site continua "Confirmar
                                      presença".
   2. PHOTO_ALBUM_ENABLED = true, antes da data de ativação → álbum funciona
                                      normalmente em album.html, mas SEM
                                      nenhuma chamada pública no site (útil
                                      para os noivos testarem antes da hora).
   3. PHOTO_ALBUM_ENABLED = true, a partir da data de ativação → o botão
                                      "Confirmar presença" vira "Álbum de
                                      fotos" automaticamente.

   A data de ativação é conferida contra um horário de referência do próprio
   Supabase (cabeçalho HTTP `Date`), não só o relógio do celular do
   convidado — assim a virada não depende do aparelho de cada um estar com a
   hora certa. Se por algum motivo não for possível consultar o servidor, o
   relógio do dispositivo é usado como reserva.
   ========================================================================== */

window.SITE_CONFIG = (function () {
  const PHOTO_ALBUM_ENABLED = true; // álbum publicado: acessível por quem tem o link direto, sem chamada pública no site
  const PHOTO_ALBUM_ACTIVATION_ISO = '2026-10-10T00:00:00-03:00';

  const SUPABASE_URL = 'https://huggafwjjceoekgjzbxi.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_BzOM_a4GHiAiiAThr5N0GA_ZV0bkE4D';

  let horaServidorPromise = null;
  function obterAgora() {
    if (!horaServidorPromise) {
      horaServidorPromise = fetch(`${SUPABASE_URL}/rest/v1/`, {
        method: 'HEAD',
        headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
      })
        .then((res) => {
          const cabecalho = res.headers.get('date');
          const data = cabecalho ? new Date(cabecalho) : null;
          return data && !Number.isNaN(data.getTime()) ? data : new Date();
        })
        .catch(() => new Date());
    }
    return horaServidorPromise;
  }

  async function albumEstaNoAr() {
    if (!PHOTO_ALBUM_ENABLED) return false;
    const agora = await obterAgora();
    return agora.getTime() >= new Date(PHOTO_ALBUM_ACTIVATION_ISO).getTime();
  }

  return {
    PHOTO_ALBUM_ENABLED,
    PHOTO_ALBUM_ACTIVATION_ISO,
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    obterAgora,
    albumEstaNoAr,
  };
})();
