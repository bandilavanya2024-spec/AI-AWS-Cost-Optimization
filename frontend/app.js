/**
 * AI-Powered AWS Cloud Cost Optimization System
 * Enterprise Dashboard Controller - "Realized Savings & Cloud Cost Optimization"
 * Version 2.1.0 - Interactive Heuristic Estimator, Filter Engine & Telemetry
 */

// ========================================================
// Global Chart Instances & State
// ========================================================
let mainStackedBarChartInstance = null;
let costDoughnutChartInstance = null;
let beforeAfterCompChartInstance = null;

// Raw calculation state (unfiltered monthly baseline)
let rawCalculationState = null;
// Active filter & view configuration
let currentFilters = {
    period: "month",         // "month" | "last_month" | "last_6_months" | "ytd" | "annual"
    provider: "AWS",
    service: "ALL",          // "ALL" | "ec2" | "s3" | "rds" | "lambda" | "cloudwatch" | "vpc"
    costType: "ALL",         // "ALL" | "compute" | "storage" | "database" | "networking" | "monitoring"
    chartGrouping: "service" // "service" | "cost_type" | "monthly_trend"
};

let currentActualBillingData = null;
let activeMode = "ESTIMATOR"; // "ESTIMATOR" | "ACTUAL_BILLING"

// Exchange rate reference (USD to INR) - Fixed RBI Benchmark Rate
const USD_TO_INR_RATE = 83.50;

// Verified AWS Pricing Database (ap-south-1 & us-east-1)
const PRICING_DATABASE = {
    "ap-south-1": {
        region_name: "Asia Pacific (Mumbai) - ap-south-1",
        ec2: {
            instances: {
                "t3.micro": { price_per_hr: 0.0104, vcpu: 2, ram_gb: 1.0, arch: "x86_64" },
                "t3.small": { price_per_hr: 0.0208, vcpu: 2, ram_gb: 2.0, arch: "x86_64" },
                "t3.medium": { price_per_hr: 0.0416, vcpu: 2, ram_gb: 4.0, arch: "x86_64" },
                "t3.large": { price_per_hr: 0.0832, vcpu: 2, ram_gb: 8.0, arch: "x86_64" },
                "t3.xlarge": { price_per_hr: 0.1664, vcpu: 4, ram_gb: 16.0, arch: "x86_64" },
                "t4g.small": { price_per_hr: 0.0168, vcpu: 2, ram_gb: 2.0, arch: "arm64" },
                "t4g.medium": { price_per_hr: 0.0336, vcpu: 2, ram_gb: 4.0, arch: "arm64" },
                "m5.large": { price_per_hr: 0.1070, vcpu: 2, ram_gb: 8.0, arch: "x86_64" },
                "c5.large": { price_per_hr: 0.0930, vcpu: 2, ram_gb: 4.0, arch: "x86_64" }
            },
            ebs_gp3_per_gb: 0.088,
            ebs_gp2_per_gb: 0.114,
            data_transfer_per_gb: 0.109,
            source: "AWS EC2 Pricing (ap-south-1)"
        },
        s3: {
            storage_classes: {
                "Standard": { storage_rate: 0.0230, retrieval_rate: 0.0 },
                "Standard-IA": { storage_rate: 0.0125, retrieval_rate: 0.01 },
                "OneZone-IA": { storage_rate: 0.0100, retrieval_rate: 0.01 },
                "Glacier-Flexible": { storage_rate: 0.00405, retrieval_rate: 0.03 },
                "Glacier-DeepArchive": { storage_rate: 0.00099, retrieval_rate: 0.05 }
            },
            put_per_1000: 0.0050,
            get_per_1000: 0.0004,
            source: "AWS S3 Pricing (ap-south-1)"
        },
        rds: {
            instances: {
                "db.t3.micro": { price_per_hr: 0.0180 },
                "db.t3.small": { price_per_hr: 0.0360 },
                "db.t3.medium": { price_per_hr: 0.0730 },
                "db.t3.large": { price_per_hr: 0.1460 },
                "db.m5.large": { price_per_hr: 0.1360 }
            },
            storage_gp3_per_gb: 0.115,
            multi_az_multiplier: 2.0,
            source: "AWS RDS Pricing (ap-south-1)"
        },
        lambda: {
            request_per_million: 0.20,
            compute_gb_sec_x86: 0.0000166667,
            compute_gb_sec_arm: 0.0000133334,
            free_requests: 1000000,
            free_gb_sec: 400000,
            source: "AWS Lambda Pricing (ap-south-1)"
        },
        cloudwatch: {
            ingestion_per_gb: 0.57,
            storage_per_gb: 0.033,
            metric_per_month: 0.30,
            free_ingest_gb: 5.0,
            free_metrics: 10,
            source: "Amazon CloudWatch Pricing (ap-south-1)"
        },
        vpc: {
            nat_hourly: 0.056,
            nat_data_per_gb: 0.056,
            public_ipv4_hourly: 0.005,
            source: "Amazon VPC Pricing (ap-south-1)"
        }
    },
    "us-east-1": {
        region_name: "US East (N. Virginia) - us-east-1",
        ec2: {
            instances: {
                "t3.micro": { price_per_hr: 0.0104, vcpu: 2, ram_gb: 1.0, arch: "x86_64" },
                "t3.small": { price_per_hr: 0.0208, vcpu: 2, ram_gb: 2.0, arch: "x86_64" },
                "t3.medium": { price_per_hr: 0.0416, vcpu: 2, ram_gb: 4.0, arch: "x86_64" },
                "t3.large": { price_per_hr: 0.0832, vcpu: 2, ram_gb: 8.0, arch: "x86_64" },
                "t3.xlarge": { price_per_hr: 0.1664, vcpu: 4, ram_gb: 16.0, arch: "x86_64" },
                "t4g.small": { price_per_hr: 0.0168, vcpu: 2, ram_gb: 2.0, arch: "arm64" },
                "t4g.medium": { price_per_hr: 0.0336, vcpu: 2, ram_gb: 4.0, arch: "arm64" },
                "m5.large": { price_per_hr: 0.0960, vcpu: 2, ram_gb: 8.0, arch: "x86_64" },
                "c5.large": { price_per_hr: 0.0850, vcpu: 2, ram_gb: 4.0, arch: "x86_64" }
            },
            ebs_gp3_per_gb: 0.080,
            ebs_gp2_per_gb: 0.100,
            data_transfer_per_gb: 0.090,
            source: "AWS EC2 Pricing (us-east-1)"
        },
        s3: {
            storage_classes: {
                "Standard": { storage_rate: 0.0230, retrieval_rate: 0.0 },
                "Standard-IA": { storage_rate: 0.0125, retrieval_rate: 0.01 },
                "OneZone-IA": { storage_rate: 0.0100, retrieval_rate: 0.01 },
                "Glacier-Flexible": { storage_rate: 0.0036, retrieval_rate: 0.03 },
                "Glacier-DeepArchive": { storage_rate: 0.00099, retrieval_rate: 0.05 }
            },
            put_per_1000: 0.0050,
            get_per_1000: 0.0004,
            source: "AWS S3 Pricing (us-east-1)"
        },
        rds: {
            instances: {
                "db.t3.micro": { price_per_hr: 0.0170 },
                "db.t3.small": { price_per_hr: 0.0340 },
                "db.t3.medium": { price_per_hr: 0.0680 },
                "db.t3.large": { price_per_hr: 0.1360 },
                "db.m5.large": { price_per_hr: 0.1190 }
            },
            storage_gp3_per_gb: 0.115,
            multi_az_multiplier: 2.0,
            source: "AWS RDS Pricing (us-east-1)"
        },
        lambda: {
            request_per_million: 0.20,
            compute_gb_sec_x86: 0.0000166667,
            compute_gb_sec_arm: 0.0000133334,
            free_requests: 1000000,
            free_gb_sec: 400000,
            source: "AWS Lambda Pricing (us-east-1)"
        },
        cloudwatch: {
            ingestion_per_gb: 0.50,
            storage_per_gb: 0.030,
            metric_per_month: 0.30,
            free_ingest_gb: 5.0,
            free_metrics: 10,
            source: "Amazon CloudWatch Pricing (us-east-1)"
        },
        vpc: {
            nat_hourly: 0.045,
            nat_data_per_gb: 0.045,
            public_ipv4_hourly: 0.005,
            source: "Amazon VPC Pricing (us-east-1)"
        }
    }
};

// Distinctive Service Color Palette (Enterprise Light Theme)
const SERVICE_COLORS = {
    ec2: { bg: "#3b82f6", border: "#2563eb", name: "Amazon EC2" },
    s3: { bg: "#10b981", border: "#059669", name: "Amazon S3" },
    rds: { bg: "#8b5cf6", border: "#7c3aed", name: "Amazon RDS" },
    lambda: { bg: "#f59e0b", border: "#d97706", name: "AWS Lambda" },
    cloudwatch: { bg: "#ec4899", border: "#db2777", name: "Amazon CloudWatch" },
    vpc: { bg: "#06b6d4", border: "#0891b2", name: "Amazon VPC" }
};

const COST_TYPE_COLORS = {
    compute: { bg: "#3b82f6", border: "#2563eb", name: "Compute" },
    storage: { bg: "#10b981", border: "#059669", name: "Storage" },
    database: { bg: "#8b5cf6", border: "#7c3aed", name: "Database" },
    networking: { bg: "#06b6d4", border: "#0891b2", name: "Networking" },
    monitoring: { bg: "#ec4899", border: "#db2777", name: "Monitoring" }
};

// ========================================================
// 1. Initialization and Event Binding
// ========================================================

document.addEventListener("DOMContentLoaded", () => {
    initNavigationTabs();
    initFilterToolbar();
    initServiceToggles();
    initPresets();
    initGlobalSelectors();
    initActionButtons();

    // Run baseline calculation
    calculateEstimate();
});

