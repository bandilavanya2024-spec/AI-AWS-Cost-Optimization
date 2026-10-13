/**
 * AI-Powered AWS Cloud Cost Optimization System
 * Frontend Application Controller
 * Version 1.1.0
 */

let barChartInstance = null;
let pieChartInstance = null;
let currentAnalysisData = null;
let currentPriorityFilter = "ALL";
let lastSuccessfulRetrievalTimestamp = null;
let lastDataSourceType = null;

// Local realistic fallback payload used if API Gateway is offline or initial local preview
const LOCAL_FALLBACK_PAYLOAD = {
    status: "success",
    retrieval_timestamp_utc: new Date().toISOString(),
    data_source: "demo_data",
    is_sample_data: true,
    data_source_label: "Demo / Sample Data (Simulated for Evaluation)",
    data_source_message: "Demo data: Cost Explorer data is not yet available or permissions are restricted. Simulated sample data is displayed for evaluation.",
    summary: {
        total_monthly_cost: 100.00,
        total_cost_formatted: "$100.00",
        services_analyzed_count: 6,
        highest_cost_service: {
            service_name: "Amazon Elastic Compute Cloud - Compute",
            cost: 38.50,
            cost_formatted: "$38.50",
            percentage_of_total: 38.5
        },
        potential_savings_estimate: {
            min_estimate: 15.79,
            max_estimate: 35.79,
            midpoint_estimate: 25.79,
            display_text: "$15.79 - $35.79",
            percentage_of_total: 25.8,
            notice: "All savings figures are algorithmic heuristic estimates based on industry benchmarks, not guaranteed financial commitments."
        }
    },
    service_breakdown: [
        { service_name: "Amazon Elastic Compute Cloud - Compute", cost: 38.50, cost_formatted: "$38.50", percentage_of_total: 38.5 },
        { service_name: "Amazon Relational Database Service", cost: 28.20, cost_formatted: "$28.20", percentage_of_total: 28.2 },
        { service_name: "Amazon Simple Storage Service", cost: 14.80, cost_formatted: "$14.80", percentage_of_total: 14.8 },
        { service_name: "AmazonCloudWatch", cost: 9.40, cost_formatted: "$9.40", percentage_of_total: 9.4 },
        { service_name: "Amazon Virtual Private Cloud", cost: 5.00, cost_formatted: "$5.00", percentage_of_total: 5.0 },
        { service_name: "AWS Lambda", cost: 4.10, cost_formatted: "$4.10", percentage_of_total: 4.1 }
    ],
    recommendations: [
        {
            service: "Amazon Elastic Compute Cloud - Compute",
            cost: 38.50,
            share_percentage: 38.5,
            priority: "HIGH",
            estimated_savings_range: { min: 7.70, max: 15.40, midpoint: 11.55 },
            findings: ["EC2 accounts for $38.50 (38.5% of total account spend)."],
            actionable_rules: [
                {
                    title: "Compute Instance Right-Sizing",
                    action: "Inspect CloudWatch CPUUtilization and Memory metrics. For instances averaging < 15% CPU, downsize to next smaller instance type (e.g. t3.medium -> t3.small).",
                    condition: "Conditional: Requires CloudWatch metrics review before downsizing.",
                    potential_impact: "Up to 30-50% reduction in hourly instance cost."
                },
                {
                    title: "Automated Non-Production Scheduling",
                    action: "Configure AWS Systems Manager Quick Setup or EventBridge + Lambda to stop development and testing EC2 instances outside working hours.",
                    condition: "Applicable to development/staging workloads.",
                    potential_impact: "Up to 65% savings on non-24x7 workloads."
                },
                {
                    title: "Compute Savings Plans / Spot Instances",
                    action: "Evaluate 1-year No-Upfront Compute Savings Plans for predictable baseline usage, or Spot Instances for batch workloads.",
                    condition: "Applicable if compute workload runs consistently for months.",
                    potential_impact: "Savings of 25% to 60% compared to On-Demand rates."
                }
            ]
        },
        {
            service: "Amazon Relational Database Service",
            cost: 28.20,
            share_percentage: 28.2,
            priority: "HIGH",
            estimated_savings_range: { min: 4.23, max: 9.87, midpoint: 7.05 },
            findings: ["RDS database spend is $28.20 (28.2% of total account spend)."],
            actionable_rules: [
                {
                    title: "Single-AZ for Non-Production Environments",
                    action: "Verify that test and development RDS instances do not have Multi-AZ deployment enabled, which doubles instance cost.",
                    condition: "Conditional: Multi-AZ must remain enabled for mission-critical production databases.",
                    potential_impact: "50% savings on development database instances."
                },
                {
                    title: "Idle Database Instance Detection",
                    action: "Inspect DatabaseConnections metric in CloudWatch. Stop or take a final snapshot and terminate instances with 0 active connections.",
                    condition: "Verify with application owners before decommissioning.",
                    potential_impact: "Eliminates 100% of idle instance cost."
                }
            ]
        },
        {
            service: "Amazon Simple Storage Service",
            cost: 14.80,
            share_percentage: 14.8,
            priority: "LOW",
            estimated_savings_range: { min: 2.22, max: 5.18, midpoint: 3.70 },
            findings: ["S3 storage spend is $14.80 (14.8% of total account spend)."],
            actionable_rules: [
                {
                    title: "Implement S3 Lifecycle Rules",
                    action: "Create bucket lifecycle rules to transition objects older than 30/90 days from S3 Standard to S3 Standard-IA or Glacier Flexible Retrieval.",
                    condition: "Applicable to data that is infrequently accessed after creation.",
                    potential_impact: "Saves 40% to 68% on storage tier costs."
                },
                {
                    title: "Abort Incomplete Multipart Uploads",
                    action: "Enable a 7-day abort rule on bucket lifecycle to clean up orphaned multipart upload parts.",
                    condition: "Universal recommendation for all S3 buckets.",
                    potential_impact: "Prevents hidden storage charges from failed uploads."
                }
            ]
        },
        {
            service: "AmazonCloudWatch",
            cost: 9.40,
            share_percentage: 9.4,
            priority: "LOW",
            estimated_savings_range: { min: 0.94, max: 2.82, midpoint: 1.88 },
            findings: ["CloudWatch monitoring and logs spend is $9.40 (9.4% of total spend)."],
            actionable_rules: [
                {
                    title: "Enforce Log Group Retention Policies",
                    action: "By default, AWS CloudWatch Log Groups have 'Never Expire' retention. Update log groups to 14, 30, or 90 days retention.",
                    condition: "Verify compliance and auditing retention requirements before shortening.",
                    potential_impact: "Stops cumulative monthly log storage cost accumulation."
                }
            ]
        }
    ],
    engine_metadata: {
        engine_type: "Deterministic Rule-Based Heuristic Engine",
        version: "1.1.0",
        disclaimer: "This system applies transparent rule-based heuristics to identify cost optimization opportunities. It does not employ a trained machine learning model or make automated resource changes without user review."
    }
};

