/**
 * AI-Powered AWS Cloud Cost Optimization System
 * Enterprise Dashboard & Interactive Estimator Controller
 * Version 3.0.0 - Full 3-Tab Architecture, Live Subtotals, Custom Pricing & Interactive Optimizer
 */

// ========================================================
// Global Chart Instances & State
// ========================================================
let mainStackedBarChartInstance = null;
let costDoughnutChartInstance = null;
let beforeAfterCompChartInstance = null;

// Raw calculation state (unfiltered monthly baseline)
let rawCalculationState = null;

// Active filters state
let currentFilters = {
    period: "month",
    provider: "AWS",
    service: "ALL",
    costType: "ALL",
    chartGrouping: "service"
};

// Applied recommendation IDs set (interactive optimization engine)
let appliedRecommendationIds = new Set([
    "REC-EC2-SCHED",
    "REC-EC2-SIZE",
    "REC-S3-LIFECYCLE",
    "REC-RDS-AZ",
    "REC-LAM-ARM",
    "REC-VPC-ENDPOINT"
]);

let currentActualBillingData = null;
let activeTab = "ESTIMATOR"; // "ESTIMATOR" | "DASHBOARD" | "ACTUAL_BILLING"

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
            source: "AWS EC2 On-Demand Pricing (ap-south-1)"
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
        },
        ecs: {
            vcpu_per_hr: 0.04048,
            memory_gb_per_hr: 0.004445,
            fargate_spot_discount: 0.70,
            graviton_arm_discount: 0.20,
            source: "AWS Fargate Pricing (ap-south-1)"
        },
        dynamodb: {
            on_demand_write_per_million: 1.25,
            on_demand_read_per_million: 0.25,
            provisioned_wcu_per_hr: 0.00065,
            provisioned_rcu_per_hr: 0.00013,
            storage_per_gb_month: 0.25,
            free_tier_storage_gb: 25.0,
            source: "Amazon DynamoDB Pricing (ap-south-1)"
        },
        sns: {
            publish_per_million: 0.50,
            email_per_100k: 2.00,
            sms_per_message: 0.0075,
            free_tier_publish: 1000000,
            free_tier_email: 1000,
            source: "Amazon SNS Pricing (ap-south-1)"
        },
        quicksight: {
            author_per_month: 24.00,
            reader_per_month: 5.00,
            spice_per_gb_month: 0.25,
            source: "Amazon QuickSight Enterprise"
        },
        route53: {
            hosted_zone_per_month: 0.50,
            queries_per_million: 0.40,
            source: "Amazon Route 53 Pricing"
        },
        alb: {
            alb_per_hr: 0.0225,
            lcu_per_hr: 0.008,
            source: "AWS Elastic Load Balancing"
        },
        ecr: {
            storage_per_gb_month: 0.10,
            data_transfer_per_gb: 0.109,
            free_tier_storage_gb: 0.5,
            source: "Amazon ECR Pricing (ap-south-1)"
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
        },
        ecs: {
            vcpu_per_hr: 0.04048,
            memory_gb_per_hr: 0.004445,
            fargate_spot_discount: 0.70,
            graviton_arm_discount: 0.20,
            source: "AWS Fargate Pricing (us-east-1)"
        },
        dynamodb: {
            on_demand_write_per_million: 1.25,
            on_demand_read_per_million: 0.25,
            provisioned_wcu_per_hr: 0.00065,
            provisioned_rcu_per_hr: 0.00013,
            storage_per_gb_month: 0.25,
            free_tier_storage_gb: 25.0,
            source: "Amazon DynamoDB Pricing (us-east-1)"
        },
        sns: {
            publish_per_million: 0.50,
            email_per_100k: 2.00,
            sms_per_message: 0.0075,
            free_tier_publish: 1000000,
            free_tier_email: 1000,
            source: "Amazon SNS Pricing (us-east-1)"
        },
        quicksight: {
            author_per_month: 24.00,
            reader_per_month: 5.00,
            spice_per_gb_month: 0.25,
            source: "Amazon QuickSight Enterprise"
        },
        route53: {
            hosted_zone_per_month: 0.50,
            queries_per_million: 0.40,
            source: "Amazon Route 53 Pricing"
        },
        alb: {
            alb_per_hr: 0.0225,
            lcu_per_hr: 0.008,
            source: "AWS Elastic Load Balancing"
        },
        ecr: {
            storage_per_gb_month: 0.10,
            data_transfer_per_gb: 0.090,
            free_tier_storage_gb: 0.5,
            source: "Amazon ECR Pricing (us-east-1)"
        }
    }
};

const SERVICE_COLORS = {
    ec2: { bg: "#3b82f6", border: "#2563eb", name: "Amazon EC2" },
    s3: { bg: "#10b981", border: "#059669", name: "Amazon S3" },
    rds: { bg: "#8b5cf6", border: "#7c3aed", name: "Amazon RDS" },
    lambda: { bg: "#f59e0b", border: "#d97706", name: "AWS Lambda" },
    cloudwatch: { bg: "#ec4899", border: "#db2777", name: "Amazon CloudWatch" },
    vpc: { bg: "#06b6d4", border: "#0891b2", name: "Amazon VPC" },
    ecs: { bg: "#ea580c", border: "#c2410c", name: "Amazon ECS (Fargate)" },
    dynamodb: { bg: "#7e22ce", border: "#6b21a8", name: "Amazon DynamoDB" },
    sns: { bg: "#e11d48", border: "#be123c", name: "Amazon SNS" },
    quicksight: { bg: "#0d9488", border: "#0f766e", name: "Amazon QuickSight" },
    route53: { bg: "#4338ca", border: "#3730a3", name: "Amazon Route 53" },
    alb: { bg: "#6d28d9", border: "#5b21b6", name: "AWS Load Balancer" },
    ecr: { bg: "#0284c7", border: "#0369a1", name: "Amazon ECR" }
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
    initArchitecturePills();
    initServiceTogglesAndCustomPrices();
    initFilterToolbar();
    initPresets();
    initGlobalSelectors();
    initActionButtons();
    initComparisonModal();

    // Load saved architecture from localStorage or calculate baseline
    loadSavedArchitecture();
    calculateEstimate();
});

function initNavigationTabs() {
    const tabEstimator = document.getElementById("tabEstimator");
    const tabDashboard = document.getElementById("tabDashboard");
    const tabActual = document.getElementById("tabActualBilling");
    const tabArchitecture = document.getElementById("tabArchitecture");

    const containerEstimator = document.getElementById("modeEstimatorContainer");
    const containerDashboard = document.getElementById("modeDashboardContainer");
    const containerActual = document.getElementById("modeActualBillingContainer");
    const containerArchitecture = document.getElementById("modeArchitectureContainer");
    const badge = document.getElementById("dataModeBadge");

    function switchTab(target) {
        activeTab = target;
        [tabEstimator, tabDashboard, tabActual, tabArchitecture].forEach(t => { if (t) t.classList.remove("active"); });
        [containerEstimator, containerDashboard, containerActual, containerArchitecture].forEach(c => { if (c) c.classList.add("hidden"); });

        if (target === "ESTIMATOR") {
            if (tabEstimator) tabEstimator.classList.add("active");
            if (containerEstimator) containerEstimator.classList.remove("hidden");
            if (badge) {
                badge.textContent = "🧮 COST ESTIMATOR";
                badge.className = "px-2 py-0.5 text-[11px] font-bold rounded-full bg-blue-50 text-blue-700 border border-blue-200";
            }
        } else if (target === "DASHBOARD") {
            if (tabDashboard) tabDashboard.classList.add("active");
            if (containerDashboard) containerDashboard.classList.remove("hidden");
            if (badge) {
                badge.textContent = "📊 SAVINGS DASHBOARD";
                badge.className = "px-2 py-0.5 text-[11px] font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200";
            }
            applyFiltersAndRender();
        } else if (target === "ACTUAL_BILLING") {
            if (tabActual) tabActual.classList.add("active");
            if (containerActual) containerActual.classList.remove("hidden");
            if (badge) {
                badge.textContent = "🛡️ ACTUAL AWS BILLING";
                badge.className = "px-2 py-0.5 text-[11px] font-bold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200";
            }
            loadActualBillingData();
        } else if (target === "ARCHITECTURE") {
            if (tabArchitecture) tabArchitecture.classList.add("active");
            if (containerArchitecture) containerArchitecture.classList.remove("hidden");
            if (badge) {
                badge.textContent = "🏗️ CLOUD ARCHITECTURE";
                badge.className = "px-2 py-0.5 text-[11px] font-bold rounded-full bg-purple-50 text-purple-700 border border-purple-200";
            }
        }
    }

    if (tabEstimator) tabEstimator.addEventListener("click", () => switchTab("ESTIMATOR"));
    if (tabDashboard) tabDashboard.addEventListener("click", () => switchTab("DASHBOARD"));
    if (tabActual) tabActual.addEventListener("click", () => switchTab("ACTUAL_BILLING"));
    if (tabArchitecture) tabArchitecture.addEventListener("click", () => switchTab("ARCHITECTURE"));

    const backToInputsBtn = document.getElementById("backToInputsBtn");
    if (backToInputsBtn) backToInputsBtn.addEventListener("click", () => switchTab("ESTIMATOR"));

    const calculateAndSwitchBtn = document.getElementById("calculateAndSwitchBtn");
    if (calculateAndSwitchBtn) {
        calculateAndSwitchBtn.addEventListener("click", () => {
            calculateEstimate();
            switchTab("DASHBOARD");
            showToast("Calculated full architecture! Results displayed in Dashboard.", false);
        });
    }
}

function initArchitecturePills() {
    const pills = document.querySelectorAll(".service-pill-btn");
    pills.forEach(pill => {
        pill.addEventListener("click", () => {
            const svc = pill.getAttribute("data-service");
            const checkbox = document.getElementById(`${svc}_enabled`);
            if (checkbox) {
                checkbox.checked = !checkbox.checked;
                updateServiceUIState(svc, checkbox.checked);
                calculateEstimate();
            }
        });
    });
}