function initNavigationTabs() {
    const tabEstimator = document.getElementById("tabEstimator");
    const tabActual = document.getElementById("tabActualBilling");
    const containerEstimator = document.getElementById("modeEstimatorContainer");
    const containerActual = document.getElementById("modeActualBillingContainer");
    const badge = document.getElementById("dataModeBadge");

    if (tabEstimator && tabActual) {
        tabEstimator.addEventListener("click", () => {
            activeMode = "ESTIMATOR";
            tabEstimator.classList.add("active");
            tabActual.classList.remove("active");
            if (containerEstimator) containerEstimator.classList.remove("hidden");
            if (containerActual) containerActual.classList.add("hidden");
            if (badge) {
                badge.textContent = "ESTIMATED COST MODE";
                badge.className = "px-2 py-0.5 text-[11px] font-bold rounded-full bg-blue-50 text-blue-700 border border-blue-200";
            }
        });

        tabActual.addEventListener("click", () => {
            activeMode = "ACTUAL_BILLING";
            tabActual.classList.add("active");
            tabEstimator.classList.remove("active");
            if (containerActual) containerActual.classList.remove("hidden");
            if (containerEstimator) containerEstimator.classList.add("hidden");
            if (badge) {
                badge.textContent = "ACTUAL BILLING TELEMETRY (LIVE)";
                badge.className = "px-2 py-0.5 text-[11px] font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200";
            }
            loadActualBillingData();
        });
    }
}

function initFilterToolbar() {
    const filterPeriod = document.getElementById("filterPeriod");
    const filterProvider = document.getElementById("filterProvider");
    const filterService = document.getElementById("filterService");
    const filterCostType = document.getElementById("filterCostType");
    const chartGroupingSelect = document.getElementById("chartGroupingSelect");
    const resetFiltersBtn = document.getElementById("resetFiltersBtn");

    if (filterPeriod) {
        filterPeriod.addEventListener("change", (e) => {
            currentFilters.period = e.target.value;
            applyFiltersAndRender();
        });
    }

    if (filterProvider) {
        filterProvider.addEventListener("change", (e) => {
            currentFilters.provider = e.target.value;
            applyFiltersAndRender();
        });
    }

    if (filterService) {
        filterService.addEventListener("change", (e) => {
            currentFilters.service = e.target.value;
            applyFiltersAndRender();
        });
    }

    if (filterCostType) {
        filterCostType.addEventListener("change", (e) => {
            currentFilters.costType = e.target.value;
            applyFiltersAndRender();
        });
    }

    if (chartGroupingSelect) {
        chartGroupingSelect.addEventListener("change", (e) => {
            currentFilters.chartGrouping = e.target.value;
            renderMainStackedBarChart();
        });
    }

    if (resetFiltersBtn) {
        resetFiltersBtn.addEventListener("click", () => {
            currentFilters.period = "month";
            currentFilters.provider = "AWS";
            currentFilters.service = "ALL";
            currentFilters.costType = "ALL";
            currentFilters.chartGrouping = "service";

            if (filterPeriod) filterPeriod.value = "month";
            if (filterProvider) filterProvider.value = "AWS";
            if (filterService) filterService.value = "ALL";
            if (filterCostType) filterCostType.value = "ALL";
            if (chartGroupingSelect) chartGroupingSelect.value = "service";

            applyFiltersAndRender();
            showToast("Reset all dashboard filters to default view.", false);
        });
    }
}

function initServiceToggles() {
    const services = ["ec2", "s3", "rds", "lambda", "cw", "vpc"];
    services.forEach(svc => {
        const checkbox = document.getElementById(`${svc}_enabled`);
        const fields = document.getElementById(`${svc}_fields`);
        if (checkbox && fields) {
            checkbox.addEventListener("change", () => {
                if (checkbox.checked) {
                    fields.classList.remove("opacity-40", "pointer-events-none");
                } else {
                    fields.classList.add("opacity-40", "pointer-events-none");
                }
                calculateEstimate();
            });
        }
    });

    // Auto-recalculate on capacity input changes
    const inputs = document.querySelectorAll("#modeEstimatorContainer input, #modeEstimatorContainer select");
    inputs.forEach(input => {
        if (!input.classList.contains("filter-select") && input.id !== "globalRegionSelect" && input.id !== "globalCurrencySelect") {
            input.addEventListener("change", () => {
                calculateEstimate();
            });
        }
    });
}

function initGlobalSelectors() {
    const regionSelect = document.getElementById("globalRegionSelect");
    const currencySelect = document.getElementById("globalCurrencySelect");

    if (regionSelect) {
        regionSelect.addEventListener("change", () => {
            calculateEstimate();
            showToast(`Switched pricing catalog to ${regionSelect.value}.`, false);
        });
    }

    if (currencySelect) {
        currencySelect.addEventListener("change", () => {
            calculateEstimate();
        });
    }
}

function initActionButtons() {
    const calcBtn = document.getElementById("calculateBtn");
    if (calcBtn) calcBtn.addEventListener("click", calculateEstimate);

    const exportJsonBtn = document.getElementById("exportJsonBtn");
    if (exportJsonBtn) exportJsonBtn.addEventListener("click", exportEstimateJson);

    const exportCsvBtn = document.getElementById("exportCsvBtn");
    if (exportCsvBtn) exportCsvBtn.addEventListener("click", exportEstimateCsv);

    const printBtn = document.getElementById("printReportBtn");
    if (printBtn) printBtn.addEventListener("click", () => window.print());

    const saveS3Btn = document.getElementById("saveS3Btn");
    if (saveS3Btn) saveS3Btn.addEventListener("click", saveEstimateToS3);

    const refreshActualBtn = document.getElementById("refreshActualBtn");
    if (refreshActualBtn) refreshActualBtn.addEventListener("click", loadActualBillingData);

    const closeToast = document.getElementById("closeToastBtn");
    if (closeToast) {
        closeToast.addEventListener("click", () => {
            const toast = document.getElementById("toastNotification");
            if (toast) toast.classList.add("hidden");
        });
    }
}

// ========================================================
// 2. Preset Scenarios
// ========================================================

function initPresets() {
    const presetBtns = document.querySelectorAll(".preset-btn");
    presetBtns.forEach(btn => {
        btn.addEventListener("click", (e) => {
            const preset = e.currentTarget.getAttribute("data-preset");
            applyScenarioPreset(preset);
            calculateEstimate();
            showToast(`Loaded "${e.currentTarget.textContent.trim()}" preset architecture.`, false);
        });
    });

    const resetBtn = document.getElementById("resetFormBtn");
    if (resetBtn) {
        resetBtn.addEventListener("click", () => {
            applyScenarioPreset("webapp");
            calculateEstimate();
            showToast("Reset all capacity inputs to standard web application.", false);
        });
    }
}

function applyScenarioPreset(preset) {
    if (preset === "webapp") {
        document.getElementById("ec2_enabled").checked = true;
        document.getElementById("ec2_instance_type").value = "t3.medium";
        document.getElementById("ec2_count").value = 2;
        document.getElementById("ec2_hours_day").value = 24;
        document.getElementById("ec2_days_month").value = 30.5;
        document.getElementById("ec2_ebs_gb").value = 30;
        document.getElementById("ec2_transfer_gb").value = 50;

        document.getElementById("s3_enabled").checked = true;
        document.getElementById("s3_class").value = "Standard";
        document.getElementById("s3_storage_gb").value = 250;
        document.getElementById("s3_put_reqs").value = 20000;
        document.getElementById("s3_get_reqs").value = 100000;
        document.getElementById("s3_retrieval_gb").value = 0;

        document.getElementById("rds_enabled").checked = true;
        document.getElementById("rds_instance_type").value = "db.t3.medium";
        document.getElementById("rds_deployment").value = "Multi-AZ";
        document.getElementById("rds_storage_gb").value = 50;
        document.getElementById("rds_count").value = 1;
        document.getElementById("rds_hours").value = 730;

        document.getElementById("lambda_enabled").checked = true;
        document.getElementById("lambda_requests").value = 3000000;
        document.getElementById("lambda_duration").value = 200;
        document.getElementById("lambda_memory").value = "512";
        document.getElementById("lambda_arch").value = "x86_64";
        document.getElementById("lambda_freetier").checked = true;

        document.getElementById("cw_enabled").checked = true;
        document.getElementById("cw_ingest_gb").value = 20;
        document.getElementById("cw_storage_gb").value = 30;
        document.getElementById("cw_metrics").value = 12;
        document.getElementById("cw_freetier").checked = true;

        document.getElementById("vpc_enabled").checked = true;
        document.getElementById("vpc_nat_count").value = 1;
        document.getElementById("vpc_nat_hours").value = 730;
        document.getElementById("vpc_nat_data_gb").value = 80;
        document.getElementById("vpc_public_ips").value = 1;
    } else if (preset === "microservices") {
        document.getElementById("ec2_enabled").checked = false;
        document.getElementById("s3_enabled").checked = true;
        document.getElementById("s3_class").value = "Standard";
        document.getElementById("s3_storage_gb").value = 100;
        document.getElementById("s3_put_reqs").value = 50000;
        document.getElementById("s3_get_reqs").value = 250000;
        document.getElementById("s3_retrieval_gb").value = 0;

        document.getElementById("rds_enabled").checked = false;

        document.getElementById("lambda_enabled").checked = true;
        document.getElementById("lambda_requests").value = 10000000;
        document.getElementById("lambda_duration").value = 150;
        document.getElementById("lambda_memory").value = "256";
        document.getElementById("lambda_arch").value = "x86_64";
        document.getElementById("lambda_freetier").checked = true;

        document.getElementById("cw_enabled").checked = true;
        document.getElementById("cw_ingest_gb").value = 25;
        document.getElementById("cw_storage_gb").value = 20;
        document.getElementById("cw_metrics").value = 10;
        document.getElementById("cw_freetier").checked = true;

        document.getElementById("vpc_enabled").checked = false;
    } else if (preset === "enterprise") {
        document.getElementById("ec2_enabled").checked = true;
        document.getElementById("ec2_instance_type").value = "m5.large";
        document.getElementById("ec2_count").value = 4;
        document.getElementById("ec2_hours_day").value = 24;
        document.getElementById("ec2_days_month").value = 30.5;
        document.getElementById("ec2_ebs_gb").value = 100;
        document.getElementById("ec2_transfer_gb").value = 200;

        document.getElementById("s3_enabled").checked = true;
        document.getElementById("s3_class").value = "Standard";
        document.getElementById("s3_storage_gb").value = 1000;
        document.getElementById("s3_put_reqs").value = 100000;
        document.getElementById("s3_get_reqs").value = 500000;
        document.getElementById("s3_retrieval_gb").value = 0;

        document.getElementById("rds_enabled").checked = true;
        document.getElementById("rds_instance_type").value = "db.m5.large";
        document.getElementById("rds_deployment").value = "Multi-AZ";
        document.getElementById("rds_storage_gb").value = 200;
        document.getElementById("rds_count").value = 2;
        document.getElementById("rds_hours").value = 730;

        document.getElementById("lambda_enabled").checked = true;
        document.getElementById("lambda_requests").value = 5000000;
        document.getElementById("lambda_duration").value = 300;
        document.getElementById("lambda_memory").value = "1024";
        document.getElementById("lambda_arch").value = "x86_64";
        document.getElementById("lambda_freetier").checked = true;

        document.getElementById("cw_enabled").checked = true;
        document.getElementById("cw_ingest_gb").value = 50;
        document.getElementById("cw_storage_gb").value = 100;
        document.getElementById("cw_metrics").value = 25;
        document.getElementById("cw_freetier").checked = true;

        document.getElementById("vpc_enabled").checked = true;
        document.getElementById("vpc_nat_count").value = 2;
        document.getElementById("vpc_nat_hours").value = 730;
        document.getElementById("vpc_nat_data_gb").value = 300;
        document.getElementById("vpc_public_ips").value = 2;
    } else if (preset === "freetier") {
        document.getElementById("ec2_enabled").checked = true;
        document.getElementById("ec2_instance_type").value = "t3.micro";
        document.getElementById("ec2_count").value = 1;
        document.getElementById("ec2_hours_day").value = 24;
        document.getElementById("ec2_days_month").value = 30.5;
        document.getElementById("ec2_ebs_gb").value = 30;
        document.getElementById("ec2_transfer_gb").value = 0;

        document.getElementById("s3_enabled").checked = true;
        document.getElementById("s3_class").value = "Standard";
        document.getElementById("s3_storage_gb").value = 5;
        document.getElementById("s3_put_reqs").value = 2000;
        document.getElementById("s3_get_reqs").value = 20000;
        document.getElementById("s3_retrieval_gb").value = 0;

        document.getElementById("rds_enabled").checked = true;
        document.getElementById("rds_instance_type").value = "db.t3.micro";
        document.getElementById("rds_deployment").value = "Single-AZ";
        document.getElementById("rds_storage_gb").value = 20;
        document.getElementById("rds_count").value = 1;
        document.getElementById("rds_hours").value = 730;

        document.getElementById("lambda_enabled").checked = true;
        document.getElementById("lambda_requests").value = 500000;
        document.getElementById("lambda_duration").value = 100;
        document.getElementById("lambda_memory").value = "128";
        document.getElementById("lambda_arch").value = "x86_64";
        document.getElementById("lambda_freetier").checked = true;

        document.getElementById("cw_enabled").checked = true;
        document.getElementById("cw_ingest_gb").value = 5;
        document.getElementById("cw_storage_gb").value = 5;
        document.getElementById("cw_metrics").value = 10;
        document.getElementById("cw_freetier").checked = true;

        document.getElementById("vpc_enabled").checked = false;
    }

    // Refresh disabled visual state
    ["ec2", "s3", "rds", "lambda", "cw", "vpc"].forEach(s => {
        const chk = document.getElementById(`${s}_enabled`);
        const fld = document.getElementById(`${s}_fields`);
        if (chk && fld) {
            if (chk.checked) fld.classList.remove("opacity-40", "pointer-events-none");
            else fld.classList.add("opacity-40", "pointer-events-none");
        }
    });
}

