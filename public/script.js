const API_URL = "http://localhost:3000/api";

// Estados globais
let criticalStock = [];
let lowStock = [];
let stats = null;
let checkResult = null;
let socket = null;
let azelerSyncStatus = {
  lastSync: null,
  totalExternal: 0,
  totalLocal: 0,
  missingInLocal: 0,
  missingInExternal: 0,
  lowStockItems: 0,
  syncing: false,
};

// Paginação
let criticalPage = 1;
let lowPage = 1;
const pageLimit = 20;

// Inicialização
document.addEventListener("DOMContentLoaded", function () {
  initializeWebSocket();
  fetchDashboard();
  fetchCriticalStock(criticalPage);
  fetchLowStock(lowPage);
  fetchStats();

  // Atualização automática a cada 30s
  setInterval(() => {
    fetchDashboard();
    fetchCriticalStock(criticalPage);
    fetchLowStock(lowPage);
    fetchStats();
  }, 30000);
});

// WebSocket
function initializeWebSocket() {
  socket = io("http://localhost:3000");

  const statusElement = document.getElementById("socket-status");
  statusElement.textContent = "Conectando...";
  statusElement.style.color = "#f39c12";

  socket.on("connect", () => {
    statusElement.textContent = "Conectado";
    statusElement.style.color = "#27ae60";
  });

  socket.on("disconnect", () => {
    statusElement.textContent = "Desconectado";
    statusElement.style.color = "#e74c3c";
  });

  socket.on("critical-stock-update", (data) => {
    criticalStock = data.items;
    stats = data.stats;
    updateCriticalStockTable();
    updateDashboardCards();
    // showAlerts(data.items);
  });
}

// Funções de API com paginação
async function fetchCriticalStock(page = 1) {
  try {
    const response = await fetch(
      `${API_URL}/spare-parts/critical-stock?page=${page}&limit=${pageLimit}`
    );
    const data = await response.json();
    criticalStock = data.data;
    updateCriticalStockTable();
    updateCriticalPagination(data.pagination);
    showSuccess(`${data.pagination.total} peças críticas encontradas`);
    criticalPage = page;
  } catch (error) {
    showError("Erro ao buscar estoque crítico: " + error.message);
  }
}

async function fetchLowStock(page = 1) {
  try {
    const response = await fetch(
      `${API_URL}/spare-parts/low-stock?threshold=1&page=${page}&limit=${pageLimit}`
    );
    const data = await response.json();
    lowStock = data.data;
    updateLowStockTable();
    updateLowPagination(data.pagination);
    showSuccess(`${data.pagination.total} peças com estoque ≤ 1 encontradas`);
    lowPage = page;
  } catch (error) {
    showError("Erro ao buscar estoque baixo: " + error.message);
  }
}

async function fetchStats() {
  try {
    const response = await fetch(`${API_URL}/spare-parts/stats`);
    const data = await response.json();
    stats = data.data;
    updateStatsDisplay();
    updateDashboardCards();
    showSuccess("Estatísticas atualizadas");
  } catch (error) {
    showError("Erro ao buscar estatísticas: " + error.message);
  }
}

async function fetchDashboard() {
  try {
    const response = await fetch(`${API_URL}/spare-parts/dashboard`);
    const data = await response.json();
    stats = data.data.stats;
    criticalStock = data.data.topCriticalItems;
    updateDashboardCards();
    updateCriticalStockTable();

    if (data.data.hasAlerts) {
      showAlert(data.data.alertMessage);
    }
  } catch (error) {
    showError("Erro ao buscar dashboard: " + error.message);
  }
}

async function syncWithAzeler() {
  try {
    azelerSyncStatus.syncing = true;
    updateAzelerSyncCard();
    showInfo("Sincronizando com API Azeler...");
    const response = await fetch(`${API_URL}/spare-parts/sync`);
    const data = await response.json();

    const syncInfo = data.data;
    azelerSyncStatus = {
      lastSync: new Date().toLocaleString(),
      totalExternal: syncInfo.totalExternal,
      totalLocal: syncInfo.totalLocal,
      missingInLocal: syncInfo.missingInLocal.length,
      missingInExternal: syncInfo.missingInExternal.length,
      lowStockItems: syncInfo.lowStockItems.length,
      syncing: false,
    };
    updateAzelerSyncCard();
    showSuccess("Sincronização concluída!");
    await fetchDashboard();
  } catch (error) {
    azelerSyncStatus.syncing = false;
    updateAzelerSyncCard();
    showError("Erro na sincronização: " + error.message);
  }
}

function updateAzelerSyncCard() {
  const statusDiv = document.getElementById("azeler-sync-status");
  const btn = document.getElementById("azeler-sync-btn");
  if (!statusDiv || !btn) return;

  if (azelerSyncStatus.syncing) {
    statusDiv.innerHTML = "Sincronizando... <span class='spinner'></span>";
    btn.disabled = true;
    return;
  }

  statusDiv.innerHTML = `
    <b>Última sincronização:</b> ${azelerSyncStatus.lastSync || "Nunca"}<br>
    <b>Total Azeler:</b> ${azelerSyncStatus.totalExternal}<br>
    <b>Total Local:</b> ${azelerSyncStatus.totalLocal}<br>
    <b>Faltando localmente:</b> ${azelerSyncStatus.missingInLocal}<br>
    <b>Faltando na Azeler:</b> ${azelerSyncStatus.missingInExternal}<br>
    <b>Estoque crítico:</b> ${azelerSyncStatus.lowStockItems}
  `;
  btn.disabled = false;
}

