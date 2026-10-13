
import streamlit as st
import pandas as pd
import plotly.express as px

st.set_page_config(
    page_title="AI-Powered AWS Cloud Cost Optimization System",
    page_icon="☁️",
    layout="wide"
)

st.title("☁️ AI-Powered AWS Cloud Cost Optimization System")
st.caption("Zero-cost-first local prototype")

st.info(
    "This is a local prototype. The example data below is "
    "sample data, not actual AWS billing information."
)

data = pd.DataFrame({
    "Service": ["EC2", "S3", "Lambda", "CloudWatch", "RDS"],
    "Cost": [25, 10, 5, 8, 30]
})

col1, col2, col3 = st.columns(3)

with col1:
    st.metric("Sample Total Cost", "$78.00")

with col2:
    st.metric("Services Analysed", len(data))

with col3:
    st.metric("Potential Savings", "To be analysed")

st.subheader("Sample Cost by AWS Service")

fig = px.bar(
    data,
    x="Service",
    y="Cost",
    title="Illustrative Service Costs ($)"
)

st.plotly_chart(fig, use_container_width=True)

st.subheader("Sample Cost Data")
st.dataframe(data, use_container_width=True)

st.subheader("Initial Optimization Guidance")

st.write("- Review EC2 utilization before recommending downsizing.")
st.write("- Review S3 storage and lifecycle needs.")
st.write("- Check Lambda execution duration and request volume.")
st.write("- Review CloudWatch log retention.")
st.write("- Investigate RDS utilization before recommending changes.")

st.warning(
    "These are general recommendations, not findings from your "
    "actual AWS account. No resources have been changed."
)

st.subheader("Cost Analysis")

highest_cost_service = data.loc[data["Cost"].idxmax()]
total_cost = data["Cost"].sum()

st.write(
    f"Highest-cost service: **{highest_cost_service['Service']}** "
    f"(${highest_cost_service['Cost']:.2f})"
)

st.write(f"Total sample cost: **${total_cost:.2f}**")

if highest_cost_service["Service"] == "EC2":
    st.info("Recommendation: Review EC2 CPU utilization and instance usage.")
elif highest_cost_service["Service"] == "RDS":
    st.info("Recommendation: Review database utilization and instance sizing.")
else:
    st.info(
        f"Recommendation: Review usage and configuration for "
        f"{highest_cost_service['Service']}."
    )