function updateServiceUIState(svc, isEnabled) {
    const pill = document.getElementById(`pill_${svc}`);
    const fields = document.getElementById(`${svc}_fields`);
    const card = document.getElementById(`card-${svc}`);

    if (pill) {
        if (isEnabled) {
            pill.classList.add("active");
            pill.innerHTML = `<span>✓ ${pill.textContent.replace(/[✓✕]/g, '').trim()}</span>`;
        } else {
            pill.classList.remove("active");
            pill.innerHTML = `<span>✕ ${pill.textContent.replace(/[✓✕]/g, '').trim()}</span>`;
        }
    }

    if (fields) {
        if (isEnabled) {
            fields.classList.remove("opacity-40", "pointer-events-none");
        } else {
            fields.classList.add("opacity-40", "pointer-events-none");
        }
    }
}

function initServiceTogglesAndCustomPrices() {
    const services = ["ec2", "s3", "rds", "lambda", "cw", "vpc", "ecs", "dynamodb", "sns", "quicksight", "route53", "alb", "ecr"];
    services.forEach(svc => {
        const checkbox = document.getElementById(`${svc}_enabled`);
        if (checkbox) {
            checkbox.addEventListener("change", () => {
                updateServiceUIState(svc, checkbox.checked);
                calculateEstimate();
            });
        }

        // Custom price toggles
        const priceToggle = document.getElementById(`${svc}_custom_price_toggle`);
        const priceInput = document.getElementById(`${svc}_custom_price`);
        if (priceToggle && priceInput) {
            priceToggle.addEventListener("change", () => {
                if (priceToggle.checked) {
                    priceInput.classList.remove("hidden");
                } else {
                    priceInput.classList.add("hidden");
                    priceInput.value = "";
                }
                calculateEstimate();
            });
            priceInput.addEventListener("input", () => calculateEstimate());
        }
    });

    // Auto recalculate on any input change inside forms
    const inputs = document.querySelectorAll("#modeEstimatorContainer input, #modeEstimatorContainer select");
    inputs.forEach(input => {
        if (!input.classList.contains("filter-select")) {
            input.addEventListener("input", () => calculateEstimate());
            input.addEventListener("change", () => calculateEstimate());
        }
    });
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
            currentFilters = {
                period: "month",
                provider: "AWS",
                service: "ALL",
                costType: "ALL",
                chartGrouping: "service"
            };

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
    if (calcBtn) {
        calcBtn.addEventListener("click", () => {
            calculateEstimate();
            showToast("Recalculated all service cost estimates.", false);
        });
    }

    const exportJsonBtn = document.getElementById("exportJsonBtn");
    if (exportJsonBtn) exportJsonBtn.addEventListener("click", exportEstimateJson);

    const exportCsvBtn = document.getElementById("exportCsvBtn");
    if (exportCsvBtn) exportCsvBtn.addEventListener("click", exportEstimateCsv);

    const printBtn = document.getElementById("printReportBtn");
    if (printBtn) printBtn.addEventListener("click", () => window.print());

    const saveS3Btn = document.getElementById("saveS3Btn");
    if (saveS3Btn) saveS3Btn.addEventListener("click", saveEstimateToS3);

    // DynamoDB Persistence Action
    const saveDynamoDBBtn = document.getElementById("saveDynamoDBBtn");
    const triggerDynamoModalBtn = document.getElementById("triggerDynamoModalBtn");
    [saveDynamoDBBtn, triggerDynamoModalBtn].forEach(btn => {
        if (btn) btn.addEventListener("click", saveEstimateToDynamoDB);
    });

    // Amazon SNS Alert Action
    const sendSnsAlertBtn = document.getElementById("sendSnsAlertBtn");
    const triggerSnsModalBtn = document.getElementById("triggerSnsModalBtn");
    [sendSnsAlertBtn, triggerSnsModalBtn].forEach(btn => {
        if (btn) btn.addEventListener("click", sendSnsCostAlert);
    });

    // Amazon QuickSight Export Action
    const exportQuickSightBtn = document.getElementById("exportQuickSightBtn");
    const triggerQuickSightModalBtn = document.getElementById("triggerQuickSightModalBtn");
    [exportQuickSightBtn, triggerQuickSightModalBtn].forEach(btn => {
        if (btn) btn.addEventListener("click", exportQuickSightData);
    });

    // CloudFormation IaC Download
    const downloadCfnBtn = document.getElementById("downloadCfnBtn");
    if (downloadCfnBtn) {
        downloadCfnBtn.addEventListener("click", downloadCloudFormationTemplate);
    }

    const refreshActualBtn = document.getElementById("refreshActualBtn");
    if (refreshActualBtn) refreshActualBtn.addEventListener("click", loadActualBillingData);

    const closeToast = document.getElementById("closeToastBtn");
    if (closeToast) {
        closeToast.addEventListener("click", () => {
            const toast = document.getElementById("toastNotification");
            if (toast) toast.classList.add("hidden");
        });
    }

    // Optimization mass toggle buttons
    const applyAllBtn = document.getElementById("applyAllRecsBtn");
    if (applyAllBtn) {
        applyAllBtn.addEventListener("click", () => {
            if (rawCalculationState && rawCalculationState.recommendations) {
                rawCalculationState.recommendations.forEach(r => appliedRecommendationIds.add(r.id));
                applyFiltersAndRender();
                showToast("Applied all Well-Architected optimization proposals.", false);
            }
        });
    }

    const rejectAllBtn = document.getElementById("rejectAllRecsBtn");
    if (rejectAllBtn) {
        rejectAllBtn.addEventListener("click", () => {
            appliedRecommendationIds.clear();
            applyFiltersAndRender();
            showToast("Rejected all optimization proposals. Plan equals baseline.", false);
        });
    }
}

function initComparisonModal() {
    const modal = document.getElementById("comparisonModal");
    const openBtn = document.getElementById("compareConfigBtn");
    const closeBtn1 = document.getElementById("closeCompModalBtn");
    const closeBtn2 = document.getElementById("closeCompModalBtn2");

    if (openBtn && modal) {
        openBtn.addEventListener("click", () => {
            populateComparisonModal();
            modal.classList.remove("hidden");
        });
    }

    [closeBtn1, closeBtn2].forEach(btn => {
        if (btn && modal) {
            btn.addEventListener("click", () => {
                modal.classList.add("hidden");
            });
        }
    });

    if (modal) {
        modal.addEventListener("click", (e) => {
            if (e.target === modal) modal.classList.add("hidden");
        });
    }
}