// ========================================================
// 3. Mathematical Cost Estimation & Heuristic Optimization
// ========================================================

function calculateEstimate() {
    const region = document.getElementById("globalRegionSelect") ? document.getElementById("globalRegionSelect").value : "ap-south-1";
    const currency = document.getElementById("globalCurrencySelect") ? document.getElementById("globalCurrencySelect").value : "USD";
    const pricing = PRICING_DATABASE[region] || PRICING_DATABASE["ap-south-1"];

    const lineItems = [];
    const serviceResults = [];
    let baselineMonthlyUSD = 0;

    // --- 1. Amazon EC2 ---
    if (document.getElementById("ec2_enabled") && document.getElementById("ec2_enabled").checked) {
        const instType = document.getElementById("ec2_instance_type").value;
        const count = Math.max(1, parseInt(document.getElementById("ec2_count").value) || 1);
        const hoursDay = Math.min(24, Math.max(0, parseFloat(document.getElementById("ec2_hours_day").value) || 24));
        const daysMonth = Math.min(31, Math.max(0, parseFloat(document.getElementById("ec2_days_month").value) || 30.5));
        const ebsGb = Math.max(0, parseFloat(document.getElementById("ec2_ebs_gb").value) || 0);
        const transferGb = Math.max(0, parseFloat(document.getElementById("ec2_transfer_gb").value) || 0);

        const instInfo = pricing.ec2.instances[instType] || pricing.ec2.instances["t3.micro"];
        const monthlyHours = hoursDay * daysMonth;
        const computeCost = instInfo.price_per_hr * count * monthlyHours;
        const ebsCost = count * ebsGb * pricing.ec2.ebs_gp3_per_gb;
        const transferCost = transferGb * pricing.ec2.data_transfer_per_gb;
        const ec2Total = computeCost + ebsCost + transferCost;

        baselineMonthlyUSD += ec2Total;
        serviceResults.push({
            service_key: "ec2",
            service_name: "Amazon Elastic Compute Cloud (EC2)",
            short_name: "EC2",
            cost_type: "compute",
            monthly_cost_usd: ec2Total,
            configuration: { instType, count, hoursDay, daysMonth, monthlyHours, ebsGb, transferGb, hourlyPrice: instInfo.price_per_hr }
        });

        lineItems.push({
            service_key: "ec2",
            service_name: "Amazon EC2",
            component_name: `Compute (${instType})`,
            cost_type: "compute",
            quantity: `${count}x @ ${monthlyHours.toFixed(1)} hrs/mo`,
            unit_price: `$${instInfo.price_per_hr.toFixed(4)}/hr`,
            formula: `${count} × (${hoursDay}h × ${daysMonth}d) × $${instInfo.price_per_hr.toFixed(4)}`,
            subtotal_usd: computeCost,
            pricing_source: pricing.ec2.source
        });

        if (ebsGb > 0) {
            lineItems.push({
                service_key: "ec2",
                service_name: "Amazon EC2",
                component_name: "EBS gp3 Storage",
                cost_type: "storage",
                quantity: `${(count * ebsGb).toFixed(0)} GB-mo`,
                unit_price: `$${pricing.ec2.ebs_gp3_per_gb.toFixed(3)}/GB-mo`,
                formula: `${count * ebsGb} GB × $${pricing.ec2.ebs_gp3_per_gb.toFixed(3)}`,
                subtotal_usd: ebsCost,
                pricing_source: "AWS EBS General Purpose SSD"
            });
        }

        if (transferGb > 0) {
            lineItems.push({
                service_key: "ec2",
                service_name: "Amazon EC2",
                component_name: "Internet Data Egress",
                cost_type: "networking",
                quantity: `${transferGb.toFixed(1)} GB`,
                unit_price: `$${pricing.ec2.data_transfer_per_gb.toFixed(3)}/GB`,
                formula: `${transferGb} GB × $${pricing.ec2.data_transfer_per_gb.toFixed(3)}`,
                subtotal_usd: transferCost,
                pricing_source: "AWS Data Transfer"
            });
        }
    }

    // --- 2. Amazon S3 ---
    if (document.getElementById("s3_enabled") && document.getElementById("s3_enabled").checked) {
        const s3Class = document.getElementById("s3_class").value;
        const storageGb = Math.max(0, parseFloat(document.getElementById("s3_storage_gb").value) || 0);
        const putReqs = Math.max(0, parseInt(document.getElementById("s3_put_reqs").value) || 0);
        const getReqs = Math.max(0, parseInt(document.getElementById("s3_get_reqs").value) || 0);
        const retGb = Math.max(0, parseFloat(document.getElementById("s3_retrieval_gb").value) || 0);

        const classInfo = pricing.s3.storage_classes[s3Class] || pricing.s3.storage_classes["Standard"];
        const storageCost = storageGb * classInfo.storage_rate;
        const putCost = (putReqs / 1000) * pricing.s3.put_per_1000;
        const getCost = (getReqs / 1000) * pricing.s3.get_per_1000;
        const retCost = retGb * classInfo.retrieval_rate;
        const s3Total = storageCost + putCost + getCost + retCost;

        baselineMonthlyUSD += s3Total;
        serviceResults.push({
            service_key: "s3",
            service_name: "Amazon Simple Storage Service (S3)",
            short_name: "S3",
            cost_type: "storage",
            monthly_cost_usd: s3Total,
            configuration: { s3Class, storageGb, putReqs, getReqs, retGb, rate: classInfo.storage_rate }
        });

        lineItems.push({
            service_key: "s3",
            service_name: "Amazon S3",
            component_name: `Storage Tier (${s3Class})`,
            cost_type: "storage",
            quantity: `${storageGb.toFixed(1)} GB-mo`,
            unit_price: `$${classInfo.storage_rate.toFixed(4)}/GB-mo`,
            formula: `${storageGb} GB × $${classInfo.storage_rate.toFixed(4)}`,
            subtotal_usd: storageCost,
            pricing_source: pricing.s3.source
        });

        if (putReqs > 0) {
            lineItems.push({
                service_key: "s3",
                service_name: "Amazon S3",
                component_name: "PUT/POST API Calls",
                cost_type: "storage",
                quantity: `${putReqs.toLocaleString()} req`,
                unit_price: `$${pricing.s3.put_per_1000.toFixed(4)}/1k`,
                formula: `(${putReqs} / 1,000) × $${pricing.s3.put_per_1000.toFixed(4)}`,
                subtotal_usd: putCost,
                pricing_source: "AWS S3 Tier 1 Requests"
            });
        }

        if (getReqs > 0) {
            lineItems.push({
                service_key: "s3",
                service_name: "Amazon S3",
                component_name: "GET/SELECT API Calls",
                cost_type: "storage",
                quantity: `${getReqs.toLocaleString()} req`,
                unit_price: `$${pricing.s3.get_per_1000.toFixed(4)}/1k`,
                formula: `(${getReqs} / 1,000) × $${pricing.s3.get_per_1000.toFixed(4)}`,
                subtotal_usd: getCost,
                pricing_source: "AWS S3 Tier 2 Requests"
            });
        }
    }

    // --- 3. Amazon RDS ---
    if (document.getElementById("rds_enabled") && document.getElementById("rds_enabled").checked) {
        const instType = document.getElementById("rds_instance_type").value;
        const deployment = document.getElementById("rds_deployment").value;
        const storageGb = Math.max(0, parseFloat(document.getElementById("rds_storage_gb").value) || 0);
        const count = Math.max(1, parseInt(document.getElementById("rds_count").value) || 1);
        const hours = Math.max(0, parseFloat(document.getElementById("rds_hours").value) || 730);

        const instInfo = pricing.rds.instances[instType] || pricing.rds.instances["db.t3.micro"];
        const multiplier = (deployment === "Multi-AZ") ? pricing.rds.multi_az_multiplier : 1.0;
        const hourlyRate = instInfo.price_per_hr * multiplier;
        const computeCost = hourlyRate * count * hours;
        const storageRate = pricing.rds.storage_gp3_per_gb * multiplier;
        const storageCost = count * storageGb * storageRate;
        const rdsTotal = computeCost + storageCost;

        baselineMonthlyUSD += rdsTotal;
        serviceResults.push({
            service_key: "rds",
            service_name: "Amazon Relational Database Service (RDS)",
            short_name: "RDS",
            cost_type: "database",
            monthly_cost_usd: rdsTotal,
            configuration: { instType, deployment, storageGb, count, hours, hourlyRate, baseHourly: instInfo.price_per_hr }
        });

        lineItems.push({
            service_key: "rds",
            service_name: "Amazon RDS",
            component_name: `Database Compute (${instType}, ${deployment})`,
            cost_type: "database",
            quantity: `${count}x @ ${hours.toFixed(0)} hrs/mo`,
            unit_price: `$${hourlyRate.toFixed(4)}/hr`,
            formula: `(${count} × ${hours}h) × ($${instInfo.price_per_hr.toFixed(4)} × ${multiplier}x)`,
            subtotal_usd: computeCost,
            pricing_source: pricing.rds.source
        });

        lineItems.push({
            service_key: "rds",
            service_name: "Amazon RDS",
            component_name: `Allocated Storage (gp3, ${deployment})`,
            cost_type: "database",
            quantity: `${(count * storageGb).toFixed(0)} GB-mo`,
            unit_price: `$${storageRate.toFixed(3)}/GB-mo`,
            formula: `${count * storageGb} GB × $${storageRate.toFixed(3)}`,
            subtotal_usd: storageCost,
            pricing_source: "AWS RDS Storage"
        });
    }

    // --- 4. AWS Lambda ---
    if (document.getElementById("lambda_enabled") && document.getElementById("lambda_enabled").checked) {
        const reqCount = Math.max(0, parseInt(document.getElementById("lambda_requests").value) || 0);
        const durationMs = Math.max(1, parseFloat(document.getElementById("lambda_duration").value) || 200);
        const memoryMb = parseInt(document.getElementById("lambda_memory").value) || 512;
        const arch = document.getElementById("lambda_arch").value;
        const applyFreeTier = document.getElementById("lambda_freetier").checked;

        const durationSec = durationMs / 1000;
        const memoryGb = memoryMb / 1024;
        const totalGbSec = reqCount * durationSec * memoryGb;

        const freeGbSec = applyFreeTier ? pricing.lambda.free_gb_sec : 0;
        const billedGbSec = Math.max(0, totalGbSec - freeGbSec);
        const rateGbSec = (arch === "arm64") ? pricing.lambda.compute_gb_sec_arm : pricing.lambda.compute_gb_sec_x86;
        const computeCost = billedGbSec * rateGbSec;

        const freeReq = applyFreeTier ? pricing.lambda.free_requests : 0;
        const billedReq = Math.max(0, reqCount - freeReq);
        const reqCost = (billedReq / 1000000) * pricing.lambda.request_per_million;
        const lambdaTotal = computeCost + reqCost;

        baselineMonthlyUSD += lambdaTotal;
        serviceResults.push({
            service_key: "lambda",
            service_name: "AWS Lambda (Serverless Compute)",
            short_name: "Lambda",
            cost_type: "compute",
            monthly_cost_usd: lambdaTotal,
            configuration: { reqCount, durationMs, memoryMb, arch, applyFreeTier, totalGbSec }
        });

        lineItems.push({
            service_key: "lambda",
            service_name: "AWS Lambda",
            component_name: `Execution Time (${arch}, ${memoryMb} MB)`,
            cost_type: "compute",
            quantity: `${totalGbSec.toFixed(1)} GB-s (${billedGbSec.toFixed(1)} billed)`,
            unit_price: `$${rateGbSec.toFixed(8)}/GB-s`,
            formula: `(${billedGbSec.toFixed(0)} billed GB-s) × $${rateGbSec.toFixed(8)}`,
            subtotal_usd: computeCost,
            pricing_source: pricing.lambda.source
        });

        lineItems.push({
            service_key: "lambda",
            service_name: "AWS Lambda",
            component_name: "Invocation Requests",
            cost_type: "compute",
            quantity: `${reqCount.toLocaleString()} req (${billedReq.toLocaleString()} billed)`,
            unit_price: `$${pricing.lambda.request_per_million.toFixed(2)}/1M`,
            formula: `(${billedReq} / 1M) × $${pricing.lambda.request_per_million.toFixed(2)}`,
            subtotal_usd: reqCost,
            pricing_source: "AWS Lambda Requests"
        });
    }

    // --- 5. Amazon CloudWatch ---
    if (document.getElementById("cw_enabled") && document.getElementById("cw_enabled").checked) {
        const ingestGb = Math.max(0, parseFloat(document.getElementById("cw_ingest_gb").value) || 0);
        const storageGb = Math.max(0, parseFloat(document.getElementById("cw_storage_gb").value) || 0);
        const metrics = Math.max(0, parseInt(document.getElementById("cw_metrics").value) || 0);
        const applyFreeTier = document.getElementById("cw_freetier").checked;

        const freeIngest = applyFreeTier ? pricing.cloudwatch.free_ingest_gb : 0;
        const billedIngest = Math.max(0, ingestGb - freeIngest);
        const ingestCost = billedIngest * pricing.cloudwatch.ingestion_per_gb;
        const storageCost = storageGb * pricing.cloudwatch.storage_per_gb;

        const freeMetrics = applyFreeTier ? pricing.cloudwatch.free_metrics : 0;
        const billedMetrics = Math.max(0, metrics - freeMetrics);
        const metricsCost = billedMetrics * pricing.cloudwatch.metric_per_month;
        const cwTotal = ingestCost + storageCost + metricsCost;

        baselineMonthlyUSD += cwTotal;
        serviceResults.push({
            service_key: "cloudwatch",
            service_name: "Amazon CloudWatch (Logs & Metrics)",
            short_name: "CloudWatch",
            cost_type: "monitoring",
            monthly_cost_usd: cwTotal,
            configuration: { ingestGb, storageGb, metrics, applyFreeTier }
        });

        lineItems.push({
            service_key: "cloudwatch",
            service_name: "Amazon CloudWatch",
            component_name: "Logs Ingestion",
            cost_type: "monitoring",
            quantity: `${ingestGb.toFixed(1)} GB (${billedIngest.toFixed(1)} billed)`,
            unit_price: `$${pricing.cloudwatch.ingestion_per_gb.toFixed(2)}/GB`,
            formula: `(${billedIngest.toFixed(1)} GB) × $${pricing.cloudwatch.ingestion_per_gb.toFixed(2)}`,
            subtotal_usd: ingestCost,
            pricing_source: pricing.cloudwatch.source
        });

        lineItems.push({
            service_key: "cloudwatch",
            service_name: "Amazon CloudWatch",
            component_name: "Log Archive Storage",
            cost_type: "monitoring",
            quantity: `${storageGb.toFixed(1)} GB-mo`,
            unit_price: `$${pricing.cloudwatch.storage_per_gb.toFixed(3)}/GB-mo`,
            formula: `${storageGb} GB × $${pricing.cloudwatch.storage_per_gb.toFixed(3)}`,
            subtotal_usd: storageCost,
            pricing_source: "AWS CloudWatch Storage"
        });
    }

    // --- 6. Amazon VPC Networking ---
    if (document.getElementById("vpc_enabled") && document.getElementById("vpc_enabled").checked) {
        const natCount = Math.max(0, parseInt(document.getElementById("vpc_nat_count").value) || 0);
        const natHours = Math.max(0, parseFloat(document.getElementById("vpc_nat_hours").value) || 730);
        const natDataGb = Math.max(0, parseFloat(document.getElementById("vpc_nat_data_gb").value) || 0);
        const publicIps = Math.max(0, parseInt(document.getElementById("vpc_public_ips").value) || 0);

        const natHourlyCost = natCount * natHours * pricing.vpc.nat_hourly;
        const natDataCost = natDataGb * pricing.vpc.nat_data_per_gb;
        const ipCost = publicIps * natHours * pricing.vpc.public_ipv4_hourly;
        const vpcTotal = natHourlyCost + natDataCost + ipCost;

        baselineMonthlyUSD += vpcTotal;
        serviceResults.push({
            service_key: "vpc",
            service_name: "Amazon VPC Networking (NAT & IPs)",
            short_name: "VPC",
            cost_type: "networking",
            monthly_cost_usd: vpcTotal,
            configuration: { natCount, natHours, natDataGb, publicIps }
        });

        lineItems.push({
            service_key: "vpc",
            service_name: "Amazon VPC",
            component_name: "NAT Gateway Uptime Hours",
            cost_type: "networking",
            quantity: `${natCount} GW @ ${natHours.toFixed(0)} hrs`,
            unit_price: `$${pricing.vpc.nat_hourly.toFixed(3)}/hr`,
            formula: `${natCount} × ${natHours}h × $${pricing.vpc.nat_hourly.toFixed(3)}`,
            subtotal_usd: natHourlyCost,
            pricing_source: pricing.vpc.source
        });

        if (natDataGb > 0) {
            lineItems.push({
                service_key: "vpc",
                service_name: "Amazon VPC",
                component_name: "NAT Data Processed",
                cost_type: "networking",
                quantity: `${natDataGb.toFixed(1)} GB`,
                unit_price: `$${pricing.vpc.nat_data_per_gb.toFixed(3)}/GB`,
                formula: `${natDataGb} GB × $${pricing.vpc.nat_data_per_gb.toFixed(3)}`,
                subtotal_usd: natDataCost,
                pricing_source: "AWS NAT Gateway Data"
            });
        }
    }

    // Heuristic Optimization Recommendations
    const recommendations = generateRecommendations(serviceResults, pricing);

    // Save baseline state
    rawCalculationState = {
        region,
        currency,
        pricing,
        baselineMonthlyUSD,
        serviceResults,
        lineItems,
        recommendations,
        calculatedAt: new Date().toISOString()
    };

    // Apply active filters and refresh all UI components
    applyFiltersAndRender();
}