// Initialize Dashboard on DOM Load
document.addEventListener("DOMContentLoaded", () => {
    setupEventListeners();
    loadCostAnalysis();
});

function setupEventListeners() {
    const refreshBtn = document.getElementById("refreshBtn");
    if (refreshBtn) refreshBtn.addEventListener("click", () => loadCostAnalysis(true));

    const retryBtn = document.getElementById("retryBtn");
    if (retryBtn) retryBtn.addEventListener("click", () => loadCostAnalysis(true));

    const exportCsvBtn = document.getElementById("exportCsvBtn");
    if (exportCsvBtn) exportCsvBtn.addEventListener("click", exportCostDataCsv);

    const exportJsonBtn = document.getElementById("exportJsonBtn");
    if (exportJsonBtn) exportJsonBtn.addEventListener("click", exportCostDataJson);

    const saveS3Btn = document.getElementById("saveS3Btn");
    if (saveS3Btn) saveS3Btn.addEventListener("click", saveReportToS3);

    const closeNotificationBtn = document.getElementById("closeNotificationBtn");
    if (closeNotificationBtn) {
        closeNotificationBtn.addEventListener("click", () => {
            const notif = document.getElementById("s3SaveNotification");
            if (notif) notif.classList.add("hidden");
        });
    }

    // Recommendation priority filters
    const filterBtns = document.querySelectorAll(".filter-btn");
    filterBtns.forEach(btn => {
        btn.addEventListener("click", (e) => {
            filterBtns.forEach(b => {
                b.classList.remove("active", "bg-cyan-600", "text-white");
                b.classList.add("bg-slate-800", "text-slate-300");
            });
            e.target.classList.add("active", "bg-cyan-600", "text-white");
            e.target.classList.remove("bg-slate-800", "text-slate-300");
            currentPriorityFilter = e.target.getAttribute("data-priority");
            if (currentAnalysisData && currentAnalysisData.recommendations) {
                renderRecommendations(currentAnalysisData.recommendations);
            }
        });
    });
}