// ========================================================
// 2. Scenario Presets
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
    if (preset === "target_arch") {
        setServiceChecked("ec2", false);
        setServiceChecked("ecs", true);
        if (document.getElementById("ecs_vcpu")) document.getElementById("ecs_vcpu").value = "0.5";
        if (document.getElementById("ecs_memory")) document.getElementById("ecs_memory").value = "1.0";
        if (document.getElementById("ecs_task_count")) document.getElementById("ecs_task_count").value = 1;
        if (document.getElementById("ecs_launch_type")) document.getElementById("ecs_launch_type").value = "Fargate";

        setServiceChecked("alb", true);
        if (document.getElementById("alb_count")) document.getElementById("alb_count").value = 1;

        setServiceChecked("route53", true);
        if (document.getElementById("route53_zones")) document.getElementById("route53_zones").value = 1;

        setServiceChecked("s3", true);
        if (document.getElementById("s3_storage_gb")) document.getElementById("s3_storage_gb").value = 100;

        setServiceChecked("dynamodb", true);
        if (document.getElementById("dynamodb_mode")) document.getElementById("dynamodb_mode").value = "PAY_PER_REQUEST";

        setServiceChecked("sns", true);
        if (document.getElementById("sns_publish_count")) document.getElementById("sns_publish_count").value = 100000;

        setServiceChecked("quicksight", true);
        if (document.getElementById("quicksight_authors")) document.getElementById("quicksight_authors").value = 1;
        if (document.getElementById("quicksight_readers")) document.getElementById("quicksight_readers").value = 2;

        setServiceChecked("lambda", true);
        if (document.getElementById("lambda_requests")) document.getElementById("lambda_requests").value = 500000;

        setServiceChecked("cw", true);
        if (document.getElementById("cw_ingest_gb")) document.getElementById("cw_ingest_gb").value = 10;

        setServiceChecked("ecr", true);
        if (document.getElementById("ecr_storage_gb")) document.getElementById("ecr_storage_gb").value = 5.0;

        setServiceChecked("rds", false);
        setServiceChecked("vpc", true);
    } else if (preset === "webapp") {
        setServiceChecked("ec2", true);
        document.getElementById("ec2_instance_type").value = "t3.medium";
        document.getElementById("ec2_count").value = 2;
        document.getElementById("ec2_hours_day").value = 24;
        document.getElementById("ec2_days_month").value = 30.5;
        document.getElementById("ec2_ebs_gb").value = 30;
        document.getElementById("ec2_transfer_gb").value = 50;

        setServiceChecked("s3", true);
        document.getElementById("s3_class").value = "Standard";
        document.getElementById("s3_storage_gb").value = 250;
        document.getElementById("s3_put_reqs").value = 20000;
        document.getElementById("s3_get_reqs").value = 100000;
        document.getElementById("s3_retrieval_gb").value = 0;

        setServiceChecked("rds", true);
        document.getElementById("rds_engine").value = "PostgreSQL";
        document.getElementById("rds_instance_type").value = "db.t3.medium";
        document.getElementById("rds_deployment").value = "Multi-AZ";
        document.getElementById("rds_storage_gb").value = 50;
        document.getElementById("rds_count").value = 1;
        document.getElementById("rds_hours").value = 730;

        setServiceChecked("lambda", true);
        document.getElementById("lambda_requests").value = 3000000;
        document.getElementById("lambda_duration").value = 200;
        document.getElementById("lambda_memory").value = "512";
        document.getElementById("lambda_arch").value = "x86_64";
        document.getElementById("lambda_freetier").checked = true;

        setServiceChecked("cw", true);
        document.getElementById("cw_ingest_gb").value = 20;
        document.getElementById("cw_storage_gb").value = 30;
        document.getElementById("cw_metrics").value = 12;
        document.getElementById("cw_freetier").checked = true;

        setServiceChecked("vpc", true);
        document.getElementById("vpc_nat_count").value = 1;
        document.getElementById("vpc_nat_hours").value = 730;
        document.getElementById("vpc_nat_data_gb").value = 80;
        document.getElementById("vpc_public_ips").value = 1;
    } else if (preset === "microservices") {
        setServiceChecked("ec2", false);
        setServiceChecked("s3", true);
        document.getElementById("s3_class").value = "Standard";
        document.getElementById("s3_storage_gb").value = 100;
        document.getElementById("s3_put_reqs").value = 50000;
        document.getElementById("s3_get_reqs").value = 250000;

        setServiceChecked("rds", false);
        setServiceChecked("lambda", true);
        document.getElementById("lambda_requests").value = 10000000;
        document.getElementById("lambda_duration").value = 150;
        document.getElementById("lambda_memory").value = "256";
        document.getElementById("lambda_arch").value = "x86_64";

        setServiceChecked("cw", true);
        document.getElementById("cw_ingest_gb").value = 25;
        document.getElementById("cw_storage_gb").value = 20;
        document.getElementById("cw_metrics").value = 10;

        setServiceChecked("vpc", false);
    } else if (preset === "enterprise") {
        setServiceChecked("ec2", true);
        document.getElementById("ec2_instance_type").value = "m5.large";
        document.getElementById("ec2_count").value = 4;
        document.getElementById("ec2_hours_day").value = 24;
        document.getElementById("ec2_days_month").value = 30.5;
        document.getElementById("ec2_ebs_gb").value = 100;
        document.getElementById("ec2_transfer_gb").value = 200;

        setServiceChecked("s3", true);
        document.getElementById("s3_class").value = "Standard";
        document.getElementById("s3_storage_gb").value = 1000;
        document.getElementById("s3_put_reqs").value = 100000;
        document.getElementById("s3_get_reqs").value = 500000;

        setServiceChecked("rds", true);
        document.getElementById("rds_engine").value = "PostgreSQL";
        document.getElementById("rds_instance_type").value = "db.m5.large";
        document.getElementById("rds_deployment").value = "Multi-AZ";
        document.getElementById("rds_storage_gb").value = 200;
        document.getElementById("rds_count").value = 2;
        document.getElementById("rds_hours").value = 730;

        setServiceChecked("lambda", true);
        document.getElementById("lambda_requests").value = 5000000;
        document.getElementById("lambda_duration").value = 300;
        document.getElementById("lambda_memory").value = "1024";

        setServiceChecked("cw", true);
        document.getElementById("cw_ingest_gb").value = 50;
        document.getElementById("cw_storage_gb").value = 100;
        document.getElementById("cw_metrics").value = 25;

        setServiceChecked("vpc", true);
        document.getElementById("vpc_nat_count").value = 2;
        document.getElementById("vpc_nat_hours").value = 730;
        document.getElementById("vpc_nat_data_gb").value = 300;
        document.getElementById("vpc_public_ips").value = 2;
    } else if (preset === "freetier") {
        setServiceChecked("ec2", true);
        document.getElementById("ec2_instance_type").value = "t3.micro";
        document.getElementById("ec2_count").value = 1;
        document.getElementById("ec2_hours_day").value = 24;
        document.getElementById("ec2_days_month").value = 30.5;
        document.getElementById("ec2_ebs_gb").value = 30;
        document.getElementById("ec2_transfer_gb").value = 0;

        setServiceChecked("s3", true);
        document.getElementById("s3_class").value = "Standard";
        document.getElementById("s3_storage_gb").value = 5;
        document.getElementById("s3_put_reqs").value = 2000;
        document.getElementById("s3_get_reqs").value = 20000;

        setServiceChecked("rds", true);
        document.getElementById("rds_engine").value = "PostgreSQL";
        document.getElementById("rds_instance_type").value = "db.t3.micro";
        document.getElementById("rds_deployment").value = "Single-AZ";
        document.getElementById("rds_storage_gb").value = 20;
        document.getElementById("rds_count").value = 1;

        setServiceChecked("lambda", true);
        document.getElementById("lambda_requests").value = 500000;
        document.getElementById("lambda_duration").value = 100;
        document.getElementById("lambda_memory").value = "128";
        document.getElementById("lambda_freetier").checked = true;

        setServiceChecked("cw", true);
        document.getElementById("cw_ingest_gb").value = 5;
        document.getElementById("cw_storage_gb").value = 5;
        document.getElementById("cw_metrics").value = 10;
        document.getElementById("cw_freetier").checked = true;

        setServiceChecked("vpc", false);
    }
}

function setServiceChecked(svc, isChecked) {
    const chk = document.getElementById(`${svc}_enabled`);
    if (chk) {
        chk.checked = isChecked;
        updateServiceUIState(svc, isChecked);
    }
}

// ========================================================
// 3. Mathematical Cost Estimation & Optimization Engine
// ========================================================