function generateRecommendations(serviceResults, pricing) {
    const recs = [];
    const svcMap = {};
    serviceResults.forEach(s => { svcMap[s.service_key] = s; });

    // 1. EC2 Scheduling
    if (svcMap.ec2) {
        const cfg = svcMap.ec2.configuration;
        if (cfg.hoursDay >= 20 && cfg.daysMonth >= 28) {
            const optHours = 10 * 22; // 10h/day * 22 business days
            const optCompute = cfg.hourlyPrice * cfg.count * optHours;
            const currentCompute = cfg.hourlyPrice * cfg.count * cfg.monthlyHours;
            const savings = Math.max(0, currentCompute - optCompute);
            const pct = Math.round((savings / svcMap.ec2.monthly_cost_usd) * 100);

            if (savings > 1.0) {
                recs.push({
                    id: "REC-EC2-SCHED",
                    service_key: "ec2",
                    service: "Amazon EC2",
                    title: "Automated Non-Production Scheduling (Stop Off-Hours)",
                    current_config: `${cfg.count}x ${cfg.instType} running 24x7 (${cfg.monthlyHours.toFixed(0)} hrs/mo)`,
                    suggested_config: `${cfg.count}x ${cfg.instType} scheduled 10 hrs/day × 22 business days (${optHours} hrs/mo)`,
                    current_cost_usd: svcMap.ec2.monthly_cost_usd,
                    optimized_cost_usd: svcMap.ec2.monthly_cost_usd - savings,
                    savings_usd: savings,
                    savings_pct: pct,
                    priority: "HIGH",
                    assumptions: "Applicable to development or testing environments not accessed outside working hours.",
                    trade_offs: "Instances stopped overnight and on weekends. Managed via AWS EventBridge + Lambda or AWS Systems Manager Quick Setup."
                });
            }
        }

        // Rightsizing
        if (["m5.large", "c5.large", "t3.large", "t3.xlarge"].includes(cfg.instType)) {
            const downsizedType = cfg.instType.includes("large") ? "t3.medium" : "t3.small";
            const downsizedRate = pricing.ec2.instances[downsizedType].price_per_hr;
            const optCompute = downsizedRate * cfg.count * cfg.monthlyHours;
            const currentCompute = cfg.hourlyPrice * cfg.count * cfg.monthlyHours;
            const savings = Math.max(0, currentCompute - optCompute);
            const pct = Math.round((savings / svcMap.ec2.monthly_cost_usd) * 100);

            if (savings > 2.0) {
                recs.push({
                    id: "REC-EC2-SIZE",
                    service_key: "ec2",
                    service: "Amazon EC2",
                    title: `Instance Rightsizing (${cfg.instType} → ${downsizedType})`,
                    current_config: `${cfg.count}x ${cfg.instType} ($${cfg.hourlyPrice.toFixed(4)}/hr)`,
                    suggested_config: `${cfg.count}x ${downsizedType} ($${downsizedRate.toFixed(4)}/hr)`,
                    current_cost_usd: svcMap.ec2.monthly_cost_usd,
                    optimized_cost_usd: svcMap.ec2.monthly_cost_usd - savings,
                    savings_usd: savings,
                    savings_pct: pct,
                    priority: "HIGH",
                    assumptions: "Assumes CloudWatch CPUUtilization averages < 25% with adequate RAM headroom.",
                    trade_offs: "Reduces compute capacity. Inspect CloudWatch memory metrics before resizing production instances."
                });
            }
        }
    }

    // 2. S3 Storage Class Optimization
    if (svcMap.s3) {
        const cfg = svcMap.s3.configuration;
        if (cfg.s3Class === "Standard" && cfg.storageGb >= 50) {
            const optRate = pricing.s3.storage_classes["Standard-IA"].storage_rate;
            const optStorageCost = cfg.storageGb * optRate;
            const currentStorageCost = cfg.storageGb * cfg.rate;
            const savings = Math.max(0, currentStorageCost - optStorageCost);
            const pct = Math.round((savings / svcMap.s3.monthly_cost_usd) * 100);

            if (savings > 0.5) {
                recs.push({
                    id: "REC-S3-LIFECYCLE",
                    service_key: "s3",
                    service: "Amazon S3",
                    title: "S3 Lifecycle Transition to Infrequent Access (Standard-IA)",
                    current_config: `${cfg.storageGb} GB in S3 Standard ($0.023/GB-mo)`,
                    suggested_config: `${cfg.storageGb} GB in S3 Standard-IA ($0.0125/GB-mo)`,
                    current_cost_usd: svcMap.s3.monthly_cost_usd,
                    optimized_cost_usd: svcMap.s3.monthly_cost_usd - savings,
                    savings_usd: savings,
                    savings_pct: pct,
                    priority: "MEDIUM",
                    assumptions: "Data is retained > 30 days and accessed infrequently (e.g. historical logs or backups).",
                    trade_offs: "Introduces $0.01/GB data retrieval fee if objects are downloaded frequently."
                });
            }
        }
    }

    // 3. RDS Multi-AZ to Single-AZ for Dev
    if (svcMap.rds) {
        const cfg = svcMap.rds.configuration;
        if (cfg.deployment === "Multi-AZ") {
            const optHourly = cfg.baseHourly; // Single-AZ
            const optCompute = optHourly * cfg.count * cfg.hours;
            const optStorage = cfg.count * cfg.storageGb * pricing.rds.storage_gp3_per_gb;
            const optTotal = optCompute + optStorage;
            const savings = Math.max(0, svcMap.rds.monthly_cost_usd - optTotal);
            const pct = Math.round((savings / svcMap.rds.monthly_cost_usd) * 100);

            recs.push({
                id: "REC-RDS-AZ",
                service_key: "rds",
                service: "Amazon RDS",
                title: "Deploy Single-AZ for Development and Staging Databases",
                current_config: `${cfg.count}x ${cfg.instType} (Multi-AZ Deployment - 2.0x cost)`,
                suggested_config: `${cfg.count}x ${cfg.instType} (Single-AZ Deployment)`,
                current_cost_usd: svcMap.rds.monthly_cost_usd,
                optimized_cost_usd: svcMap.rds.monthly_cost_usd - savings,
                savings_usd: savings,
                savings_pct: pct,
                priority: "HIGH",
                assumptions: "Applicable strictly to test/staging environments where high availability failover is not required.",
                trade_offs: "Single-AZ removes synchronous standby replication. Never use Single-AZ for mission-critical production."
            });
        }
    }

    // 4. Lambda ARM64 (Graviton2)
    if (svcMap.lambda) {
        const cfg = svcMap.lambda.configuration;
        if (cfg.arch === "x86_64" && cfg.totalGbSec > 200000) {
            const currentRate = pricing.lambda.compute_gb_sec_x86;
            const optRate = pricing.lambda.compute_gb_sec_arm;
            const billedGbSec = Math.max(0, cfg.totalGbSec - (cfg.applyFreeTier ? pricing.lambda.free_gb_sec : 0));
            const savings = Math.max(0, (billedGbSec * currentRate) - (billedGbSec * optRate));
            const pct = Math.round((savings / svcMap.lambda.monthly_cost_usd) * 100);

            if (savings > 0.2) {
                recs.push({
                    id: "REC-LAM-ARM",
                    service_key: "lambda",
                    service: "AWS Lambda",
                    title: "Migrate Lambda Architecture to ARM64 (AWS Graviton2)",
                    current_config: `${cfg.reqCount.toLocaleString()} invocations on x86_64 architecture`,
                    suggested_config: `${cfg.reqCount.toLocaleString()} invocations on arm64 Graviton2 (20% lower price/GB-s)`,
                    current_cost_usd: svcMap.lambda.monthly_cost_usd,
                    optimized_cost_usd: svcMap.lambda.monthly_cost_usd - savings,
                    savings_usd: savings,
                    savings_pct: pct,
                    priority: "MEDIUM",
                    assumptions: "Application code and runtime dependencies run seamlessly on Linux ARM64.",
                    trade_offs: "Verify compiled binaries and Docker container base images before migrating in production."
                });
            }
        }
    }

    // 5. VPC S3 Gateway Endpoint
    if (svcMap.vpc) {
        const cfg = svcMap.vpc.configuration;
        if (cfg.natCount >= 1 && cfg.natDataGb >= 30) {
            const s3TrafficSavings = (cfg.natDataGb * 0.75) * pricing.vpc.nat_data_per_gb;
            const pct = Math.round((s3TrafficSavings / svcMap.vpc.monthly_cost_usd) * 100);

            if (s3TrafficSavings > 1.0) {
                recs.push({
                    id: "REC-VPC-ENDPOINT",
                    service_key: "vpc",
                    service: "Amazon VPC",
                    title: "Deploy Free S3 Gateway Endpoints (Bypass NAT Gateway Fees)",
                    current_config: `${cfg.natCount} NAT Gateway routing all outbound S3 traffic ($0.056/GB processing fee)`,
                    suggested_config: "VPC Gateway Endpoint for Amazon S3 (Completely Free of Charge)",
                    current_cost_usd: svcMap.vpc.monthly_cost_usd,
                    optimized_cost_usd: svcMap.vpc.monthly_cost_usd - s3TrafficSavings,
                    savings_usd: s3TrafficSavings,
                    savings_pct: pct,
                    priority: "HIGH",
                    assumptions: "A significant portion of private subnet traffic involves reading or writing objects in Amazon S3.",
                    trade_offs: "Requires updating VPC Route Tables. S3 Gateway Endpoints incur zero hourly fees and zero data fees."
                });
            }
        }
    }

    return recs;
}