function showNotification(message, isError = false) {
    const notif = document.getElementById("s3SaveNotification");
    const msg = document.getElementById("s3NotificationMessage");
    const icon = document.getElementById("s3NotificationIcon");
    if (!notif || !msg || !icon) return;

    msg.textContent = message;
    if (isError) {
        notif.className = "p-3 rounded-xl border text-xs flex items-center justify-between gap-3 bg-red-950/40 border-red-500/40 text-red-200";
        icon.textContent = "❌";
    } else {
        notif.className = "p-3 rounded-xl border text-xs flex items-center justify-between gap-3 bg-emerald-950/40 border-emerald-500/40 text-emerald-200";
        icon.textContent = "✅";
    }
    notif.classList.remove("hidden");
}

async function loadCostAnalysis(bypassCache = false) {
    const refreshSpinner = document.getElementById("refreshSpinner");
    const apiErrorBanner = document.getElementById("apiErrorBanner");
    const staleDataNotice = document.getElementById("staleDataNotice");
    const apiErrorMessage = document.getElementById("apiErrorMessage");

    if (refreshSpinner) refreshSpinner.classList.remove("hidden");

    let data = null;
    let fetchError = null;

    if (CONFIG.API_BASE_URL && CONFIG.API_BASE_URL.trim() !== "") {
        try {
            const url = `${CONFIG.API_BASE_URL.replace(/\/+$/, "")}/cost-analysis${bypassCache ? "?bypass_cache=true" : ""}`;
            console.log("Fetching live cost analysis from API Gateway:", url);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 12000); // 12-second network timeout

            const response = await fetch(url, {
                method: "GET",
                headers: { "Content-Type": "application/json" },
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (response.ok) {
                data = await response.json();
            } else {
                fetchError = new Error(`API Gateway returned HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (err) {
            fetchError = err;
        }
    } else {
        fetchError = new Error("API_BASE_URL is not configured in config.js");
    }

    if (fetchError) {
        console.warn("Cost analysis API fetch error:", fetchError);
        if (apiErrorBanner) {
            apiErrorBanner.classList.remove("hidden");
            if (apiErrorMessage) apiErrorMessage.textContent = `Could not reach API Gateway: ${fetchError.message}`;
        }

        // If we already have previously loaded data, preserve it and warn user that data is stale
        if (currentAnalysisData) {
            if (staleDataNotice) staleDataNotice.classList.remove("hidden");
            if (refreshSpinner) refreshSpinner.classList.add("hidden");
            return;
        } else {
            // First run fallback
            data = LOCAL_FALLBACK_PAYLOAD;
            if (staleDataNotice) staleDataNotice.classList.add("hidden");
        }
    } else {
        // Successful API call - hide error banners
        if (apiErrorBanner) apiErrorBanner.classList.add("hidden");
        if (staleDataNotice) staleDataNotice.classList.add("hidden");
    }

    currentAnalysisData = data;
    lastSuccessfulRetrievalTimestamp = data.retrieval_timestamp_utc || new Date().toISOString();
    lastDataSourceType = data.data_source || "demo_data";

    renderDashboard(data);

    if (refreshSpinner) refreshSpinner.classList.add("hidden");
}

function renderDashboard(data) {
    // 1. Data Source Banner & Last Retrieval Time
    const banner = document.getElementById("dataSourceBanner");
    const badge = document.getElementById("dataSourceBadge");
    const icon = document.getElementById("dataSourceIcon");
    const msg = document.getElementById("dataSourceMessage");
    const lastUpdated = document.getElementById("lastUpdated");

    const isSample = (data.is_sample_data || data.data_source === "demo_data");

    if (isSample) {
        banner.className = "p-4 rounded-xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-amber-950/30 border-amber-500/30 text-amber-200";
        badge.className = "font-semibold text-xs tracking-wider uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30";
        badge.textContent = "Demo / Sample Data Mode";
        icon.textContent = "⚠️";
    } else {
        banner.className = "p-4 rounded-xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-emerald-950/30 border-emerald-500/30 text-emerald-200";
        badge.className = "font-semibold text-xs tracking-wider uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30";
        badge.textContent = "Live AWS Cost Explorer Data";
        icon.textContent = "✅";
    }
    msg.textContent = data.data_source_message || "";

    if (lastUpdated) {
        const timeDisplay = lastSuccessfulRetrievalTimestamp
            ? new Date(lastSuccessfulRetrievalTimestamp).toLocaleString()
            : "Unknown";
        const typeLabel = isSample ? "Sample Data" : "Live AWS";
        lastUpdated.textContent = `Last Retrieval: ${timeDisplay} (${typeLabel})`;
    }

    // 2. KPI Cards
    const summary = data.summary || {};
    document.getElementById("totalSpend").textContent = summary.total_cost_formatted || `$${summary.total_monthly_cost || 0}`;
    
    const highest = summary.highest_cost_service || {};
    document.getElementById("highestCostService").textContent = highest.service_name || "N/A";
    document.getElementById("highestCostAmount").textContent = `${highest.cost_formatted || "$0.00"} (${highest.percentage_of_total || 0}% of total)`;

    const savings = summary.potential_savings_estimate || {};
    document.getElementById("potentialSavings").textContent = savings.display_text || "$0.00";
    document.getElementById("potentialSavingsPct").textContent = `~${savings.percentage_of_total || 0}% estimated potential reduction`;

    document.getElementById("servicesCount").textContent = summary.services_analyzed_count || 0;

    // 3. Render Charts
    renderCharts(data.service_breakdown || []);

    // 4. Breakdown Table
    renderTable(data.service_breakdown || []);

    // 5. Recommendations
    renderRecommendations(data.recommendations || []);
}

function renderCharts(breakdown) {
    const labels = breakdown.map(item => item.service_name.replace("Amazon ", "").replace("AWS ", ""));
    const costs = breakdown.map(item => item.cost);
    const pcts = breakdown.map(item => item.percentage_of_total);

    const colors = [
        "rgba(6, 182, 212, 0.8)",   // cyan
        "rgba(59, 130, 246, 0.8)",  // blue
        "rgba(168, 85, 247, 0.8)",  // purple
        "rgba(245, 158, 11, 0.8)",  // amber
        "rgba(16, 185, 129, 0.8)",  // emerald
        "rgba(244, 63, 94, 0.8)"    // rose
    ];

    // Bar Chart
    const barCanvas = document.getElementById("costBarChart");
    if (barCanvas) {
        const barCtx = barCanvas.getContext("2d");
        if (barChartInstance) barChartInstance.destroy();
        barChartInstance = new Chart(barCtx, {
            type: "bar",
            data: {
                labels: labels,
                datasets: [{
                    label: "Cost ($)",
                    data: costs,
                    backgroundColor: colors.slice(0, costs.length),
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: "#94a3b8", font: { size: 10 } }
                    },
                    y: {
                        grid: { color: "#334155" },
                        ticks: {
                            color: "#94a3b8",
                            callback: val => `$${val}`
                        }
                    }
                }
            }
        });
    }

    // Doughnut Chart
    const pieCanvas = document.getElementById("costPieChart");
    if (pieCanvas) {
        const pieCtx = pieCanvas.getContext("2d");
        if (pieChartInstance) pieChartInstance.destroy();
        pieChartInstance = new Chart(pieCtx, {
            type: "doughnut",
            data: {
                labels: labels,
                datasets: [{
                    data: pcts,
                    backgroundColor: colors.slice(0, pcts.length),
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: "bottom",
                        labels: { color: "#94a3b8", boxWidth: 10, font: { size: 10 } }
                    }
                }
            }
        });
    }
}

function renderTable(breakdown) {
    const tbody = document.getElementById("breakdownTableBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    breakdown.forEach(item => {
        const row = document.createElement("tr");
        row.className = "hover:bg-slate-800/40 transition";
        row.innerHTML = `
            <td class="py-3 px-4 font-medium text-slate-200 flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-cyan-400"></span>
                ${item.service_name}
            </td>
            <td class="py-3 px-4 font-bold text-white">${item.cost_formatted}</td>
            <td class="py-3 px-4 text-slate-300 font-semibold">${item.percentage_of_total}%</td>
            <td class="py-3 px-4">
                <div class="w-full bg-slate-700/60 rounded-full h-1.5 overflow-hidden">
                    <div class="bg-cyan-500 h-1.5 rounded-full" style="width: ${Math.min(item.percentage_of_total, 100)}%"></div>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function renderRecommendations(recommendations) {
    const container = document.getElementById("recommendationsContainer");
    if (!container) return;
    container.innerHTML = "";

    const filtered = (currentPriorityFilter === "ALL")
        ? recommendations
        : recommendations.filter(r => r.priority === currentPriorityFilter);

    if (filtered.length === 0) {
        container.innerHTML = `<div class="col-span-2 text-center py-8 text-xs text-slate-500">No recommendations matching selected priority filter.</div>`;
        return;
    }

    filtered.forEach(rec => {
        const priorityColors = {
            HIGH: "bg-red-500/20 text-red-300 border-red-500/30",
            MEDIUM: "bg-amber-500/20 text-amber-300 border-amber-500/30",
            LOW: "bg-blue-500/20 text-blue-300 border-blue-500/30"
        };
        const pClass = priorityColors[rec.priority] || priorityColors.LOW;

        const card = document.createElement("div");
        card.className = `recommendation-card bg-slate-800/70 border border-slate-700/80 rounded-2xl p-5 shadow-lg space-y-4 priority-${rec.priority.toLowerCase()}`;

        let rulesHtml = "";
        (rec.actionable_rules || []).forEach(rule => {
            rulesHtml += `
                <div class="p-3 rounded-xl bg-slate-900/70 border border-slate-800 text-xs space-y-1">
                    <div class="font-semibold text-cyan-300 flex items-center justify-between">
                        <span>🔧 ${rule.title}</span>
                    </div>
                    <p class="text-slate-300 mt-1">${rule.action}</p>
                    <div class="mt-2 pt-2 border-t border-slate-800 flex flex-col gap-1 text-[11px]">
                        <span class="text-amber-400 font-medium">⚠️ ${rule.condition}</span>
                        <span class="text-emerald-400 font-medium">📈 Expected Impact: ${rule.potential_impact}</span>
                    </div>
                </div>
            `;
        });

        const estRange = rec.estimated_savings_range || {};

        card.innerHTML = `
            <div class="flex justify-between items-start gap-2">
                <div>
                    <span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${pClass}">
                        ${rec.priority} Priority
                    </span>
                    <h4 class="text-sm font-bold text-white mt-2">${rec.service}</h4>
                </div>
                <div class="text-right">
                    <span class="text-[10px] uppercase text-slate-400">Est. Savings</span>
                    <div class="text-sm font-extrabold text-emerald-400">
                        $${estRange.min || 0} - $${estRange.max || 0}
                    </div>
                </div>
            </div>

            <div class="text-xs text-slate-400 italic">
                ${(rec.findings || []).join(" ")}
            </div>

            <div class="space-y-2">
                ${rulesHtml}
            </div>
        `;
        container.appendChild(card);
    });
}

function exportCostDataCsv() {
    if (!currentAnalysisData || !currentAnalysisData.service_breakdown) {
        showNotification("No cost analysis data available to export.", true);
        return;
    }
    
    let csv = "Service,Cost_USD,Percentage_Of_Total\n";
    currentAnalysisData.service_breakdown.forEach(item => {
        csv += `"${item.service_name}",${item.cost},${item.percentage_of_total}%\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute("href", url);
    link.setAttribute("download", `aws_cost_analysis_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification(`CSV report exported successfully.`);
}

function exportCostDataJson() {
    if (!currentAnalysisData) {
        showNotification("No cost analysis data available to download.", true);
        return;
    }

    // Prepare complete export object including retrieval semantics
    const exportObject = {
        export_metadata: {
            system: "AI-Powered AWS Cloud Cost Optimization System",
            downloaded_at_utc: new Date().toISOString(),
            last_retrieved_at_utc: lastSuccessfulRetrievalTimestamp,
            data_source_mode: currentAnalysisData.data_source || "demo_data",
            is_sample_data: currentAnalysisData.is_sample_data || false,
            aws_region: "ap-south-1"
        },
        cost_analysis: currentAnalysisData
    };

    const jsonString = JSON.stringify(exportObject, null, 2);
    const blob = new Blob([jsonString], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute("href", url);
    link.setAttribute("download", `aws_cost_analysis_report_${dateStr}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification(`JSON report downloaded successfully.`);
}

async function saveReportToS3() {
    if (!currentAnalysisData) {
        showNotification("No report data available to save.", true);
        return;
    }

    const s3Spinner = document.getElementById("s3Spinner");
    if (s3Spinner) s3Spinner.classList.remove("hidden");

    try {
        const url = `${CONFIG.API_BASE_URL.replace(/\/+$/, "")}/save-report`;
        showNotification("Saving report snapshot to S3 bucket cost-optimizer-reports-226234259454...");

        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(currentAnalysisData)
        });

        const result = await response.json();

        if (response.ok && result.status === "success") {
            showNotification(`Snapshot saved to S3: ${result.s3_key}`);
        } else {
            const errMsg = result.message || "Failed to persist report to S3.";
            showNotification(`S3 Save Notice: ${errMsg}`, true);
        }
    } catch (err) {
        showNotification(`Network error saving report to S3: ${err.message}`, true);
    } finally {
        if (s3Spinner) s3Spinner.classList.add("hidden");
    }
}