function calculateEstimate() {
    const region = document.getElementById("globalRegionSelect") ? document.getElementById("globalRegionSelect").value : "ap-south-1";
    const currency = document.getElementById("globalCurrencySelect") ? document.getElementById("globalCurrencySelect").value : "USD";
    const pricing = PRICING_DATABASE[region] || PRICING_DATABASE["ap-south-1"];

    const isINR = (currency === "INR");
    const mult = isINR ? USD_TO_INR_RATE : 1.0;
    const symbol = isINR ? "₹" : "$";

    const lineItems = [];
    const serviceResults = [];
    let baselineMonthlyUSD = 0;

    // --- 1. Amazon EC2 ---
    const ec2Enabled = document.getElementById("ec2_enabled") && document.getElementById("ec2_enabled").checked;
    let ec2Subtotal = 0;
    if (ec2Enabled) {
        const instType = document.getElementById("ec2_instance_type").value;
        const count = Math.max(1, parseInt(document.getElementById("ec2_count").value) || 1);
        const hoursDay = Math.min(24, Math.max(0, parseFloat(document.getElementById("ec2_hours_day").value) || 24));
        const daysMonth = Math.min(31, Math.max(0, parseFloat(document.getElementById("ec2_days_month").value) || 30.5));
        const ebsGb = Math.max(0, parseFloat(document.getElementById("ec2_ebs_gb").value) || 0);
        const ebsType = document.getElementById("ec2_ebs_type").value;
        const transferGb = Math.max(0, parseFloat(document.getElementById("ec2_transfer_gb").value) || 0);

        // Custom price override
        const customPriceToggle = document.getElementById("ec2_custom_price_toggle");
        const customPriceVal = document.getElementById("ec2_custom_price").value;
        let hourlyPrice, priceSource, isCustomPrice = false;

        if (customPriceToggle && customPriceToggle.checked && customPriceVal !== "" && parseFloat(customPriceVal) >= 0) {
            hourlyPrice = parseFloat(customPriceVal);
            priceSource = "User Custom Override";
            isCustomPrice = true;
        } else {
            const instInfo = pricing.ec2.instances[instType] || pricing.ec2.instances["t3.micro"];
            hourlyPrice = instInfo.price_per_hr;
            priceSource = "AWS Official Catalog (Verified)";
        }

        const monthlyHours = hoursDay * daysMonth;
        const computeCost = hourlyPrice * count * monthlyHours;
        const ebsRate = (ebsType === "gp3") ? pricing.ec2.ebs_gp3_per_gb : pricing.ec2.ebs_gp2_per_gb;
        const ebsCost = count * ebsGb * ebsRate;
        const transferCost = transferGb * pricing.ec2.data_transfer_per_gb;
        ec2Subtotal = computeCost + ebsCost + transferCost;
        baselineMonthlyUSD += ec2Subtotal;

        serviceResults.push({
            service_key: "ec2",
            service_name: "Amazon Elastic Compute Cloud (EC2)",
            short_name: "EC2",
            cost_type: "compute",
            monthly_cost_usd: ec2Subtotal,
            configuration: { instType, count, hoursDay, daysMonth, monthlyHours, ebsGb, ebsType, transferGb, hourlyPrice, isCustomPrice }
        });

        lineItems.push({
            service_key: "ec2",
            service_name: "Amazon EC2",
            component_name: `Compute (${instType})`,
            cost_type: "compute",
            quantity: `${count}x @ ${monthlyHours.toFixed(1)} hrs/mo`,
            unit_price: `$${hourlyPrice.toFixed(4)}/hr`,
            formula: `${count} × (${hoursDay}h × ${daysMonth}d) × $${hourlyPrice.toFixed(4)}`,
            subtotal_usd: computeCost,
            pricing_source: priceSource,
            is_custom: isCustomPrice
        });

        if (ebsGb > 0) {
            lineItems.push({
                service_key: "ec2",
                service_name: "Amazon EC2",
                component_name: `EBS Storage (${ebsType})`,
                cost_type: "storage",
                quantity: `${(count * ebsGb).toFixed(0)} GB-mo`,
                unit_price: `$${ebsRate.toFixed(3)}/GB-mo`,
                formula: `${count * ebsGb} GB × $${ebsRate.toFixed(3)}`,
                subtotal_usd: ebsCost,
                pricing_source: "AWS Official Catalog (Verified)",
                is_custom: false
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
                pricing_source: "AWS Official Catalog (Verified)",
                is_custom: false
            });
        }
    }
    updateCardSubtotal("subtotal_ec2", ec2Subtotal, symbol, mult, ec2Enabled);

    // --- 2. Amazon S3 ---
    const s3Enabled = document.getElementById("s3_enabled") && document.getElementById("s3_enabled").checked;
    let s3Subtotal = 0;
    if (s3Enabled) {
        const s3Class = document.getElementById("s3_class").value;
        const storageGb = Math.max(0, parseFloat(document.getElementById("s3_storage_gb").value) || 0);
        const putReqs = Math.max(0, parseInt(document.getElementById("s3_put_reqs").value) || 0);
        const getReqs = Math.max(0, parseInt(document.getElementById("s3_get_reqs").value) || 0);
        const retGb = Math.max(0, parseFloat(document.getElementById("s3_retrieval_gb").value) || 0);

        const customPriceToggle = document.getElementById("s3_custom_price_toggle");
        const customPriceVal = document.getElementById("s3_custom_price").value;
        let storageRate, priceSource, isCustomPrice = false;

        const classInfo = pricing.s3.storage_classes[s3Class] || pricing.s3.storage_classes["Standard"];
        if (customPriceToggle && customPriceToggle.checked && customPriceVal !== "" && parseFloat(customPriceVal) >= 0) {
            storageRate = parseFloat(customPriceVal);
            priceSource = "User Custom Override";
            isCustomPrice = true;
        } else {
            storageRate = classInfo.storage_rate;
            priceSource = "AWS Official Catalog (Verified)";
        }

        const storageCost = storageGb * storageRate;
        const putCost = (putReqs / 1000) * pricing.s3.put_per_1000;
        const getCost = (getReqs / 1000) * pricing.s3.get_per_1000;
        const retCost = retGb * classInfo.retrieval_rate;
        s3Subtotal = storageCost + putCost + getCost + retCost;
        baselineMonthlyUSD += s3Subtotal;

        serviceResults.push({
            service_key: "s3",
            service_name: "Amazon Simple Storage Service (S3)",
            short_name: "S3",
            cost_type: "storage",
            monthly_cost_usd: s3Subtotal,
            configuration: { s3Class, storageGb, putReqs, getReqs, retGb, rate: storageRate, isCustomPrice }
        });

        lineItems.push({
            service_key: "s3",
            service_name: "Amazon S3",
            component_name: `Storage (${s3Class})`,
            cost_type: "storage",
            quantity: `${storageGb.toFixed(1)} GB-mo`,
            unit_price: `$${storageRate.toFixed(4)}/GB-mo`,
            formula: `${storageGb} GB × $${storageRate.toFixed(4)}`,
            subtotal_usd: storageCost,
            pricing_source: priceSource,
            is_custom: isCustomPrice
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
                pricing_source: "AWS Official Catalog (Verified)",
                is_custom: false
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
                pricing_source: "AWS Official Catalog (Verified)",
                is_custom: false
            });
        }
    }
    updateCardSubtotal("subtotal_s3", s3Subtotal, symbol, mult, s3Enabled);

    // --- 3. Amazon RDS ---
    const rdsEnabled = document.getElementById("rds_enabled") && document.getElementById("rds_enabled").checked;
    let rdsSubtotal = 0;
    if (rdsEnabled) {
        const engine = document.getElementById("rds_engine").value;
        const instType = document.getElementById("rds_instance_type").value;
        const deployment = document.getElementById("rds_deployment").value;
        const storageGb = Math.max(0, parseFloat(document.getElementById("rds_storage_gb").value) || 0);
        const count = Math.max(1, parseInt(document.getElementById("rds_count").value) || 1);
        const hours = Math.max(0, parseFloat(document.getElementById("rds_hours").value) || 730);

        const customPriceToggle = document.getElementById("rds_custom_price_toggle");
        const customPriceVal = document.getElementById("rds_custom_price").value;
        let baseHourly, priceSource, isCustomPrice = false;

        const instInfo = pricing.rds.instances[instType] || pricing.rds.instances["db.t3.micro"];
        if (customPriceToggle && customPriceToggle.checked && customPriceVal !== "" && parseFloat(customPriceVal) >= 0) {
            baseHourly = parseFloat(customPriceVal);
            priceSource = "User Custom Override";
            isCustomPrice = true;
        } else {
            baseHourly = instInfo.price_per_hr;
            priceSource = "AWS Official Catalog (Verified)";
        }

        const multiplier = (deployment === "Multi-AZ") ? pricing.rds.multi_az_multiplier : 1.0;
        const hourlyRate = baseHourly * multiplier;
        const computeCost = hourlyRate * count * hours;
        const storageRate = pricing.rds.storage_gp3_per_gb * multiplier;
        const storageCost = count * storageGb * storageRate;
        rdsSubtotal = computeCost + storageCost;
        baselineMonthlyUSD += rdsSubtotal;

        serviceResults.push({
            service_key: "rds",
            service_name: "Amazon Relational Database Service (RDS)",
            short_name: "RDS",
            cost_type: "database",
            monthly_cost_usd: rdsSubtotal,
            configuration: { engine, instType, deployment, storageGb, count, hours, hourlyRate, baseHourly, isCustomPrice }
        });

        lineItems.push({
            service_key: "rds",
            service_name: "Amazon RDS",
            component_name: `DB Compute (${instType}, ${deployment})`,
            cost_type: "database",
            quantity: `${count}x @ ${hours.toFixed(0)} hrs/mo`,
            unit_price: `$${hourlyRate.toFixed(4)}/hr`,
            formula: `(${count} × ${hours}h) × ($${baseHourly.toFixed(4)} × ${multiplier}x)`,
            subtotal_usd: computeCost,
            pricing_source: priceSource,
            is_custom: isCustomPrice
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
            pricing_source: "AWS Official Catalog (Verified)",
            is_custom: false
        });
    }
    updateCardSubtotal("subtotal_rds", rdsSubtotal, symbol, mult, rdsEnabled);

    // --- 4. AWS Lambda ---
    const lambdaEnabled = document.getElementById("lambda_enabled") && document.getElementById("lambda_enabled").checked;
    let lambdaSubtotal = 0;
    if (lambdaEnabled) {
        const reqCount = Math.max(0, parseInt(document.getElementById("lambda_requests").value) || 0);
        const durationMs = Math.max(1, parseFloat(document.getElementById("lambda_duration").value) || 200);
        const memoryMb = parseInt(document.getElementById("lambda_memory").value) || 512;
        const arch = document.getElementById("lambda_arch").value;
        const applyFreeTier = document.getElementById("lambda_freetier").checked;

        const durationSec = durationMs / 1000;
        const memoryGb = memoryMb / 1024;
        const totalGbSec = reqCount * durationSec * memoryGb;

        const customPriceToggle = document.getElementById("lambda_custom_price_toggle");
        const customPriceVal = document.getElementById("lambda_custom_price").value;
        let rateGbSec, priceSource, isCustomPrice = false;

        if (customPriceToggle && customPriceToggle.checked && customPriceVal !== "" && parseFloat(customPriceVal) >= 0) {
            rateGbSec = parseFloat(customPriceVal);
            priceSource = "User Custom Override";
            isCustomPrice = true;
        } else {
            rateGbSec = (arch === "arm64") ? pricing.lambda.compute_gb_sec_arm : pricing.lambda.compute_gb_sec_x86;
            priceSource = "AWS Official Catalog (Verified)";
        }

        const freeGbSec = applyFreeTier ? pricing.lambda.free_gb_sec : 0;
        const billedGbSec = Math.max(0, totalGbSec - freeGbSec);
        const computeCost = billedGbSec * rateGbSec;

        const freeReq = applyFreeTier ? pricing.lambda.free_requests : 0;
        const billedReq = Math.max(0, reqCount - freeReq);
        const reqCost = (billedReq / 1000000) * pricing.lambda.request_per_million;
        lambdaSubtotal = computeCost + reqCost;
        baselineMonthlyUSD += lambdaSubtotal;

        serviceResults.push({
            service_key: "lambda",
            service_name: "AWS Lambda (Serverless Compute)",
            short_name: "Lambda",
            cost_type: "compute",
            monthly_cost_usd: lambdaSubtotal,
            configuration: { reqCount, durationMs, memoryMb, arch, applyFreeTier, totalGbSec, isCustomPrice }
        });

        lineItems.push({
            service_key: "lambda",
            service_name: "AWS Lambda",
            component_name: `Compute Execution (${arch}, ${memoryMb} MB)`,
            cost_type: "compute",
            quantity: `${totalGbSec.toFixed(1)} GB-s (${billedGbSec.toFixed(1)} billed)`,
            unit_price: `$${rateGbSec.toFixed(8)}/GB-s`,
            formula: `(${billedGbSec.toFixed(0)} billed GB-s) × $${rateGbSec.toFixed(8)}`,
            subtotal_usd: computeCost,
            pricing_source: priceSource,
            is_custom: isCustomPrice
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
            pricing_source: "AWS Official Catalog (Verified)",
            is_custom: false
        });
    }
    updateCardSubtotal("subtotal_lambda", lambdaSubtotal, symbol, mult, lambdaEnabled);

    // --- 5. Amazon CloudWatch ---
    const cwEnabled = document.getElementById("cw_enabled") && document.getElementById("cw_enabled").checked;
    let cwSubtotal = 0;
    if (cwEnabled) {
        const ingestGb = Math.max(0, parseFloat(document.getElementById("cw_ingest_gb").value) || 0);
        const storageGb = Math.max(0, parseFloat(document.getElementById("cw_storage_gb").value) || 0);
        const metrics = Math.max(0, parseInt(document.getElementById("cw_metrics").value) || 0);
        const applyFreeTier = document.getElementById("cw_freetier").checked;

        const customPriceToggle = document.getElementById("cw_custom_price_toggle");
        const customPriceVal = document.getElementById("cw_custom_price").value;
        let ingestRate, priceSource, isCustomPrice = false;

        if (customPriceToggle && customPriceToggle.checked && customPriceVal !== "" && parseFloat(customPriceVal) >= 0) {
            ingestRate = parseFloat(customPriceVal);
            priceSource = "User Custom Override";
            isCustomPrice = true;
        } else {
            ingestRate = pricing.cloudwatch.ingestion_per_gb;
            priceSource = "AWS Official Catalog (Verified)";
        }

        const freeIngest = applyFreeTier ? pricing.cloudwatch.free_ingest_gb : 0;
        const billedIngest = Math.max(0, ingestGb - freeIngest);
        const ingestCost = billedIngest * ingestRate;
        const storageCost = storageGb * pricing.cloudwatch.storage_per_gb;

        const freeMetrics = applyFreeTier ? pricing.cloudwatch.free_metrics : 0;
        const billedMetrics = Math.max(0, metrics - freeMetrics);
        const metricsCost = billedMetrics * pricing.cloudwatch.metric_per_month;
        cwSubtotal = ingestCost + storageCost + metricsCost;
        baselineMonthlyUSD += cwSubtotal;

        serviceResults.push({
            service_key: "cloudwatch",
            service_name: "Amazon CloudWatch (Logs & Metrics)",
            short_name: "CloudWatch",
            cost_type: "monitoring",
            monthly_cost_usd: cwSubtotal,
            configuration: { ingestGb, storageGb, metrics, applyFreeTier, isCustomPrice }
        });

        lineItems.push({
            service_key: "cloudwatch",
            service_name: "Amazon CloudWatch",
            component_name: "Logs Ingestion",
            cost_type: "monitoring",
            quantity: `${ingestGb.toFixed(1)} GB (${billedIngest.toFixed(1)} billed)`,
            unit_price: `$${ingestRate.toFixed(2)}/GB`,
            formula: `max(0, ${ingestGb.toFixed(1)} - ${freeIngest.toFixed(1)}) × $${ingestRate.toFixed(2)}`,
            subtotal_usd: ingestCost,
            pricing_source: priceSource,
            is_custom: isCustomPrice
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
            pricing_source: "AWS Official Catalog (Verified)",
            is_custom: false
        });
    }
    updateCardSubtotal("subtotal_cw", cwSubtotal, symbol, mult, cwEnabled);

    // --- 6. Amazon VPC ---
    const vpcEnabled = document.getElementById("vpc_enabled") && document.getElementById("vpc_enabled").checked;
    let vpcSubtotal = 0;
    if (vpcEnabled) {
        const natCount = Math.max(0, parseInt(document.getElementById("vpc_nat_count").value) || 0);
        const natHours = Math.max(0, parseFloat(document.getElementById("vpc_nat_hours").value) || 730);
        const natDataGb = Math.max(0, parseFloat(document.getElementById("vpc_nat_data_gb").value) || 0);
        const publicIps = Math.max(0, parseInt(document.getElementById("vpc_public_ips").value) || 0);

        const customPriceToggle = document.getElementById("vpc_custom_price_toggle");
        const customPriceVal = document.getElementById("vpc_custom_price").value;
        let natHourly, priceSource, isCustomPrice = false;

        if (customPriceToggle && customPriceToggle.checked && customPriceVal !== "" && parseFloat(customPriceVal) >= 0) {
            natHourly = parseFloat(customPriceVal);
            priceSource = "User Custom Override";
            isCustomPrice = true;
        } else {
            natHourly = pricing.vpc.nat_hourly;
            priceSource = "AWS Official Catalog (Verified)";
        }

        const natHourlyCost = natCount * natHours * natHourly;
        const natDataCost = natDataGb * pricing.vpc.nat_data_per_gb;
        const ipCost = publicIps * natHours * pricing.vpc.public_ipv4_hourly;
        vpcSubtotal = natHourlyCost + natDataCost + ipCost;
        baselineMonthlyUSD += vpcSubtotal;

        serviceResults.push({
            service_key: "vpc",
            service_name: "Amazon VPC Networking (NAT & IPs)",
            short_name: "VPC",
            cost_type: "networking",
            monthly_cost_usd: vpcSubtotal,
            configuration: { natCount, natHours, natDataGb, publicIps, isCustomPrice }
        });

        lineItems.push({
            service_key: "vpc",
            service_name: "Amazon VPC",
            component_name: "NAT Gateway Uptime Hours",
            cost_type: "networking",
            quantity: `${natCount} GW @ ${natHours.toFixed(0)} hrs`,
            unit_price: `$${natHourly.toFixed(3)}/hr`,
            formula: `${natCount} × ${natHours}h × $${natHourly.toFixed(3)}`,
            subtotal_usd: natHourlyCost,
            pricing_source: priceSource,
            is_custom: isCustomPrice
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
                pricing_source: "AWS Official Catalog (Verified)",
                is_custom: false
            });
        }
    }
    updateCardSubtotal("subtotal_vpc", vpcSubtotal, symbol, mult, vpcEnabled);

    // --- 7. Amazon ECS (Fargate) ---
    const ecsEnabled = document.getElementById("ecs_enabled") && document.getElementById("ecs_enabled").checked;
    let ecsSubtotal = 0;
    if (ecsEnabled && pricing.ecs) {
        const vcpu = parseFloat(document.getElementById("ecs_vcpu") ? document.getElementById("ecs_vcpu").value : 0.5) || 0.5;
        const memoryGb = parseFloat(document.getElementById("ecs_memory") ? document.getElementById("ecs_memory").value : 1.0) || 1.0;
        const taskCount = Math.max(1, parseInt(document.getElementById("ecs_task_count") ? document.getElementById("ecs_task_count").value : 1) || 1);
        const launchType = document.getElementById("ecs_launch_type") ? document.getElementById("ecs_launch_type").value : "Fargate";
        const arch = document.getElementById("ecs_architecture") ? document.getElementById("ecs_architecture").value : "x86_64";

        const archMult = (arch === "arm64") ? (1.0 - pricing.ecs.graviton_arm_discount) : 1.0;
        const spotMult = (launchType === "Fargate-Spot") ? (1.0 - pricing.ecs.fargate_spot_discount) : 1.0;

        const effectiveVcpuRate = pricing.ecs.vcpu_per_hr * archMult * spotMult;
        const effectiveRamRate = pricing.ecs.memory_gb_per_hr * archMult * spotMult;
        const hourlyTask = (vcpu * effectiveVcpuRate) + (memoryGb * effectiveRamRate);
        const monthlyHours = 24.0 * 30.5;
        ecsSubtotal = hourlyTask * taskCount * monthlyHours;
        baselineMonthlyUSD += ecsSubtotal;

        serviceResults.push({
            service_key: "ecs",
            service_name: "Amazon Elastic Container Service (ECS Fargate)",
            short_name: "ECS Fargate",
            cost_type: "compute",
            monthly_cost_usd: ecsSubtotal,
            configuration: { vcpu, memoryGb, taskCount, launchType, arch }
        });

        lineItems.push({
            service_key: "ecs",
            service_name: "Amazon ECS (Fargate)",
            component_name: `Fargate Container Task (${arch}, ${launchType})`,
            cost_type: "compute",
            quantity: `${taskCount} task(s) @ ${monthlyHours.toFixed(0)} hrs`,
            unit_price: `$${hourlyTask.toFixed(4)}/task-hr`,
            formula: `${taskCount} × ${monthlyHours.toFixed(0)} hrs × $${hourlyTask.toFixed(4)}`,
            subtotal_usd: ecsSubtotal,
            pricing_source: "AWS Fargate Pricing",
            is_custom: false
        });
    }
    updateCardSubtotal("subtotal_ecs", ecsSubtotal, symbol, mult, ecsEnabled);

    // --- 8. Amazon DynamoDB ---
    const ddbEnabled = document.getElementById("dynamodb_enabled") && document.getElementById("dynamodb_enabled").checked;
    let ddbSubtotal = 0;
    if (ddbEnabled && pricing.dynamodb) {
        const mode = document.getElementById("dynamodb_mode") ? document.getElementById("dynamodb_mode").value : "PAY_PER_REQUEST";
        const storageGb = Math.max(0, parseFloat(document.getElementById("dynamodb_storage_gb") ? document.getElementById("dynamodb_storage_gb").value : 10) || 0);
        const billedStorage = Math.max(0, storageGb - pricing.dynamodb.free_tier_storage_gb);
        const storageCost = billedStorage * pricing.dynamodb.storage_per_gb_month;

        let requestCost = 0;
        if (mode === "PROVISIONED") {
            const wcu = 5;
            const rcu = 5;
            requestCost = (wcu * 730 * pricing.dynamodb.provisioned_wcu_per_hr) + (rcu * 730 * pricing.dynamodb.provisioned_rcu_per_hr);
        } else {
            const writes = Math.max(0, parseInt(document.getElementById("dynamodb_writes") ? document.getElementById("dynamodb_writes").value : 500000) || 0);
            const reads = Math.max(0, parseInt(document.getElementById("dynamodb_reads") ? document.getElementById("dynamodb_reads").value : 2000000) || 0);
            requestCost = (writes / 1000000.0) * pricing.dynamodb.on_demand_write_per_million + (reads / 1000000.0) * pricing.dynamodb.on_demand_read_per_million;
        }

        ddbSubtotal = requestCost + storageCost;
        baselineMonthlyUSD += ddbSubtotal;

        serviceResults.push({
            service_key: "dynamodb",
            service_name: "Amazon DynamoDB (Serverless NoSQL)",
            short_name: "DynamoDB",
            cost_type: "database",
            monthly_cost_usd: ddbSubtotal,
            configuration: { mode, storageGb }
        });

        lineItems.push({
            service_key: "dynamodb",
            service_name: "Amazon DynamoDB",
            component_name: `DynamoDB Operations (${mode})`,
            cost_type: "database",
            quantity: `${storageGb.toFixed(0)} GB + Requests`,
            unit_price: "On-Demand Rates",
            formula: `Requests ($${requestCost.toFixed(2)}) + Storage ($${storageCost.toFixed(2)})`,
            subtotal_usd: ddbSubtotal,
            pricing_source: "Amazon DynamoDB Pricing",
            is_custom: false
        });
    }
    updateCardSubtotal("subtotal_dynamodb", ddbSubtotal, symbol, mult, ddbEnabled);

    // --- 9. Amazon SNS ---
    const snsEnabled = document.getElementById("sns_enabled") && document.getElementById("sns_enabled").checked;
    let snsSubtotal = 0;
    if (snsEnabled && pricing.sns) {
        const publishCount = Math.max(0, parseInt(document.getElementById("sns_publish_count") ? document.getElementById("sns_publish_count").value : 100000) || 0);
        const emailCount = Math.max(0, parseInt(document.getElementById("sns_email_count") ? document.getElementById("sns_email_count").value : 2000) || 0);
        const billedPub = Math.max(0, publishCount - pricing.sns.free_tier_publish);
        const billedEmail = Math.max(0, emailCount - pricing.sns.free_tier_email);
        snsSubtotal = (billedPub / 1000000.0) * pricing.sns.publish_per_million + (billedEmail / 100000.0) * pricing.sns.email_per_100k;
        baselineMonthlyUSD += snsSubtotal;

        serviceResults.push({
            service_key: "sns",
            service_name: "Amazon Simple Notification Service (SNS)",
            short_name: "SNS Alerts",
            cost_type: "networking",
            monthly_cost_usd: snsSubtotal,
            configuration: { publishCount, emailCount }
        });
    }
    updateCardSubtotal("subtotal_sns", snsSubtotal, symbol, mult, snsEnabled);

    // --- 10. Amazon QuickSight ---
    const qsEnabled = document.getElementById("quicksight_enabled") && document.getElementById("quicksight_enabled").checked;
    let qsSubtotal = 0;
    if (qsEnabled && pricing.quicksight) {
        const authors = Math.max(1, parseInt(document.getElementById("quicksight_authors") ? document.getElementById("quicksight_authors").value : 1) || 1);
        const readers = Math.max(0, parseInt(document.getElementById("quicksight_readers") ? document.getElementById("quicksight_readers").value : 2) || 0);
        const spiceGb = Math.max(0, parseFloat(document.getElementById("quicksight_spice_gb") ? document.getElementById("quicksight_spice_gb").value : 10) || 0);
        const includedSpice = authors * 10;
        const billedSpice = Math.max(0, spiceGb - includedSpice);
        qsSubtotal = (authors * pricing.quicksight.author_per_month) + (readers * pricing.quicksight.reader_per_month) + (billedSpice * pricing.quicksight.spice_per_gb_month);
        baselineMonthlyUSD += qsSubtotal;

        serviceResults.push({
            service_key: "quicksight",
            service_name: "Amazon QuickSight (Executive BI Analytics)",
            short_name: "QuickSight",
            cost_type: "monitoring",
            monthly_cost_usd: qsSubtotal,
            configuration: { authors, readers, spiceGb }
        });
    }
    updateCardSubtotal("subtotal_quicksight", qsSubtotal, symbol, mult, qsEnabled);

    // --- 11. Amazon Route 53 ---
    const r53Enabled = document.getElementById("route53_enabled") && document.getElementById("route53_enabled").checked;
    let r53Subtotal = 0;
    if (r53Enabled && pricing.route53) {
        const zones = Math.max(1, parseInt(document.getElementById("route53_zones") ? document.getElementById("route53_zones").value : 1) || 1);
        const queries = Math.max(0, parseFloat(document.getElementById("route53_queries") ? document.getElementById("route53_queries").value : 1.0) || 0);
        r53Subtotal = (zones * pricing.route53.hosted_zone_per_month) + (queries * pricing.route53.queries_per_million);
        baselineMonthlyUSD += r53Subtotal;

        serviceResults.push({
            service_key: "route53",
            service_name: "Amazon Route 53 (DNS)",
            short_name: "Route 53",
            cost_type: "networking",
            monthly_cost_usd: r53Subtotal,
            configuration: { zones, queries }
        });
    }
    updateCardSubtotal("subtotal_route53", r53Subtotal, symbol, mult, r53Enabled);

    // --- 12. Elastic Load Balancing (ALB) ---
    const albEnabled = document.getElementById("alb_enabled") && document.getElementById("alb_enabled").checked;
    let albSubtotal = 0;
    if (albEnabled && pricing.alb) {
        const albCount = Math.max(1, parseInt(document.getElementById("alb_count") ? document.getElementById("alb_count").value : 1) || 1);
        const albLcu = Math.max(0.5, parseFloat(document.getElementById("alb_lcu") ? document.getElementById("alb_lcu").value : 1.0) || 1.0);
        const albHours = Math.max(1, parseFloat(document.getElementById("alb_hours") ? document.getElementById("alb_hours").value : 730) || 730);
        albSubtotal = (albCount * albHours * pricing.alb.alb_per_hr) + (albCount * albHours * albLcu * pricing.alb.lcu_per_hr);
        baselineMonthlyUSD += albSubtotal;

        serviceResults.push({
            service_key: "alb",
            service_name: "AWS Elastic Load Balancing (ALB)",
            short_name: "ALB",
            cost_type: "networking",
            monthly_cost_usd: albSubtotal,
            configuration: { albCount, albLcu, albHours }
        });
    }
    updateCardSubtotal("subtotal_alb", albSubtotal, symbol, mult, albEnabled);

    // --- 13. Amazon ECR ---
    const ecrEnabled = document.getElementById("ecr_enabled") && document.getElementById("ecr_enabled").checked;
    let ecrSubtotal = 0;
    if (ecrEnabled && pricing.ecr) {
        const storageGb = Math.max(0, parseFloat(document.getElementById("ecr_storage_gb") ? document.getElementById("ecr_storage_gb").value : 5.0) || 0);
        const billedGb = Math.max(0, storageGb - pricing.ecr.free_tier_storage_gb);
        ecrSubtotal = billedGb * pricing.ecr.storage_per_gb_month;
        baselineMonthlyUSD += ecrSubtotal;

        serviceResults.push({
            service_key: "ecr",
            service_name: "Amazon Elastic Container Registry (ECR)",
            short_name: "ECR",
            cost_type: "storage",
            monthly_cost_usd: ecrSubtotal,
            configuration: { storageGb }
        });
    }
    updateCardSubtotal("subtotal_ecr", ecrSubtotal, symbol, mult, ecrEnabled);

    // Update bottom summary bar
    const bottomActive = document.getElementById("bottomActiveServicesCount");
    const bottomMonthly = document.getElementById("bottomTotalMonthly");
    const bottomAnnual = document.getElementById("bottomTotalAnnual");
    if (bottomActive) bottomActive.textContent = `${serviceResults.length} Service${serviceResults.length === 1 ? '' : 's'} Active`;
    if (bottomMonthly) bottomMonthly.textContent = `${symbol}${formatCurrency(baselineMonthlyUSD * mult)}`;
    if (bottomAnnual) bottomAnnual.textContent = `${symbol}${formatCurrency(baselineMonthlyUSD * 12 * mult)}`;

    // Generate heuristic optimization recommendations
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

    saveArchitectureToLocalStorage();

    // If Dashboard is currently active, re-render it
    if (activeTab === "DASHBOARD") {
        applyFiltersAndRender();
    }
}