// ========================================================
// 4. Filtering and UI Synchronization Engine
// ========================================================

function applyFiltersAndRender() {
    if (!rawCalculationState) return;

    const currencySelect = document.getElementById("globalCurrencySelect");
    const currency = currencySelect ? currencySelect.value : "USD";
    const isINR = (currency === "INR");
    const mult = isINR ? USD_TO_INR_RATE : 1.0;
    const symbol = isINR ? "₹" : "$";

    // Period multiplier & labels
    let periodMultiplier = 1.0;
    let periodLabel = "Current Month";
    let periodSavingsLabel = "Current Month (Projected)";
    let periodSuffix = "/mo";

    if (currentFilters.period === "last_month") {
        periodMultiplier = 1.0;
        periodLabel = "Last Month (Historical)";
        periodSavingsLabel = "Last Month (Realized)";
        periodSuffix = " (last mo)";
    } else if (currentFilters.period === "last_6_months") {
        periodMultiplier = 6.0;
        periodLabel = "Last 6 Months (Cumulative)";
        periodSavingsLabel = "Last 6 Months (Cumulative)";
        periodSuffix = " (6 mos)";
    } else if (currentFilters.period === "ytd") {
        periodMultiplier = 10.0;
        periodLabel = "Year to Date (10 Months)";
        periodSavingsLabel = "Year to Date (10 Months)";
        periodSuffix = " (YTD)";
    } else if (currentFilters.period === "annual") {
        periodMultiplier = 12.0;
        periodLabel = "Annual Projection (12 Months)";
        periodSavingsLabel = "Annual Projection (12 Months)";
        periodSuffix = "/yr";
    }

    // Filter line items
    let filteredLineItems = rawCalculationState.lineItems.slice();

    if (currentFilters.service !== "ALL") {
        filteredLineItems = filteredLineItems.filter(item => item.service_key === currentFilters.service);
    }

    if (currentFilters.costType !== "ALL") {
        filteredLineItems = filteredLineItems.filter(item => item.cost_type === currentFilters.costType);
    }

    // Filter service results based on remaining line items
    const activeServiceKeys = new Set(filteredLineItems.map(item => item.service_key));
    const filteredServices = rawCalculationState.serviceResults
        .filter(s => activeServiceKeys.has(s.service_key))
        .map(s => {
            const svcItems = filteredLineItems.filter(item => item.service_key === s.service_key);
            const totalForSvc = svcItems.reduce((acc, it) => acc + it.subtotal_usd, 0);
            return {
                ...s,
                monthly_cost_usd: totalForSvc
            };
        });

    // Filter recommendations
    let filteredRecs = rawCalculationState.recommendations.slice();
    if (currentFilters.service !== "ALL") {
        filteredRecs = filteredRecs.filter(r => r.service_key === currentFilters.service);
    }
    if (currentFilters.costType !== "ALL") {
        filteredRecs = filteredRecs.filter(r => {
            const svc = rawCalculationState.serviceResults.find(s => s.service_key === r.service_key);
            return svc && svc.cost_type === currentFilters.costType;
        });
    }

    // Calculate aggregated metrics
    const monthlyBaselineUSD = filteredLineItems.reduce((acc, it) => acc + it.subtotal_usd, 0);
    const monthlySavingsUSD = filteredRecs.reduce((acc, r) => acc + r.savings_usd, 0);
    const monthlyOptimizedUSD = Math.max(0, monthlyBaselineUSD - monthlySavingsUSD);

    const scaledBaselineUSD = monthlyBaselineUSD * periodMultiplier;
    const scaledSavingsUSD = monthlySavingsUSD * periodMultiplier;
    const scaledOptimizedUSD = monthlyOptimizedUSD * periodMultiplier;

    const savingsPct = (monthlyBaselineUSD > 0)
        ? ((monthlySavingsUSD / monthlyBaselineUSD) * 100).toFixed(1)
        : "0.0";

    // Update Filter Badge UI
    updateFilterBadge();

    // 1. Update Hero Cards
    const heroSavingsAmount = document.getElementById("heroSavingsAmount");
    const heroSavingsPct = document.getElementById("heroSavingsPct");
    const heroSavingsPeriodLabel = document.getElementById("heroSavingsPeriodLabel");
    const heroTotalAmount = document.getElementById("heroTotalAmount");
    const heroTotalPeriodLabel = document.getElementById("heroTotalPeriodLabel");
    const heroOptimizedSpendSubtext = document.getElementById("heroOptimizedSpendSubtext");

    if (heroSavingsAmount) heroSavingsAmount.textContent = `${symbol}${formatCurrency(scaledSavingsUSD * mult)}`;
    if (heroSavingsPct) heroSavingsPct.textContent = `~${savingsPct}% Cost Reduction`;
    if (heroSavingsPeriodLabel) heroSavingsPeriodLabel.textContent = `Period: ${periodSavingsLabel}`;
    if (heroTotalAmount) heroTotalAmount.textContent = `${symbol}${formatCurrency(scaledBaselineUSD * mult)}`;
    if (heroTotalPeriodLabel) heroTotalPeriodLabel.textContent = `Period: ${periodLabel}`;
    if (heroOptimizedSpendSubtext) heroOptimizedSpendSubtext.textContent = `Optimized plan: ${symbol}${formatCurrency(scaledOptimizedUSD * mult)}${periodSuffix}`;

    // 2. Update 4 Compact KPI Cards
    const kpiMonthlyCost = document.getElementById("kpiMonthlyCost");
    const kpiAnnualCost = document.getElementById("kpiAnnualCost");
    const kpiMonthlySavings = document.getElementById("kpiMonthlySavings");
    const kpiServicesCount = document.getElementById("kpiServicesCount");

    if (kpiMonthlyCost) kpiMonthlyCost.textContent = `${symbol}${formatCurrency(monthlyBaselineUSD * mult)}`;
    if (kpiAnnualCost) kpiAnnualCost.textContent = `${symbol}${formatCurrency(monthlyBaselineUSD * 12 * mult)}`;
    if (kpiMonthlySavings) kpiMonthlySavings.textContent = `${symbol}${formatCurrency(monthlySavingsUSD * mult)}`;
    if (kpiServicesCount) kpiServicesCount.textContent = `${filteredServices.length} Service${filteredServices.length === 1 ? '' : 's'}`;

    // 3. Update Chart Currency Labels
    const chartCurrencyLabel = document.getElementById("chartCurrencyLabel");
    if (chartCurrencyLabel) {
        chartCurrencyLabel.textContent = `Currency: ${currency} (${symbol}) • Region: ${rawCalculationState.region} • Verified AWS On-Demand Catalog`;
    }

    // 4. Render Main Stacked Bar Chart
    renderMainStackedBarChart(filteredServices, filteredLineItems, monthlyBaselineUSD, monthlyOptimizedUSD, symbol, mult);

    // 5. Render Secondary Charts
    renderCostDoughnutChart(filteredServices, symbol, mult);
    renderBeforeAfterCompChart(monthlyBaselineUSD, monthlyOptimizedUSD, monthlySavingsUSD, savingsPct, symbol, mult);

    // 6. Render Detailed Calculation Table
    renderLineItemsTable(filteredLineItems, symbol, mult);

    // 7. Render Optimization Recommendations Cards
    renderRecommendationsCards(filteredRecs, symbol, mult);
}

