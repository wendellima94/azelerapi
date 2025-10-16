const axios = require("axios");
const pLimit = require("p-limit");

class DesguacesAPIClient {
  constructor() {
    this.baseUrl = "https://agw.desguacesgp.es/api/innova";
    this.headers = {
      "x-api-token":
        "LdAgpHwsMhM4NqWjIlRq6bxyLJPfnGMRCxGDze9Nwm0h34C1ra2Aqzan5Z7D",
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "AzelerSync/1.0",
    };

    // Cache simples em memória (TTL 5 min)
    this.cache = new Map();
    this.TTL = 5 * 60 * 1000;

    // Controle de concorrência (até 5 requisições simultâneas)
    this.limit = pLimit(5);
  }

  limparModelo(modelo) {
    if (!modelo) return "";
    return String(modelo).split("(")[0].trim();
  }

  _toList(data) {
    if (Array.isArray(data)) return data;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        return [];
      }
    }
    if (typeof data === "object" && data !== null) {
      for (let key of [
        "data",
        "resultado",
        "result",
        "items",
        "rows",
        "records",
        "response",
      ]) {
        if (Array.isArray(data[key])) return data[key];
      }
    }
    return [];
  }

  /**
   * Busca peças por matrícula (tenta GET, se falhar → POST)
   */
  async obterPecasPorMatricula(matriculas) {
    const todasPecas = [];
    const listaMatriculas = String(matriculas)
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);

    const tasks = listaMatriculas.map((matricula) =>
      this.limit(async () => {
        // Cache check
        if (this.cache.has(matricula)) {
          const { data, ts } = this.cache.get(matricula);
          if (Date.now() - ts < this.TTL) {
            todasPecas.push(...data);
            return;
          }
        }

        const filtros = {
          f_matricula: matricula,
          f_estpie_cod: "1",
          f_precioV: ".00",
        };

        // Função auxiliar para tentar requisição
        const tryRequest = async (method) => {
          try {
            const res = await axios({
              url: `${this.baseUrl}/vehidespiececoncreto`,
              method,
              headers: this.headers,
              [method === "GET" ? "params" : "data"]: filtros,
              timeout: 30000,
            });

            const items = this._toList(res.data);
            console.log(
              `[API] ${method} matricula=${matricula} status=${res.status} qtd=${items.length}`
            );
            return { status: res.status, items };
          } catch (err) {
            const status = err.response?.status || 500;
            console.warn(
              `⚠️ ${method} falhou para ${matricula}: status=${status}`
            );
            return { status, items: [] };
          }
        };

        // 🚀 Tenta GET primeiro
        let { status, items } = await tryRequest("GET");

        // Se GET falhar (405, 400, 401, 403, 404, 415) ou vier vazio → tenta POST
        if ([400, 401, 403, 404, 405, 415].includes(status) || !items.length) {
          console.log(`[API] Tentando POST como fallback para ${matricula}...`);
          ({ status, items } = await tryRequest("POST"));
        }

        if (!items.length) {
          console.log(`[API] Nenhuma peça encontrada para ${matricula}`);
          return;
        }

        // Filtra e mapeia peças
        const pecas = items
          .filter(
            (p) =>
              String(p.estpie_cod).trim() === "1" &&
              String(p.precioV).trim() === ".00"
          )
          .map((p) => ({
            idPiezaDesp: p.idPiezaDesp || "",
            descricao: p.descripcion || "",
            OEM: p.refsOEM || null,
            preco: 0.0,
            marca: p.marca || "",
            modelo: p.modelo || "",
            modelo_limpo: this.limparModelo(p.modelo),
            matricula,
            estpie_cod: p.estpie_cod,
          }));

        console.log(`[API] Peças filtradas para ${matricula}: ${pecas.length}`);
        todasPecas.push(...pecas);

        // Salva no cache
        this.cache.set(matricula, { data: pecas, ts: Date.now() });
      })
    );

    await Promise.all(tasks);
    console.log(`[API] Total geral de peças processadas: ${todasPecas.length}`);
    return todasPecas;
  }

  /**
   * Busca imagens associadas a uma peça pelo ID (idPiezaDesp)
   * 🚧 Ainda não testado — deixar para depois
   */
  async obterImagensPorPeca(idPiezaDesp) {
    try {
      const res = await axios.get(`${this.baseUrl}/gesdoc`, {
        headers: this.headers,
        params: { f_idPiezaDesp: idPiezaDesp },
        timeout: 20000,
      });

      if (Array.isArray(res.data)) {
        return res.data
          .map((img) => img.rutaimgsrvsto)
          .filter(Boolean)
          .map((url) => (url.startsWith("http") ? url : `https://${url}`));
      }
      return [];
    } catch (err) {
      console.error(
        `❌ Erro ao buscar imagens para peça ${idPiezaDesp}:`,
        err.message
      );
      return [];
    }
  }

  /**
   * Busca peças + imagens em lote
   * 🚧 Imagens ainda não testadas — por enquanto retorna só as peças
   */
  async obterPecasComImagens(matriculas) {
    const pecas = await this.obterPecasPorMatricula(matriculas);

    // 🚧 Comentado até testar a rota de imagens
    // const pecasComImagens = await Promise.all(
    //   pecas.map(peca =>
    //     this.limit(async () => {
    //       const imagens = await this.obterImagensPorPeca(peca.idPiezaDesp);
    //       return { ...peca, imagens };
    //     })
    //   )
    // );
    // return pecasComImagens;

    // Por enquanto retorna só as peças sem imagens
    return pecas.map((p) => ({ ...p, imagens: [] }));
  }
}

module.exports = new DesguacesAPIClient();
