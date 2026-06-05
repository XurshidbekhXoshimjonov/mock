(() => {
    const testId = "1780587000000-full-listening-cdi-original";
    const title = "Full Listening CDI";

    function integrationStatus() {
        let status = document.getElementById("ieltsxIntegrationStatus");
        if (status) return status;

        status = document.createElement("p");
        status.id = "ieltsxIntegrationStatus";
        status.style.margin = "10px 0 0";
        status.style.fontSize = "14px";
        status.style.color = "#475569";
        document.getElementById("result-unanswered")?.insertAdjacentElement("afterend", status);
        return status;
    }

    document.addEventListener("ieltsx-listening-result", async (event) => {
        const detail = event.detail || {};
        const status = integrationStatus();
        const auth = window.authClient?.getAuth();

        if (!auth?.token) {
            status.innerHTML = 'Result is ready. <a href="login.html">Log in</a> to save it to IELTSX history.';
            return;
        }

        status.textContent = "Saving result to IELTSX profile...";
        const saved = await window.authClient.recordTestResult({
            testId,
            title,
            type: "Listening",
            part: "full",
            correct: Number(detail.correct) || 0,
            total: Number(detail.total) || 40,
            band: Number(detail.band) || 0,
            practiceUrl: "/full-listening-cdi.html"
        });
        status.textContent = saved
            ? "Result saved to IELTSX profile and test history."
            : "Result was already saved or could not be saved.";
    });
})();