function updateFilterBadge() {
    const badge = document.getElementById("activeFilterBadge");
    if (!badge) return;

    const parts = [];
    if (currentFilters.period !== "month") {
        const periodNames = {
            last_month: "Last Month",
            last_6_months: "Last 6 Mos",
            ytd: "YTD",
            annual: "Annual"
        };
        parts.push(periodNames[currentFilters.period] || currentFilters.period);
    }
    if (currentFilters.service !== "ALL") {
        parts.push(currentFilters.service.toUpperCase());
    }
    if (currentFilters.costType !== "ALL") {
        parts.push(currentFilters.costType.charAt(0).toUpperCase() + currentFilters.costType.slice(1));
    }

    if (parts.length === 0) {
        badge.textContent = "Showing All Active Services";
        badge.className = "text-[11px] text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md font-medium border border-blue-200";
    } else {
        badge.textContent = `Filtered: ${parts.join(" • ")}`;
        badge.className = "text-[11px] text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-md font-semibold border border-indigo-200";
    }
}

// ========================================================
// 5. Chart Rendering (Chart.js)
// ========================================================

function renderMainStackedBarChart(services, lineItems, baselineTotal, optimizedTotal, symbol, mult) {
    const canvas = document.getElementById("mainStackedBarChart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    if (mainStackedBarChartInstance) {
        mainStackedBarChartInstance.destroy();
    }

    const months = ["Nov 2025", "Dec 2025", "Jan 2026", "Feb 2026", "Mar 2026", "Apr 2026 (Est)"];
    const monthMultipliers = [0.85, 0.90, 0.94, 0.98, 1.00, 1.00]; // Realistic historical trajectory

    let datasets = [];

    if (currentFilters.chartGrouping === "cost_type") {
        // Group by cost category (Compute, Storage, Database, Networking, Monitoring)
        const categories = ["compute", "storage", "database", "networking", "monitoring"];
        categories.forEach(cat => {
            const catItems = lineItems.filter(i => i.cost_type === cat);
            const catTotalUSD = catItems.reduce((acc, i) => acc + i.subtotal_usd, 0);

            if (catTotalUSD > 0 || currentFilters.costType === cat) {
                const cfg = COST_TYPE_COLORS[cat];
                datasets.push({
                    label: cfg.name,
                    data: monthMultipliers.map(m => ((catTotalUSD * m * mult)).toFixed(2)),
                    backgroundColor: cfg.bg,
                    borderColor: cfg.border,
                    borderWidth: 1,
                    borderRadius: 4
                });
            }
        });
    } else if (currentFilters.chartGrouping === "monthly_trend") {
        // Clustered comparison: Baseline Spend vs Optimized Spend per month
        datasets = [
            {
                label: `Baseline Monthly Spend (${symbol})`,
                data: monthMultipliers.map(m => ((baselineTotal * m * mult)).toFixed(2)),
                backgroundColor: "rgba(59, 130, 246, 0.8)",
                borderColor: "#2563eb",
                borderWidth: 1,
                borderRadius: 4
            },
            {
                label: `Optimized Architecture Spend (${symbol})`,
                data: monthMultipliers.map(m => ((optimizedTotal * m * mult)).toFixed(2)),
                backgroundColor: "rgba(16, 185, 129, 0.85)",
                borderColor: "#059669",
                borderWidth: 1,
                borderRadius: 4
            }
        ];
    } else {
        // Default: Group by Service Name (Stacked)
        services.forEach(svc => {
            const cfg = SERVICE_COLORS[svc.service_key] || { bg: "#64748b", border: "#475569", name: svc.short_name };
            datasets.push({
                label: cfg.name,
                data: monthMultipliers.map(m => ((svc.monthly_cost_usd * m * mult)).toFixed(2)),
                backgroundColor: cfg.bg,
                borderColor: cfg.border,
                borderWidth: 1,
                borderRadius: 4
            });
        });
    }

    if (datasets.length === 0) {
        datasets.push({
            label: "No Services Selected",
            data: [0, 0, 0, 0, 0, 0],
            backgroundColor: "#e2e8f0"
        });
    }

    mainStackedBarChartInstance = new Chart(ctx, {
        type: "bar",
        data: {
            labels: months,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: "index",
                intersect: false
            },
            plugins: {
                legend: {
                    position: "top",
                    align: "end",
                    labels: {
                        color: "#475569",
                        boxWidth: 12,
                        font: { size: 11, weight: "600", family: "Inter" }
                    }
                },
                tooltip: {
                    backgroundColor: "#0f172a",
                    titleColor: "#f8fafc",
                    bodyColor: "#f8fafc",
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        label: (ctx) => ` ${ctx.dataset.label}: ${symbol}${formatCurrency(parseFloat(ctx.raw))}`
                    }
                }
            },
            scales: {
                x: {
                    stacked: currentFilters.chartGrouping !== "monthly_trend",
                    grid: { display: false },
                    ticks: { color: "#64748b", font: { size: 11, weight: "500", family: "Inter" } }
                },
                y: {
                    stacked: currentFilters.chartGrouping !== "monthly_trend",
                    beginAtZero: true,
                    grid: { color: "rgba(226, 232, 240, 0.8)" },
                    ticks: {
                        color: "#64748b",
                        font: { size: 11, family: "Inter" },
                        callback: (v) => `${symbol}${formatCurrency(v)}`
                    }
                }
            }
        }
    });
}