async function checkStock() {
  const warehouseID = document.getElementById("warehouse-id").value;
  if (!warehouseID) {
    showError("Digite um WarehouseID");
    return;
  }

  try {
    const response = await fetch(
      `${API_URL}/spare-parts/check-stock/${warehouseID}`
    );
    const data = await response.json();
    checkResult = data;
    updateCheckResult();

    if (data.success && data.alert) {
      showAlert(data.alert);
    }
  } catch (error) {
    checkResult = { success: false, message: "Peça não encontrada" };
    updateCheckResult();
    showError("Erro ao verificar estoque: " + error.message);
  }
}

function updateStock() {
  const updateGroup = document.getElementById("update-stock-group");
  updateGroup.style.display =
    updateGroup.style.display === "none" ? "flex" : "none";
}

async function confirmUpdateStock() {
  const warehouseID = document.getElementById("warehouse-id").value;
  const newStock = document.getElementById("new-stock").value;

  if (!warehouseID || newStock === "") {
    showError("Digite WarehouseID e novo estoque");
    return;
  }

  try {
    const response = await fetch(
      `${API_URL}/spare-parts/update-stock/${warehouseID}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ stock: parseInt(newStock) }),
      }
    );

    const data = await response.json();

    if (data.success) {
      showSuccess(`${data.message} - ${data.statusMessage}`);
      document.getElementById("new-stock").value = "";
      document.getElementById("update-stock-group").style.display = "none";

      // Recarrega dados
      await checkStock();
      await fetchDashboard();
    } else {
      showError(data.message);
    }
  } catch (error) {
    showError("Erro ao atualizar estoque: " + error.message);
  }
}

// Funções de atualização da UI
function updateCriticalStockTable() {
  const tbody = document.getElementById("critical-stock-body");

  if (criticalStock.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6">Nenhuma peça crítica</td></tr>';
    return;
  }

  tbody.innerHTML = criticalStock
    .map(
      (item) => `
        <tr class="status-critical">
            <td>${item.warehouseID}</td>
            <td>${item.partDescription || "N/A"}</td>
            <td>${item.stock}</td>
            <td>${item.brand || "N/A"}</td>
            <td>${item.model || "N/A"}</td>
            <td><strong>CRÍTICO</strong></td>
        </tr>
    `
    )
    .join("");
}

function updateLowStockTable() {
  const tbody = document.getElementById("low-stock-body");

  if (lowStock.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="6">Clique em "Ver Estoque ≤ 1"</td></tr>';
    return;
  }

  tbody.innerHTML = lowStock
    .map((item) => {
      const statusClass =
        item.stock === 0
          ? "status-critical"
          : item.stock === 1
          ? "status-normal"
          : "status-high";
      const statusText =
        item.stock === 0 ? "CRÍTICO" : item.stock === 1 ? "NORMAL" : "ALTO";

      return `
            <tr class="${statusClass}">
                <td>${item.warehouseID}</td>
                <td>${item.partDescription || "N/A"}</td>
                <td>${item.stock}</td>
                <td>${item.brand || "N/A"}</td>
                <td>${item.model || "N/A"}</td>
                <td><strong>${statusText}</strong></td>
            </tr>
        `;
    })
    .join("");
}

// Paginação
function updateCriticalPagination(pagination) {
  const container = document.getElementById("critical-pagination");
  container.innerHTML = renderPagination(pagination, fetchCriticalStock);
}

function updateLowPagination(pagination) {
  const container = document.getElementById("low-pagination");
  container.innerHTML = renderPagination(pagination, fetchLowStock);
}

function renderPagination(pagination, fetchFunction) {
  if (!pagination) return "";
  const { page, totalPages } = pagination;
  let html = "";

  if (page > 1) {
    html += `<button onclick="${fetchFunction.name}(${
      page - 1
    })">Anterior</button>`;
  }
  html += ` Página ${page} de ${totalPages} `;
  if (page < totalPages) {
    html += `<button onclick="${fetchFunction.name}(${
      page + 1
    })">Próxima</button>`;
  }
  return html;
}

function updateStatsDisplay() {
  const display = document.getElementById("stats-display");
  display.textContent = stats
    ? JSON.stringify(stats, null, 2)
    : "Clique para ver estatísticas";
}

function updateCheckResult() {
  const display = document.getElementById("check-result");
  display.textContent = checkResult
    ? JSON.stringify(checkResult, null, 2)
    : "Digite um WarehouseID e clique";
}

function updateDashboardCards() {
  if (!stats) return;

  document.getElementById("critical-count").textContent =
    stats.criticalStock || 0;
  document.getElementById("normal-count").textContent = stats.lowStock || 0;
  document.getElementById("high-count").textContent = stats.normalStock || 0;
  document.getElementById("total-count").textContent = stats.total || 0;
}

// Funções de notificação
function showAlert(message) {
  showNotification(message, "alert");
}

function showSuccess(message) {
  showNotification(message, "success");
}

function showError(message) {
  showNotification(message, "alert");
}

function showInfo(message) {
  showNotification(message, "info");
}

function showNotification(message, type = "info") {
  const container = document.getElementById("alerts-container");
  const alert = document.createElement("div");  
  alert.className = `alert ${type}`;
  alert.textContent = message;

  container.appendChild(alert);

  // Remove após 5 segundos
  setTimeout(() => {
    if (alert.parentNode) {
      alert.parentNode.removeChild(alert);
    }
  }, 5000);
}

// function showAlerts(criticalItems) {
//   if (criticalItems && criticalItems.length > 0) {
//     showAlert(
//       `⚠️ ${criticalItems.length} peça(s) com estoque crítico (0 unidades)!`
//     );
//   }
// }