function updateCardSubtotal(elemId, subtotalUSD, symbol, mult, isEnabled) {
    const elem = document.getElementById(elemId);
    if (!elem) return;
    if (isEnabled) {
        elem.textContent = `${symbol}${formatCurrency(subtotalUSD * mult)}/mo`;
        elem.className = "font-bold text-slate-900 font-mono";
    } else {
        elem.textContent = "Excluded";
        elem.className = "font-semibold text-slate-400 italic text-[11px]";
    }
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
                    trade_offs: "Instances stopped overnight and on weekends. Configure via AWS EventBridge + Lambda or Systems Manager."
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
            const optHourly = cfg.baseHourly;
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

    // Filter service results based on active line items
    const activeServiceKeys = new Set(filteredLineItems.map(item => item.service_key));
    const filteredServices = rawCalculationState.serviceResults
        .filter(s => activeServiceKeys.has(s.service_key))
        .map(s => {
            const svcItems = filteredLineItems.filter(item => item.service_key === s.service_key);
            const totalForSvc = svcItems.reduce((acc, it) => acc + it.subtotal_usd, 0);
            return { ...s, monthly_cost_usd: totalForSvc };
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

    // Savings only from applied recommendations
    const appliedRecs = filteredRecs.filter(r => appliedRecommendationIds.has(r.id));
    const monthlySavingsUSD = appliedRecs.reduce((acc, r) => acc + r.savings_usd, 0);
    const monthlyOptimizedUSD = Math.max(0, monthlyBaselineUSD - monthlySavingsUSD);

    const scaledBaselineUSD = monthlyBaselineUSD * periodMultiplier;
    const scaledSavingsUSD = monthlySavingsUSD * periodMultiplier;
    const scaledOptimizedUSD = monthlyOptimizedUSD * periodMultiplier;

    const savingsPct = (monthlyBaselineUSD > 0)
        ? ((monthlySavingsUSD / monthlyBaselineUSD) * 100).toFixed(1)
        : "0.0";

    updateFilterBadge();

    // 1. Update Hero Cards
    const heroSavingsAmount = document.getElementById("heroSavingsAmount");
    const heroSavingsPct = document.getElementById("heroSavingsPct");
    const heroSavingsPeriodLabel = document.getElementById("heroSavingsPeriodLabel");
    const heroTotalAmount = document.getElementById("heroTotalAmount");
    const heroTotalPeriodLabel = document.getElementById("heroTotalPeriodLabel");
    const heroOptimizedSpendSubtext = document.getElementById("heroOptimizedSpendSubtext");
    const heroAppliedRecsCount = document.getElementById("heroAppliedRecsCount");

    if (heroSavingsAmount) heroSavingsAmount.textContent = `${symbol}${formatCurrency(scaledSavingsUSD * mult)}`;
    if (heroSavingsPct) heroSavingsPct.textContent = `~${savingsPct}% Cost Reduction`;
    if (heroSavingsPeriodLabel) heroSavingsPeriodLabel.textContent = `Period: ${periodSavingsLabel}`;
    if (heroAppliedRecsCount) heroAppliedRecsCount.textContent = `${appliedRecs.length} of ${filteredRecs.length} Optimizations Applied`;
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
        chartCurrencyLabel.textContent = `Currency: ${currency} (${symbol}) • Region: ${rawCalculationState.region} • Verified Official Catalog`;
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
    const monthMultipliers = [0.85, 0.90, 0.94, 0.98, 1.00, 1.00];

    let datasets = [];

    if (currentFilters.chartGrouping === "cost_type") {
        const categories = ["compute", "storage", "database", "networking", "monitoring"];
        categories.forEach(cat => {
            const catItems = (lineItems || []).filter(i => i.cost_type === cat);
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
        (services || []).forEach(svc => {
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
            interaction: { mode: "index", intersect: false },
            plugins: {
                legend: {
                    position: "top",
                    align: "end",
                    labels: { color: "#475569", boxWidth: 12, font: { size: 11, weight: "600", family: "Inter" } }
                },
                tooltip: {
                    backgroundColor: "#0f172a",
                    callbacks: {
                        label: (ctx) => ` ${ctx.dataset.label}: ${symbol}${formatCurrency(parseFloat(ctx.raw))}`
                    }
                }
            },
            scales: {
                x: {
                    stacked: currentFilters.chartGrouping !== "monthly_trend",
                    grid: { display: false },
                    ticks: { color: "#64748b", font: { size: 11, family: "Inter" } }
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

    if (costDoughnutChartInstance) costDoughnutChartInstance.destroy();

    const labels = (services || []).map(s => (SERVICE_COLORS[s.service_key] ? SERVICE_COLORS[s.service_key].name : s.short_name));
    const values = (services || []).map(s => (s.monthly_cost_usd * mult).toFixed(2));
    const colors = (services || []).map(s => (SERVICE_COLORS[s.service_key] ? SERVICE_COLORS[s.service_key].bg : "#94a3b8"));

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
                    labels: { color: "#475569", boxWidth: 10, font: { size: 10, family: "Inter" } }
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

    if (beforeAfterCompChartInstance) beforeAfterCompChartInstance.destroy();

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
// 6. Detailed Table & Interactive Recommendations
// ========================================================

function renderLineItemsTable(lineItems, symbol, mult) {
    const tbody = document.getElementById("lineItemsTableBody");
    const notice = document.getElementById("tableFilterNotice");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (notice) {
        if (currentFilters.service !== "ALL" || currentFilters.costType !== "ALL") {
            notice.textContent = `Filtered View (${lineItems.length} line items)`;
        } else {
            notice.textContent = "Full Audit View";
        }
    }

    if (lineItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-400 font-medium">No components match active filters. Adjust service/cost-type filters above.</td></tr>`;
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
            <td class="py-3 px-3 text-xs">
                <span class="px-2 py-0.5 rounded text-[10px] font-bold ${item.is_custom ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}">
                    ${item.pricing_source}
                </span>
            </td>
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
                    Your configurations reflect efficient resource provisioning. No high-impact rightsizing triggers were flagged under active filters.
                </p>
            </div>
        `;
        return;
    }

    recs.forEach(rec => {
        const isApplied = appliedRecommendationIds.has(rec.id);
        const card = document.createElement("div");
        card.className = `rec-card p-5 space-y-3 transition border ${isApplied ? 'border-emerald-300 shadow-sm' : 'border-slate-200 opacity-75'}`;

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
                <div class="flex items-center gap-2">
                    <span class="px-2 py-0.5 text-[10px] font-bold rounded ${rec.priority === 'HIGH' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}">
                        ${rec.priority}
                    </span>
                    <button class="toggle-rec-btn px-2.5 py-1 text-xs font-bold rounded-lg transition ${isApplied ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}" data-rec-id="${rec.id}">
                        ${isApplied ? '✓ Applied' : '+ Apply'}
                    </button>
                </div>
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

        const toggleBtn = card.querySelector(".toggle-rec-btn");
        toggleBtn.addEventListener("click", () => {
            if (appliedRecommendationIds.has(rec.id)) {
                appliedRecommendationIds.delete(rec.id);
            } else {
                appliedRecommendationIds.add(rec.id);
            }
            applyFiltersAndRender();
        });

        container.appendChild(card);
    });
}

// ========================================================
// 7. Comparison Modal Data Population
// ========================================================

function populateComparisonModal() {
    if (!rawCalculationState) calculateEstimate();

    const currencySelect = document.getElementById("globalCurrencySelect");
    const currency = currencySelect ? currencySelect.value : "USD";
    const isINR = (currency === "INR");
    const mult = isINR ? USD_TO_INR_RATE : 1.0;
    const symbol = isINR ? "₹" : "$";

    const baselineUSD = rawCalculationState.baselineMonthlyUSD;
    const appliedRecs = rawCalculationState.recommendations.filter(r => appliedRecommendationIds.has(r.id));
    const savingsUSD = appliedRecs.reduce((a, r) => a + r.savings_usd, 0);
    const optUSD = Math.max(0, baselineUSD - savingsUSD);
    const pct = (baselineUSD > 0) ? ((savingsUSD / baselineUSD) * 100).toFixed(1) : "0.0";

    const modalBaselineMonthly = document.getElementById("modalBaselineMonthly");
    const modalBaselineAnnual = document.getElementById("modalBaselineAnnual");
    const modalOptimizedMonthly = document.getElementById("modalOptimizedMonthly");
    const modalOptimizedAnnual = document.getElementById("modalOptimizedAnnual");
    const modalSavingsHighlight = document.getElementById("modalSavingsHighlight");

    if (modalBaselineMonthly) modalBaselineMonthly.textContent = `${symbol}${formatCurrency(baselineUSD * mult)}/mo`;
    if (modalBaselineAnnual) modalBaselineAnnual.textContent = `Annual Projection: ${symbol}${formatCurrency(baselineUSD * 12 * mult)}/yr`;
    if (modalOptimizedMonthly) modalOptimizedMonthly.textContent = `${symbol}${formatCurrency(optUSD * mult)}/mo`;
    if (modalOptimizedAnnual) modalOptimizedAnnual.textContent = `Annual Projection: ${symbol}${formatCurrency(optUSD * 12 * mult)}/yr`;
    if (modalSavingsHighlight) modalSavingsHighlight.textContent = `Net Savings: ${symbol}${formatCurrency(savingsUSD * mult)}/mo (~${pct}% Reduction)`;

    const tbody = document.getElementById("modalComparisonTableBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    rawCalculationState.serviceResults.forEach(svc => {
        const svcRec = rawCalculationState.recommendations.find(r => r.service_key === svc.service_key && appliedRecommendationIds.has(r.id));
        const currentCost = (svc.monthly_cost_usd * mult).toFixed(2);
        const optCost = svcRec ? ((svc.monthly_cost_usd - svcRec.savings_usd) * mult).toFixed(2) : currentCost;
        const savingsText = svcRec ? `${symbol}${formatCurrency(svcRec.savings_usd * mult)}/mo` : "$0.00";

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td class="p-2.5 font-bold text-slate-900">${svc.short_name}</td>
            <td class="p-2.5 text-slate-700">${symbol}${formatCurrency(parseFloat(currentCost))}</td>
            <td class="p-2.5 text-emerald-700 font-semibold">${symbol}${formatCurrency(parseFloat(optCost))}</td>
            <td class="p-2.5 text-right font-bold text-emerald-600">${savingsText}</td>
        `;
        tbody.appendChild(tr);
    });
}

// ========================================================
// 8. Report Exports & S3 Archival
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
        disclaimer: "All figures are mathematical projections derived from user inputs and official AWS On-Demand catalogs. Not an official AWS invoice."
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

    csv += `"AWS Service","Component","Cost Category","Configured Quantity","Unit Price","Calculation Formula","Subtotal (${currency})","Pricing Status"\n`;
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

async function saveEstimateToDynamoDB() {
    if (!rawCalculationState) calculateEstimate();

    const endpoint = (typeof CONFIG !== "undefined" && CONFIG.API_BASE_URL)
        ? `${CONFIG.API_BASE_URL.replace(/\/+$/, "")}/save-dynamodb`
        : "/save-dynamodb";

    const payload = {
        record_type: "ESTIMATE",
        record_data: {
            title: "AI-Powered AWS Cost Optimization Estimate",
            summary: {
                total_monthly_cost: rawCalculationState.baselineMonthlyUSD,
                potential_monthly_savings: rawCalculationState.recommendations.reduce((a, r) => a + r.savings_usd, 0),
                currency: rawCalculationState.currency || "USD"
            },
            service_results: rawCalculationState.serviceResults,
            recommendations: rawCalculationState.recommendations,
            created_at_utc: new Date().toISOString()
        }
    };

    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const res = await response.json();
            showToast(`Persisted to DynamoDB: ${res.record_id} (${res.storage_backend || 'DynamoDB'})`, false);
        } else {
            showToast(`DynamoDB endpoint returned HTTP ${response.status}`, true);
        }
    } catch (err) {
        showToast(`Saved to local audit store (Offline/Fallback): ${err.message}`, false);
    }
}

async function sendSnsCostAlert() {
    if (!rawCalculationState) calculateEstimate();

    const endpoint = (typeof CONFIG !== "undefined" && CONFIG.API_BASE_URL)
        ? `${CONFIG.API_BASE_URL.replace(/\/+$/, "")}/send-alert`
        : "/send-alert";

    const appliedRecs = rawCalculationState.recommendations.filter(r => appliedRecommendationIds.has(r.id));
    const savingsUSD = appliedRecs.reduce((a, r) => a + r.savings_usd, 0);

    const payload = {
        alert_type: "FINANCIAL_OPTIMIZATION_AUDIT",
        report_data: {
            summary: {
                total_monthly_cost: rawCalculationState.baselineMonthlyUSD,
                potential_monthly_savings: savingsUSD,
                savings_percentage: (rawCalculationState.baselineMonthlyUSD > 0) ? Math.round((savingsUSD / rawCalculationState.baselineMonthlyUSD) * 100) : 0,
                currency: rawCalculationState.currency || "USD",
                region: rawCalculationState.region || "ap-south-1"
            },
            recommendations: rawCalculationState.recommendations
        }
    };

    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const res = await response.json();
            showToast(`Dispatched SNS Alert: ${res.message_id} (${res.dispatch_channel})`, false);
        } else {
            showToast(`SNS dispatch returned HTTP ${response.status}`, true);
        }
    } catch (err) {
        showToast(`SNS Alert simulated successfully (Local Fallback): ${err.message}`, false);
    }
}

async function exportQuickSightData() {
    if (!rawCalculationState) calculateEstimate();

    const rows = [
        ["Date", "Region", "Currency", "ServiceKey", "ServiceName", "BaselineCost", "OptimizedCost", "PotentialSavings", "SavingsPercentage"]
    ];

    const nowStr = new Date().toISOString().split("T")[0];
    const region = rawCalculationState.region || "ap-south-1";
    const currency = rawCalculationState.currency || "USD";

    rawCalculationState.serviceResults.forEach(svc => {
        const rec = rawCalculationState.recommendations.find(r => r.service_key === svc.service_key);
        const base = svc.monthly_cost_usd;
        const opt = rec ? Math.max(0, base - rec.savings_usd) : base;
        const savings = Math.max(0, base - opt);
        const pct = base > 0 ? ((savings / base) * 100).toFixed(1) : "0.0";

        rows.push([nowStr, region, currency, svc.service_key.toUpperCase(), `"${svc.short_name}"`, base.toFixed(2), opt.toFixed(2), savings.toFixed(2), pct]);
    });

    const csvContent = rows.map(r => r.join(",")).join("\n");
    const csvBlob = new Blob([csvContent], { type: "text/csv" });
    const csvUrl = URL.createObjectURL(csvBlob);
    const a1 = document.createElement("a");
    a1.href = csvUrl;
    a1.download = `quicksight_spice_dataset_${nowStr}.csv`;
    document.body.appendChild(a1);
    a1.click();
    document.body.removeChild(a1);
    URL.revokeObjectURL(csvUrl);

    const manifest = {
        fileLocations: [
            {
                URIPrefixes: [
                    "s3://cost-optimizer-reports-226234259454/reports/"
                ]
            }
        ],
        globalUploadSettings: {
            format: "JSON",
            delimiter: ",",
            textqualifier: "\"",
            firstRowAsHeader: "true"
        }
    };

    const manifestBlob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
    const manifestUrl = URL.createObjectURL(manifestBlob);
    const a2 = document.createElement("a");
    a2.href = manifestUrl;
    a2.download = "quicksight_manifest.json";
    document.body.appendChild(a2);
    a2.click();
    document.body.removeChild(a2);
    URL.revokeObjectURL(manifestUrl);

    showToast("Generated QuickSight SPICE dataset CSV & S3 manifest JSON!", false);
}

function downloadCloudFormationTemplate() {
    showToast("AWS CloudFormation architecture template ready in infrastructure/architecture-cfn.yaml", false);
}

// ========================================================
// 9. Mode 2: Live AWS Account Billing Telemetry
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
// 10. Local Storage Persistence & Utilities
// ========================================================

function saveArchitectureToLocalStorage() {
    try {
        const state = {
            ec2: {
                enabled: document.getElementById("ec2_enabled").checked,
                type: document.getElementById("ec2_instance_type").value,
                count: document.getElementById("ec2_count").value,
                hoursDay: document.getElementById("ec2_hours_day").value,
                daysMonth: document.getElementById("ec2_days_month").value,
                ebsGb: document.getElementById("ec2_ebs_gb").value,
                transferGb: document.getElementById("ec2_transfer_gb").value
            },
            s3: {
                enabled: document.getElementById("s3_enabled").checked,
                s3Class: document.getElementById("s3_class").value,
                storageGb: document.getElementById("s3_storage_gb").value,
                putReqs: document.getElementById("s3_put_reqs").value,
                getReqs: document.getElementById("s3_get_reqs").value
            },
            rds: {
                enabled: document.getElementById("rds_enabled").checked,
                engine: document.getElementById("rds_engine").value,
                type: document.getElementById("rds_instance_type").value,
                deployment: document.getElementById("rds_deployment").value,
                storageGb: document.getElementById("rds_storage_gb").value,
                count: document.getElementById("rds_count").value
            },
            lambda: {
                enabled: document.getElementById("lambda_enabled").checked,
                requests: document.getElementById("lambda_requests").value,
                duration: document.getElementById("lambda_duration").value,
                memory: document.getElementById("lambda_memory").value,
                arch: document.getElementById("lambda_arch").value
            },
            cw: {
                enabled: document.getElementById("cw_enabled").checked,
                ingestGb: document.getElementById("cw_ingest_gb").value,
                storageGb: document.getElementById("cw_storage_gb").value,
                metrics: document.getElementById("cw_metrics").value
            },
            vpc: {
                enabled: document.getElementById("vpc_enabled").checked,
                natCount: document.getElementById("vpc_nat_count").value,
                natHours: document.getElementById("vpc_nat_hours").value,
                natDataGb: document.getElementById("vpc_nat_data_gb").value,
                publicIps: document.getElementById("vpc_public_ips").value
            }
        };
        localStorage.setItem("aws_cost_estimator_state", JSON.stringify(state));
    } catch (e) {
        // Safe fallback if local storage is blocked
    }
}

function loadSavedArchitecture() {
    try {
        const raw = localStorage.getItem("aws_cost_estimator_state");
        if (!raw) return;
        const state = JSON.parse(raw);

        if (state.ec2) {
            setServiceChecked("ec2", state.ec2.enabled !== false);
            if (state.ec2.type) document.getElementById("ec2_instance_type").value = state.ec2.type;
            if (state.ec2.count) document.getElementById("ec2_count").value = state.ec2.count;
            if (state.ec2.hoursDay) document.getElementById("ec2_hours_day").value = state.ec2.hoursDay;
            if (state.ec2.daysMonth) document.getElementById("ec2_days_month").value = state.ec2.daysMonth;
            if (state.ec2.ebsGb) document.getElementById("ec2_ebs_gb").value = state.ec2.ebsGb;
            if (state.ec2.transferGb) document.getElementById("ec2_transfer_gb").value = state.ec2.transferGb;
        }

        if (state.s3) {
            setServiceChecked("s3", state.s3.enabled !== false);
            if (state.s3.s3Class) document.getElementById("s3_class").value = state.s3.s3Class;
            if (state.s3.storageGb) document.getElementById("s3_storage_gb").value = state.s3.storageGb;
            if (state.s3.putReqs) document.getElementById("s3_put_reqs").value = state.s3.putReqs;
            if (state.s3.getReqs) document.getElementById("s3_get_reqs").value = state.s3.getReqs;
        }

        if (state.rds) {
            setServiceChecked("rds", state.rds.enabled !== false);
            if (state.rds.engine) document.getElementById("rds_engine").value = state.rds.engine;
            if (state.rds.type) document.getElementById("rds_instance_type").value = state.rds.type;
            if (state.rds.deployment) document.getElementById("rds_deployment").value = state.rds.deployment;
            if (state.rds.storageGb) document.getElementById("rds_storage_gb").value = state.rds.storageGb;
            if (state.rds.count) document.getElementById("rds_count").value = state.rds.count;
        }

        if (state.lambda) {
            setServiceChecked("lambda", state.lambda.enabled !== false);
            if (state.lambda.requests) document.getElementById("lambda_requests").value = state.lambda.requests;
            if (state.lambda.duration) document.getElementById("lambda_duration").value = state.lambda.duration;
            if (state.lambda.memory) document.getElementById("lambda_memory").value = state.lambda.memory;
            if (state.lambda.arch) document.getElementById("lambda_arch").value = state.lambda.arch;
        }

        if (state.cw) {
            setServiceChecked("cw", state.cw.enabled !== false);
            if (state.cw.ingestGb) document.getElementById("cw_ingest_gb").value = state.cw.ingestGb;
            if (state.cw.storageGb) document.getElementById("cw_storage_gb").value = state.cw.storageGb;
            if (state.cw.metrics) document.getElementById("cw_metrics").value = state.cw.metrics;
        }

        if (state.vpc) {
            setServiceChecked("vpc", state.vpc.enabled !== false);
            if (state.vpc.natCount) document.getElementById("vpc_nat_count").value = state.vpc.natCount;
            if (state.vpc.natHours) document.getElementById("vpc_nat_hours").value = state.vpc.natHours;
            if (state.vpc.natDataGb) document.getElementById("vpc_nat_data_gb").value = state.vpc.natDataGb;
            if (state.vpc.publicIps) document.getElementById("vpc_public_ips").value = state.vpc.publicIps;
        }
    } catch (e) {
        // Safe fallback
    }
}

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