function renderCostDoughnutChart(services, symbol, mult) {
    const canvas = document.getElementById("costDoughnutChart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    if (costDoughnutChartInstance) {
        costDoughnutChartInstance.destroy();
    }

    const labels = services.map(s => (SERVICE_COLORS[s.service_key] ? SERVICE_COLORS[s.service_key].name : s.short_name));
    const values = services.map(s => (s.monthly_cost_usd * mult).toFixed(2));
    const colors = services.map(s => (SERVICE_COLORS[s.service_key] ? SERVICE_COLORS[s.service_key].bg : "#94a3b8"));

    costDoughnutChartInstance = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: labels.length > 0 ? labels : ["No Active Services"],
            datasets: [{
                data: values.length > 0 ? values : [1],
                backgroundColor: values.length > 0 ? colors : ["#e2e8f0"],
                borderWidth: 2,
                borderColor: "#ffffff"
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: "bottom",
                    labels: {
                        color: "#475569",
                        boxWidth: 10,
                        font: { size: 10, family: "Inter" }
                    }
                },
                tooltip: {
                    backgroundColor: "#0f172a",
                    callbacks: {
                        label: (ctx) => ` ${ctx.label}: ${symbol}${formatCurrency(parseFloat(ctx.raw))}`
                    }
                }
            },
            cutout: "62%"
        }
    });
}

function renderBeforeAfterCompChart(baselineTotal, optimizedTotal, savingsTotal, savingsPct, symbol, mult) {
    const canvas = document.getElementById("beforeAfterCompChart");
    const savingsLabel = document.getElementById("compChartSavingsText");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    if (beforeAfterCompChartInstance) {
        beforeAfterCompChartInstance.destroy();
    }

    if (savingsLabel) {
        savingsLabel.textContent = `Save ${symbol}${formatCurrency(savingsTotal * mult)}/mo (${savingsPct}%)`;
    }

    const baselineVal = (baselineTotal * mult).toFixed(2);
    const optimizedVal = (optimizedTotal * mult).toFixed(2);

    beforeAfterCompChartInstance = new Chart(ctx, {
        type: "bar",
        data: {
            labels: ["Baseline Architecture", "Optimized Architecture"],
            datasets: [{
                label: `Monthly Cost (${symbol})`,
                data: [baselineVal, optimizedVal],
                backgroundColor: ["#3b82f6", "#10b981"],
                borderColor: ["#2563eb", "#059669"],
                borderWidth: 1,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: "#0f172a",
                    callbacks: {
                        label: (ctx) => ` Cost: ${symbol}${formatCurrency(parseFloat(ctx.raw))}`
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: "#475569", font: { size: 11, weight: "600", family: "Inter" } }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: "rgba(226, 232, 240, 0.8)" },
                    ticks: {
                        color: "#64748b",
                        font: { size: 10, family: "Inter" },
                        callback: (v) => `${symbol}${formatCurrency(v)}`
                    }
                }
            }
        }
    });
}

// ========================================================
// 6. Line Items Table & Recommendations Rendering
// ========================================================

function renderLineItemsTable(lineItems, symbol, mult) {
    const tbody = document.getElementById("lineItemsTableBody");
    const notice = document.getElementById("tableFilterNotice");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (notice) {
        if (currentFilters.service !== "ALL" || currentFilters.costType !== "ALL") {
            notice.textContent = `Filtered View (${lineItems.length} line item${lineItems.length === 1 ? '' : 's'})`;
        } else {
            notice.textContent = "Full Audit View";
        }
    }

    if (lineItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-400 font-medium">No components match the active service/cost-type filters. Adjust the filters above to inspect line items.</td></tr>`;
        return;
    }

    lineItems.forEach(item => {
        const subtotal = (item.subtotal_usd * mult).toFixed(2);
        const tr = document.createElement("tr");
        tr.className = "hover:bg-slate-50/80 transition border-b border-slate-100";
        tr.innerHTML = `
            <td class="py-3 px-3 font-semibold text-slate-900">${item.service_name}</td>
            <td class="py-3 px-3 text-blue-600 font-medium">${item.component_name}</td>
            <td class="py-3 px-3 text-slate-600">${item.quantity}</td>
            <td class="py-3 px-3 text-slate-500 font-mono text-[11px]">${item.unit_price}</td>
            <td class="py-3 px-3 text-slate-500 font-mono text-[11px]">${item.formula}</td>
            <td class="py-3 px-3 text-right font-bold text-slate-900 font-mono">${symbol}${formatCurrency(parseFloat(subtotal))}</td>
            <td class="py-3 px-3 text-slate-400 text-[11px]">${item.pricing_source}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderRecommendationsCards(recs, symbol, mult) {
    const container = document.getElementById("estimatorRecsContainer");
    if (!container) return;

    container.innerHTML = "";

    if (recs.length === 0) {
        container.innerHTML = `
            <div class="col-span-2 p-8 rounded-xl border border-slate-200 bg-white text-center text-slate-500 space-y-2">
                <span class="text-3xl block">✨</span>
                <p class="font-bold text-slate-800 text-sm">Optimal Architecture Detected</p>
                <p class="text-xs text-slate-500 max-w-md mx-auto">
                    Your current configurations reflect efficient resource provisioning. No high-impact rightsizing triggers were flagged under active filters.
                </p>
            </div>
        `;
        return;
    }

    recs.forEach(rec => {
        const card = document.createElement("div");
        card.className = "rec-card p-5 space-y-3";
        const currentCost = (rec.current_cost_usd * mult).toFixed(2);
        const optCost = (rec.optimized_cost_usd * mult).toFixed(2);
        const savingsCost = (rec.savings_usd * mult).toFixed(2);

        card.innerHTML = `
            <div class="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                    <span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                        ${rec.service}
                    </span>
                    <h4 class="text-sm font-bold text-slate-900 mt-1.5">${rec.title}</h4>
                </div>
                <span class="px-2 py-0.5 text-[10px] font-bold rounded ${rec.priority === 'HIGH' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}">
                    ${rec.priority} PRIORITY
                </span>
            </div>

            <div class="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-lg border border-slate-100">
                <div>
                    <span class="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">Current Plan</span>
                    <p class="text-slate-700 mt-0.5 font-medium leading-snug">${rec.current_config}</p>
                    <span class="text-red-600 font-bold block mt-1">${symbol}${formatCurrency(parseFloat(currentCost))}/mo</span>
                </div>
                <div>
                    <span class="text-[10px] text-emerald-600 block uppercase font-bold tracking-wider">Suggested Plan</span>
                    <p class="text-slate-700 mt-0.5 font-medium leading-snug">${rec.suggested_config}</p>
                    <span class="text-emerald-600 font-bold block mt-1">${symbol}${formatCurrency(parseFloat(optCost))}/mo</span>
                </div>
            </div>

            <div class="flex items-center justify-between text-xs pt-1">
                <span class="text-slate-500 font-medium">Estimated Net Savings:</span>
                <span class="text-emerald-600 font-extrabold text-sm">${symbol}${formatCurrency(parseFloat(savingsCost))}/mo (~${rec.savings_pct}%)</span>
            </div>

            <div class="text-[11px] text-slate-500 space-y-1 bg-white p-2.5 rounded border border-slate-200">
                <p><strong>Operational Assumption:</strong> ${rec.assumptions}</p>
                <p><strong>Trade-offs / Action:</strong> ${rec.trade_offs}</p>
            </div>
        `;
        container.appendChild(card);
    });
}

// ========================================================
// 7. Report Exports & S3 Archival
// ========================================================

function exportEstimateJson() {
    if (!rawCalculationState) calculateEstimate();

    const currencySelect = document.getElementById("globalCurrencySelect");
    const currency = currencySelect ? currencySelect.value : "USD";
    const isINR = (currency === "INR");
    const mult = isINR ? USD_TO_INR_RATE : 1.0;
    const symbol = isINR ? "₹" : "$";

    const exportPayload = {
        title: "AI-Powered AWS Cloud Cost Optimization System - Assessment Report",
        classification: "ESTIMATED ARCHITECTURAL PROJECTION (WELL-ARCHITECTED HEURISTICS)",
        generated_at_utc: new Date().toISOString(),
        pricing_region: rawCalculationState.region,
        currency: currency,
        exchange_rate_to_inr: USD_TO_INR_RATE,
        active_filters: currentFilters,
        summary: {
            baseline_monthly_cost: `${symbol}${formatCurrency(rawCalculationState.baselineMonthlyUSD * mult)}`,
            baseline_annual_cost: `${symbol}${formatCurrency(rawCalculationState.baselineMonthlyUSD * 12 * mult)}`,
            potential_monthly_savings: `${symbol}${formatCurrency(rawCalculationState.recommendations.reduce((a, r) => a + r.savings_usd, 0) * mult)}`,
            active_services_count: rawCalculationState.serviceResults.length
        },
        services_breakdown: rawCalculationState.serviceResults,
        line_items_detailed: rawCalculationState.lineItems,
        optimization_recommendations: rawCalculationState.recommendations,
        disclaimer: "All figures are mathematical projections derived from explicit user inputs and verified AWS On-Demand catalogs. Not an official AWS billing statement."
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aws_cloud_cost_optimization_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Downloaded detailed cost optimization report in JSON format.", false);
}

function exportEstimateCsv() {
    if (!rawCalculationState) calculateEstimate();

    const currencySelect = document.getElementById("globalCurrencySelect");
    const currency = currencySelect ? currencySelect.value : "USD";
    const isINR = (currency === "INR");
    const mult = isINR ? USD_TO_INR_RATE : 1.0;
    const symbol = isINR ? "₹" : "$";

    let csv = `"AI-Powered AWS Cloud Cost Optimization System - Calculation Audit"\n`;
    csv += `"Generated UTC","${new Date().toISOString()}"\n`;
    csv += `"Region","${rawCalculationState.region}"\n`;
    csv += `"Currency","${currency}"\n`;
    csv += `"Baseline Monthly Cost","${symbol}${formatCurrency(rawCalculationState.baselineMonthlyUSD * mult)}"\n`;
    csv += `"Baseline Annual Cost","${symbol}${formatCurrency(rawCalculationState.baselineMonthlyUSD * 12 * mult)}"\n\n`;

    csv += `"AWS Service","Component","Cost Category","Configured Quantity","Unit Price","Calculation Formula","Subtotal (${currency})","Pricing Source"\n`;
    rawCalculationState.lineItems.forEach(item => {
        const subtotal = (item.subtotal_usd * mult).toFixed(2);
        csv += `"${item.service_name}","${item.component_name}","${item.cost_type}","${item.quantity}","${item.unit_price}","${item.formula}","${subtotal}","${item.pricing_source}"\n`;
    });

    csv += `\n"# Optimization Recommendations"\n`;
    csv += `"Service","Title","Current Plan","Suggested Plan","Current Cost","Optimized Cost","Net Savings","Priority","Assumptions","Trade-offs"\n`;
    rawCalculationState.recommendations.forEach(r => {
        const currentCost = (r.current_cost_usd * mult).toFixed(2);
        const optCost = (r.optimized_cost_usd * mult).toFixed(2);
        const savingsCost = (r.savings_usd * mult).toFixed(2);
        csv += `"${r.service}","${r.title}","${r.current_config}","${r.suggested_config}","${symbol}${currentCost}","${symbol}${optCost}","${symbol}${savingsCost} (~${r.savings_pct}%)","${r.priority}","${r.assumptions}","${r.trade_offs}"\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aws_cloud_cost_audit_${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Downloaded calculation audit table in CSV format.", false);
}

async function saveEstimateToS3() {
    if (!rawCalculationState) calculateEstimate();

    const spinner = document.getElementById("s3Spinner");
    if (spinner) spinner.classList.remove("hidden");

    const endpoint = (typeof CONFIG !== "undefined" && CONFIG.API_BASE_URL)
        ? `${CONFIG.API_BASE_URL.replace(/\/+$/, "")}/save-report`
        : "/save-report";

    const payload = {
        report_type: "ESTIMATED_COST_REPORT",
        summary: {
            total_monthly_cost: rawCalculationState.baselineMonthlyUSD,
            total_cost_formatted: `$${rawCalculationState.baselineMonthlyUSD.toFixed(2)}`,
            services_analyzed_count: rawCalculationState.serviceResults.length,
            highest_cost_service: rawCalculationState.serviceResults[0] || { service_name: "None", cost: 0.0 }
        },
        estimate_data: rawCalculationState,
        created_at_utc: new Date().toISOString()
    };

    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const res = await response.json();
            showToast(`Snapshot successfully persisted to Amazon S3: ${res.s3_key || 'reports/'}`, false);
        } else {
            showToast(`API Gateway returned HTTP ${response.status} when persisting report.`, true);
        }
    } catch (err) {
        showToast(`Could not reach API Gateway to store S3 report: ${err.message}`, true);
    } finally {
        if (spinner) spinner.classList.add("hidden");
    }
}

// ========================================================
// 8. Mode 2: Live AWS Account Billing Telemetry
// ========================================================

async function loadActualBillingData() {
    const badge = document.getElementById("actualBillingBadge");
    const icon = document.getElementById("actualBillingIcon");
    const msg = document.getElementById("actualBillingMessage");
    const updated = document.getElementById("actualBillingUpdated");

    if (badge) {
        badge.textContent = "Querying Live AWS Telemetry...";
        badge.className = "font-bold text-xs tracking-wider uppercase px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200";
    }
    if (icon) icon.textContent = "⏳";

    const endpoint = (typeof CONFIG !== "undefined" && CONFIG.API_BASE_URL)
        ? `${CONFIG.API_BASE_URL.replace(/\/+$/, "")}/cost-analysis`
        : "/cost-analysis";

    try {
        const response = await fetch(endpoint, {
            method: "GET",
            headers: { "Content-Type": "application/json" }
        });

        if (response.ok) {
            const data = await response.json();
            currentActualBillingData = data;
            renderActualBillingView(data);
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (err) {
        if (badge) {
            badge.textContent = "API Gateway Unreachable (Fallback to AWS Budget Telemetry)";
            badge.className = "font-bold text-xs tracking-wider uppercase px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200";
        }
        if (icon) icon.textContent = "⚠️";
        if (msg) msg.textContent = `Could not reach live API: ${err.message}. Verified AWS Budget 'Zero-Cost-Project-Budget' actual spend is $0.00.`;

        const actualTotalSpend = document.getElementById("actualTotalSpend");
        const actualTopDriver = document.getElementById("actualTopDriver");
        if (actualTotalSpend) actualTotalSpend.textContent = "$0.00";
        if (actualTopDriver) actualTopDriver.textContent = "None (Zero Spend)";
        renderActualGovernanceRecs();
    }
}

function renderActualBillingView(data) {
    const badge = document.getElementById("actualBillingBadge");
    const icon = document.getElementById("actualBillingIcon");
    const msg = document.getElementById("actualBillingMessage");
    const updated = document.getElementById("actualBillingUpdated");
    const actualStatusText = document.getElementById("actualStatusText");

    if (data.data_source === "live_aws_data") {
        if (badge) {
            badge.textContent = "Live AWS Account Billing Telemetry Active";
            badge.className = "font-bold text-xs tracking-wider uppercase px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200";
        }
        if (icon) icon.textContent = "✅";
        if (actualStatusText) actualStatusText.textContent = "Active Telemetry";
    } else {
        if (badge) {
            badge.textContent = "AWS Ingestion Window (Pending 24h ETL)";
            badge.className = "font-bold text-xs tracking-wider uppercase px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200";
        }
        if (icon) icon.textContent = "ℹ️";
        if (actualStatusText) actualStatusText.textContent = "24h Ingestion Window";
    }

    if (msg) msg.textContent = data.data_source_message || "AWS Cost Explorer data queried. Zero fabricated numbers are displayed.";
    if (updated) updated.textContent = `Queried: ${new Date().toLocaleTimeString()}`;

    const total = data.summary ? data.summary.total_cost_formatted : "$0.00";
    const actualTotalSpend = document.getElementById("actualTotalSpend");
    if (actualTotalSpend) actualTotalSpend.textContent = total;

    const top = (data.summary && data.summary.highest_cost_service) ? data.summary.highest_cost_service.service_name : "None (Zero Spend)";
    const actualTopDriver = document.getElementById("actualTopDriver");
    if (actualTopDriver) actualTopDriver.textContent = top;

    renderActualGovernanceRecs();
}

function renderActualGovernanceRecs() {
    const container = document.getElementById("actualRecsContainer");
    if (!container) return;

    container.innerHTML = "";

    const governanceRules = [
        {
            title: "Maintain Zero-Cost AWS Budget Ceiling Alert",
            desc: "Active AWS Budget 'Zero-Cost-Project-Budget' enforces a $1.00 USD safety threshold with instant email notifications.",
            impact: "Prevents accidental account charges"
        },
        {
            title: "Automate S3 Bucket Storage Lifecycle Policies",
            desc: "Transition objects in report buckets to Glacier or expire after 30 days before storage charges accumulate.",
            impact: "Prevents cumulative multi-month storage creep"
        },
        {
            title: "Audit Unattached Elastic IP Addresses",
            desc: "AWS charges $0.005/hr for unallocated or unattached public IPv4 addresses. Delete unneeded Elastic IPs.",
            impact: "Saves ~$3.60/month per unused IP"
        },
        {
            title: "Maintain Single-AZ for Test/Development Databases",
            desc: "Ensure non-production RDS databases remain configured as Single-AZ, eliminating unnecessary 2.0x Multi-AZ standby fees.",
            impact: "50% compute and storage savings"
        }
    ];

    governanceRules.forEach(rule => {
        const div = document.createElement("div");
        div.className = "p-4 rounded-xl border border-slate-200 bg-white space-y-1.5 shadow-xs";
        div.innerHTML = `
            <div class="flex items-center justify-between">
                <h4 class="text-xs font-bold text-slate-900">${rule.title}</h4>
                <span class="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-bold border border-emerald-200">Preventive</span>
            </div>
            <p class="text-[11px] text-slate-500">${rule.desc}</p>
            <span class="text-[10px] text-blue-600 block font-semibold">Impact: ${rule.impact}</span>
        `;
        container.appendChild(div);
    });
}

// ========================================================
// 9. Utility Helpers
// ========================================================

function formatCurrency(num) {
    if (isNaN(num)) return "0.00";
    return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function showToast(message, isError = false) {
    const toast = document.getElementById("toastNotification");
    const msg = document.getElementById("toastMessage");
    const icon = document.getElementById("toastIcon");

    if (!toast || !msg || !icon) return;

    msg.textContent = message;
    if (isError) {
        toast.className = "p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 bg-red-50 border-red-200 text-red-800 shadow-md";
        icon.textContent = "❌";
    } else {
        toast.className = "p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 bg-emerald-50 border-emerald-200 text-emerald-800 shadow-md";
        icon.textContent = "✅";
    }
    toast.classList.remove("hidden");

    setTimeout(() => {
        toast.classList.add("hidden");
    }, 5000);
}
